/**
 * process-order-refund
 *
 * Handles item-level and full-order refunds for Razorpay payments.
 * Called by admin after:
 *   - reject_full  → full refund of paid amount
 *   - proceed_partial → partial refund for rejected items only
 *
 * Admin-only endpoint. Validates JWT + is_admin.
 *
 * Body:
 *   { order_id: string, mode: 'full' | 'partial', reason?: string }
 *
 * For 'partial' mode, the function:
 *   1. Reads rejected_items from the order
 *   2. Calculates the refund amount from order_items prices
 *   3. Issues a partial refund via Razorpay API
 *   4. Updates order.refund_amount, refund_status, payment_status
 *
 * For 'full' mode:
 *   1. Refunds the full paid amount
 *   2. Updates order accordingly
 */

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

function createAdminClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const parts = h.split(' ');
  return parts.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : null;
}

async function razorpayRefund(
  paymentId: string,
  amountPaise: number,
  notes: Record<string, string>,
  keyId: string,
  keySecret: string,
): Promise<{ id: string; amount: number; status: string }> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount: amountPaise, notes }),
  });

  const raw = await res.text();
  let data: any;
  try { data = JSON.parse(raw); } catch { data = null; }

  if (!res.ok || !data?.id) {
    throw new Error(data?.error?.description || `Razorpay refund failed: ${raw}`);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createAdminClient();
  const razorpayKeyId = requireEnv('RAZORPAY_KEY_ID');
  const razorpayKeySecret = requireEnv('RAZORPAY_KEY_SECRET');

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = getBearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { order_id?: string; mode?: string; reason?: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { order_id, mode, reason } = body;
  if (!order_id || !mode || !['full', 'partial'].includes(mode)) {
    return new Response(JSON.stringify({ error: 'order_id and mode (full|partial) are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Load order ────────────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status, payment_method, payment_status, razorpay_payment_id, total_amount, refund_status, rejected_items, billing_breakdown')
    .eq('id', order_id)
    .maybeSingle();

  if (orderErr || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Validate refund eligibility ───────────────────────────────────────────
  const isRazorpay = ['razorpay', 'razorpay_upi', 'razorpay_cards'].includes(order.payment_method);
  if (!isRazorpay) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'COD orders do not require refund processing' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (order.payment_status !== 'paid') {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: `Payment status is ${order.payment_status}, not paid` }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (['initiated', 'completed'].includes(order.refund_status)) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: `Refund already ${order.refund_status}` }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!order.razorpay_payment_id) {
    return new Response(JSON.stringify({ error: 'No Razorpay payment ID on order — cannot refund' }), {
      status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Calculate refund amount ───────────────────────────────────────────────
  let refundAmountRupees = 0;

  if (mode === 'full') {
    refundAmountRupees = Number(order.total_amount || 0);
  } else {
    // Partial: sum up rejected items from order_items
    const rejectedItems: Array<{ order_item_id: string; product_key: string }> =
      Array.isArray(order.rejected_items) ? order.rejected_items : [];

    if (rejectedItems.length === 0) {
      return new Response(JSON.stringify({ error: 'No rejected items found for partial refund' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load order items to calculate prices
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('id, quantity, price, lot_snapshot')
      .eq('order_id', order_id);

    const itemMap = new Map((orderItems || []).map((i: any) => [i.id, i]));

    for (const rejected of rejectedItems) {
      const item = itemMap.get(rejected.order_item_id);
      if (!item) continue;

      if (Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0) {
        // Find the specific product in the lot snapshot
        const snap = item.lot_snapshot.find((s: any) => s.product_key === rejected.product_key);
        if (snap) {
          const qty = Number(snap.quantity || 0) * Number(item.quantity || 0);
          refundAmountRupees += Number(snap.unit_price || 0) * qty;
        }
      } else {
        // Direct product
        refundAmountRupees += Number(item.price || 0) * Number(item.quantity || 0);
      }
    }

    if (refundAmountRupees <= 0) {
      return new Response(JSON.stringify({ error: 'Calculated refund amount is zero' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const refundAmountPaise = Math.round(refundAmountRupees * 100);

  // ── Issue Razorpay refund ─────────────────────────────────────────────────
  let refundResult: { id: string; amount: number; status: string };
  try {
    refundResult = await razorpayRefund(
      order.razorpay_payment_id,
      refundAmountPaise,
      {
        order_id,
        mode,
        reason: reason || (mode === 'full' ? 'Order rejected by admin' : 'Partial fulfillment — rejected items refunded'),
        initiated_by: user.id,
      },
      razorpayKeyId,
      razorpayKeySecret,
    );
  } catch (err: any) {
    // Mark refund as failed
    await supabase.from('orders').update({
      refund_status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('id', order_id);

    return new Response(JSON.stringify({ error: err.message || 'Razorpay refund failed' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Update order ──────────────────────────────────────────────────────────
  const newPaymentStatus = mode === 'full' ? 'refunded' : 'partially_refunded';
  const newRefundStatus = 'initiated';

  await supabase.from('orders').update({
    refund_status: newRefundStatus,
    refund_amount: refundAmountRupees,
    payment_status: newPaymentStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', order_id);

  // ── Write workflow log ────────────────────────────────────────────────────
  await supabase.from('order_workflow_log').insert({
    order_id,
    event_type: mode === 'full' ? 'full_refund_initiated' : 'partial_refund_initiated',
    actor_id: user.id,
    actor_role: 'admin',
    metadata: {
      razorpay_refund_id: refundResult.id,
      refund_amount_rupees: refundAmountRupees,
      refund_amount_paise: refundAmountPaise,
      mode,
      reason,
    },
  });

  return new Response(JSON.stringify({
    ok: true,
    refund_id: refundResult.id,
    refund_amount: refundAmountRupees,
    refund_status: newRefundStatus,
    payment_status: newPaymentStatus,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
