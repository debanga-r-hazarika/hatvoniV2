import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { buildSellerItemsForOrder, calculateSellerSubtotal } from '../lib/sellerOrderPricing';

const rejectionReasons = [
  'Out of stock',
  'Damaged item',
  'Cannot fulfill in time',
  'Product mismatch',
  'Other',
];

const formatCurrency = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const getDecisionKey = (item) => `${item.source_order_item_id}:${item.product_key}`;

// Map internal order status to seller-facing label
// Uses the computed seller_status column; falls back to raw status mapping
function resolveSellerStatus(order) {
  if (!order) return 'pending_approval';
  // Prefer the computed column (set by sync_order_derived_status trigger)
  const ss = String(order.seller_status || '').toLowerCase();
  if (ss && ss !== 'unknown') return ss;
  // Fallback: map raw status
  const s = String(order.status || 'pending').toLowerCase();
  if (s === 'processing') return order.partial_fulfillment ? 'partially_approved' : 'approved';
  if (s === 'rejected')   return 'rejected';
  if (s === 'shipped')    return 'shipped';
  if (s === 'delivered')  return 'delivered';
  if (s === 'cancelled')  return 'cancelled';
  return 'pending_approval';
}

const SELLER_STATUS_COLORS = {
  pending_approval:    'bg-amber-100 text-amber-800',
  approved:            'bg-emerald-100 text-emerald-800',
  partially_approved:  'bg-orange-100 text-orange-800',
  rejected:            'bg-red-100 text-red-800',
  shipped:             'bg-blue-100 text-blue-800',
  delivered:           'bg-emerald-200 text-emerald-900',
  cancelled:           'bg-red-100 text-red-800',
};

function StatusBadge({ decision }) {
  if (decision === 'approved')
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">✓ Approved</span>;
  if (decision === 'rejected')
    return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">✕ Rejected</span>;
  return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">● Pending</span>;
}

export default function SellerOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isSeller, isAdmin, profile: currentSellerProfile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [sellerItems, setSellerItems] = useState([]);
  const [profile, setProfile] = useState(null);

  // Per-item reject state: itemKey → reason string
  const [rejectReasons, setRejectReasons] = useState({});
  // Which item is currently in "reject mode"
  const [rejectingKey, setRejectingKey] = useState('');
  const [rejectError, setRejectError] = useState('');

  const fetchDetail = useCallback(async () => {
    if (!user?.id || !id) return;
    setLoading(true);
    setError('');
    try {
      const { data: sellerProducts, error: spErr } = await supabase
        .from('products').select('key').eq('seller_id', user.id);
      if (spErr) throw spErr;

      const sellerProductKeys = new Set((sellerProducts || []).map((r) => r.key).filter(Boolean));
      if (sellerProductKeys.size === 0) { setOrder(null); setSellerItems([]); return; }

      const { data: orderData, error: oErr } = await supabase
        .from('orders')
        .select('id, user_id, status, seller_status, partial_fulfillment, rejected_items, total_amount, payment_method, payment_status, created_at, updated_at')
        .eq('id', id).maybeSingle();
      if (oErr) throw oErr;
      if (!orderData) throw new Error('Order not found');

      const { data: orderItemsData, error: oiErr } = await supabase
        .from('order_items')
        .select('id, order_id, lot_name, quantity, price, product_id, lot_snapshot, products(id, key, name)')
        .eq('order_id', id).order('created_at', { ascending: true });
      if (oiErr) throw oiErr;

      const sellerLines = buildSellerItemsForOrder(orderItemsData || [], sellerProductKeys);
      if (sellerLines.length === 0) throw new Error('This order has no items assigned to your seller account.');

      const sellerLineKeys = sellerLines.map((item) => item.source_order_item_id).filter(Boolean);
      let decisionMap = {};
      if (sellerLineKeys.length > 0) {
        const { data: decisionsData, error: dErr } = await supabase
          .from('seller_order_item_decisions')
          .select('order_item_id, product_key, decision, decision_reason, decided_at, override_by, override_reason, overridden_at')
          .eq('seller_id', user.id).in('order_item_id', sellerLineKeys);
        if (dErr) throw dErr;
        decisionMap = (decisionsData || []).reduce((acc, d) => {
          acc[`${d.order_item_id}:${d.product_key}`] = d;
          return acc;
        }, {});
      }

      const sellerItemsWithDecisions = sellerLines.map((item) => {
        const d = decisionMap[getDecisionKey(item)] || null;
        return {
          ...item,
          order_id: orderData.id,
          seller_decision: d?.decision || 'pending',
          seller_decision_reason: d?.decision_reason || '',
          seller_decided_at: d?.decided_at || null,
          admin_override_by: d?.override_by || null,
          admin_override_reason: d?.override_reason || null,
          admin_overridden_at: d?.overridden_at || null,
        };
      });

      let customerProfile = null;
      if (orderData.user_id) {
        const { data: pData } = await supabase.from('profiles')
          .select('id, first_name, last_name, email, phone').eq('id', orderData.user_id).maybeSingle();
        customerProfile = pData;
      }

      setOrder(orderData);
      setSellerItems(sellerItemsWithDecisions);
      setProfile(customerProfile);
    } catch (err) {
      setError(err.message || 'Unable to load order');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    if (!isSeller && !isAdmin) { navigate('/'); return; }
    fetchDetail();

    // Realtime: re-fetch when admin finalizes the order
    const channel = supabase
      .channel('seller-order-' + id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${id}`,
      }, () => { fetchDetail(); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'seller_order_item_decisions',
      }, () => { fetchDetail(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authLoading, fetchDetail, id, isAdmin, isSeller, navigate, user]);

  const sellerFullName = `${currentSellerProfile?.first_name || ''} ${currentSellerProfile?.last_name || ''}`.trim().toLowerCase();
  const sellerEmail = String(currentSellerProfile?.email || '').toLowerCase();
  const isInsiderManagedSeller = sellerFullName.includes('hatvoni') || sellerEmail.endsWith('@hatvoni.com');

  const summary = useMemo(() => sellerItems.reduce(
    (acc, item) => { acc[item.seller_decision || 'pending'] = (acc[item.seller_decision || 'pending'] || 0) + 1; return acc; },
    { pending: 0, approved: 0, rejected: 0 }
  ), [sellerItems]);

  const sellerSubtotal = useMemo(() => calculateSellerSubtotal(sellerItems), [sellerItems]);
  const customerName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Customer';

  const updateItemDecisions = useCallback(async (updates) => {
    if (!updates.length || isUpdating || isInsiderManagedSeller) return;
    const pendingUpdates = updates.filter(({ item }) => (item.seller_decision || 'pending') === 'pending');
    if (!pendingUpdates.length) return;

    setIsUpdating(true);
    try {
      const payload = pendingUpdates.map(({ item, decision, reason }) => ({
        order_item_id: item.source_order_item_id,
        product_key: item.product_key,
        seller_id: user.id,
        decision,
        decision_reason: decision === 'rejected' ? reason : null,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from('seller_order_item_decisions')
        .upsert(payload, { onConflict: 'order_item_id,product_key,seller_id' });
      if (upsertError) throw upsertError;

      // Optimistic local update — no full reload, stays on page
      const now = new Date().toISOString();
      setSellerItems((prev) => prev.map((item) => {
        const update = pendingUpdates.find(({ item: u }) => getDecisionKey(u) === getDecisionKey(item));
        if (!update) return item;
        return {
          ...item,
          seller_decision: update.decision,
          seller_decision_reason: update.decision === 'rejected' ? (update.reason || '') : '',
          seller_decided_at: now,
        };
      }));

      setRejectingKey('');
      setRejectReasons({});
      setRejectError('');

      // Decisions are stored locally in seller_order_item_decisions.
      // Admin panel handles order progression — no external sync needed.
      Promise.resolve().catch((err) => console.warn('Decision sync warning:', err));

    } catch (err) {
      alert('Failed to save decision: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUpdating(false);
    }
  }, [isInsiderManagedSeller, isUpdating, user?.id]);

  const handleApprove = useCallback((item) => {
    if (rejectingKey === getDecisionKey(item)) setRejectingKey('');
    updateItemDecisions([{ item, decision: 'approved' }]);
  }, [rejectingKey, updateItemDecisions]);

  const handleStartReject = useCallback((item) => {
    setRejectingKey(getDecisionKey(item));
    setRejectError('');
  }, []);

  const handleConfirmReject = useCallback((item) => {
    const reason = (rejectReasons[getDecisionKey(item)] || '').trim();
    if (!reason) { setRejectError('Please select a reason.'); return; }
    updateItemDecisions([{ item, decision: 'rejected', reason }]);
  }, [rejectReasons, updateItemDecisions]);

  const handleApproveAll = useCallback(() => {
    const pending = sellerItems.filter((item) => (item.seller_decision || 'pending') === 'pending');
    if (!pending.length) return;
    updateItemDecisions(pending.map((item) => ({ item, decision: 'approved' })));
  }, [sellerItems, updateItemDecisions]);

  if (loading) {
    return (
      <main className="pt-8 md:pt-12 pb-20 min-h-[60vh] grid place-items-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="pt-8 pb-20 max-w-4xl mx-auto px-6 text-center">
        <span className="material-symbols-outlined text-6xl text-error">error</span>
        <h1 className="font-brand text-4xl text-primary mt-4">Order not available</h1>
        <p className="text-on-surface-variant mt-3">{error || 'You do not have permission to view this order.'}</p>
        <Link to="/seller"><button className="mt-8 bg-primary text-on-primary px-8 py-3 rounded-xl font-bold">Back to Seller Panel</button></Link>
      </main>
    );
  }

  return (
    <main className="pb-16 md:pb-24 px-4 md:px-10 max-w-3xl mx-auto pt-8 md:pt-12">

      {/* Header */}
      <div className="mb-8">
        <Link to="/seller" className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest uppercase text-on-surface-variant hover:text-primary mb-6 transition-colors">
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to Seller Panel
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b border-outline-variant/20">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-secondary uppercase mb-1">Seller Order</p>
            <h1 className="font-brand text-4xl text-primary tracking-tight">#{order.id.slice(0, 8)}</h1>
            <p className="text-xs text-on-surface-variant mt-2 font-medium">
              {new Date(order.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5 font-medium">{customerName}{profile?.email ? ` · ${profile.email}` : ''}</p>
          </div>
          <div className="text-right bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/20 shadow-sm">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">Your share</p>
            <p className="text-3xl font-brand text-primary my-0.5">{formatCurrency(sellerSubtotal)}</p>
            <p className="text-[10px] text-on-surface-variant/70 font-medium tracking-wide">of {formatCurrency(order.total_amount)} total</p>
          </div>
        </div>

        {/* Summary pills */}
        {!isInsiderManagedSeller && (
          <div className="flex flex-wrap gap-2 mt-4">
            {summary.pending > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                {summary.pending} pending
              </span>
            )}
            {summary.approved > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                {summary.approved} approved
              </span>
            )}
            {summary.rejected > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                {summary.rejected} rejected
              </span>
            )}
            {summary.pending > 0 && (
              <button
                onClick={handleApproveAll}
                disabled={isUpdating}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">done_all</span>
                Approve all {summary.pending}
              </button>
            )}
          </div>
        )}

        {isInsiderManagedSeller && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-secondary-container/20 border border-secondary/30">
            <p className="text-sm font-semibold text-on-surface-variant">Managed in Insider App</p>
            <p className="text-xs text-on-surface-variant mt-0.5">Approvals and rejections for Hatvoni Heritage are handled in the Insider panel.</p>
          </div>
        )}
      </div>

      {/* Order outcome banner — shown after admin finalizes */}
      {(() => {
        const ss = resolveSellerStatus(order);
        if (ss === 'pending_approval') return null;
        const bannerConfig = {
          approved:           { bg: 'bg-emerald-50 border-emerald-200', icon: 'task_alt', iconColor: 'text-emerald-600', title: 'Order Approved', msg: 'Admin has accepted this order. Prepare items for fulfillment.' },
          partially_approved: { bg: 'bg-orange-50 border-orange-200',  icon: 'splitscreen', iconColor: 'text-orange-600', title: 'Partial Fulfillment', msg: 'Some items were rejected. Only approved items will be fulfilled.' },
          rejected:           { bg: 'bg-red-50 border-red-200',        icon: 'cancel',    iconColor: 'text-red-600',    title: 'Order Rejected',  msg: 'Admin has rejected this order. No fulfillment required.' },
          shipped:            { bg: 'bg-blue-50 border-blue-200',      icon: 'local_shipping', iconColor: 'text-blue-600', title: 'Shipped',       msg: 'Order has been dispatched to the customer.' },
          delivered:          { bg: 'bg-emerald-50 border-emerald-200', icon: 'done_all', iconColor: 'text-emerald-600', title: 'Delivered',      msg: 'Order successfully delivered.' },
          cancelled:          { bg: 'bg-red-50 border-red-200',        icon: 'cancel',    iconColor: 'text-red-600',    title: 'Cancelled',       msg: 'This order was cancelled.' },
        };
        const cfg = bannerConfig[ss];
        if (!cfg) return null;
        return (
          <div className={`mb-6 rounded-2xl border p-4 flex items-start gap-4 ${cfg.bg}`}>
            <span className={`material-symbols-outlined text-2xl mt-0.5 ${cfg.iconColor}`}>{cfg.icon}</span>
            <div>
              <p className="font-bold text-on-surface">{cfg.title}</p>
              <p className="text-sm text-on-surface-variant mt-0.5">{cfg.msg}</p>
              <span className={`inline-flex items-center mt-2 px-3 py-1 rounded-full text-xs font-bold ${SELLER_STATUS_COLORS[ss] || 'bg-slate-100 text-slate-700'}`}>
                {ss.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Item cards */}
      <div className="space-y-3">
        {sellerItems.map((item) => {
          const itemKey = getDecisionKey(item);
          const isPending = (item.seller_decision || 'pending') === 'pending' && !item.admin_override_by;
          const isRejecting = rejectingKey === itemKey;

          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-4 transition-colors ${
                item.seller_decision === 'approved' ? 'border-emerald-200 bg-emerald-50/40'
                : item.seller_decision === 'rejected' ? 'border-red-200 bg-red-50/40'
                : isRejecting ? 'border-red-200 bg-red-50/20'
                : 'border-outline-variant/30 bg-surface-container-low'
              }`}
            >
              {/* Item header row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-headline text-on-surface text-sm md:text-base font-bold leading-tight">{item.product_name || 'Product'}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">Ref: {item.product_key}</p>
                </div>
                <StatusBadge decision={item.seller_decision} />
              </div>

              {/* Financials row */}
              <div className="flex items-center justify-between mt-4 pb-3 border-b border-outline-variant/10">
                <div className="flex gap-4">
                  <div className="bg-surface-container/50 px-3 py-1.5 rounded-lg border border-outline-variant/10">
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-widest block font-bold">Qty</span>
                    <span className="text-sm font-bold text-on-surface">{item.quantity}</span>
                  </div>
                  <div className="bg-surface-container/50 px-3 py-1.5 rounded-lg border border-outline-variant/10">
                    <span className="text-[10px] text-on-surface-variant uppercase tracking-widest block font-bold">Unit</span>
                    <span className="text-sm font-bold text-on-surface">{formatCurrency(item.unit_price)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-widest block font-bold">Total</span>
                  <span className="font-brand text-lg text-primary">{formatCurrency(item.line_total)}</span>
                </div>
              </div>

              {/* Decided info */}
              {item.seller_decided_at && !item.admin_override_by && (
                <p className="text-[10px] text-on-surface-variant mt-2">
                  {item.seller_decision === 'rejected' ? 'Rejected' : 'Approved'} on {new Date(item.seller_decided_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {item.seller_decision === 'rejected' && item.seller_decision_reason && ` · ${item.seller_decision_reason}`}
                </p>
              )}

              {/* Admin override / on-behalf indicator */}
              {item.admin_override_by && item.seller_decision !== 'pending' && (
                <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${
                  item.seller_decision === 'approved'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  <span className="material-symbols-outlined text-[14px] mt-0.5 shrink-0">admin_panel_settings</span>
                  <div>
                    <p>
                      {item.seller_decision === 'approved' ? 'Approved' : 'Rejected'} by admin
                      {item.admin_overridden_at && (
                        <span className="font-normal opacity-70 ml-1">
                          · {new Date(item.admin_overridden_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </p>
                    {item.admin_override_reason && (
                      <p className="font-normal opacity-80 mt-0.5">Reason: {item.admin_override_reason}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Action area — only for pending, non-Insider items */}
              {!isInsiderManagedSeller && isPending && (
                <div className="mt-3 pt-3 border-t border-outline-variant/20">
                  {!isRejecting ? (
                    /* Normal state: Approve + Reject buttons */
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(item)}
                        disabled={isUpdating}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        Approve
                      </button>
                      <button
                        onClick={() => handleStartReject(item)}
                        disabled={isUpdating}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-red-500 text-red-600 text-sm font-semibold hover:bg-red-50 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">cancel</span>
                        Reject
                      </button>
                    </div>
                  ) : (
                    /* Reject mode: reason picker + confirm/cancel */
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-red-700">Why are you rejecting this item?</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {rejectionReasons.map((reason) => (
                          <label
                            key={reason}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                              rejectReasons[itemKey] === reason
                                ? 'border-red-500 bg-red-50 text-red-800'
                                : 'border-outline-variant/40 hover:border-red-300 hover:bg-red-50/40'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`reject-reason-${itemKey}`}
                              value={reason}
                              checked={rejectReasons[itemKey] === reason}
                              onChange={() => {
                                setRejectReasons((prev) => ({ ...prev, [itemKey]: reason }));
                                setRejectError('');
                              }}
                              className="accent-red-600"
                            />
                            <span className="text-sm font-medium">{reason}</span>
                          </label>
                        ))}
                      </div>
                      {rejectError && <p className="text-xs text-red-600 font-medium">{rejectError}</p>}
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => handleConfirmReject(item)}
                          disabled={isUpdating}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                        >
                          {isUpdating ? 'Saving…' : 'Confirm Rejection'}
                        </button>
                        <button
                          onClick={() => { setRejectingKey(''); setRejectReasons((p) => { const n = { ...p }; delete n[itemKey]; return n; }); setRejectError(''); }}
                          disabled={isUpdating}
                          className="px-4 py-2.5 rounded-xl border border-outline-variant text-on-surface text-sm font-semibold hover:bg-surface-container transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Locked state label */}
              {!isInsiderManagedSeller && !isPending && (
                <p className="mt-2 text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-semibold">
                  {item.admin_override_by ? 'Decided by admin — locked' : 'Decision locked'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Admin-rejected items notice — shown when admin rejected some of this seller's items */}
      {(() => {
        if (!order?.rejected_items) return null;
        const rejected = Array.isArray(order.rejected_items)
          ? order.rejected_items
          : (() => { try { return JSON.parse(order.rejected_items); } catch { return []; } })();
        // Filter to only this seller's rejected items
        const myRejected = rejected.filter((r) =>
          sellerItems.some((si) => si.product_key === r.product_key || si.source_order_item_id === r.order_item_id)
        );
        if (myRejected.length === 0) return null;
        return (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-red-600 text-lg">cancel</span>
              <p className="text-sm font-bold text-red-800">
                {myRejected.length} of your item{myRejected.length !== 1 ? 's were' : ' was'} rejected by admin
              </p>
            </div>
            <div className="space-y-2">
              {myRejected.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white border border-red-100 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                    <span className="font-mono font-semibold text-red-800">{r.product_key || `Item ${i + 1}`}</span>
                  </div>
                  {r.reason && <span className="text-red-600 italic truncate max-w-[160px]">{r.reason}</span>}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-red-700 mt-2">These items will not be fulfilled. No action required from you.</p>
          </div>
        );
      })()}

      {/* Subtotal */}
      <div className="mt-4 px-4 py-3 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center justify-between">
        <p className="text-sm font-semibold text-on-surface-variant">Your seller subtotal</p>
        <p className="text-lg font-brand text-primary">{formatCurrency(sellerSubtotal)}</p>
      </div>
      <p className="text-xs text-on-surface-variant mt-2 px-1">
        Allocations are proportional to what the customer paid per item. This avoids inflated totals in multi-seller orders.
      </p>

      {/* Footer actions */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={fetchDetail}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container transition-colors text-sm font-semibold disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Refresh
        </button>
        <Link to="/seller" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container transition-colors text-sm font-semibold">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back
        </Link>
      </div>
    </main>
  );
}
