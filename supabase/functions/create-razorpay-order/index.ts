import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createAdminClient() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

function isRazorpayMethod(method: string | null | undefined): boolean {
  const normalized = String(method || '').toLowerCase();
  return normalized === 'razorpay' || normalized === 'razorpay_upi' || normalized === 'razorpay_cards';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createAdminClient();
  const razorpayKeyId = requireEnv('RAZORPAY_KEY_ID');
  const razorpayKeySecret = requireEnv('RAZORPAY_KEY_SECRET');

  const token = getBearerToken(req);
  const {
    data: { user },
  } = token ? await adminClient.auth.getUser(token) : { data: { user: null } };

  let body: { order_id?: string; payment_method?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.order_id) {
    return new Response(JSON.stringify({ error: 'order_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, display_order_id, user_id, total_amount, payment_method, payment_status, razorpay_order_id, status, payment_metadata')
    .eq('id', body.order_id)
    .maybeSingle();

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (user?.id && order.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Order ownership mismatch' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!isRazorpayMethod(order.payment_method)) {
    return new Response(JSON.stringify({ error: 'Order is not marked for Razorpay payment' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (body.payment_method && String(body.payment_method).toLowerCase() !== String(order.payment_method || '').toLowerCase()) {
    return new Response(JSON.stringify({ error: 'Payment method mismatch with order' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (String(order.payment_status || '').toLowerCase() === 'paid') {
    return new Response(JSON.stringify({ error: 'Order is already paid' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const amountPaise = Math.max(1, Math.round(Number(order.total_amount || 0) * 100));
  const receipt = `hatvoni_${String(order.display_order_id || order.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24)}`;

  const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt,
      payment_capture: 1,
      notes: {
        local_order_id: order.id,
        display_order_id: order.display_order_id || undefined,
        user_id: order.user_id,
      },
    }),
  });

  const razorpayRaw = await razorpayResponse.text();
  let razorpayOrder: any = null;
  try {
    razorpayOrder = JSON.parse(razorpayRaw);
  } catch {
    razorpayOrder = null;
  }

  if (!razorpayResponse.ok || !razorpayOrder?.id) {
    return new Response(JSON.stringify({
      error: 'Failed to create Razorpay order',
      details: razorpayOrder?.error?.description || razorpayRaw,
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const paymentMetadata = {
    ...(order.payment_metadata || {}),
    checkout_payment_method: String(order.payment_method || '').toLowerCase(),
    razorpay_order: razorpayOrder,
    last_gateway_sync_at: new Date().toISOString(),
  };

  const { error: updateError } = await adminClient
    .from('orders')
    .update({
      payment_gateway: 'razorpay',
      payment_status: 'initiated',
      razorpay_order_id: razorpayOrder.id,
      payment_attempted_at: new Date().toISOString(),
      payment_metadata: paymentMetadata,
    })
    .eq('id', order.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to update local order for Razorpay', details: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('first_name, last_name, email, phone')
    .eq('id', order.user_id)
    .maybeSingle();

  return new Response(JSON.stringify({
    ok: true,
    order_id: order.id,
    display_order_id: order.display_order_id,
    payment_method: String(order.payment_method || '').toLowerCase(),
    key_id: razorpayKeyId,
    razorpay_order_id: razorpayOrder.id,
    amount: amountPaise,
    currency: razorpayOrder.currency || 'INR',
    customer: {
      name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || undefined,
      email: profile?.email || undefined,
      contact: profile?.phone || undefined,
    },
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
