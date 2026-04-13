import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

/**
 * Called from the seller panel when a seller approves or rejects an item.
 * Looks up the seller's profile name, then calls the insider approve-seller-items endpoint.
 * Supports per-item decisions via raw_item_id or product_name.
 * The insider secret never leaves the server.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const insiderApproveUrl = requireEnv('INSIDER_APPROVE_SELLER_URL');
    const insiderSecret = requireEnv('INSIDER_INGEST_SECRET');

    // Verify the caller is an authenticated seller
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify the JWT and get the user
    const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({})) as any;
    const order_id = body?.order_id as string | undefined;
    const product_name = body?.product_name as string | undefined;
    // Per-item fields
    const raw_item_id = body?.raw_item_id as string | undefined;
    const decision = (body?.decision as string | undefined) ?? 'approved';
    const rejection_reason = body?.rejection_reason as string | undefined;

    if (!order_id) {
      return new Response(JSON.stringify({ ok: false, error: 'order_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the seller's profile name
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ ok: false, error: 'Seller profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sellerName = `${(profile.first_name || '').trim()} ${(profile.last_name || '').trim()}`.trim().replace(/\s+/g, ' ');

    // Get the order's external_order_id (= customer site order UUID)
    const { data: order, error: orderErr } = await adminClient
      .from('orders')
      .select('id, external_order_id')
      .eq('id', order_id)
      .maybeSingle();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ ok: false, error: 'Order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const externalOrderId = order.external_order_id ?? order.id;

    // Build payload for insider approve-seller-items
    const insiderPayload: Record<string, unknown> = {
      external_order_id: externalOrderId,
      seller_name: sellerName,
      decision,
    };
    if (raw_item_id) insiderPayload.raw_item_id = raw_item_id;
    else if (product_name) insiderPayload.product_name = product_name;
    if (decision === 'rejected' && rejection_reason) insiderPayload.rejection_reason = rejection_reason;

    // Call insider approve-seller-items with the real secret (server-side only)
    const resp = await fetch(insiderApproveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-customer-site-ingest-secret': insiderSecret,
      },
      body: JSON.stringify(insiderPayload),
    });

    const result = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error('Insider approve-seller-items failed:', resp.status, result);
      // Don't fail the seller — log and return ok so their panel still shows the decision
      return new Response(JSON.stringify({ ok: true, insider_synced: false, insider_error: result?.error }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, insider_synced: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('notify-seller-approved error:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
