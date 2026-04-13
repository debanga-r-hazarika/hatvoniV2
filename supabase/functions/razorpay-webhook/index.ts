import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function triggerForwardOrder(orderId: string): Promise<void> {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const url = `${supabaseUrl}/functions/v1/forward-order-to-insider`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId }),
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const webhookSecret = requireEnv('RAZORPAY_WEBHOOK_SECRET');
  const adminClient = createAdminClient();

  const receivedSignature = req.headers.get('x-razorpay-signature') || '';
  if (!receivedSignature) {
    return new Response(JSON.stringify({ error: 'Missing x-razorpay-signature header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  const expectedSignature = await hmacSha256Hex(webhookSecret, rawBody);
  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const eventType = String(body?.event || 'unknown');
  const eventIdHeader = req.headers.get('x-razorpay-event-id');
  const derivedEventId = eventIdHeader || await sha256Hex(rawBody);

  const { error: eventInsertError } = await adminClient
    .from('razorpay_webhook_events')
    .insert({
      event_id: derivedEventId,
      event_type: eventType,
      payload: body,
    });

  if (eventInsertError) {
    const duplicate = eventInsertError.message?.toLowerCase().includes('duplicate')
      || eventInsertError.message?.toLowerCase().includes('unique');

    if (duplicate) {
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Failed to persist webhook event', details: eventInsertError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const paymentEntity = body?.payload?.payment?.entity || null;
  const orderEntity = body?.payload?.order?.entity || null;

  const razorpayOrderId = String(paymentEntity?.order_id || orderEntity?.id || '');
  if (!razorpayOrderId) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'no_order_reference' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, payment_status, payment_metadata')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle();

  if (orderError || !order) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'order_not_found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const currentStatus = String(order.payment_status || '').toLowerCase();
  let nextStatus = currentStatus;

  if (eventType === 'payment.captured' || eventType === 'order.paid') {
    nextStatus = 'paid';
  } else if (eventType === 'payment.failed') {
    nextStatus = 'failed';
  } else if (eventType.startsWith('refund.')) {
    nextStatus = 'refunded';
  } else {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'event_not_mapped' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const paymentMetadata = {
    ...(order.payment_metadata || {}),
    latest_webhook: {
      event_id: derivedEventId,
      event_type: eventType,
      received_at: new Date().toISOString(),
    },
  };

  const updatePayload: Record<string, unknown> = {
    payment_status: nextStatus,
    payment_gateway: 'razorpay',
    payment_metadata: paymentMetadata,
  };

  if (paymentEntity?.id) {
    updatePayload.razorpay_payment_id = String(paymentEntity.id);
  }

  if (nextStatus === 'paid') {
    updatePayload.paid_at = new Date().toISOString();
  }

  const { error: updateError } = await adminClient
    .from('orders')
    .update(updatePayload)
    .eq('id', order.id)
    .neq('payment_status', nextStatus);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to apply webhook state', details: updateError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (nextStatus === 'paid' && currentStatus !== 'paid') {
    await triggerForwardOrder(order.id);
  }

  return new Response(JSON.stringify({ ok: true, order_id: order.id, status: nextStatus }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
