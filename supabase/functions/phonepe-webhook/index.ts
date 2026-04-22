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

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function derivePaymentStatus(statusPayload: any): 'paid' | 'failed' | 'pending' {
  const code = String(statusPayload?.code || '').toUpperCase();
  const state = String(statusPayload?.state || statusPayload?.payload?.state || '').toUpperCase();

  if (code === 'PAYMENT_SUCCESS' || state === 'COMPLETED' || state === 'SUCCESS') {
    return 'paid';
  }

  if (
    ['PAYMENT_ERROR', 'PAYMENT_FAILED', 'PAYMENT_DECLINED', 'PAYMENT_CANCELLED', 'PAYMENT_EXPIRED'].includes(code)
    || ['FAILED', 'DECLINED', 'CANCELLED', 'EXPIRED'].includes(state)
  ) {
    return 'failed';
  }

  return 'pending';
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function extractMerchantOrderId(body: any): string | null {
  const candidates = [
    body?.merchantOrderId,
    body?.merchant_order_id,
    body?.payload?.merchantOrderId,
    body?.payload?.merchant_order_id,
    body?.data?.merchantOrderId,
    body?.data?.merchant_order_id,
  ];

  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return value ? String(value).trim() : null;
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

  const webhookUsername = requireEnv('PHONEPE_WEBHOOK_USERNAME');
  const webhookPassword = requireEnv('PHONEPE_WEBHOOK_PASSWORD');

  const authHeader = String(req.headers.get('authorization') || req.headers.get('Authorization') || '').trim();
  const expectedWebhookAuthHash = await sha256Hex(`${webhookUsername}:${webhookPassword}`);
  const expectedHeaderWithPrefix = `SHA256(${expectedWebhookAuthHash})`;
  const expectedHeaderRaw = expectedWebhookAuthHash;
  const expectedHeaderLiteralCreds = `SHA256(${webhookUsername}:${webhookPassword})`;

  if (
    !timingSafeEqual(authHeader, expectedHeaderWithPrefix)
    && !timingSafeEqual(authHeader, expectedHeaderRaw)
    && !timingSafeEqual(authHeader, expectedHeaderLiteralCreds)
  ) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid PhonePe webhook authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const eventType = String(body?.event || '').trim();
  if (!['checkout.order.completed', 'checkout.order.failed'].includes(eventType)) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'Event type is not handled for order payment reconciliation' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const merchantOrderId = extractMerchantOrderId(body);
  if (!merchantOrderId) {
    return new Response(JSON.stringify({ ok: false, error: 'merchantOrderId missing from callback payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, payment_method, payment_status, paid_at, payment_metadata')
    .eq('id', merchantOrderId)
    .maybeSingle();

  if (orderError) {
    return new Response(JSON.stringify({ ok: false, error: 'Unable to load linked order', details: orderError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!order) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'No local order linked to merchantOrderId' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (String(order.payment_method || '').toLowerCase() !== 'phonepe') {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'Order payment method is not phonepe' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const derivedStatus = derivePaymentStatus(body);
  const alreadyPaid = String(order.payment_status || '').toLowerCase() === 'paid';

  const paymentMetadata = {
    ...(order.payment_metadata || {}),
    phonepe: {
      ...(order.payment_metadata?.phonepe || {}),
      merchant_order_id: merchantOrderId,
      webhook_payload: body,
      webhook_event: eventType,
      webhook_received_at: new Date().toISOString(),
      last_status_code: body?.code || null,
      last_status_sync_at: new Date().toISOString(),
    },
  };

  const updatePayload: Record<string, unknown> = {
    payment_gateway: 'phonepe',
    payment_metadata: paymentMetadata,
  };

  if (derivedStatus === 'paid') {
    updatePayload.payment_status = 'paid';
    updatePayload.paid_at = order.paid_at || new Date().toISOString();
  } else if (derivedStatus === 'failed' && !alreadyPaid) {
    updatePayload.payment_status = 'failed';
  }

  const { error: updateError } = await adminClient
    .from('orders')
    .update(updatePayload)
    .eq('id', order.id);

  if (updateError) {
    return new Response(JSON.stringify({ ok: false, error: 'Failed to update order from PhonePe webhook', details: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const finalStatus = derivedStatus === 'failed' && alreadyPaid ? 'paid' : derivedStatus;

  return new Response(JSON.stringify({
    ok: true,
    order_id: order.id,
    merchant_order_id: merchantOrderId,
    payment_status: finalStatus,
    source: 'phonepe-webhook',
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
