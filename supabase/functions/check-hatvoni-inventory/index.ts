import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * Checks Hatvoni Heritage inventory for a given order by querying the local
 * hatvoni_inventory / hatvoni_inventory_lots tables (synced from Insider).
 *
 * No cross-project call needed — fast local query.
 * Admin-only endpoint (verifies JWT + is_admin).
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Parse request ─────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as { order_id?: string };
    if (!body.order_id) {
      return new Response(JSON.stringify({ error: 'order_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Load order items ──────────────────────────────────────────────────
    const { data: orderItems, error: itemsErr } = await supabase
      .from('order_items')
      .select('id, quantity, lot_snapshot, products(key, seller_id, name)')
      .eq('order_id', body.order_id);
    if (itemsErr) throw itemsErr;

    type CheckItem = { product_key: string; product_name: string; qty_needed: number };
    const candidates: CheckItem[] = [];

    for (const item of orderItems || []) {
      if (Array.isArray((item as any).lot_snapshot) && (item as any).lot_snapshot.length > 0) {
        for (const snap of (item as any).lot_snapshot) {
          candidates.push({
            product_key: snap.product_key,
            product_name: snap.product_name || snap.product_key,
            qty_needed: snap.quantity * (item as any).quantity,
          });
        }
      } else if ((item as any).products && !(item as any).products.seller_id) {
        candidates.push({
          product_key: (item as any).products.key,
          product_name: (item as any).products.name || (item as any).products.key,
          qty_needed: (item as any).quantity,
        });
      }
    }

    // Keep only Hatvoni-owned product keys (no seller_id)
    const allKeys = [...new Set(candidates.map((i) => i.product_key).filter(Boolean))];
    let hatvoniKeys = new Set<string>();
    if (allKeys.length > 0) {
      const { data: products } = await supabase
        .from('products').select('key, seller_id').in('key', allKeys);
      hatvoniKeys = new Set(
        (products || []).filter((p: any) => !p.seller_id).map((p: any) => p.key)
      );
    }

    const hatvoniItems = candidates.filter((i) => hatvoniKeys.has(i.product_key));

    if (hatvoniItems.length === 0) {
      return new Response(JSON.stringify({
        ok: true, all_available: true, items: [],
        note: 'No Hatvoni Heritage items in this order.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── 4. Query local hatvoni_inventory ─────────────────────────────────────
    const keys = [...new Set(hatvoniItems.map((i) => i.product_key))];

    const { data: inventory, error: invErr } = await supabase
      .from('hatvoni_inventory')
      .select('tag_key, display_name, unit, total_qty_available, lot_count, last_synced_at')
      .in('tag_key', keys);
    if (invErr) throw invErr;

    // Also fetch lot detail for richer response
    const { data: lots } = await supabase
      .from('hatvoni_inventory_lots')
      .select('tag_key, insider_lot_id, batch_reference, product_type, qty_available, unit, output_size, output_size_unit, production_date')
      .in('tag_key', keys)
      .gt('qty_available', 0)
      .order('production_date', { ascending: true });

    const invByKey = new Map<string, any>(
      (inventory || []).map((r: any) => [r.tag_key, r])
    );
    const lotsByKey = new Map<string, any[]>();
    for (const lot of lots || []) {
      const arr = lotsByKey.get((lot as any).tag_key) || [];
      arr.push(lot);
      lotsByKey.set((lot as any).tag_key, arr);
    }

    const results = hatvoniItems.map((item) => {
      const inv = invByKey.get(item.product_key);
      const itemLots = lotsByKey.get(item.product_key) || [];
      const totalAvailable = inv ? Number(inv.total_qty_available || 0) : 0;

      return {
        product_key: item.product_key,
        product_name: item.product_name || inv?.display_name || item.product_key,
        qty_needed: item.qty_needed,
        qty_available: totalAvailable,
        unit: inv?.unit || 'unit',
        available: totalAvailable >= item.qty_needed,
        last_synced_at: inv?.last_synced_at || null,
        not_in_inventory: !inv,
        lots: itemLots.map((l: any) => ({
          batch_reference: l.batch_reference,
          product_type: l.product_type,
          qty_available: l.qty_available,
          unit: l.unit,
          output_size: l.output_size,
          output_size_unit: l.output_size_unit,
          production_date: l.production_date,
        })),
      };
    });

    const allAvailable = results.every((r) => r.available);

    return new Response(JSON.stringify({ ok: true, all_available: allAvailable, items: results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('check-hatvoni-inventory error:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
