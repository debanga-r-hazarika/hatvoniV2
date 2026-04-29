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

type ActionBody = {
  action?: 'check' | 'deduct' | 'restock';
  order_id?: string;
  order_item_id?: string;
  product_key?: string;
  qty?: number;
  assigned_batch_id?: string;
  assigned_batch_reference?: string;
  idempotency_key?: string;
};

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
    const body = await req.json().catch(() => ({})) as ActionBody;
    const action = body.action || 'check';
    if (action !== 'check' && action !== 'deduct' && action !== 'restock') {
      return new Response(JSON.stringify({ error: 'action must be check, deduct, or restock' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!body.order_id) {
      return new Response(JSON.stringify({ error: 'order_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Deduct/restock path (batch-level, idempotent) ────────────────────
    if (action === 'deduct' || action === 'restock') {
      const orderItemId = String(body.order_item_id || '').trim();
      const productKey = String(body.product_key || '').trim();
      const assignedBatchId = String(body.assigned_batch_id || '').trim();
      const assignedBatchReference = String(body.assigned_batch_reference || '').trim();
      const idempotencyKey = String(body.idempotency_key || `${orderItemId}:${productKey}:${assignedBatchId}`).trim();
      const qty = Number(body.qty || 0);
      const isRestock = action === 'restock';

      if (!orderItemId || !productKey || !assignedBatchId || !idempotencyKey) {
        return new Response(JSON.stringify({ error: 'order_item_id, product_key, assigned_batch_id and idempotency_key are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return new Response(JSON.stringify({ error: 'qty must be a positive number' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: approval, error: approvalErr } = await supabase
        .from('order_item_approvals')
        .select('id, order_item_id, product_key, inventory_deduction_status, inventory_deduction_ref, assigned_batch_id, assigned_batch_reference')
        .eq('order_item_id', orderItemId)
        .eq('product_key', productKey)
        .maybeSingle();
      if (approvalErr) throw approvalErr;
      if (!approval) {
        return new Response(JSON.stringify({ error: 'Approval record not found for order item/product key' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!isRestock && approval.inventory_deduction_status === 'success' && approval.inventory_deduction_ref === idempotencyKey) {
        return new Response(JSON.stringify({ ok: true, idempotent: true, inventory_deduction_ref: idempotencyKey }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (isRestock) {
        const { data: restockEvents, error: restockEventsErr } = await supabase
          .from('order_item_batch_events')
          .select('payload')
          .eq('order_item_id', orderItemId)
          .eq('product_key', productKey)
          .eq('event_type', 'restock_success')
          .order('created_at', { ascending: false })
          .limit(50);
        if (restockEventsErr) throw restockEventsErr;
        const alreadyDone = (restockEvents || []).some((ev: any) => String(ev?.payload?.idempotency_key || '') === idempotencyKey);
        if (alreadyDone) {
          return new Response(JSON.stringify({ ok: true, action: 'restock', idempotent: true, inventory_deduction_ref: idempotencyKey }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const { data: lot, error: lotErr } = await supabase
        .from('hatvoni_inventory_lots')
        .select('insider_lot_id, batch_reference, qty_available, tag_key')
        .eq('insider_lot_id', assignedBatchId)
        .eq('tag_key', productKey)
        .maybeSingle();
      if (lotErr) throw lotErr;
      if (!lot) {
        return new Response(JSON.stringify({ error: 'Assigned batch not found for this product key' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const lotQty = Number(lot.qty_available || 0);
      if (!isRestock && lotQty < qty) {
        await supabase
          .from('order_item_approvals')
          .update({
            inventory_deduction_status: 'failed',
            inventory_deduction_ref: idempotencyKey,
            updated_at: new Date().toISOString(),
          })
          .eq('order_item_id', orderItemId)
          .eq('product_key', productKey);
        return new Response(JSON.stringify({ error: 'Insufficient quantity in assigned batch', qty_available: lotQty, qty_required: qty }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const nextQty = isRestock ? lotQty + qty : lotQty - qty;
      const { error: lotUpdateErr } = await supabase
        .from('hatvoni_inventory_lots')
        .update({
          qty_available: nextQty,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('insider_lot_id', assignedBatchId)
        .eq('tag_key', productKey);
      if (lotUpdateErr) throw lotUpdateErr;

      const { data: remainingLots, error: remErr } = await supabase
        .from('hatvoni_inventory_lots')
        .select('qty_available')
        .eq('tag_key', productKey);
      if (remErr) throw remErr;
      const nextTotal = (remainingLots || []).reduce((sum: number, row: any) => sum + Number(row.qty_available || 0), 0);

      const { error: invUpdateErr } = await supabase
        .from('hatvoni_inventory')
        .update({
          total_qty_available: nextTotal,
          lot_count: (remainingLots || []).filter((row: any) => Number(row.qty_available || 0) > 0).length,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('tag_key', productKey);
      if (invUpdateErr) throw invUpdateErr;

      const { error: approvalUpdateErr } = await supabase
        .from('order_item_approvals')
        .update({
          assigned_batch_id: assignedBatchId,
          assigned_batch_reference: assignedBatchReference || lot.batch_reference,
          inventory_deduction_status: isRestock ? 'retried' : 'success',
          inventory_deduction_ref: idempotencyKey,
          updated_at: new Date().toISOString(),
        })
        .eq('order_item_id', orderItemId)
        .eq('product_key', productKey);
      if (approvalUpdateErr) throw approvalUpdateErr;

      await supabase.from('order_item_batch_events').insert({
        order_item_id: orderItemId,
        product_key: productKey,
        event_type: isRestock ? 'restock_success' : 'deduction_success',
        actor_id: user.id,
        payload: {
          idempotency_key: idempotencyKey,
          assigned_batch_id: assignedBatchId,
          assigned_batch_reference: assignedBatchReference || lot.batch_reference,
          quantity: qty,
          operation: isRestock ? 'restock' : 'deduct',
          lot_qty_before: lotQty,
          lot_qty_after: nextQty,
          inventory_total_after: nextTotal,
        },
      }).then(() => {}, () => {});

      return new Response(JSON.stringify({
        ok: true,
        action: isRestock ? 'restock' : 'deduct',
        order_item_id: orderItemId,
        product_key: productKey,
        assigned_batch_id: assignedBatchId,
        assigned_batch_reference: assignedBatchReference || lot.batch_reference,
        quantity: qty,
        lot_qty_after: nextQty,
        inventory_total_after: nextTotal,
        inventory_deduction_ref: idempotencyKey,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. Load order items for check action ─────────────────────────────────
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

    // ── 5. Query local hatvoni_inventory ─────────────────────────────────────
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

    return new Response(JSON.stringify({ ok: true, action: 'check', all_available: allAvailable, items: results }), {
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
