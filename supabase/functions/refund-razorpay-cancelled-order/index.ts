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

function base64Encode(value: string): string {
  return btoa(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const razorpayKeyId = requireEnv('RAZORPAY_KEY_ID');
  const razorpayKeySecret = requireEnv('RAZORPAY_KEY_SECRET');
  const adminClient = createAdminClient();

  const token = getBearerToken(req);
  const { data: authData } = token ? await adminClient.auth.getUser(token) : { data: { user: null } };
  const user = authData?.user ?? null;

  let body: { order_id?: string; reason?: string };
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
    .select('id, user_id, payment_method, payment_status, payment_gateway, razorpay_payment_id, total_amount, refund_status, refund_amount, cancellation_reason, payment_metadata')
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

  if (!isRazorpayMethod(order.payment_method) || String(order.payment_status || '').toLowerCase() !== 'paid') {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'not_razorpay_paid' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const currentRefundStatus = String(order.refund_status || '').toLowerCase();
  if (currentRefundStatus === 'initiated' || currentRefundStatus === 'completed') {
    return new Response(JSON.stringify({ ok: true, skipped: true, refund_status: currentRefundStatus }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!order.razorpay_payment_id) {
    const { error: failureUpdateError } = await adminClient
      .from('orders')
      .update({
        refund_status: 'failed',
        payment_metadata: {
          ...(order.payment_metadata || {}),
          refund_error: {
            reason: 'Missing Razorpay payment id',
            recorded_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', order.id);

    if (failureUpdateError) {
      return new Response(JSON.stringify({ error: 'Missing Razorpay payment id' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, refund_status: 'failed', error: 'Missing Razorpay payment id' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const refundAmountRupees = Math.max(Number(order.total_amount || 0), 0);
  const refundAmountPaise = Math.max(1, Math.round(refundAmountRupees * 100));
  const cancellationReason = String(body.reason || order.cancellation_reason || 'Customer cancelled order').trim();

  const refundResponse = await fetch(`https://api.razorpay.com/v1/payments/${order.razorpay_payment_id}/refund`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${base64Encode(`${razorpayKeyId}:${razorpayKeySecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: refundAmountPaise,
      notes: {
        reason: cancellationReason,
        source: 'customer_site',
        order_id: order.id,
      },
    }),
  });

  const refundText = await refundResponse.text();
  let refundPayload: any = null;
  try {
    refundPayload = refundText ? JSON.parse(refundText) : null;
  } catch {
    refundPayload = null;
  }

  if (!refundResponse.ok || !refundPayload?.id) {
    const { error: failureUpdateError } = await adminClient
      .from('orders')
      .update({
        refund_status: 'failed',
        payment_metadata: {
          ...(order.payment_metadata || {}),
          refund_error: {
            reason: refundPayload?.error?.description || refundText || 'Failed to create Razorpay refund',
            recorded_at: new Date().toISOString(),
          },
        },
      })
      .eq('id', order.id);

    if (failureUpdateError) {
      return new Response(JSON.stringify({ error: 'Failed to create Razorpay refund', details: failureUpdateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, refund_status: 'failed', error: refundPayload?.error?.description || 'Failed to create Razorpay refund' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const nextRefundStatus = String(refundPayload.status || '').toLowerCase() === 'processed' ? 'completed' : 'initiated';
  const paymentMetadata = {
    ...(order.payment_metadata || {}),
    cancellation_refund: {
      refund_id: refundPayload.id,
      refund_status: refundPayload.status || nextRefundStatus,
      amount: refundPayload.amount || refundAmountPaise,
      created_at: new Date().toISOString(),
      reason: cancellationReason,
    },
  };

  const { error: updateError } = await adminClient
    .from('orders')
    .update({
      refund_amount: refundAmountRupees,
      refund_status: nextRefundStatus,
      payment_status: nextRefundStatus === 'completed' ? 'refunded' : order.payment_status,
      payment_metadata: paymentMetadata,
    })
    .eq('id', order.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Refund created but failed to save local state', details: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    order_id: order.id,
    refund_status: nextRefundStatus,
    refund_amount: refundAmountRupees,
    razorpay_refund_id: refundPayload.id,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});