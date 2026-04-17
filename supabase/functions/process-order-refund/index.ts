import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getEnv(name: string): string | null {
  return Deno.env.get(name) ?? null;
}

function createAdminClient() {
  const url = getEnv('SUPABASE_URL')!;
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, {
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
    throw new Error(data?.error?.description || `Razorpay refund failed (${res.status}): ${raw}`);
  }
  return data;
}

Deno.serve(async (req: Request) => {
  // Always handle CORS preflight first — before any env reads
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Read env vars inside handler so missing vars return 500 instead of crashing boot
  const supabaseUrl = getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const razorpayKeyId = getEnv('RAZORPAY_KEY_ID');
  const razorpayKeySecret = getEnv('RAZORPAY_KEY_SECRET');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: missing Supabase env vars' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!razorpayKeyId || !razorpayKeySecret) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: missing Razorpay env vars' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createAdminClient();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = getBearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized — no token provided' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: { user }, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token', detail: authErr?.message }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: profile } = await adminClient
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { order_id?: string; mode?: string; reason?: string };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
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
  const { data: order, error: orderErr } = await adminClient
    .from('orders')
    .select('id, status, payment_method, payment_status, razorpay_payment_id, total_amount, refund_status, rejected_items')
    .eq('id', order_id)
    .maybeSingle();

  if (orderErr || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Validate eligibility ──────────────────────────────────────────────────
  const isRazorpay = ['razorpay', 'razorpay_upi', 'razorpay_cards'].includes(order.payment_method);
  if (!isRazorpay) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'COD — no refund required' }), {
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
    const rejectedItems: Array<{ order_item_id: string; product_key: string }> =
      Array.isArray(order.rejected_items) ? order.rejected_items : [];

    if (rejectedItems.length === 0) {
      return new Response(JSON.stringify({ error: 'No rejected items found for partial refund' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: orderItems, error: itemsErr } = await adminClient
      .from('order_items')
      .select('id, quantity, price, lot_snapshot')
      .eq('order_id', order_id);

    if (itemsErr) {
      return new Response(JSON.stringify({ error: 'Failed to load order items: ' + itemsErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const itemMap = new Map((orderItems || []).map((i: any) => [i.id, i]));

    for (const rejected of rejectedItems) {
      const item = itemMap.get(rejected.order_item_id);
      if (!item) { console.warn(`Item ${rejected.order_item_id} not found`); continue; }

      if (Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0) {
        const snap = item.lot_snapshot.find((s: any) => s.product_key === rejected.product_key);
        if (snap) {
          refundAmountRupees += Number(snap.unit_price || 0) * Number(snap.quantity || 0) * Number(item.quantity || 0);
        }
      } else {
        refundAmountRupees += Number(item.price || 0) * Number(item.quantity || 0);
      }
    }

    if (refundAmountRupees <= 0) {
      return new Response(JSON.stringify({
        error: `Calculated refund is ₹0. Check rejected_items match order_items. Rejected: ${JSON.stringify(rejectedItems)}`,
      }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const refundAmountPaise = Math.round(refundAmountRupees * 100);
  console.log(`Refund: ${mode} | ₹${refundAmountRupees} | ${refundAmountPaise} paise | order ${order_id}`);

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
    await adminClient.from('orders').update({
      refund_status: 'failed',
      updated_at: new Date().toISOString(),
    }).eq('id', order_id);
    return new Response(JSON.stringify({ error: err.message || 'Razorpay refund failed' }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Update order ──────────────────────────────────────────────────────────
  const newPaymentStatus = mode === 'full' ? 'refunded' : 'partially_refunded';

  await adminClient.from('orders').update({
    refund_status: 'initiated',
    refund_amount: refundAmountRupees,
    payment_status: newPaymentStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', order_id);

  // ── Audit log ─────────────────────────────────────────────────────────────
  await adminClient.from('order_workflow_log').insert({
    order_id,
    event_type: mode === 'full' ? 'full_refund_initiated' : 'partial_refund_initiated',
    actor_id: user.id,
    actor_role: 'admin',
    metadata: {
      razorpay_refund_id: refundResult.id,
      refund_amount_rupees: refundAmountRupees,
      refund_amount_paise: refundAmountPaise,
      mode,
      reason: reason || null,
    },
  });

  return new Response(JSON.stringify({
    ok: true,
    refund_id: refundResult.id,
    refund_amount: refundAmountRupees,
    refund_status: 'initiated',
    payment_status: newPaymentStatus,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
