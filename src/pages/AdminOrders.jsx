// HATVONI ADMIN ORDERS - ORDER WORKFLOW SYSTEM

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (v) =>
  `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const fmtDate = (v) =>
  v
    ? new Date(v).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

// Customer-facing flow: placed → processing → shipped → delivered | cancelled
// 'rejected' is an internal admin state (customer sees 'cancelled')
// 'partially_approved' is never a resting state — always resolves to 'processing'
const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'rejected'];

const STATUS_COLORS = {
  pending:    'bg-slate-100 text-slate-700',
  processing: 'bg-amber-100 text-amber-800',
  shipped:    'bg-blue-100 text-blue-800',
  delivered:  'bg-emerald-100 text-emerald-800',
  cancelled:  'bg-red-100 text-red-800',
  rejected:   'bg-red-200 text-red-900',
};

const PAYMENT_COLORS = {
  pending:            'bg-slate-100 text-slate-700',
  initiated:          'bg-amber-100 text-amber-800',
  paid:               'bg-emerald-100 text-emerald-800',
  failed:             'bg-red-100 text-red-800',
  refunded:           'bg-purple-100 text-purple-800',
  partially_refunded: 'bg-orange-100 text-orange-800',
};

const ITEM_DECISION_COLORS = {
  pending:         'bg-slate-100 text-slate-700',
  pending_review:  'bg-slate-100 text-slate-700',
  approved:        'bg-emerald-100 text-emerald-800',
  rejected:        'bg-red-100 text-red-800',
};

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${colorClass}`}>
      {label}
    </span>
  );
}

function Row({ label, value, mono = false, icon = null }) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-outline-variant/10 last:border-0 last:pb-0">
      <div className="flex items-center gap-2">
        {icon && <span className="material-symbols-outlined text-[16px] text-on-surface-variant/70">{icon}</span>}
        <span className="text-[11px] font-bold tracking-widest uppercase text-on-surface-variant">{label}</span>
      </div>
      <span className={`text-sm text-on-surface font-medium ${mono ? 'font-mono text-xs bg-surface-container px-2 py-0.5 rounded-md border border-outline-variant/20 tracking-wider' : ''}`}>
        {value || '—'}
      </span>
    </div>
  );
}

// ─── list view ──────────────────────────────────────────────────────────────

function OrdersList({ onSelect }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, order_status, payment_status, payment_method, total_amount, created_at, shipping_address, user_id, tracking_number, shipment_status, cancellation_reason, refund_status, refund_amount')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const userIds = [...new Set((data || []).map((o) => o.user_id).filter(Boolean))];
      let profilesById = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, phone')
          .in('id', userIds);
        profilesById = (profiles || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
      }

      setOrders((data || []).map((o) => ({ ...o, profile: profilesById[o.user_id] || null })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // realtime
  useEffect(() => {
    const ch = supabase.channel('admin-orders-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const name = `${o.profile?.first_name || ''} ${o.profile?.last_name || ''}`.trim();
      const matchSearch = !q
        || o.id.toLowerCase().includes(q)
        || name.toLowerCase().includes(q)
        || (o.profile?.email || '').toLowerCase().includes(q)
        || (o.tracking_number || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchPayment = paymentFilter === 'all' || o.payment_status === paymentFilter;
      return matchSearch && matchStatus && matchPayment;
    });
  }, [orders, search, statusFilter, paymentFilter]);

  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    processing: orders.filter((o) => o.status === 'processing').length,
    shipped: orders.filter((o) => o.status === 'shipped').length,
    revenue: orders.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + Number(o.total_amount || 0), 0),
  }), [orders]);

  return (
    <div className="min-h-screen bg-surface pt-32 md:pt-40 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link to="/admin" className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-xl">arrow_back</span>
              </Link>
              <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tight">Orders</h1>
            </div>
            <p className="text-on-surface-variant font-body ml-9">Event-driven order workflow — all status changes are system-controlled</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant text-sm font-semibold text-primary hover:bg-primary/5 transition-colors">
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'Total', value: stats.total, color: 'bg-primary' },
            { label: 'Pending', value: stats.pending, color: 'bg-slate-500' },
            { label: 'Processing', value: stats.processing, color: 'bg-amber-500' },
            { label: 'Shipped', value: stats.shipped, color: 'bg-blue-500' },
            { label: 'Revenue', value: fmt(stats.revenue), color: 'bg-emerald-600' },
          ].map((s) => (
            <div key={s.label} className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-3">
              <div className={`${s.color} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                <span className="material-symbols-outlined text-white text-sm">package_2</span>
              </div>
              <div>
                <p className="text-lg font-brand text-primary leading-none">{s.value}</p>
                <p className="text-xs text-on-surface-variant font-body mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface-container-low rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
            <input
              type="text"
              placeholder="Search by order ID, customer, email, tracking..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent w-full font-body text-sm"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm font-body focus:ring-2 focus:ring-secondary">
            <option value="all">All Status</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-4 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm font-body focus:ring-2 focus:ring-secondary">
            <option value="all">All Payments</option>
            {['pending','initiated','paid','failed','refunded','partially_refunded'].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">receipt_long</span>
            <p className="mt-4 text-on-surface-variant font-body">No orders found</p>
          </div>
        ) : (
          <div className="bg-surface-container-low rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-outline-variant/30">
                    {['Order', 'Customer', 'Amount', 'Status', 'Payment', 'Date', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map((order) => {
                    const name = `${order.profile?.first_name || ''} ${order.profile?.last_name || ''}`.trim() || '—';
                    return (
                      <tr key={order.id} className="hover:bg-surface-container transition-colors cursor-pointer" onClick={() => onSelect(order.id)}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-primary font-semibold">#{order.id.slice(0, 8)}</p>
                          {order.tracking_number && (
                            <p className="text-[10px] text-on-surface-variant mt-0.5">📦 {order.tracking_number}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-on-surface">{name}</p>
                          <p className="text-xs text-on-surface-variant">{order.profile?.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-primary whitespace-nowrap">{fmt(order.total_amount)}</td>
                        <td className="px-4 py-3">
                          <Badge label={order.status?.replace(/_/g, ' ')} colorClass={STATUS_COLORS[order.status] || STATUS_COLORS.pending} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge label={order.payment_status?.replace(/_/g, ' ')} colorClass={PAYMENT_COLORS[order.payment_status] || PAYMENT_COLORS.pending} />
                        </td>
                        <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">{fmtDate(order.created_at)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelect(order.id); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors"
                          >
                            Manage
                            <span className="material-symbols-outlined text-sm">chevron_right</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Item Decision Panel ─────────────────────────────────────────────────────
// Handles both admin approvals (own-seller/Hatvoni items) and
// admin overrides of third-party seller decisions.

function ItemDecisionPanel({ items, sellerDecisions, adminApprovals, onRefresh }) {
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideDecision, setOverrideDecision] = useState('approved');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [overriding, setOverriding] = useState(false);

  // adminDecideTarget carries the line + whether it's a sync item + fetched inventory
  const [adminDecideTarget, setAdminDecideTarget] = useState(null);
  // { order_item_id, product_key, isSyncItem, inventoryLoading, inventory, inventoryError }
  const [adminDecision, setAdminDecision] = useState('approved');
  const [adminReason, setAdminReason] = useState('');
  const [adminDecideError, setAdminDecideError] = useState('');
  const [adminDeciding, setAdminDeciding] = useState(false);

  // Fetch inventory for a specific product key from hatvoni_inventory
  const fetchInventoryForKey = async (productKey) => {
    const { data, error } = await supabase
      .from('hatvoni_inventory')
      .select('tag_key, display_name, total_qty_available, unit, last_synced_at')
      .eq('tag_key', productKey)
      .maybeSingle();
    if (error) throw error;
    return data; // null if not found
  };

  // Called when admin clicks Approve or Reject on an admin item
  const openAdminDecide = async (line, initialDecision) => {
    const isSyncItem = line.adminApproval?.sync_with_insider === true;

    // For sync items clicking Approve: fetch inventory first, then open modal
    if (isSyncItem && initialDecision === 'approved') {
      setAdminDecideTarget({
        order_item_id: line.order_item_id,
        product_key: line.product_key,
        name: line.name,
        qty_ordered: line.qty,
        isSyncItem: true,
        inventoryLoading: true,
        inventory: null,
        inventoryError: null,
      });
      setAdminDecision('approved');
      setAdminReason('');
      setAdminDecideError('');

      // Fetch inventory in background
      try {
        const inv = await fetchInventoryForKey(line.product_key);
        setAdminDecideTarget((prev) => prev ? {
          ...prev,
          inventoryLoading: false,
          inventory: inv,
          inventoryError: null,
        } : null);
      } catch (err) {
        setAdminDecideTarget((prev) => prev ? {
          ...prev,
          inventoryLoading: false,
          inventory: null,
          inventoryError: err.message || 'Failed to fetch inventory',
        } : null);
      }
    } else {
      // Non-sync item or Reject: open modal directly
      setAdminDecideTarget({
        order_item_id: line.order_item_id,
        product_key: line.product_key,
        name: line.name,
        qty_ordered: line.qty,
        isSyncItem,
        inventoryLoading: false,
        inventory: null,
        inventoryError: null,
      });
      setAdminDecision(initialDecision);
      setAdminReason('');
      setAdminDecideError('');
    }
  };

  const handleAdminDecide = async (forceApprove = false) => {
    if (!adminDecideTarget) return;
    setAdminDeciding(true);
    setAdminDecideError('');
    try {
      // Build inventory snapshot to store alongside the decision
      const inventorySnap = adminDecideTarget.inventory
        ? {
            tag_key: adminDecideTarget.inventory.tag_key,
            qty_available: adminDecideTarget.inventory.total_qty_available,
            unit: adminDecideTarget.inventory.unit,
            last_synced_at: adminDecideTarget.inventory.last_synced_at,
            force_approved: forceApprove,
          }
        : null;

      const { error } = await supabase.rpc('admin_approve_item', {
        p_order_item_id: adminDecideTarget.order_item_id,
        p_product_key: adminDecideTarget.product_key,
        p_decision: adminDecision,
        p_reason: adminReason || (forceApprove ? 'Approved — production will fulfill' : null),
        p_inventory_snap: inventorySnap,
      });
      if (error) throw error;
      setAdminDecideTarget(null);
      setAdminReason('');
      await onRefresh();
    } catch (err) {
      setAdminDecideError(err.message || 'Failed to save decision');
    } finally {
      setAdminDeciding(false);
    }
  };

  const handleOverride = async () => {
    if (!overrideTarget) return;
    setOverriding(true);
    setOverrideError('');
    try {
      const { error } = await supabase.rpc('admin_override_seller_decision', {
        p_order_item_id: overrideTarget.order_item_id,
        p_product_key: overrideTarget.product_key,
        p_seller_id: overrideTarget.seller_id,
        p_new_decision: overrideDecision,
        p_reason: overrideReason,
      });
      if (error) throw error;
      setOverrideTarget(null);
      setOverrideReason('');
      await onRefresh();
    } catch (err) {
      setOverrideError(err.message || 'Override failed');
    } finally {
      setOverriding(false);
    }
  };

  // Build display lines from items
  const displayLines = useMemo(() => {
    return (items || []).flatMap((item) => {
      if (Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0) {
        return item.lot_snapshot.map((s) => ({
          order_item_id: item.id,
          product_key: s.product_key,
          name: s.product_name || s.product_key,
          qty: s.quantity * item.quantity,
          unit_price: s.unit_price,
          line_total: s.unit_price * s.quantity * item.quantity,
          lot_name: item.lot_name,
          seller_id: s.seller_id || null,
          image_url: item.products?.image_url,
          // Find seller decision for this line
          sellerDecision: sellerDecisions.find(
            (d) => d.order_item_id === item.id && d.product_key === s.product_key
          ) || null,
          // Find admin approval for this line
          adminApproval: adminApprovals.find(
            (a) => a.order_item_id === item.id && a.product_key === s.product_key
          ) || null,
        }));
      }
      return [{
        order_item_id: item.id,
        product_key: item.products?.key || null,
        name: item.products?.name || item.lot_name || 'Product',
        qty: item.quantity,
        unit_price: item.price,
        line_total: item.price * item.quantity,
        lot_name: item.lot_name,
        seller_id: item.products?.seller_id || null,
        image_url: item.products?.image_url,
        sellerDecision: sellerDecisions.find((d) => d.order_item_id === item.id) || null,
        adminApproval: adminApprovals.find((a) => a.order_item_id === item.id) || null,
      }];
    });
  }, [items, sellerDecisions, adminApprovals]);

  return (
    <section className="bg-surface-container-lowest rounded-3xl p-6 lg:p-8 border border-outline-variant/30 shadow-[0_10px_40px_rgba(0,123,71,0.03)]">
      <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-primary mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined">fact_check</span> Item-Level Approval
      </h2>
      <p className="text-xs text-on-surface-variant mb-6">
        All items must be approved or rejected before the order can be finalized.
        Admin can approve/reject own-seller items directly, and override any seller decision.
      </p>

      <div className="space-y-3">
        {displayLines.map((line) => {
          const sd = line.sellerDecision;
          const aa = line.adminApproval;

          // Determine the effective decision and who made it
          const isAdminItem = aa !== null; // has an admin approval record
          const isSellerItem = sd !== null; // has a seller decision record
          const isOverridden = sd?.override_by != null;

          let effectiveStatus = 'pending';
          let decisionSource = '';
          if (isAdminItem) {
            effectiveStatus = aa.status; // pending_review | approved | rejected
            decisionSource = 'admin';
          } else if (isSellerItem) {
            effectiveStatus = sd.decision; // pending | approved | rejected
            decisionSource = isOverridden ? 'admin_override' : 'seller';
          }

          const statusLabel = {
            pending: 'Pending',
            pending_review: 'Pending Review',
            approved: 'Approved',
            rejected: 'Rejected',
          }[effectiveStatus] || effectiveStatus;

          const statusColor = ITEM_DECISION_COLORS[effectiveStatus] || ITEM_DECISION_COLORS.pending;

          return (
            <div key={`${line.order_item_id}-${line.product_key}`}
              className="rounded-2xl border border-outline-variant/20 p-4 bg-surface">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Product info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {line.image_url ? (
                    <img src={line.image_url} alt={line.name}
                      className="w-12 h-12 rounded-xl object-cover border border-outline-variant/20 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 border border-outline-variant/20">
                      <span className="material-symbols-outlined text-outline text-sm">local_mall</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-primary text-sm truncate">{line.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {line.product_key && (
                        <span className="text-[10px] font-mono text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
                          {line.product_key}
                        </span>
                      )}
                      {line.lot_name && (
                        <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">{line.lot_name}</span>
                      )}
                      {/* Show item type: 3rd-party seller vs own-seller */}
                      {isAdminItem ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          {aa?.sync_with_insider ? '🔄 Insider sync' : '🏠 Own seller'}
                        </span>
                      ) : isSellerItem ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          🏪 3rd-party seller
                        </span>
                      ) : null}
                      <span className="text-[10px] text-on-surface-variant">
                        {line.qty} × {fmt(line.unit_price)} = {fmt(line.line_total)}
                      </span>
                    </div>
                    {/* Show inventory snapshot if available (sync_with_insider items) */}
                    {aa?.inventory_snapshot && (
                      <div className="mt-1.5 text-[10px] bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-800">
                        Insider stock: {aa.inventory_snapshot.qty_available ?? '—'} {aa.inventory_snapshot.unit || 'units'} available
                      </div>
                    )}
                  </div>
                </div>

                {/* Decision status */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <Badge label={statusLabel} colorClass={statusColor} />
                    {decisionSource && (
                      <p className="text-[10px] text-on-surface-variant mt-1">
                        {decisionSource === 'admin_override' ? '⚡ Admin override' :
                         decisionSource === 'admin' ? '🔑 Admin decision' :
                         '🏪 Seller decision'}
                      </p>
                    )}
                    {(sd?.decision_reason || aa?.decision_reason) && (
                      <p className="text-[10px] text-red-600 mt-0.5 italic max-w-[160px] truncate">
                        {sd?.decision_reason || aa?.decision_reason}
                      </p>
                    )}
                    {isOverridden && (
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        Was: {sd.original_decision}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1.5">
                    {/* Admin items: direct approve/reject */}
                    {isAdminItem && aa.status === 'pending_review' && (
                      <>
                        <button
                          onClick={() => openAdminDecide(line, 'approved')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openAdminDecide(line, 'rejected')}
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {/* Admin items: already decided — allow re-decision */}
                    {isAdminItem && aa.status !== 'pending_review' && (
                      <button
                        onClick={() => openAdminDecide(line, aa.status === 'approved' ? 'rejected' : 'approved')}
                        className="px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant text-xs font-bold hover:bg-surface-container transition-colors"
                      >
                        Change
                      </button>
                    )}

                    {/* Seller items: admin override button */}
                    {isSellerItem && !isAdminItem && (
                      <button
                        onClick={() => {
                          setOverrideTarget({
                            order_item_id: line.order_item_id,
                            product_key: line.product_key,
                            seller_id: sd.seller_id,
                            current_decision: sd.decision,
                          });
                          setOverrideDecision(sd.decision === 'approved' ? 'rejected' : 'approved');
                          setOverrideReason('');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-colors"
                      >
                        Override
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Admin Decide Modal — inventory-aware for sync_with_insider items */}
      {adminDecideTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-8 shadow-2xl border border-outline-variant/20">

            <h3 className="font-brand text-2xl text-primary mb-1">
              {adminDecideTarget.isSyncItem && adminDecision === 'approved' ? 'Insider Inventory Check' : 'Admin Item Decision'}
            </h3>
            <p className="text-sm text-on-surface-variant mb-5">
              <span className="font-semibold text-on-surface">{adminDecideTarget.name}</span>
              {adminDecideTarget.qty_ordered && (
                <span className="ml-2 text-on-surface-variant">· {adminDecideTarget.qty_ordered} ordered</span>
              )}
            </p>

            {/* ── Inventory section (sync items only, approve path) ── */}
            {adminDecideTarget.isSyncItem && adminDecision === 'approved' && (
              <div className="mb-6">
                {adminDecideTarget.inventoryLoading ? (
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-200">
                    <span className="material-symbols-outlined animate-spin text-blue-600">progress_activity</span>
                    <p className="text-sm text-blue-800 font-medium">Checking Insider inventory...</p>
                  </div>
                ) : adminDecideTarget.inventoryError ? (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200">
                    <p className="text-sm text-red-700 font-medium">⚠ Could not fetch inventory: {adminDecideTarget.inventoryError}</p>
                    <p className="text-xs text-red-600 mt-1">You can still approve — production team will be notified.</p>
                  </div>
                ) : adminDecideTarget.inventory ? (
                  (() => {
                    const inv = adminDecideTarget.inventory;
                    const qtyAvail = Number(inv.total_qty_available ?? 0);
                    const qtyNeeded = Number(adminDecideTarget.qty_ordered ?? 0);
                    const inStock = qtyAvail >= qtyNeeded;
                    const lastSync = inv.last_synced_at
                      ? new Date(inv.last_synced_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : '—';
                    return (
                      <div className={`p-4 rounded-2xl border ${inStock ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-bold text-on-surface">{inv.display_name || inv.tag_key}</p>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {inStock ? '✓ In Stock' : '⚠ Low Stock'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className={`text-lg font-bold ${inStock ? 'text-emerald-700' : 'text-amber-700'}`}>{qtyAvail}</p>
                            <p className="text-[10px] text-on-surface-variant">{inv.unit || 'units'} available</p>
                          </div>
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className="text-lg font-bold text-primary">{qtyNeeded}</p>
                            <p className="text-[10px] text-on-surface-variant">ordered</p>
                          </div>
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className={`text-lg font-bold ${qtyAvail - qtyNeeded >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {qtyAvail - qtyNeeded >= 0 ? '+' : ''}{qtyAvail - qtyNeeded}
                            </p>
                            <p className="text-[10px] text-on-surface-variant">after order</p>
                          </div>
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-2">Last synced: {lastSync}</p>
                        {!inStock && (
                          <p className="text-xs text-amber-700 mt-2 font-medium">
                            Stock is below order quantity. You can still approve — production team will fulfill the order.
                          </p>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <p className="text-sm text-slate-700">No inventory record found for <span className="font-mono font-bold">{adminDecideTarget.product_key}</span> in Insider.</p>
                    <p className="text-xs text-slate-600 mt-1">You can still approve — production team will fulfill the order.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Decision toggle (shown for non-sync items or reject path) ── */}
            {(!adminDecideTarget.isSyncItem || adminDecision === 'rejected') && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Decision</label>
                <div className="flex gap-3">
                  {['approved', 'rejected'].map((d) => (
                    <button key={d}
                      onClick={() => setAdminDecision(d)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${adminDecision === d
                        ? d === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-red-500 bg-red-50 text-red-800'
                        : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}
                    >
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Reason field ── */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                {adminDecision === 'rejected' ? 'Rejection reason (required)' : 'Note (optional)'}
              </label>
              <input type="text" value={adminReason} onChange={(e) => setAdminReason(e.target.value)}
                placeholder={adminDecision === 'rejected' ? 'Why is this item rejected?' : 'Optional note for audit trail...'}
                className="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-2 focus:ring-primary" />
            </div>

            {adminDecideError && (
              <p className="text-red-600 text-sm mb-4">{adminDecideError}</p>
            )}

            {/* ── Action buttons ── */}
            <div className="flex flex-col gap-2">
              {/* Sync item + approve path: show two approve options */}
              {adminDecideTarget.isSyncItem && adminDecision === 'approved' && !adminDecideTarget.inventoryLoading && (
                <>
                  {/* Option 1: Approve (in stock or unknown) */}
                  <button
                    onClick={() => handleAdminDecide(false)}
                    disabled={adminDeciding}
                    className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    {adminDeciding ? 'Saving...' : 'Approve — Stock Available'}
                  </button>
                  {/* Option 2: Force approve even if 0 qty */}
                  <button
                    onClick={() => handleAdminDecide(true)}
                    disabled={adminDeciding}
                    className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">factory</span>
                    {adminDeciding ? 'Saving...' : 'Approve — Production Will Fulfill'}
                  </button>
                  {/* Switch to reject */}
                  <button
                    onClick={() => setAdminDecision('rejected')}
                    className="w-full py-3 rounded-xl border-2 border-red-400 text-red-700 text-sm font-bold hover:bg-red-50 transition-colors"
                  >
                    Switch to Reject
                  </button>
                </>
              )}

              {/* Non-sync item or reject path: standard confirm + cancel */}
              {(!adminDecideTarget.isSyncItem || adminDecision === 'rejected') && (
                <div className="flex gap-3">
                  <button
                    onClick={() => { setAdminDecideTarget(null); setAdminDecideError(''); }}
                    className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-bold hover:bg-surface-container transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAdminDecide(false)}
                    disabled={adminDeciding}
                    className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-60 ${adminDecision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {adminDeciding ? 'Saving...' : `Confirm ${adminDecision}`}
                  </button>
                </div>
              )}

              {/* Cancel button for sync approve path */}
              {adminDecideTarget.isSyncItem && adminDecision === 'approved' && !adminDecideTarget.inventoryLoading && (
                <button
                  onClick={() => { setAdminDecideTarget(null); setAdminDecideError(''); }}
                  className="w-full py-2.5 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-8 shadow-2xl border border-outline-variant/20">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-amber-500 text-2xl">warning</span>
              <h3 className="font-brand text-2xl text-primary">Override Seller Decision</h3>
            </div>
            <p className="text-sm text-on-surface-variant mb-1">
              Current seller decision: <strong className="text-on-surface">{overrideTarget.current_decision}</strong>
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
              This override will be logged with your admin ID, reason, and timestamp.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">New Decision</label>
              <div className="flex gap-3">
                {['approved', 'rejected'].map((d) => (
                  <button key={d}
                    onClick={() => setOverrideDecision(d)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-colors ${overrideDecision === d
                      ? d === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-red-500 bg-red-50 text-red-800'
                      : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Override Reason (required)</label>
              <input type="text" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Why are you overriding this seller's decision?"
                className="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-2 focus:ring-primary" />
            </div>
            {overrideError && (
              <p className="text-red-600 text-sm mb-4">{overrideError}</p>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setOverrideTarget(null); setOverrideError(''); }}
                className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-bold hover:bg-surface-container transition-colors">
                Cancel
              </button>
              <button onClick={handleOverride} disabled={overriding || !overrideReason.trim()}
                className="flex-1 py-3 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-60 transition-all">
                {overriding ? 'Overriding...' : 'Confirm Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Order Finalization Panel ────────────────────────────────────────────────
// The ONLY way to advance order status. Enforces the 3-path decision logic.

function OrderFinalizationPanel({ orderId, order, readiness, onRefresh, onNotice, onError }) {
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isPending = order?.status === 'pending';
  const isRazorpay = ['razorpay', 'razorpay_upi', 'razorpay_cards'].includes(order?.payment_method);
  const isPaid = order?.payment_status === 'paid';

  const allDecided = readiness?.all_decided ?? false;
  const hasRejections = readiness?.has_rejections ?? false;
  const hasApprovals = readiness?.has_approvals ?? false;

  const handleFinalize = async () => {
    if (!action) return;
    setFinalizing(true);
    onError('');
    try {
      const { error } = await supabase.rpc('admin_finalize_order', {
        p_order_id: orderId,
        p_action: action,
        p_reason: reason || null,
      });
      if (error) throw error;

      // Auto-trigger refund for Razorpay paid orders when rejecting/partial
      if (isRazorpay && isPaid && (action === 'reject_full' || action === 'proceed_partial')) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          await supabase.functions.invoke('process-order-refund', {
            body: {
              order_id: orderId,
              mode: action === 'reject_full' ? 'full' : 'partial',
              reason: reason || (action === 'reject_full' ? 'Order rejected by admin' : 'Partial fulfillment — rejected items refunded'),
            },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
        } catch (refundErr) {
          // Refund failure is non-blocking — order status already changed
          console.warn('Auto-refund failed, admin can retry manually:', refundErr);
        }
      }

      setShowConfirm(false);
      setAction('');
      setReason('');
      const msg = action === 'accept'
        ? 'Order accepted → PROCESSING. Shipping options are now available.'
        : action === 'reject_full'
          ? `Order rejected.${isRazorpay && isPaid ? ' Full refund initiated.' : ' (COD — no refund required.)'}`
          : `Proceeding with approved items → PROCESSING.${isRazorpay && isPaid ? ' Partial refund initiated for rejected items.' : ' (COD — no refund for rejected items.)'}`;
      onNotice(msg);
      await onRefresh();
    } catch (err) {
      onError(err.message || 'Failed to finalize order');
    } finally {
      setFinalizing(false);
    }
  };

  // Don't show finalization panel if order is already past pending
  if (!isPending) {
    return null;
  }

  // Counts for the summary line
  const totalApproved = (readiness?.seller_approved ?? 0) + (readiness?.admin_approved ?? 0);
  const totalRejected = (readiness?.seller_rejected ?? 0) + (readiness?.admin_rejected ?? 0);
  const totalPending  = (readiness?.seller_pending  ?? 0) + (readiness?.admin_pending  ?? 0);

  return (
    <section className="bg-surface-container-lowest rounded-3xl p-6 lg:p-8 border border-outline-variant/30 shadow-[0_10px_40px_rgba(0,123,71,0.03)] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10" />

      <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-primary mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined">rule</span> Order Decision
      </h2>
      <p className="text-xs text-on-surface-variant mb-6">
        Once all items are reviewed, choose how to proceed with this order.
      </p>

      {/* ── Readiness status bar ── */}
      {isPending && (
        <div className={`rounded-2xl p-4 mb-6 border ${allDecided ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-lg ${allDecided ? 'text-emerald-600' : 'text-amber-600'}`}>
                {allDecided ? 'check_circle' : 'pending'}
              </span>
              <p className={`text-sm font-bold ${allDecided ? 'text-emerald-800' : 'text-amber-800'}`}>
                {allDecided
                  ? 'All items reviewed — choose an action below'
                  : `${totalPending} item${totalPending !== 1 ? 's' : ''} still pending review`}
              </p>
            </div>
            {/* Compact pill summary */}
            <div className="flex items-center gap-2 flex-wrap">
              {totalApproved > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  ✓ {totalApproved} approved
                </span>
              )}
              {totalRejected > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">
                  ✕ {totalRejected} rejected
                </span>
              )}
              {totalPending > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  ● {totalPending} pending
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Action buttons — only shown when all items are decided ── */}
      {isPending && allDecided && (
        <div className="space-y-3">

          {/* ── CASE 1: No rejections → single Accept button ── */}
          {!hasRejections && (
            <button
              onClick={() => { setAction('accept'); setShowConfirm(true); }}
              className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-emerald-500 bg-emerald-50 hover:bg-emerald-100 active:scale-[0.99] transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 transition-colors">
                <span className="material-symbols-outlined text-white text-xl">check_circle</span>
              </div>
              <div className="flex-1">
                <p className="font-bold text-emerald-800 text-sm">Accept Order</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  All {totalApproved} item{totalApproved !== 1 ? 's' : ''} approved — move to PROCESSING.
                  Shipping options will become available.
                </p>
              </div>
              <span className="material-symbols-outlined text-emerald-500 text-xl shrink-0">arrow_forward</span>
            </button>
          )}

          {/* ── CASE 2: Rejections exist — show both options ── */}
          {hasRejections && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-amber-600 text-base">warning</span>
                <p className="text-xs font-bold text-amber-800">
                  {totalRejected} item{totalRejected !== 1 ? 's were' : ' was'} rejected.
                  {totalApproved > 0
                    ? ` ${totalApproved} item${totalApproved !== 1 ? 's' : ''} approved. Choose how to proceed:`
                    : ' No items were approved.'}
                </p>
              </div>

              {/* Option A: Proceed with approved items (only if some approved) */}
              {hasApprovals && (
                <button
                  onClick={() => { setAction('proceed_partial'); setShowConfirm(true); }}
                  className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-orange-400 bg-orange-50 hover:bg-orange-100 active:scale-[0.99] transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center shrink-0 group-hover:bg-orange-600 transition-colors">
                    <span className="material-symbols-outlined text-white text-xl">splitscreen</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-orange-800 text-sm">Proceed with Approved Items</p>
                    <p className="text-xs text-orange-700 mt-0.5">
                      Fulfill {totalApproved} approved item{totalApproved !== 1 ? 's' : ''}, remove {totalRejected} rejected.
                      {isRazorpay && isPaid
                        ? ' Partial refund for rejected items triggered automatically.'
                        : ' COD — no refund for rejected items.'}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-orange-400 text-xl shrink-0">arrow_forward</span>
                </button>
              )}

              {/* Option B: Reject entire order */}
              <button
                onClick={() => { setAction('reject_full'); setShowConfirm(true); }}
                className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-red-400 bg-red-50 hover:bg-red-100 active:scale-[0.99] transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center shrink-0 group-hover:bg-red-600 transition-colors">
                  <span className="material-symbols-outlined text-white text-xl">cancel</span>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-red-800 text-sm">Reject Entire Order</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    Cancel all items and close the order.
                    {isRazorpay && isPaid
                      ? ` Full refund of ${fmt(order?.total_amount)} triggered automatically.`
                      : ' COD — no refund required.'}
                  </p>
                </div>
                <span className="material-symbols-outlined text-red-400 text-xl shrink-0">arrow_forward</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-8 shadow-2xl border border-outline-variant/20">

            {/* Icon + title */}
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                action === 'accept' ? 'bg-emerald-100' :
                action === 'reject_full' ? 'bg-red-100' : 'bg-orange-100'
              }`}>
                <span className={`material-symbols-outlined text-2xl ${
                  action === 'accept' ? 'text-emerald-600' :
                  action === 'reject_full' ? 'text-red-600' : 'text-orange-600'
                }`}>
                  {action === 'accept' ? 'check_circle' : action === 'reject_full' ? 'cancel' : 'splitscreen'}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Confirm action</p>
                <h3 className="font-brand text-xl text-primary leading-tight">
                  {action === 'accept' ? 'Accept Order' :
                   action === 'reject_full' ? 'Reject Entire Order' :
                   'Proceed with Approved Items'}
                </h3>
              </div>
            </div>

            {/* What will happen */}
            <div className={`rounded-2xl p-4 mb-5 text-sm ${
              action === 'accept' ? 'bg-emerald-50 text-emerald-800' :
              action === 'reject_full' ? 'bg-red-50 text-red-800' : 'bg-orange-50 text-orange-800'
            }`}>
              {action === 'accept' && (
                <p>Order moves to <strong>PROCESSING</strong>. Shipping options will become available.</p>
              )}
              {action === 'reject_full' && (
                <p>
                  Order will be <strong>REJECTED</strong> and closed.
                  {isRazorpay && isPaid
                    ? <> A <strong>full refund of {fmt(order?.total_amount)}</strong> will be issued to the customer via Razorpay.</>
                    : <> This is a COD order — no refund is required.</>}
                </p>
              )}
              {action === 'proceed_partial' && (
                <p>
                  <strong>{totalApproved} approved item{totalApproved !== 1 ? 's' : ''}</strong> will proceed to PROCESSING.{' '}
                  <strong>{totalRejected} rejected item{totalRejected !== 1 ? 's' : ''}</strong> will be removed.
                  {isRazorpay && isPaid
                    ? <> A <strong>partial refund</strong> for the rejected items will be issued automatically via Razorpay.</>
                    : <> This is a COD order — no refund for rejected items.</>}
                </p>
              )}
            </div>

            {/* Optional note */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">
                Internal note (optional)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for audit trail..."
                className="w-full px-4 py-3 border border-outline-variant rounded-xl text-sm focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirm(false); setAction(''); setReason(''); }}
                className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-bold hover:bg-surface-container transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalize}
                disabled={finalizing}
                className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2 ${
                  action === 'accept' ? 'bg-emerald-600 hover:bg-emerald-700' :
                  action === 'reject_full' ? 'bg-red-600 hover:bg-red-700' :
                  'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                {finalizing && <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>}
                {finalizing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
 
// ─── WorkflowLog ─────────────────────────────────────────────────────────────

function WorkflowLog({ orderId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('order_workflow_log')
        .select('id, event_type, actor_role, from_status, to_status, metadata, created_at')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      setLogs(data || []);
      setLoading(false);
    };
    fetchLogs();
  }, [orderId]);

  const eventIcon = {
    item_approved: 'check_circle', item_rejected: 'cancel',
    admin_item_approved: 'check_circle', admin_item_rejected: 'cancel',
    seller_item_approved: 'check_circle', seller_item_rejected: 'cancel',
    seller_decision_overridden: 'warning',
    order_accept: 'task_alt', order_reject_full: 'block', order_proceed_partial: 'splitscreen',
    full_refund_initiated: 'currency_rupee', partial_refund_initiated: 'currency_exchange',
    status_changed: 'swap_horiz', payment_status_changed: 'payments', refund_status_changed: 'currency_exchange',
  };
  const eventColor = {
    item_approved: 'text-emerald-600', admin_item_approved: 'text-emerald-600', seller_item_approved: 'text-emerald-600',
    item_rejected: 'text-red-600', admin_item_rejected: 'text-red-600', seller_item_rejected: 'text-red-600',
    seller_decision_overridden: 'text-amber-600',
    order_accept: 'text-emerald-700', order_reject_full: 'text-red-700', order_proceed_partial: 'text-orange-700',
    full_refund_initiated: 'text-purple-700', partial_refund_initiated: 'text-purple-600',
    status_changed: 'text-blue-600', payment_status_changed: 'text-blue-600', refund_status_changed: 'text-purple-600',
  };

  if (loading) return <div className="py-4 text-center text-sm text-on-surface-variant">Loading audit log...</div>;
  if (logs.length === 0) return <div className="py-4 text-center text-sm text-on-surface-variant">No workflow events yet.</div>;

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-outline-variant/10">
          <span className={`material-symbols-outlined text-lg mt-0.5 shrink-0 ${eventColor[log.event_type] || 'text-on-surface-variant'}`}>
            {eventIcon[log.event_type] || 'info'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-on-surface">{log.event_type.replace(/_/g, ' ')}</p>
              <span className="text-[10px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">{log.actor_role}</span>
              {log.from_status && log.to_status && (
                <span className="text-[10px] text-on-surface-variant">{log.from_status} → {log.to_status}</span>
              )}
            </div>
            {log.metadata?.reason && <p className="text-xs text-on-surface-variant mt-0.5 italic">{log.metadata.reason}</p>}
            {log.metadata?.product_key && <p className="text-[10px] font-mono text-on-surface-variant mt-0.5">{log.metadata.product_key}</p>}
            <p className="text-[10px] text-on-surface-variant/60 mt-1">{new Date(log.created_at).toLocaleString('en-IN')}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ShippingPanel ────────────────────────────────────────────────────────────

function ShippingPanel({ order, orderId, onRefresh, onNotice, onError }) {
  const [editTracking, setEditTracking] = useState(order?.tracking_number || '');
  const [editProvider, setEditProvider] = useState(order?.shipment_provider || '');
  const [editNotes, setEditNotes] = useState(order?.order_notes || '');
  const [editStatus, setEditStatus] = useState(order?.status || '');
  const [saving, setSaving] = useState(false);
  const isPartialOrder = order?.partial_fulfillment === true;

  const saveChanges = async () => {
    setSaving(true);
    onError('');
    try {
      const now = new Date().toISOString();
      const patch = {
        tracking_number: editTracking || null,
        shipment_provider: editProvider || null,
        order_notes: editNotes || null,
        admin_updated_at: now,
        updated_at: now,
      };

      if (editStatus !== order.status) {
        // ShippingPanel only handles post-processing transitions.
        // pending → processing is handled exclusively by admin_finalize_order().
        const allowedTransitions = {
          processing: ['shipped', 'cancelled'],
          shipped:    ['delivered', 'cancelled'],
        };
        const allowed = allowedTransitions[order.status] || [];
        if (!allowed.includes(editStatus)) {
          throw new Error(`Cannot change status from "${order.status}" to "${editStatus}" here. Use the Order Decision panel for approval actions.`);
        }
        patch.status = editStatus;
        if (editStatus === 'shipped' && !order.shipped_at) patch.shipped_at = now;
        if (editStatus === 'delivered' && !order.processed_at) patch.processed_at = now;
        if (editStatus === 'shipped') patch.shipment_status = 'in_transit';
        if (editStatus === 'delivered') patch.shipment_status = 'delivered';
      }

      const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
      if (error) throw error;
      onNotice('Shipping details updated.');
      await onRefresh();
    } catch (err) {
      onError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Only show statuses that are valid next steps from the current status.
  // 'processing' is set by admin_finalize_order — never by this panel.
  const nextStatuses = {
    processing: ['processing', 'shipped', 'cancelled'],
    shipped:    ['shipped', 'delivered', 'cancelled'],
  };
  const shippingStatuses = nextStatuses[order?.status] || [order?.status].filter(Boolean);

  return (
    <section className="bg-surface-container-lowest rounded-3xl p-6 lg:p-8 border border-outline-variant/30 shadow-[0_10px_40px_rgba(0,123,71,0.03)] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10"></div>
      <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-primary mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined">local_shipping</span> Shipping & Fulfillment
      </h2>
      {isPartialOrder && (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-4">
          ⚠ Partial order — only approved items should be shipped. Rejected items have been removed.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div>
          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Order Status</label>
          <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
            className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm font-semibold text-primary focus:ring-2 focus:ring-secondary">
            {shippingStatuses.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Shipment Provider</label>
          <input type="text" value={editProvider} onChange={(e) => setEditProvider(e.target.value)}
            placeholder="e.g. Delhivery, India Post"
            className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary" />
        </div>
        <div>
          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Tracking Number</label>
          <input type="text" value={editTracking} onChange={(e) => setEditTracking(e.target.value)}
            placeholder="AWB / Tracking Number"
            className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary font-mono placeholder:font-body" />
        </div>
        <div>
          <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Note to Customer</label>
          <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
            placeholder="Dispatch details visible to customer..."
            className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary" />
        </div>
      </div>

      <button onClick={saveChanges} disabled={saving}
        className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-secondary text-white font-bold tracking-wide hover:bg-secondary/90 transition-all active:scale-95 disabled:opacity-70 shadow-md">
        {saving ? <span className="material-symbols-outlined text-xl animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-xl">save</span>}
        {saving ? 'SAVING...' : 'SAVE CHANGES'}
      </button>
    </section>
  );
}

// ─── OrderDetail ─────────────────────────────────────────────────────────────

function OrderDetail({ orderId, onBack }) {
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [sellerDecisions, setSellerDecisions] = useState([]);
  const [adminApprovals, setAdminApprovals] = useState([]);
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: o, error: oErr } = await supabase
        .from('orders').select('*').eq('id', orderId).maybeSingle();
      if (oErr) throw oErr;
      if (!o) throw new Error('Order not found');

      const { data: profile } = await supabase
        .from('profiles').select('id, first_name, last_name, email, phone')
        .eq('id', o.user_id).maybeSingle();

      const { data: orderItems } = await supabase
        .from('order_items')
        .select('id, quantity, price, lot_name, lot_snapshot, products(id, key, name, seller_id, image_url, sync_with_insider)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      const itemIds = (orderItems || []).map((i) => i.id);

      const [decisionsRes, approvalsRes] = await Promise.all([
        itemIds.length > 0
          ? supabase.from('seller_order_item_decisions')
              .select('order_item_id, product_key, decision, decision_reason, decided_at, seller_id, override_by, override_reason, overridden_at, original_decision')
              .in('order_item_id', itemIds)
          : Promise.resolve({ data: [] }),
        itemIds.length > 0
          ? supabase.from('order_item_approvals')
              .select('order_item_id, product_key, status, decision_reason, decided_at, decision_by, sync_with_insider, inventory_snapshot')
              .in('order_item_id', itemIds)
          : Promise.resolve({ data: [] }),
      ]);

      const { data: readinessData } = await supabase
        .rpc('get_order_item_readiness', { p_order_id: orderId });

      setOrder({ ...o, profile });
      setItems(orderItems || []);
      setSellerDecisions(decisionsRes.data || []);
      setAdminApprovals(approvalsRes.data || []);
      setReadiness(Array.isArray(readinessData) ? readinessData[0] : readinessData);
    } catch (err) {
      setError(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase
      .channel('admin-order-detail-' + orderId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'seller_order_item_decisions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_item_approvals' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [orderId, load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="material-symbols-outlined text-5xl text-red-500">error</span>
        <p className="text-on-surface-variant font-medium">{error}</p>
        <button onClick={onBack} className="mt-4 px-6 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-semibold">
          Back to Orders
        </button>
      </div>
    );
  }

  const customerName = order?.profile
    ? [order.profile.first_name, order.profile.last_name].filter(Boolean).join(' ') || '—'
    : '—';

  const isPending = order?.status === 'pending';
  // Shipping available once order is processing (full or partial)
  const isPostProcessing = order?.status === 'processing' || order?.status === 'shipped' || order?.status === 'delivered';
  const isPartialOrder = order?.partial_fulfillment === true;

  return (
    <div className="min-h-screen bg-surface pt-32 md:pt-40 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-outline-variant/20">
          <div className="flex items-start gap-4">
            <button onClick={onBack}
              className="mt-1 p-2.5 rounded-2xl bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/30 group shadow-sm transition-colors">
              <span className="material-symbols-outlined text-primary group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
            </button>
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-secondary uppercase mb-1">
                Order Management · Admin
              </p>
              <h1 className="font-brand text-4xl text-primary tracking-tight">#{orderId.slice(0, 8)}</h1>
              {isPartialOrder && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">
                  ⚡ Partial fulfillment
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Status</span>
              <Badge
                label={(order?.status || '').replace(/_/g, ' ')}
                colorClass={STATUS_COLORS[order?.status] || STATUS_COLORS.pending}
              />
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Payment</span>
              <Badge
                label={(order?.payment_status || '').replace(/_/g, ' ')}
                colorClass={PAYMENT_COLORS[order?.payment_status] || PAYMENT_COLORS.pending}
              />
            </div>
            <button
              onClick={() => setShowLog((v) => !v)}
              className="px-4 py-2 rounded-xl border border-outline-variant text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors">
              {showLog ? 'Hide' : 'Show'} Audit Log
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3 shadow-sm">
            <span className="material-symbols-outlined text-emerald-600">check_circle</span>
            <p className="font-medium flex-1">{notice}</p>
            <button onClick={() => setNotice('')} className="text-emerald-600 hover:text-emerald-800 font-bold">✕</button>
          </div>
        )}
        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-3 shadow-sm">
            <span className="material-symbols-outlined text-red-600">error</span>
            <p className="font-medium flex-1">{error}</p>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800 font-bold">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-6">

            {/* Audit log */}
            {showLog && (
              <section className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/30 shadow-sm">
                <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-primary mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined">history</span> Workflow Audit Log
                </h2>
                <WorkflowLog orderId={orderId} />
              </section>
            )}

            {/* Step 1: Item-level approval — pending orders */}
            {isPending && (
              <ItemDecisionPanel
                orderId={orderId}
                items={items}
                sellerDecisions={sellerDecisions}
                adminApprovals={adminApprovals}
                onRefresh={load}
              />
            )}

            {/* Step 3: Order finalization — pending orders */}
            {isPending && (
              <OrderFinalizationPanel
                orderId={orderId}
                order={order}
                readiness={readiness}
                onRefresh={load}
                onNotice={setNotice}
                onError={setError}
              />
            )}

            {/* Step 4: Shipping — once processing */}
            {isPostProcessing && (
              <ShippingPanel
                order={order}
                orderId={orderId}
                onRefresh={load}
                onNotice={setNotice}
                onError={setError}
              />
            )}

            {/* Order items summary */}
            <section className="bg-surface-container-lowest rounded-3xl p-6 lg:p-8 border border-outline-variant/30 shadow-sm">
              <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined">receipt_long</span> Order Items
              </h2>
              <div className="space-y-4">
                {(items || []).flatMap((item) => {
                  if (Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0) {
                    return item.lot_snapshot.map((s) => {
                      const sd = sellerDecisions.find((d) => d.order_item_id === item.id && d.product_key === s.product_key);
                      const aa = adminApprovals.find((a) => a.order_item_id === item.id && a.product_key === s.product_key);
                      const status = aa ? aa.status : sd ? sd.decision : null;
                      const isRejected = status === 'rejected';
                      return (
                        <div key={`${item.id}-${s.product_key}`} className={`flex items-center gap-4 pb-4 border-b border-outline-variant/10 last:border-0 last:pb-0 ${isRejected ? 'opacity-50' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold text-sm truncate ${isRejected ? 'line-through text-red-700' : 'text-primary'}`}>{s.product_name || s.product_key}</p>
                            <p className="text-xs text-on-surface-variant">
                              {s.quantity * item.quantity} × {fmt(s.unit_price)}
                              {item.lot_name && <span className="ml-2 text-secondary font-bold uppercase text-[10px]">{item.lot_name}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-bold ${isRejected ? 'text-red-600 line-through' : 'text-primary'}`}>{fmt(s.unit_price * s.quantity * item.quantity)}</p>
                            {status && <Badge label={status.replace(/_/g, ' ')} colorClass={ITEM_DECISION_COLORS[status] || ITEM_DECISION_COLORS.pending} />}
                          </div>
                        </div>
                      );
                    });
                  }
                  const sd = sellerDecisions.find((d) => d.order_item_id === item.id);
                  const aa = adminApprovals.find((a) => a.order_item_id === item.id);
                  const status = aa ? aa.status : sd ? sd.decision : null;
                  const isRejected = status === 'rejected';
                  return [(
                    <div key={item.id} className={`flex items-center gap-4 pb-4 border-b border-outline-variant/10 last:border-0 last:pb-0 ${isRejected ? 'opacity-50' : ''}`}>
                      {item.products?.image_url
                        ? <img src={item.products.image_url} alt={item.products.name} className="w-12 h-12 rounded-xl object-cover border border-outline-variant/20 shrink-0" />
                        : <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center shrink-0 border border-outline-variant/20">
                            <span className="material-symbols-outlined text-outline text-sm">local_mall</span>
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${isRejected ? 'line-through text-red-700' : 'text-primary'}`}>{item.products?.name || item.lot_name || 'Product'}</p>
                        <p className="text-xs text-on-surface-variant">{item.quantity} × {fmt(item.price)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold ${isRejected ? 'text-red-600 line-through' : 'text-primary'}`}>{fmt(item.price * item.quantity)}</p>
                        {status && <Badge label={status.replace(/_/g, ' ')} colorClass={ITEM_DECISION_COLORS[status] || ITEM_DECISION_COLORS.pending} />}
                      </div>
                    </div>
                  )];
                })}
              </div>

              {/* Billing summary */}
              <div className="mt-6 bg-surface-container-low rounded-2xl p-5 border border-outline-variant/20">
                {order?.billing_breakdown && (
                  <div className="space-y-1 border-b border-outline-variant/20 pb-4 mb-4">
                    {order.billing_breakdown.subtotal != null && <Row label="Subtotal" value={fmt(order.billing_breakdown.subtotal)} />}
                    {order.billing_breakdown.shipping_fee > 0 && <Row label="Shipping" value={fmt(order.billing_breakdown.shipping_fee)} />}
                    {order.billing_breakdown.cod_fee > 0 && <Row label="COD Fee" value={fmt(order.billing_breakdown.cod_fee)} />}
                    {(order.billing_breakdown.coupon_discount > 0 || order.billing_breakdown.discount > 0) && (
                      <Row label="Discount" value={'-' + fmt(order.billing_breakdown.coupon_discount || order.billing_breakdown.discount)} />
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold uppercase tracking-wider text-on-surface">Total</span>
                  <span className="text-2xl font-brand text-primary">{fmt(order?.total_amount)}</span>
                </div>
                {order?.refund_amount > 0 && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/10">
                    <span className="text-xs text-purple-700 font-bold uppercase tracking-wider">Refunded</span>
                    <span className="text-sm font-bold text-purple-700">-{fmt(order.refund_amount)}</span>
                  </div>
                )}
              </div>
            </section>

          </div>

          {/* Right sidebar */}
          <div className="space-y-6">

            <div className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/30 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4">Customer</h3>
              <p className="text-xl font-brand text-primary leading-tight">{customerName}</p>
              <div className="mt-3 space-y-2">
                <p className="text-sm text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-secondary">mail</span>
                  {order?.profile?.email || '—'}
                </p>
                <p className="text-sm text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-secondary">call</span>
                  {order?.profile?.phone || '—'}
                </p>
              </div>
            </div>

            {order?.shipping_address && (
              <div className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/30 shadow-sm">
                <h3 className="text-[11px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4">Delivery Address</h3>
                <div className="text-sm text-on-surface-variant leading-relaxed space-y-0.5">
                  <p className="font-bold text-primary">{order.shipping_address.first_name} {order.shipping_address.last_name}</p>
                  <p>{order.shipping_address.address_line1}</p>
                  {order.shipping_address.address_line2 && <p>{order.shipping_address.address_line2}</p>}
                  <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</p>
                  {order.shipping_address.phone && <p className="mt-2 font-mono text-xs bg-surface-container px-2 py-1 rounded inline-block">{order.shipping_address.phone}</p>}
                </div>
              </div>
            )}

            <div className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/30 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4">Payment</h3>
              <div className="bg-surface-container-low px-4 py-2 rounded-2xl border border-outline-variant/20">
                <Row label="Method" value={(order?.payment_method || '').toUpperCase()} />
                <Row label="Status" value={(order?.payment_status || '').replace(/_/g, ' ')} />
                {order?.razorpay_order_id && <Row label="RP Order" value={order.razorpay_order_id} mono />}
                {order?.razorpay_payment_id && <Row label="RP Payment" value={order.razorpay_payment_id} mono />}
                {order?.refund_amount > 0 && <Row label="Refunded" value={fmt(order.refund_amount)} />}
                {order?.refund_status && order.refund_status !== 'not_required' && <Row label="Refund Status" value={order.refund_status} />}
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-3xl p-6 border border-outline-variant/30 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4">Timeline</h3>
              <div className="relative pl-5 space-y-5 before:absolute before:inset-y-0 before:left-[9px] before:w-[2px] before:bg-outline-variant/30">
                <div className="relative">
                  <span className="w-5 h-5 rounded-full bg-primary absolute -left-5 top-0 -translate-x-1/2 block" />
                  <p className="text-[10px] font-bold uppercase text-primary">Placed</p>
                  <p className="text-xs text-on-surface-variant">{fmtDate(order?.created_at)}</p>
                </div>
                {order?.shipped_at && (
                  <div className="relative">
                    <span className="w-5 h-5 rounded-full bg-blue-500 absolute -left-5 top-0 -translate-x-1/2 block" />
                    <p className="text-[10px] font-bold uppercase text-blue-700">Shipped</p>
                    <p className="text-xs text-on-surface-variant">{fmtDate(order.shipped_at)}</p>
                  </div>
                )}
                {order?.processed_at && (
                  <div className="relative">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 absolute -left-5 top-0 -translate-x-1/2 block" />
                    <p className="text-[10px] font-bold uppercase text-emerald-700">Delivered</p>
                    <p className="text-xs text-on-surface-variant">{fmtDate(order.processed_at)}</p>
                  </div>
                )}
                {order?.cancellation_reason && (
                  <div className="relative">
                    <span className="w-5 h-5 rounded-full bg-red-500 absolute -left-5 top-0 -translate-x-1/2 block" />
                    <p className="text-[10px] font-bold uppercase text-red-700">Cancelled</p>
                    <p className="text-xs text-red-600 italic mt-0.5">{order.cancellation_reason}</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function AdminOrders() {
  const { isAdmin, hasModule, loading } = useAuth();
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [selectedId, setSelectedId] = useState(orderId || null);

  useEffect(() => {
    if (selectedId && !orderId) navigate('/admin/orders/' + selectedId, { replace: true });
    else if (!selectedId && orderId) navigate('/admin/orders', { replace: true });
  }, [selectedId, orderId, navigate]);

  useEffect(() => {
    if (!loading && !isAdmin && !hasModule?.('orders')) navigate('/');
  }, [isAdmin, hasModule, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
      </div>
    );
  }

  if (!isAdmin && !hasModule?.('orders')) return null;

  if (selectedId) {
    return <OrderDetail orderId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return <OrdersList onSelect={(id) => setSelectedId(id)} />;
}
