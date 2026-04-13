import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const MAX_SKEW_MS = 5 * 60 * 1000;

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

type SyncPayload = {
  contract_version: number;
  external_order_id: string;
  external_customer_id: string;
  version: number;
  order_status: string;
  notes?: string | null;
  processed_at?: string | null;
  shipping?: {
    provider?: string | null;
    tracking_number?: string | null;
    shipment_status?: string | null;
    shipped_at?: string | null;
    transport_cost?: number | null;
    transport_covered_by?: string | null;
  };
};

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
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sharedSecret = requireEnv('INSIDER_SYNC_SHARED_SECRET');
  const timestamp = req.headers.get('X-Insider-Timestamp') || req.headers.get('x-insider-timestamp');
  const signature = req.headers.get('X-Insider-Signature') || req.headers.get('x-insider-signature');

  if (!timestamp || !signature) {
    return new Response(JSON.stringify({ error: 'Missing signature headers' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return new Response(JSON.stringify({ error: 'Invalid timestamp header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Date.now();
  if (Math.abs(now - timestampMs) > MAX_SKEW_MS) {
    return new Response(JSON.stringify({ error: 'Timestamp skew too large' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  const expectedSignature = await hmacSha256Hex(sharedSecret, `${timestamp}.${rawBody}`);

  if (!timingSafeEqual(signature, expectedSignature)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: SyncPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.external_order_id || !body.external_customer_id || typeof body.version !== 'number') {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createAdminClient();

  const logFailure = async (errorMessage: string) => {
    await adminClient.from('insider_sync_failures').insert({
      source: 'insider_to_customer_sync',
      external_order_id: body.external_order_id,
      external_customer_id: body.external_customer_id,
      version: body.version,
      error_message: errorMessage,
      payload: {
        contract_version: body.contract_version,
        order_status: body.order_status,
        has_shipping: Boolean(body.shipping),
      },
    });
  };

  try {
    const { data: currentOrder, error: fetchError } = await adminClient
      .from('orders')
      .select('id, external_order_id, external_customer_id, last_received_version')
      .eq('external_order_id', body.external_order_id)
      .maybeSingle();

    if (fetchError || !currentOrder) {
      await logFailure('Order not found for external_order_id');
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (currentOrder.external_customer_id && currentOrder.external_customer_id !== body.external_customer_id) {
      await logFailure('external_customer_id mismatch');
      return new Response(JSON.stringify({ error: 'external_customer_id mismatch' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (Number(body.version) <= Number(currentOrder.last_received_version || 0)) {
      return new Response(JSON.stringify({ ok: true, applied: false, reason: 'stale_version' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updatePayload = {
      insider_order_status: body.order_status,
      insider_notes: body.notes ?? null,
      processed_at: body.processed_at ?? null,
      shipment_provider: body.shipping?.provider ?? null,
      tracking_number: body.shipping?.tracking_number ?? null,
      shipment_status: body.shipping?.shipment_status ?? null,
      shipped_at: body.shipping?.shipped_at ?? null,
      last_received_version: body.version,
      last_synced_at: new Date().toISOString(),
      // Mark refund pending if cancelled and Razorpay payment exists
      ...(body.order_status === 'cancelled' ? { status: 'cancelled' } : {}),
    };

    const { data: updated, error: updateError } = await adminClient
      .from('orders')
      .update(updatePayload)
      .eq('id', currentOrder.id)
      .lt('last_received_version', body.version)
      .select('id')
      .maybeSingle();

    if (updateError) {
      await logFailure(`Update failed: ${updateError.message}`);
      return new Response(JSON.stringify({ error: 'Failed to update order projection' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, applied: Boolean(updated) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('insider-order-sync error:', error);
    await logFailure('Unexpected sync error');
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
