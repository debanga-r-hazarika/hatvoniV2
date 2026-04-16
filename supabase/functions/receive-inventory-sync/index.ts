import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

/**
 * Customer Site edge function: receive-inventory-sync
 *
 * Receives the inventory snapshot pushed by Insider's sync-inventory-to-customer-site
 * and upserts hatvoni_inventory (tag summary) + hatvoni_inventory_lots (lot detail).
 *
 * Authentication: shared secret via x-inventory-sync-secret header.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   INVENTORY_SYNC_SECRET — must match CUSTOMER_SITE_INVENTORY_SYNC_SECRET on Insider
 */

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

type LotPayload = {
  insider_lot_id: string;
  batch_reference: string;
  product_type: string;
  qty_available: number;
  unit: string;
  output_size: number | null;
  output_size_unit: string | null;
  production_date: string | null;
};

type TagPayload = {
  tag_key: string;
  display_name: string;
  unit: string;
  total_qty_available: number;
  lot_count: number;
  lots: LotPayload[];
};

type SyncPayload = {
  synced_at: string;
  tags: TagPayload[];
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const inboundSecret = req.headers.get('x-inventory-sync-secret') || '';
  const expectedSecret = requireEnv('INVENTORY_SYNC_SECRET');

  if (!inboundSecret || !timingSafeEqual(inboundSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: SyncPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!Array.isArray(body?.tags)) {
    return new Response(JSON.stringify({ error: 'tags[] is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const now = new Date().toISOString();
  let tagsUpserted = 0;
  let lotsUpserted = 0;
  const errors: string[] = [];

  for (const tag of body.tags) {
    try {
      // ── Upsert tag summary ───────────────────────────────────────────────
      const { error: tagErr } = await supabase
        .from('hatvoni_inventory')
        .upsert({
          tag_key: tag.tag_key,
          display_name: tag.display_name,
          unit: tag.unit || 'unit',
          total_qty_available: Number(tag.total_qty_available || 0),
          lot_count: Number(tag.lot_count || 0),
          last_synced_at: now,
          updated_at: now,
        }, { onConflict: 'tag_key' });

      if (tagErr) throw tagErr;
      tagsUpserted++;

      // ── Upsert each lot ──────────────────────────────────────────────────
      for (const lot of tag.lots || []) {
        const { error: lotErr } = await supabase
          .from('hatvoni_inventory_lots')
          .upsert({
            tag_key: tag.tag_key,
            insider_lot_id: lot.insider_lot_id,
            batch_reference: lot.batch_reference,
            product_type: lot.product_type,
            qty_available: Number(lot.qty_available || 0),
            unit: lot.unit || tag.unit || 'unit',
            output_size: lot.output_size ?? null,
            output_size_unit: lot.output_size_unit ?? null,
            production_date: lot.production_date ?? null,
            last_synced_at: now,
            updated_at: now,
          }, { onConflict: 'insider_lot_id' });

        if (lotErr) throw lotErr;
        lotsUpserted++;
      }

      // ── Remove lots that no longer exist for this tag ────────────────────
      // (lots that were in DB but not in the sync payload = deleted/exhausted)
      const incomingLotIds = (tag.lots || []).map((l) => l.insider_lot_id);
      if (incomingLotIds.length > 0) {
        await supabase
          .from('hatvoni_inventory_lots')
          .delete()
          .eq('tag_key', tag.tag_key)
          .not('insider_lot_id', 'in', `(${incomingLotIds.map((id) => `"${id}"`).join(',')})`);
      } else {
        // No lots at all — clear everything for this tag
        await supabase
          .from('hatvoni_inventory_lots')
          .delete()
          .eq('tag_key', tag.tag_key);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`tag ${tag.tag_key}: ${msg}`);
      console.error(`receive-inventory-sync error for tag ${tag.tag_key}:`, msg);
    }
  }

  return new Response(JSON.stringify({
    ok: errors.length === 0,
    tags_upserted: tagsUpserted,
    lots_upserted: lotsUpserted,
    errors: errors.length > 0 ? errors : undefined,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
