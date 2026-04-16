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

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
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

  const razorpayKeySecret = requireEnv('RAZORPAY_KEY_SECRET');
  const adminClient = createAdminClient();

  const token = getBearerToken(req);
  const {
    data: { user },
  } = token ? await adminClient.auth.getUser(token) : { data: { user: null } };

  let body: {
    order_id?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.order_id || !body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
    return new Response(JSON.stringify({ error: 'Missing required Razorpay payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, user_id, payment_method, payment_status, razorpay_order_id, payment_metadata')
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
    return new Response(JSON.stringify({ error: 'Order does not use Razorpay' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (order.razorpay_order_id && order.razorpay_order_id !== body.razorpay_order_id) {
    return new Response(JSON.stringify({ error: 'Razorpay order mismatch' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const expectedSignature = await hmacSha256Hex(
    razorpayKeySecret,
    `${body.razorpay_order_id}|${body.razorpay_payment_id}`,
  );

  if (!timingSafeEqual(body.razorpay_signature, expectedSignature)) {
    return new Response(JSON.stringify({ error: 'Invalid Razorpay signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const alreadyPaid = String(order.payment_status || '').toLowerCase() === 'paid';

  const paymentMetadata = {
    ...(order.payment_metadata || {}),
    verify_response: {
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      verified_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await adminClient
    .from('orders')
    .update({
      payment_gateway: 'razorpay',
      payment_status: 'paid',
      razorpay_order_id: body.razorpay_order_id,
      razorpay_payment_id: body.razorpay_payment_id,
      razorpay_signature: body.razorpay_signature,
      paid_at: new Date().toISOString(),
      payment_metadata: paymentMetadata,
    })
    .eq('id', order.id)
    .neq('payment_status', 'paid');

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to update payment status', details: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!alreadyPaid) {
    // Order is now paid — admin panel will handle fulfillment from here.
  }

  return new Response(JSON.stringify({ ok: true, order_id: order.id, already_paid: alreadyPaid }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
