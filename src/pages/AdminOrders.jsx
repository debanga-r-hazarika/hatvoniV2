// HATVONI ADMIN ORDERS - ORDER WORKFLOW SYSTEM

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Button from '@mui/material/Button';

/** Velocity Get Rates: format currency */
const fmtInr = (v) => {
  if (v === undefined || v === null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return `₹${v}`;
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
};

/**
 * Velocity may return expected_delivery as nested objects:
 * { pickup: { datetime, human_readable }, delivery: { ... } }
 */
const velocityEtaParts = (expectedDelivery) => {
  const ed = expectedDelivery;
  if (!ed || typeof ed !== 'object') {
    return { primaryPickup: '—', primaryDelivery: '—', subPickup: '', subDelivery: '' };
  }

  const readNode = (node) => {
    if (node == null) return { human: '', iso: '' };
    if (typeof node === 'string' || typeof node === 'number') {
      const raw = String(node);
      const parsed = Date.parse(raw);
      return {
        human: Number.isFinite(parsed)
          ? new Date(parsed).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
          : raw,
        iso: raw,
      };
    }
    if (typeof node === 'object') {
      const human = typeof node.human_readable === 'string' ? node.human_readable.trim() : '';
      const dt = typeof node.datetime === 'string' ? node.datetime : '';
      let detail = '';
      if (dt) {
        const p = Date.parse(dt);
        if (Number.isFinite(p)) {
          detail = new Date(p).toLocaleString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      }
      return { human: human || detail || '—', iso: detail || dt };
    }
    return { human: '—', iso: '' };
  };

  const pickupNode = ed.pickup ?? ed.pickup_date;
  const deliveryNode = ed.delivery ?? ed.estimated_delivery ?? ed.edd;

  const p = readNode(pickupNode);
  const d = readNode(deliveryNode);

  return {
    primaryPickup: p.human || '—',
    primaryDelivery: d.human || '—',
    subPickup: p.iso && p.human && p.iso !== p.human ? p.iso : '',
    subDelivery: d.iso && d.human && d.iso !== d.human ? d.iso : '',
  };
};

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
        {icon && <span className="material-symbols-outlined text-[16px] text-gray-900-variant/70">{icon}</span>}
        <span className="text-[11px] font-bold tracking-widest uppercase text-gray-900-variant">{label}</span>
      </div>
      <span className={`text-sm text-gray-900 font-medium ${mono ? 'font-mono text-xs bg-surface-container px-2 py-0.5 rounded-md border border-outline-variant/20 tracking-wider' : ''}`}>
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
              <Link to="/admin" className="text-gray-900-variant hover:text-gray-900 transition-colors">
                <span className="material-symbols-outlined text-xl">arrow_back</span>
              </Link>
              <h1 className="font-brand text-4xl md:text-5xl text-gray-900 tracking-tight">Orders</h1>
            </div>
            <p className="text-gray-900-variant font-body ml-9">Event-driven order workflow — all status changes are system-controlled</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant text-sm font-semibold text-gray-900 hover:bg-primary/5 transition-colors">
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
                <p className="text-lg font-brand text-gray-900 leading-none">{s.value}</p>
                <p className="text-xs text-gray-900-variant font-body mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface-container-low rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-900-variant text-lg">search</span>
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
            <span className="material-symbols-outlined text-6xl text-gray-900-variant/30">receipt_long</span>
            <p className="mt-4 text-gray-900-variant font-body">No orders found</p>
          </div>
        ) : (
          <div className="bg-surface-container-low rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-outline-variant/30">
                    {['Order', 'Customer', 'Amount', 'Status', 'Payment', 'Date', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-900-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map((order) => {
                    const name = `${order.profile?.first_name || ''} ${order.profile?.last_name || ''}`.trim() || '—';
                    return (
                      <tr key={order.id} className="hover:bg-surface-container transition-colors cursor-pointer" onClick={() => onSelect(order.id)}>
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-gray-900 font-semibold">#{order.id.slice(0, 8)}</p>
                          {order.tracking_number && (
                            <p className="text-[10px] text-gray-900-variant mt-0.5">📦 {order.tracking_number}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">{name}</p>
                          <p className="text-xs text-gray-900-variant">{order.profile?.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 whitespace-nowrap">{fmt(order.total_amount)}</td>
                        <td className="px-4 py-3">
                          <Badge label={order.status?.replace(/_/g, ' ')} colorClass={STATUS_COLORS[order.status] || STATUS_COLORS.pending} />
                        </td>
                        <td className="px-4 py-3">
                          <Badge label={order.payment_status?.replace(/_/g, ' ')} colorClass={PAYMENT_COLORS[order.payment_status] || PAYMENT_COLORS.pending} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-900-variant whitespace-nowrap">{fmtDate(order.created_at)}</td>
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
    <section className="bg-white rounded-xl p-4 lg:p-4 border border-neutral-200 shadow-sm">
      <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-gray-900 mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined">fact_check</span> Item-Level Approval
      </h2>
      <p className="text-xs text-gray-900-variant mb-6">
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
                    <p className="font-semibold text-gray-900 text-sm truncate">{line.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {line.product_key && (
                        <span className="text-[10px] font-mono text-gray-900-variant bg-surface-container px-1.5 py-0.5 rounded">
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
                      <span className="text-[10px] text-gray-900-variant">
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
                      <p className="text-[10px] text-gray-900-variant mt-1">
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
                        className="px-3 py-1.5 rounded-lg border border-outline-variant text-gray-900-variant text-xs font-bold hover:bg-surface-container transition-colors"
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
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-neutral-200">

            <h3 className="font-bold text-lg text-gray-900 mb-1">
              {adminDecideTarget.isSyncItem && adminDecision === 'approved' ? 'Inventory Check' : 'Item Decision'}
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              <span className="font-semibold text-gray-900">{adminDecideTarget.name}</span>
              {adminDecideTarget.qty_ordered && (
                <span className="ml-1.5 text-gray-400">· {adminDecideTarget.qty_ordered} ordered</span>
              )}
            </p>

            {/* ── Inventory section (sync items only, approve path) ── */}
            {adminDecideTarget.isSyncItem && adminDecision === 'approved' && (
              <div className="mb-5">
                {adminDecideTarget.inventoryLoading ? (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <span className="material-symbols-outlined animate-spin text-blue-600 text-sm">progress_activity</span>
                    <p className="text-xs text-blue-800 font-medium">Checking inventory...</p>
                  </div>
                ) : adminDecideTarget.inventoryError ? (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-xs text-red-700 font-medium">⚠ Could not fetch inventory.</p>
                    <p className="text-[10px] text-red-600 mt-0.5">Production team will be notified.</p>
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
                      <div className={`p-3 rounded-xl border ${inStock ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-gray-900">{inv.display_name || inv.tag_key}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${inStock ? 'bg-emerald-200/50 text-emerald-800' : 'bg-red-200/50 text-red-800'}`}>
                            {inStock ? '✓ In Stock' : '⚠ Out of Stock'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center mb-2">
                          <div className="bg-white/80 rounded-lg py-1.5">
                            <p className={`text-sm font-bold ${inStock ? 'text-emerald-700' : 'text-red-700'}`}>{qtyAvail}</p>
                            <p className="text-[9px] text-gray-500">available</p>
                          </div>
                          <div className="bg-white/80 rounded-lg py-1.5">
                            <p className="text-sm font-bold text-gray-900">{qtyNeeded}</p>
                            <p className="text-[9px] text-gray-500">ordered</p>
                          </div>
                          <div className="bg-white/80 rounded-lg py-1.5">
                            <p className={`text-sm font-bold ${qtyAvail - qtyNeeded >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                              {qtyAvail - qtyNeeded >= 0 ? '+' : ''}{qtyAvail - qtyNeeded}
                            </p>
                            <p className="text-[9px] text-gray-500">remaining</p>
                          </div>
                        </div>
                        <p className="text-[9px] text-gray-400">Last synced: {lastSync}</p>
                      </div>
                    );
                  })()
                ) : (
                  <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                    <p className="text-xs text-gray-700">No inventory record found in Insider.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Decision toggle (shown for non-sync items or reject path) ── */}
            {(!adminDecideTarget.isSyncItem || adminDecision === 'rejected') && (
              <div className="mb-4">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Decision</label>
                <div className="flex gap-2">
                  {['approved', 'rejected'].map((d) => (
                    <button key={d}
                      onClick={() => setAdminDecision(d)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${adminDecision === d
                        ? d === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-red-500 bg-red-50 text-red-800'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                    >
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Reason field ── */}
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                {adminDecision === 'rejected' ? 'Rejection reason (required)' : 'Note (optional)'}
              </label>
              <input type="text" value={adminReason} onChange={(e) => setAdminReason(e.target.value)}
                placeholder={adminDecision === 'rejected' ? 'Why is this item rejected?' : 'Optional note for audit trail...'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none" />
            </div>

            {adminDecideError && (
              <p className="text-red-600 text-xs mt-1 mb-3">{adminDecideError}</p>
            )}

            {/* ── Action buttons ── */}
            <div className="flex flex-col gap-2">
              {/* Sync item + approve path */}
              {adminDecideTarget.isSyncItem && adminDecision === 'approved' && !adminDecideTarget.inventoryLoading && (
                (() => {
                  const inv = adminDecideTarget.inventory;
                  const qtyAvail = Number(inv?.total_qty_available ?? 0);
                  const qtyNeeded = Number(adminDecideTarget.qty_ordered ?? 0);
                  const inStock = inv ? qtyAvail >= qtyNeeded : true; // if no inventory record, assume we can force approve or production fulfills
                  
                  return (
                    <>
                      {inStock ? (
                        <button
                          onClick={() => handleAdminDecide(false)}
                          disabled={adminDeciding}
                          className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          {adminDeciding ? 'Saving...' : 'Approve Order'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAdminDecide(true)}
                          disabled={adminDeciding}
                          className="w-full py-2 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[14px]">factory</span>
                          {adminDeciding ? 'Saving...' : 'Send to Production Team'}
                        </button>
                      )}
                      <button
                        onClick={() => setAdminDecision('rejected')}
                        className="w-full py-2 rounded-lg border border-red-200 text-red-600 bg-white text-xs font-bold hover:bg-red-50 transition-colors"
                      >
                        Change to Reject
                      </button>
                    </>
                  );
                })()
              )}

              {/* Non-sync item or reject path */}
              {(!adminDecideTarget.isSyncItem || adminDecision === 'rejected') && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setAdminDecideTarget(null); setAdminDecideError(''); }}
                    className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAdminDecide(false)}
                    disabled={adminDeciding}
                    className={`flex-1 py-2.5 rounded-lg text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-60 ${adminDecision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {adminDeciding ? 'Saving...' : `Confirm ${adminDecision.charAt(0).toUpperCase() + adminDecision.slice(1)}`}
                  </button>
                </div>
              )}

              {/* Cancel button for sync approve path */}
              {adminDecideTarget.isSyncItem && adminDecision === 'approved' && !adminDecideTarget.inventoryLoading && (
                <button
                  onClick={() => { setAdminDecideTarget(null); setAdminDecideError(''); }}
                  className="w-full py-2 rounded-lg text-gray-500 text-[11px] font-bold hover:bg-gray-100 transition-colors"
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
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-neutral-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-amber-500 text-xl">warning</span>
              <h3 className="font-bold text-lg text-gray-900">Override Decision</h3>
            </div>
            <p className="text-xs text-gray-500 mb-1">
              Current decision: <strong className="text-gray-900 uppercase">{overrideTarget.current_decision}</strong>
            </p>
            <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded p-2 mb-4">
              Override logged with your admin ID & timestamp.
            </p>
            
            <div className="mb-4">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">New Decision</label>
              <div className="flex gap-2">
                {['approved', 'rejected'].map((d) => (
                  <button key={d}
                    onClick={() => setOverrideDecision(d)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${overrideDecision === d
                      ? d === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-red-500 bg-red-50 text-red-800'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="mb-5">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Override Reason</label>
              <input type="text" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for overriding..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none" />
            </div>
            
            {overrideError && (
              <p className="text-red-600 text-xs mb-3">{overrideError}</p>
            )}
            
            <div className="flex gap-2">
              <button onClick={() => { setOverrideTarget(null); setOverrideError(''); }}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleOverride} disabled={overriding || !overrideReason.trim()}
                className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 disabled:opacity-60 transition-all shadow-sm">
                {overriding ? 'Wait...' : 'Confirm'}
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
          if (!token) throw new Error('No auth token');

          // Use fetch directly to avoid supabase-js client auth header conflicts
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const refundRes = await fetch(`${supabaseUrl}/functions/v1/process-order-refund`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'apikey': supabaseAnonKey,
            },
            body: JSON.stringify({
              order_id: orderId,
              mode: action === 'reject_full' ? 'full' : 'partial',
              reason: reason || (action === 'reject_full' ? 'Order rejected by admin' : 'Partial fulfillment — rejected items refunded'),
            }),
          });
          const refundData = await refundRes.json();
          if (!refundRes.ok && !refundData?.skipped) {
            throw new Error(refundData?.error || `Refund HTTP ${refundRes.status}`);
          }
        } catch (refundErr) {
          // Refund failure is non-blocking — order status already changed
          onError(`Order status updated but refund failed: ${refundErr.message}. Use the "Issue Partial Refund" button to retry.`);
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
    <section className="bg-surface-container-lowest rounded-3xl p-4 lg:p-5 border border-outline-variant/30 shadow-[0_10px_40px_rgba(0,123,71,0.03)] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10" />

      <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-gray-900 mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined">rule</span> Order Decision
      </h2>
      <p className="text-xs text-gray-900-variant mb-6">
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
              className="w-full flex items-center gap-4 p-5 rounded-xl border border-emerald-500 bg-emerald-50 hover:bg-emerald-100 active:scale-[0.99] transition-all text-left group"
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
                  className="w-full flex items-center gap-4 p-5 rounded-xl border border-orange-400 bg-orange-50 hover:bg-orange-100 active:scale-[0.99] transition-all text-left group"
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
                className="w-full flex items-center gap-4 p-5 rounded-xl border border-red-400 bg-red-50 hover:bg-red-100 active:scale-[0.99] transition-all text-left group"
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-900-variant">Confirm action</p>
                <h3 className="font-brand text-xl text-gray-900 leading-tight">
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
              <label className="block text-xs font-bold text-gray-900-variant uppercase tracking-wider mb-2">
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
                className="flex-1 py-3 rounded-xl border border-outline-variant text-gray-900-variant text-sm font-bold hover:bg-surface-container transition-colors"
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

  if (loading) return <div className="py-4 text-center text-sm text-gray-900-variant">Loading audit log...</div>;
  if (logs.length === 0) return <div className="py-4 text-center text-sm text-gray-900-variant">No workflow events yet.</div>;

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface border border-outline-variant/10">
          <span className={`material-symbols-outlined text-lg mt-0.5 shrink-0 ${eventColor[log.event_type] || 'text-gray-900-variant'}`}>
            {eventIcon[log.event_type] || 'info'}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-bold text-gray-900">{log.event_type.replace(/_/g, ' ')}</p>
              <span className="text-[10px] text-gray-900-variant bg-surface-container px-1.5 py-0.5 rounded">{log.actor_role}</span>
              {log.from_status && log.to_status && (
                <span className="text-[10px] text-gray-900-variant">{log.from_status} → {log.to_status}</span>
              )}
            </div>
            {log.metadata?.reason && <p className="text-xs text-gray-900-variant mt-0.5 italic">{log.metadata.reason}</p>}
            {log.metadata?.product_key && <p className="text-[10px] font-mono text-gray-900-variant mt-0.5">{log.metadata.product_key}</p>}
            <p className="text-[10px] text-gray-900-variant/60 mt-1">{new Date(log.created_at).toLocaleString('en-IN')}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ShippingPanel ────────────────────────────────────────────────────────────

function ShippingPanel({ order, orderId, onRefresh, onNotice, onError }) {
  const { user, loading: authLoading, isAdmin } = useAuth();
  // 'manual' | 'velocity'
  const [shippingMode, setShippingMode] = useState('manual');

  // ── Manual mode state ──
  const [editTracking, setEditTracking] = useState(order?.tracking_number || '');
  const [editProvider, setEditProvider] = useState(order?.shipment_provider || '');
  const [editNotes, setEditNotes] = useState(order?.order_notes || '');
  const [editStatus, setEditStatus] = useState(order?.status || '');
  const [saving, setSaving] = useState(false);

  // ── Velocity mode state ──
  // idle | checking | ready | creating_order | pending_assign | assigning | done | error
  const [velStep, setVelStep] = useState('idle');
  const [velServiceability, setVelServiceability] = useState(null); // { serviceable, carriers, zone, payment_mode }
  const [velCarrierId, setVelCarrierId] = useState('');
  const [velLength, setVelLength] = useState('15');
  const [velBreadth, setVelBreadth] = useState('15');
  const [velHeight, setVelHeight] = useState('10');
  const [velWeight, setVelWeight] = useState('0.5');
  const [velShipmentId, setVelShipmentId] = useState(''); // Velocity SHI… from forward-order
  const [velResult, setVelResult] = useState(null); // last API response (assign step)
  const [velError, setVelError] = useState('');
  const [pickupLocations, setPickupLocations] = useState([]);
  const [pickupLocationId, setPickupLocationId] = useState('');
  const [trackingVelocity, setTrackingVelocity] = useState(false);
  const [syncingVelTrack, setSyncingVelTrack] = useState(false);
  const [printingLabel, setPrintingLabel] = useState(false);
  const [cancellingPickup, setCancellingPickup] = useState(false);
  const [reinitiatingShipping, setReinitiatingShipping] = useState(false);
  const [restoringHistoricalShipment, setRestoringHistoricalShipment] = useState(false);
  const [velEnvHealth, setVelEnvHealth] = useState(null);
  const [suppressPendingVelocitySid, setSuppressPendingVelocitySid] = useState(false);

  const [retryingRefund, setRetryingRefund] = useState(false);
  const isPartialOrder = order?.partial_fulfillment === true;
  const isRazorpay = ['razorpay', 'razorpay_upi', 'razorpay_cards'].includes(order?.payment_method);
  const isPaid = order?.payment_status === 'paid';
  const pendingVelocitySidFromOrder = order?.velocity_pending_shipment_id
    ? String(order.velocity_pending_shipment_id).trim()
    : '';
  const pendingVelocitySid = suppressPendingVelocitySid ? '' : pendingVelocitySidFromOrder;
  const alreadyShippedViaVelocity = !!(order?.velocity_shipment_id && order?.tracking_number);
  const velocityFulfillment = order?.velocity_fulfillment && typeof order.velocity_fulfillment === 'object'
    ? order.velocity_fulfillment
    : null;
  const velocityOrderCreated = !!(pendingVelocitySid || velShipmentId);
  const velocityMethodLocked = Boolean(velocityFulfillment?.method_locked_after_order || pendingVelocitySid);
  const historicalVelocityOrders = Array.isArray(velocityFulfillment?.historical_velocity_orders)
    ? velocityFulfillment.historical_velocity_orders
    : [];
  const latestHistoricalVelocityOrder = historicalVelocityOrders.length > 0
    ? historicalVelocityOrders[historicalVelocityOrders.length - 1]
    : null;
  const canReinitiateShipping = Boolean(isAdmin) && order?.status === 'processing' && !order?.tracking_number && velocityOrderCreated;
  const shouldHideManualMethod = order?.status === 'processing' && velocityMethodLocked;

  useEffect(() => {
    // Re-enable DB-driven pending SID once refreshed order confirms it is cleared.
    if (!pendingVelocitySidFromOrder && suppressPendingVelocitySid) {
      setSuppressPendingVelocitySid(false);
    }
  }, [pendingVelocitySidFromOrder, suppressPendingVelocitySid]);

  /** Before courier picks up / in transit — Velocity cancel-order (`awbs[]`) cancels shipment & pickup booking. */
  const shipmentLc = String(order?.shipment_status || '').toLowerCase();
  const pickupCancelBlocked = new Set([
    'in_transit',
    'out_for_delivery',
    'picked_up',
    'picked',
    'picked up',
    'dispatch',
    'dispatched',
    'delivered',
    'cancelled',
    'rto_delivered',
    'lost',
  ]);
  const showCancelPickup =
    alreadyShippedViaVelocity &&
    !!(order?.tracking_number || order?.velocity_awb) &&
    order?.status !== 'cancelled' &&
    !pickupCancelBlocked.has(shipmentLc);
  // Show retry button when refund is pending (was set by admin_finalize_order but edge fn wasn't deployed)
  const needsRefundRetry = isPartialOrder && isRazorpay && isPaid && order?.refund_status === 'pending';

  useEffect(() => {
    let active = true;
    const loadPickupLocations = async () => {
      try {
        const { data, error } = await supabase
          .from('seller_pickup_locations')
          .select('id, warehouse_name, pincode, is_default, velocity_warehouse_id')
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (!active) return;
        const rows = data || [];
        setPickupLocations(rows);
        const firstSynced = rows.find((r) => r.velocity_warehouse_id)?.id || '';
        setPickupLocationId(firstSynced);
      } catch {
        if (!active) return;
        setPickupLocations([]);
        setPickupLocationId('');
      }
    };

    if (shippingMode === 'velocity') loadPickupLocations();
    return () => { active = false; };
  }, [shippingMode]);

  const velocityResumeKeyRef = useRef('');

  // Resume Velocity flow from DB after refresh (pending shipment id stored on order row).
  useEffect(() => {
    if (shippingMode !== 'velocity' || !pendingVelocitySid) return;
    const key = `${orderId}:${pendingVelocitySid}:${order?.velocity_fulfillment?.saved_at || ''}`;
    if (velocityResumeKeyRef.current === key) return;
    velocityResumeKeyRef.current = key;
    setVelShipmentId(pendingVelocitySid);
    setVelStep((step) => (step === 'done' ? 'done' : 'pending_assign'));
    const vf = order?.velocity_fulfillment;
    if (vf && typeof vf === 'object') {
      if (vf.pickup_location_id) setPickupLocationId(String(vf.pickup_location_id));
      if (vf.length != null) setVelLength(String(vf.length));
      if (vf.breadth != null) setVelBreadth(String(vf.breadth));
      if (vf.height != null) setVelHeight(String(vf.height));
      if (vf.weight != null) setVelWeight(String(vf.weight));
      if (vf.serviceability) setVelServiceability(vf.serviceability);
    }
  }, [shippingMode, orderId, pendingVelocitySid, order?.velocity_fulfillment?.saved_at, order?.velocity_fulfillment]);

  useEffect(() => {
    if (pendingVelocitySid) return;
    velocityResumeKeyRef.current = '';
    if (velStep === 'pending_assign') {
      setVelStep('idle');
      setVelShipmentId('');
    }
  }, [pendingVelocitySid, velStep]);

  const velocityInnerPayload = (raw) => {
    const o = raw && typeof raw === 'object' ? raw : {};
    const inner = (o.payload && typeof o.payload === 'object' ? o.payload : o) || {};
    const labelKeys = [
      'label_url', 'shipping_label_url', 'label_pdf_url', 'courier_label_url',
      'awb_label_url', 'label_print_url', 'pdf_url', 'shipping_label',
    ];
    let label_url = inner.label_url;
    if (!label_url || typeof label_url !== 'string') {
      for (const k of labelKeys) {
        const v = inner[k];
        if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
          label_url = v.trim();
          break;
        }
      }
    }
    return { ...inner, label_url: label_url || inner.label_url };
  };

  /** Find a shipping-label / PDF URL inside a Velocity tracking (or assign) API JSON tree. */
  const findLabelUrlInApiResponse = (raw) => {
    const inner = velocityInnerPayload(raw);
    if (inner.label_url && /^https?:\/\//i.test(String(inner.label_url))) {
      return String(inner.label_url).trim();
    }
    const walk = (obj, depth) => {
      if (depth > 14 || obj == null || typeof obj !== 'object') return null;
      if (Array.isArray(obj)) {
        for (const el of obj) {
          const u = walk(el, depth + 1);
          if (u) return u;
        }
        return null;
      }
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v !== 'string' || v.length > 4000 || !/^https?:\/\//i.test(v.trim())) continue;
        const key = k.toLowerCase();
        if (key === 'tracking_url' || key === 'track_url') continue;
        if (
          key.includes('label') ||
          key.includes('pdf') ||
          key.includes('manifest') ||
          key.includes('waybill') ||
          key.includes('shipping_label')
        ) {
          return v.trim();
        }
      }
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') {
          const u = walk(v, depth + 1);
          if (u) return u;
        }
      }
      return null;
    };
    return walk(raw, 0);
  };

  const velocityDimsValid = () => {
    const l = parseFloat(velLength);
    const b = parseFloat(velBreadth);
    const h = parseFloat(velHeight);
    const w = parseFloat(velWeight);
    return [l, b, h, w].every((n) => Number.isFinite(n) && n > 0);
  };

  const velocityPickupReady = () => {
    const loc = pickupLocations.find((r) => r.id === pickupLocationId);
    return !!(loc && loc.velocity_warehouse_id);
  };

  const sortedVelocityCarriers = useMemo(() => {
    const list = [...(velServiceability?.carriers || [])];
    list.sort((a, b) => {
      const aq = a.rate_quote?.charges ? 1 : 0;
      const bq = b.rate_quote?.charges ? 1 : 0;
      if (aq !== bq) return bq - aq;
      const ta = Number(a.rate_quote?.charges?.total_forward_charges ?? Number.POSITIVE_INFINITY);
      const tb = Number(b.rate_quote?.charges?.total_forward_charges ?? Number.POSITIVE_INFINITY);
      if (ta !== tb) return ta - tb;
      return String(a.carrier_name || '').localeCompare(String(b.carrier_name || ''));
    });
    return list;
  }, [velServiceability?.carriers]);

  const toUserError = (err, fallback = 'Something went wrong. Please try again.') => {
    const msg = String(err?.message || err || '').trim();
    if (!msg) return fallback;
    const lower = msg.toLowerCase();
    if (lower.includes('invalid or expired token') || lower.includes('no auth token') || lower.includes('unauthorized')) {
      return 'Your session expired. Please sign in again and retry.';
    }
    if (lower.includes('order not found')) return 'Order details could not be found. Please refresh and try again.';
    if (lower.includes('not serviceable')) return 'This delivery pincode is currently not serviceable.';
    if (lower.includes('missing required env var') || lower.includes('server misconfiguration')) {
      return 'Shipping service is not configured yet. Please contact support.';
    }
    if (lower.includes('http 5')) return 'Shipping service is temporarily unavailable. Please retry in a moment.';
    if (lower.includes('http 4')) return 'Request could not be processed. Please verify the shipping details and retry.';
    return msg;
  };

  // ── Helper to call velocity-orchestrator edge function ──
  const callVelocityFn = async (body) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('No auth token — please sign in again');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/velocity-orchestrator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({
        action: body.action,
        payload: { order_id: orderId, ...body.payload },
      }),
    });
    let data;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(res.ok ? 'Invalid response from shipping service' : `HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data?.data ?? {};
  };

  const persistVelocityFulfillmentMeta = async (mutator) => {
    const current = (order?.velocity_fulfillment && typeof order.velocity_fulfillment === 'object')
      ? order.velocity_fulfillment
      : {};
    const next = mutator({ ...current });
    await supabase
      .from('orders')
      .update({
        velocity_fulfillment: next,
        updated_at: new Date().toISOString(),
        admin_updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);
  };

  const syncVelocityTrackingFromApi = async () => {
    setSyncingVelTrack(true);
    onError('');
    try {
      await callVelocityFn({ action: 'track_order', payload: {} });
      onNotice('Tracking data pulled from Velocity and saved on the order.');
      await onRefresh();
    } catch (e) {
      onError(toUserError(e, 'Could not sync tracking from Velocity.'));
    } finally {
      setSyncingVelTrack(false);
    }
  };

  /** Opens printable label (PDF/URL) in a new tab — fetches from Velocity if not stored yet. */
  const printShippingLabel = async () => {
    const existing = order.velocity_label_url;
    if (existing && /^https?:\/\//i.test(String(existing))) {
      window.open(String(existing).trim(), '_blank', 'noopener,noreferrer');
      return;
    }
    setPrintingLabel(true);
    onError('');
    try {
      const raw = await callVelocityFn({ action: 'track_order', payload: {} });
      let url = findLabelUrlInApiResponse(raw);
      await onRefresh();
      if (!url) {
        const { data: row } = await supabase
          .from('orders')
          .select('velocity_label_url')
          .eq('id', orderId)
          .maybeSingle();
        const saved = row?.velocity_label_url;
        if (saved && /^https?:\/\//i.test(String(saved))) url = String(saved).trim();
      }
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        onNotice('Label opened in a new tab. Use your browser print dialog (Ctrl+P / ⌘P) if needed.');
      } else {
        onError(
          'Velocity has not returned a label link for this AWB yet (this can happen shortly after booking). Click again in a few minutes, or print the label from your Velocity merchant portal.',
        );
      }
    } catch (e) {
      onError(toUserError(e, 'Could not fetch the label from Velocity.'));
    } finally {
      setPrintingLabel(false);
    }
  };

  /** Cancels the forward shipment on Velocity (POST /cancel-order with `awbs[]` per API docs) and resets order for re-booking. */
  const cancelVelocityPickup = async () => {
    const ok = window.confirm(
      'Cancel this shipment and pickup on Velocity? The AWB will be voided on the carrier, and this order will return to Processing so you can create a new shipment.',
    );
    if (!ok) return;
    setCancellingPickup(true);
    onError('');
    try {
      await callVelocityFn({ action: 'cancel_order', payload: {} });
      onNotice('Pickup / shipment cancelled on Velocity. Order set back to processing.');
      setEditTracking('');
      setEditProvider('');
      setEditStatus('processing');
      await onRefresh();
    } catch (e) {
      onError(toUserError(e, 'Velocity could not cancel this shipment. It may already be in transit — check the portal.'));
    } finally {
      setCancellingPickup(false);
    }
  };

  // Default to Velocity when a Velocity shipment order exists (resumable workflow).
  useEffect(() => {
    if (order?.status === 'processing' && (order?.velocity_pending_shipment_id || velocityFulfillment?.method_locked_after_order)) {
      setShippingMode('velocity');
    }
  }, [order?.velocity_pending_shipment_id, order?.status, velocityFulfillment?.method_locked_after_order]);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const h = await callVelocityFn({ action: 'webhook_health', payload: {} });
        if (!cancelled) setVelEnvHealth({ ...h, loadFailed: false });
      } catch (e) {
        if (!cancelled) {
          setVelEnvHealth({
            loadFailed: true,
            detail: String(e?.message || e || 'Unknown error'),
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, authLoading, user]);

  // ── Step 2: serviceability (Velocity doc §3) — uses selected pickup pincode as `from` ──
  const checkServiceability = async () => {
    if (pendingVelocitySid) {
      setVelError('An immutable Velocity order already exists for this session. Continue with courier assignment or use Reinitiate Shipping.');
      return;
    }
    if (!velocityPickupReady()) {
      setVelError('Select a pickup location that is synced with Velocity (warehouse id present).');
      return;
    }
    if (!velocityDimsValid()) {
      setVelError('Enter valid package dimensions (length, breadth, height, weight must be greater than zero).');
      return;
    }
    setVelStep('checking');
    setVelError('');
    setVelServiceability(null);
    setVelResult(null);
    try {
      const data = await callVelocityFn({
        action: 'check_serviceability',
        payload: {
          pickup_location_id: pickupLocationId,
          length: parseFloat(velLength),
          breadth: parseFloat(velBreadth),
          height: parseFloat(velHeight),
          weight: parseFloat(velWeight),
        },
      });
      setVelServiceability(data);
      setVelStep(data.serviceable ? 'ready' : 'error');
      if (data.serviceable) setVelError('');
      if (!data.serviceable) setVelError('This delivery pincode is not serviceable by Velocity Shipping for the selected pickup PIN.');
    } catch (e) {
      setVelStep('error');
      setVelError(toUserError(e, 'Could not check serviceability. Please try again.'));
    }
  };

  // ── Step 3: create forward order only (Velocity doc §4a — /forward-order, no AWB yet) ──
  const createVelocityForwardOrder = async () => {
    setVelStep('creating_order');
    setVelError('');
    try {
      const data = await callVelocityFn({
        action: 'create_forward_order',
        payload: {
          pickup_location_id: pickupLocationId,
          length: parseFloat(velLength),
          breadth: parseFloat(velBreadth),
          height: parseFloat(velHeight),
          weight: parseFloat(velWeight),
          serviceability_snapshot: velServiceability,
        },
      });
      const inner = velocityInnerPayload(data);
      const sid = String(inner.shipment_id || '').trim();
      if (!sid) {
        throw new Error('Velocity did not return a shipment_id. Check Velocity API logs.');
      }
      setVelShipmentId(sid);
      setVelStep('pending_assign');
      await persistVelocityFulfillmentMeta((meta) => ({
        ...meta,
        method_locked_after_order: true,
        workflow_stage: 'order_created',
        latest_velocity_shipment_id: sid,
      }));
      await onRefresh();
      onNotice(`Velocity shipment order created. Shipment ID: ${sid}. Manual shipping is now locked; continue with courier/AWB step.`);
    } catch (e) {
      setVelStep('ready');
      setVelError(toUserError(e, 'Shipment order could not be created. Please try again.'));
    }
  };

  const continueWithExistingVelocityOrder = async () => {
    const historicalSid = String(latestHistoricalVelocityOrder?.shipment_id || '').trim();
    if (!historicalSid) return;
    setRestoringHistoricalShipment(true);
    setVelError('');
    try {
      await persistVelocityFulfillmentMeta((meta) => ({
        ...meta,
        workflow_stage: 'order_created',
        method_locked_after_order: true,
        latest_velocity_shipment_id: historicalSid,
      }));
      await supabase
        .from('orders')
        .update({
          velocity_pending_shipment_id: historicalSid,
          updated_at: new Date().toISOString(),
          admin_updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
      setShippingMode('velocity');
      setVelShipmentId(historicalSid);
      setVelStep('pending_assign');
      onNotice(`Resumed existing Velocity order ${historicalSid}.`);
      await onRefresh();
    } catch (e) {
      setVelError(toUserError(e, 'Could not restore existing Velocity order.'));
    } finally {
      setRestoringHistoricalShipment(false);
    }
  };

  const reinitiateShipping = async () => {
    const sid = velShipmentId || pendingVelocitySid;
    if (!sid) {
      setVelError('No Velocity shipment was found to reinitiate.');
      return;
    }
    if (!window.confirm('Reinitiate shipping? This will unlock method selection and start from step 1. Existing Velocity order will be preserved in history.')) return;
    setReinitiatingShipping(true);
    setVelError('');
    try {
      await persistVelocityFulfillmentMeta((meta) => {
        const history = Array.isArray(meta.historical_velocity_orders) ? [...meta.historical_velocity_orders] : [];
        const exists = history.some((h) => String(h?.shipment_id || '') === sid);
        if (!exists) {
          history.push({
            shipment_id: sid,
            source: 'reinitiate_shipping',
            saved_at: new Date().toISOString(),
          });
        }
        return {
          ...meta,
          historical_velocity_orders: history,
          workflow_stage: 'selection',
          method_locked_after_order: false,
          latest_velocity_shipment_id: null,
        };
      });
      await supabase
        .from('orders')
        .update({
          velocity_pending_shipment_id: null,
          updated_at: new Date().toISOString(),
          admin_updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
      // Immediately unlock step UI locally; DB refresh will reconcile shortly after.
      setSuppressPendingVelocitySid(true);
      velocityResumeKeyRef.current = '';
      setVelShipmentId('');
      setVelStep('idle');
      setVelServiceability(null);
      setVelResult(null);
      setVelCarrierId('');
      setShippingMode('velocity');
      onNotice('Shipping workflow reinitiated. You can continue in Velocity from step 1.');
      await onRefresh();
    } catch (e) {
      setVelError(toUserError(e, 'Could not reinitiate shipping.'));
    } finally {
      setReinitiatingShipping(false);
    }
  };

  const trackVelocityShipment = async () => {
    const sid = velShipmentId || pendingVelocitySid;
    if (!sid) return;
    setTrackingVelocity(true);
    setVelError('');
    try {
      await callVelocityFn({
        action: 'track_order',
        payload: { shipment_id: sid },
      });
      onNotice('Tracking status refreshed from Velocity.');
      await onRefresh();
    } catch (e) {
      setVelError(toUserError(e, 'Tracking request failed.'));
    } finally {
      setTrackingVelocity(false);
    }
  };

  // ── Step 4: assign courier / create shipping (Velocity doc §4b — /forward-order-shipment) ──
  const assignVelocityCourier = async () => {
    const sid = velShipmentId || pendingVelocitySid;
    if (!sid) {
      setVelError('Missing Velocity shipment id. Refresh the page or create the shipment order again.');
      return;
    }
    setVelStep('assigning');
    setVelError('');
    try {
      const data = await callVelocityFn({
        action: 'assign_courier',
        payload: {
          shipment_id: sid,
          carrier_id: velCarrierId || '',
        },
      });
      setVelResult(data);
      setVelStep('done');
      const p = velocityInnerPayload(data);
      onNotice(`Shipment created via Velocity. AWB: ${p.awb_code || '—'}${p.courier_name ? ` — ${p.courier_name}` : ''}`);
      await onRefresh();
      try {
        await callVelocityFn({ action: 'track_order', payload: {} });
        await onRefresh();
      } catch {
        /* non-fatal: order still has AWB; admin can use Sync from Velocity */
      }
    } catch (e) {
      setVelStep('pending_assign');
      setVelError(toUserError(e, 'Courier assignment failed. Adjust courier or retry.'));
    }
  };

  const retryRefund = async () => {
    setRetryingRefund(true);
    onError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('No auth token — please sign in again');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${supabaseUrl}/functions/v1/process-order-refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey },
        body: JSON.stringify({ order_id: orderId, mode: 'partial', reason: 'Partial fulfillment — rejected items refunded' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (data?.skipped) { onNotice(`Refund skipped: ${data.reason}`); }
      else if (data?.ok) { onNotice(`Partial refund of ${fmt(data.refund_amount)} initiated successfully.`); }
      else { throw new Error(data?.error || 'Refund failed'); }
      await onRefresh();
    } catch (err) {
      onError(toUserError(err, 'Refund could not be initiated right now.'));
    } finally {
      setRetryingRefund(false);
    }
  };

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
        const allowedTransitions = { processing: ['shipped', 'cancelled'], shipped: ['delivered', 'cancelled'] };
        const allowed = allowedTransitions[order.status] || [];
        if (!allowed.includes(editStatus)) {
          throw new Error(`Cannot change status from "${order.status}" to "${editStatus}" here.`);
        }
        if (editStatus === 'cancelled') {
          const velInvolved = !!(order.velocity_shipment_id || order.velocity_pending_shipment_id ||
            order.tracking_number || order.velocity_awb);
          if (velInvolved) {
            await callVelocityFn({ action: 'cancel_order', payload: {} });
            patch.tracking_number = null;
            patch.shipment_provider = null;
          }
        }
        patch.status = editStatus;
        if (editStatus === 'shipped' && !order.shipped_at) patch.shipped_at = now;
        if (editStatus === 'delivered' && !order.processed_at) patch.processed_at = now;
        if (editStatus === 'shipped') patch.shipment_status = 'in_transit';
        if (editStatus === 'delivered') patch.shipment_status = 'delivered';
        if (editStatus === 'cancelled') patch.shipment_status = patch.shipment_status || 'cancelled';
      }
      const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
      if (error) throw error;
      onNotice('Shipping details updated.');
      await onRefresh();
    } catch (err) {
      onError(toUserError(err, 'Could not save shipping details. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  // Only show statuses that are valid next steps from the current status.
  const nextStatuses = { processing: ['processing', 'shipped', 'cancelled'], shipped: ['shipped', 'delivered', 'cancelled'] };
  const shippingStatuses = nextStatuses[order?.status] || [order?.status].filter(Boolean);

  const velocityDonePayload = velStep === 'done' && velResult ? velocityInnerPayload(velResult) : null;
  const velocityDoneCharges = velocityDonePayload?.charges?.frwd_charges;

  return (
    <section className="bg-surface-container-lowest rounded-3xl p-4 lg:p-5 border border-outline-variant/30 shadow-[0_10px_40px_rgba(0,123,71,0.03)] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10" />
      <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-gray-900 mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined">local_shipping</span> Shipping &amp; Fulfillment
      </h2>
      <p className="text-xs text-gray-900-variant mb-4">
        Choose how to create the shipment — manually enter details or use Velocity Shipping to generate an AWB automatically.
      </p>

      {velEnvHealth?.loadFailed && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 mb-4 text-[11px] text-red-800">
          <p className="font-semibold">Could not load integration checks.</p>
          {velEnvHealth.detail && (
            <p className="mt-1.5 text-[10px] text-red-900/90 font-mono break-words">{velEnvHealth.detail}</p>
          )}
          <p className="mt-1 text-red-800/90">
            Staff need the <strong>Orders</strong> module; refresh the page or redeploy <code className="text-[9px]">velocity-orchestrator</code> after updates.
          </p>
        </div>
      )}
      {velEnvHealth && typeof velEnvHealth.velocity_webhook_secret_configured === 'boolean' && !velEnvHealth.loadFailed && (
        <div className="rounded-xl border border-outline-variant/25 bg-surface-container-low/90 px-4 py-3 mb-4 flex flex-col gap-2 text-[11px]">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-x-8">
            <span className="font-black uppercase tracking-[0.12em] text-gray-900-variant">Shipping integration</span>
            <span className={`font-semibold ${velEnvHealth.velocity_webhook_secret_configured ? 'text-emerald-700' : 'text-amber-800'}`}>
              Webhook secret: {velEnvHealth.velocity_webhook_secret_configured ? 'configured (auto order status)' : 'missing — set VELOCITY_WEBHOOK_SECRET for live updates'}
            </span>
            <span className={`font-semibold ${velEnvHealth.velocity_api_credentials_configured ? 'text-emerald-700' : 'text-amber-800'}`}>
              Velocity API: {velEnvHealth.velocity_api_credentials_configured ? 'secrets present' : 'secrets missing'}
            </span>
          </div>
          {velEnvHealth.velocity_probe && (
            <div className="mt-1 pt-2 border-t border-outline-variant/20 text-[10px] text-gray-800 space-y-1.5">
              <p className="font-bold uppercase tracking-wider text-gray-900-variant">Velocity upstream probe</p>
              {velEnvHealth.velocity_probe.skipped ? (
                <p className="text-amber-900/90">{String(velEnvHealth.velocity_probe.reason || 'Probe skipped.')}</p>
              ) : (
                <>
                  {velEnvHealth.velocity_probe.summary && (
                    <p className="text-gray-900 leading-snug">{String(velEnvHealth.velocity_probe.summary)}</p>
                  )}
                  {velEnvHealth.velocity_probe.probe_error && (
                    <p className="text-red-800 font-mono break-words">{String(velEnvHealth.velocity_probe.probe_error)}</p>
                  )}
                  <div className="grid gap-1 sm:grid-cols-2 font-mono text-[9px] text-gray-700/95">
                    {velEnvHealth.velocity_probe.base_http && (
                      <span>
                        Base URL: HTTP {velEnvHealth.velocity_probe.base_http.status}{' '}
                        {velEnvHealth.velocity_probe.base_http.ok ? 'ok' : 'fail'}
                        {typeof velEnvHealth.velocity_probe.base_http.ms === 'number' && ` · ${velEnvHealth.velocity_probe.base_http.ms}ms`}
                      </span>
                    )}
                    {velEnvHealth.velocity_probe.auth_token && (
                      <span>
                        Auth token: HTTP {velEnvHealth.velocity_probe.auth_token.http_status ?? '—'}{' '}
                        {velEnvHealth.velocity_probe.auth_token.token_received ? 'token received' : 'no token'}
                        {typeof velEnvHealth.velocity_probe.auth_token.ms === 'number' && ` · ${velEnvHealth.velocity_probe.auth_token.ms}ms`}
                      </span>
                    )}
                    {velEnvHealth.velocity_probe.serviceability_smoke && (
                      <span className="sm:col-span-2">
                        Serviceability smoke: HTTP {velEnvHealth.velocity_probe.serviceability_smoke.http_status}{' '}
                        {velEnvHealth.velocity_probe.serviceability_smoke.invalid_credentials ? 'INVALID_CREDENTIALS' : velEnvHealth.velocity_probe.serviceability_smoke.ok ? 'ok' : 'not ok'}
                        {typeof velEnvHealth.velocity_probe.serviceability_smoke.ms === 'number' && ` · ${velEnvHealth.velocity_probe.serviceability_smoke.ms}ms`}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {isPartialOrder && (
        <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-4">
          ⚠ Partial order — only approved items should be shipped. Rejected items have been removed.
        </p>
      )}

      {latestHistoricalVelocityOrder && order.status === 'processing' && (
        <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-indigo-900 font-semibold">
            A previous shipping order exists for this order.
          </p>
          <Button
            size="small"
            variant="contained"
            color="secondary"
            onClick={continueWithExistingVelocityOrder}
            disabled={restoringHistoricalShipment}
          >
            {restoringHistoricalShipment ? 'Restoring...' : 'Continue with Existing Order'}
          </Button>
        </div>
      )}

      {/* Existing Velocity shipment banner */}
      {alreadyShippedViaVelocity && (
        <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <span className="material-symbols-outlined text-blue-600 text-2xl shrink-0">verified</span>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-bold text-blue-800">Velocity shipment active</p>
            <p className="text-xs text-blue-700">
              AWB: <span className="font-mono font-bold">{order.tracking_number || order.velocity_awb}</span>
              {order.velocity_carrier_name && <span className="ml-2">· {order.velocity_carrier_name}</span>}
            </p>
            {order.shipment_status && (
              <p className="text-xs text-blue-800/90">
                Carrier status: <span className="font-bold capitalize">{String(order.shipment_status).replace(/_/g, ' ')}</span>
                {order.shipment_status === 'delivered' && <span className="ml-1 text-emerald-700">(order auto-marks delivered when applicable)</span>}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="small"
                variant="contained"
                color="primary"
                onClick={printShippingLabel}
                disabled={
                  printingLabel ||
                  syncingVelTrack ||
                  cancellingPickup ||
                  !(order.tracking_number || order.velocity_awb)
                }
              >
                {printingLabel ? 'Fetching label...' : 'Print shipping label'}
              </Button>
              {order.velocity_tracking_url && (
                <a href={order.velocity_tracking_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100">
                  <span className="material-symbols-outlined text-sm">map</span>
                  Public tracking
                </a>
              )}
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={syncVelocityTrackingFromApi}
                disabled={syncingVelTrack || printingLabel || cancellingPickup}
              >
                {syncingVelTrack ? 'Syncing...' : 'Sync from Velocity'}
              </Button>
              {showCancelPickup && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={cancelVelocityPickup}
                  disabled={cancellingPickup || printingLabel || syncingVelTrack}
                >
                  {cancellingPickup ? 'Cancelling...' : 'Cancel pickup & shipment'}
                </Button>
              )}
            </div>
            {!order.velocity_label_url && (order.tracking_number || order.velocity_awb) && (
              <p className="text-[10px] text-blue-800/85">
                If <strong>Print shipping label</strong> says Velocity has no link yet, wait a few minutes after pickup booking, click again, or use your Velocity merchant portal with this AWB.
              </p>
            )}
            <p className="text-[10px] text-blue-800/80">
              Webhooks: set Shipfast/Velocity to POST to this project’s <code className="text-[9px]">/functions/v1/velocity-orchestrator</code> with the same API key or Bearer as <code className="text-[9px]">VELOCITY_WEBHOOK_SECRET</code>. Use <code className="text-[9px]">order_external_id</code> = this order’s UUID.
            </p>
          </div>
        </div>
      )}

      {/* Mode tabs — locked after Velocity order creation */}
      {!alreadyShippedViaVelocity && order.status === 'processing' && !shouldHideManualMethod && (
        <div className="flex gap-2 mb-6 bg-surface-container-low rounded-xl p-1">
          {[
            { key: 'manual', label: 'Manual Entry', icon: 'edit' },
            { key: 'velocity', label: 'Velocity Shipping', icon: 'electric_bolt' },
          ].map((tab) => (
            <Button key={tab.key} onClick={() => {
              const prev = shippingMode;
              setShippingMode(tab.key);
              if (prev === 'velocity' && tab.key === 'manual') {
                setVelStep('idle');
                setVelError('');
                setVelServiceability(null);
                setVelShipmentId('');
                setVelResult(null);
                velocityResumeKeyRef.current = '';
              }
            }}
              variant={shippingMode === tab.key ? 'contained' : 'text'}
              color={shippingMode === tab.key ? 'primary' : 'inherit'}
              sx={{ flex: 1 }}
            >
              <span className="material-symbols-outlined text-base mr-1">{tab.icon}</span>
              {tab.label}
            </Button>
          ))}
        </div>
      )}

      {/* ── Manual mode — hidden while Velocity tab + order still processing (switch tab for manual AWB). Also shown when status left "processing" so shipped/delivered edits work. ── */}
      {(shippingMode === 'manual' || order.status !== 'processing') && !shouldHideManualMethod && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
            <div>
              <label className="block text-xs font-bold text-gray-900-variant uppercase tracking-wider mb-2">Order Status</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-secondary">
                {shippingStatuses.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-900-variant uppercase tracking-wider mb-2">Shipment Provider</label>
              <input type="text" value={editProvider} onChange={(e) => setEditProvider(e.target.value)}
                placeholder="e.g. Delhivery, India Post"
                className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-900-variant uppercase tracking-wider mb-2">Tracking Number / AWB</label>
              <input type="text" value={editTracking} onChange={(e) => setEditTracking(e.target.value)}
                placeholder="AWB / Tracking Number"
                className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary font-mono placeholder:font-body" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-900-variant uppercase tracking-wider mb-2">Note to Customer</label>
              <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Dispatch details visible to customer..."
                className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-3 items-center">
            <Button onClick={saveChanges} disabled={saving} variant="contained" color="primary" size="large" sx={{ width: { xs: '100%', sm: 'auto' } }}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
            {needsRefundRetry && (
              <Button onClick={retryRefund} disabled={retryingRefund} variant="outlined" color="warning" size="large" sx={{ width: { xs: '100%', sm: 'auto' } }}>
                {retryingRefund ? 'Processing...' : 'Issue partial refund'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Velocity Shipping mode (doc: serviceability → forward-order → forward-order-shipment) ── */}
      {shippingMode === 'velocity' && !alreadyShippedViaVelocity && order.status === 'processing' && (
        <div className="space-y-5">
          <p className="text-xs text-gray-900-variant -mt-1 mb-1">
            Flow: check serviceability → create <strong>shipment order</strong> (no courier yet) → <strong>assign courier</strong> to manifest and generate the AWB/label.
          </p>

          {velocityMethodLocked && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Velocity order already created for this session. Shipping method is locked to Velocity until admin reinitiates shipping.
            </div>
          )}

          <div className="rounded-2xl border border-outline-variant/20 bg-surface-container-low/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-900-variant mb-3">Fulfillment steps</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'dims', label: 'Package & pickup', done: velocityDimsValid() && velocityPickupReady() },
                { id: 'svc', label: 'Check serviceability', done: !!velServiceability },
                { id: 'fo', label: 'Shipment order only', done: !!(pendingVelocitySid || velShipmentId) },
                { id: 'awb', label: 'AWB & courier', done: velStep === 'done' || !!order.tracking_number },
              ].map((s, i) => (
                <div key={s.id} className="text-center min-w-0">
                  <div
                    className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                      s.done ? 'bg-primary text-on-primary' : 'bg-outline-variant/15 text-gray-900-variant'
                    }`}
                  >
                    {s.done ? <span className="material-symbols-outlined text-[18px]">check</span> : i + 1}
                  </div>
                  <p className="mt-1.5 text-[10px] font-semibold text-gray-900 leading-tight px-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {(pendingVelocitySid || velShipmentId) && velStep !== 'done' && (
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50 p-4 md:p-5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-900/90 mb-1">Fulfillment in progress</p>
                <p className="text-sm font-bold text-blue-950">
                  Shipment ID{' '}
                  <span className="font-mono">{velShipmentId || pendingVelocitySid}</span>
                </p>
                <p className="text-xs text-blue-900/85 mt-1 leading-relaxed max-w-2xl">
                  Shipment order is already created on Velocity. Continue with courier assignment to generate the AWB and label.
                  Use <strong> Reinitiate Shipping </strong> if you need to restart this workflow while keeping historical Velocity records.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 shrink-0 w-full sm:w-auto">
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  onClick={trackVelocityShipment}
                  disabled={trackingVelocity || !order.tracking_number}
                  title={!order.tracking_number ? 'Available after courier assigns an AWB' : 'Pull latest tracking from Velocity'}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  {trackingVelocity ? 'Refreshing...' : 'Refresh tracking'}
                </Button>
                {canReinitiateShipping && (
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    onClick={reinitiateShipping}
                    disabled={reinitiatingShipping || trackingVelocity}
                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                  >
                  {reinitiatingShipping ? 'Reinitiating workflow...' : 'Reinitiate shipping'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Step 1 — Dimensions & warehouse (Velocity doc §4 iv) */}
          {(velStep !== 'done') && (
            <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 lg:p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">1</span>
                Package dimensions &amp; pickup warehouse
              </p>
              <div className="ml-0 sm:ml-8 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Length (cm)', value: velLength, setter: setVelLength },
                    { label: 'Breadth (cm)', value: velBreadth, setter: setVelBreadth },
                    { label: 'Height (cm)', value: velHeight, setter: setVelHeight },
                    { label: 'Weight (kg)', value: velWeight, setter: setVelWeight },
                  ].map(({ label, value, setter }) => (
                    <div key={label}>
                      <label className="block text-[10px] font-bold text-gray-900-variant uppercase tracking-wider mb-1.5">{label}</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        readOnly={!!pendingVelocitySid}
                        title={pendingVelocitySid ? 'Reinitiate shipping to change dimensions.' : ''}
                        className={`w-full px-3 py-2.5 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary ${pendingVelocitySid ? 'opacity-75 cursor-not-allowed' : ''}`}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-900-variant uppercase tracking-wider mb-1.5">Pickup location &amp; Velocity warehouse_id</label>
                  <select
                    value={pickupLocationId}
                    onChange={(e) => setPickupLocationId(e.target.value)}
                    disabled={!!pendingVelocitySid}
                    title={pendingVelocitySid ? 'Reinitiate shipping to change pickup.' : ''}
                    className={`w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary ${pendingVelocitySid ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    {pickupLocations.length === 0 && (
                      <option value="">No pickup locations — add one under seller settings</option>
                    )}
                    {pickupLocations.map((loc) => (
                      <option key={loc.id} value={loc.id} disabled={!loc.velocity_warehouse_id}>
                        {loc.warehouse_name} · PIN {loc.pincode}
                        {loc.velocity_warehouse_id ? ` · ${loc.velocity_warehouse_id}` : ' (not synced to Velocity)'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-900-variant mt-1.5">
                    Maps to Velocity fields <code className="text-[10px]">pickup_location</code> and <code className="text-[10px]">warehouse_id</code> after warehouse sync.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Serviceability (hidden while pending order exists — avoids duplicate SHI) */}
          {velStep === 'idle' && !pendingVelocitySid && (
            <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 lg:p-5 shadow-sm">
              <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">2</span>
                Check serviceability
              </p>
              <p className="text-xs text-gray-900-variant ml-0 sm:ml-8 mb-4">
                Uses pickup PIN → customer shipping PIN per Velocity <code className="text-[10px]">/serviceability</code> (payment mode from order).
              </p>
              <Button
                type="button"
                onClick={checkServiceability}
                disabled={!velocityPickupReady() || !velocityDimsValid()}
                variant="contained"
                color="primary"
                sx={{ ml: { xs: 0, sm: 4 }, width: { xs: '100%', sm: 'auto' } }}
              >
                Check serviceability
              </Button>
            </div>
          )}

          {velStep === 'checking' && (
            <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 lg:p-5 flex items-center gap-3 shadow-sm">
              <span className="material-symbols-outlined animate-spin text-gray-900 text-xl">progress_activity</span>
              <p className="text-sm text-gray-900-variant">Checking serviceability with Velocity Shipping...</p>
            </div>
          )}

          {velStep === 'error' && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <p className="text-sm font-bold text-red-800 flex items-center gap-2">
                <span className="material-symbols-outlined text-red-600">error</span>
                {velError}
              </p>
              <Button
                type="button"
                onClick={() => {
                  setVelStep('idle');
                  setVelError('');
                  setVelServiceability(null);
                  setVelShipmentId('');
                }}
                variant="text"
                color="error"
                size="small"
                sx={{ mt: 1 }}
              >
                Start over
              </Button>
            </div>
          )}

          {/* After serviceability: carrier + create order (no AWB) */}
          {(velStep === 'ready' || velStep === 'creating_order') && velServiceability && !pendingVelocitySid && (
            <>
              {velError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 font-semibold flex items-start gap-2">
                  <span className="material-symbols-outlined text-red-600 text-base shrink-0">warning</span>
                  {velError}
                </div>
              )}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3 shadow-sm">
                <span className="material-symbols-outlined text-emerald-600 text-xl shrink-0 mt-0.5">check_circle</span>
                <div className="flex-1 min-w-0 space-y-2">
                  <div>
                    <p className="text-sm font-bold text-emerald-800">Route is serviceable</p>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      From PIN <span className="font-mono font-bold">{velServiceability.pickup_pincode || '—'}</span>
                      {' '}→ customer <span className="font-mono font-bold">{velServiceability.customer_pincode}</span>
                      {' '}· Zone <span className="font-bold uppercase">{velServiceability.zone || '—'}</span>
                      {' '}· Payment <span className="font-bold uppercase">{velServiceability.payment_mode || '—'}</span>
                      {' '}· {velServiceability.carriers?.length || 0} couriers listed
                    </p>
                  </div>
                  {velServiceability.rates_shipment_details && (
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const r = velServiceability.rates_shipment_details;
                        const pills = [
                          r.zone != null && r.zone !== '' && { k: 'Zone', v: String(r.zone) },
                          r.applicable_weight != null && {
                            k: 'Billable',
                            v: `${Number(r.applicable_weight)} g`,
                          },
                          r.dead_weight != null && {
                            k: 'Dead wt',
                            v: `${Number(r.dead_weight)} g`,
                          },
                          r.volumetric_weight != null && {
                            k: 'Vol. wt',
                            v: `${Number(r.volumetric_weight)} g`,
                          },
                          r.payment_method && { k: 'Pay', v: String(r.payment_method).toUpperCase() },
                          r.journey_type && { k: 'Journey', v: String(r.journey_type) },
                        ].filter(Boolean);
                        return pills.map((p, i) => (
                          <span
                            key={`${p.k}-${i}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200/80 bg-white/70 px-2 py-1 text-[10px] text-emerald-900"
                          >
                            <span className="font-semibold text-emerald-800/90">{p.k}</span>
                            <span className="font-mono font-bold">{p.v}</span>
                          </span>
                        ));
                      })()}
                    </div>
                  )}
                  {velServiceability.rates_note && (
                    <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      {velServiceability.rates_note}
                    </p>
                  )}
                </div>
              </div>

              {sortedVelocityCarriers.length > 0 && (
                <div className="rounded-2xl border border-outline-variant/30 bg-white overflow-hidden shadow-sm">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <p className="text-[11px] font-bold text-gray-900 uppercase tracking-wider">
                      Available couriers &amp; quotes
                    </p>
                    <p className="text-[10px] text-gray-900-variant mt-1">
                      Carriers with pricing first, then lowest total forward charge. Rows without a quote usually mean Velocity did not return rates for that weight slab.
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant/20 bg-surface-container-low/90 text-[10px] uppercase tracking-wide text-gray-900-variant">
                          <th className="text-left py-2.5 px-3 font-semibold">Courier</th>
                          <th className="text-left py-2.5 px-2 font-semibold w-[100px]">Mode</th>
                          <th className="text-right py-2.5 px-2 font-semibold">Freight</th>
                          <th className="text-right py-2.5 px-2 font-semibold">COD</th>
                          <th className="text-right py-2.5 px-2 font-semibold">RTO</th>
                          <th className="text-right py-2.5 px-2 font-semibold">Total</th>
                          <th className="text-left py-2.5 px-2 font-semibold w-[110px]">Pickup</th>
                          <th className="text-left py-2.5 px-3 font-semibold w-[110px]">Delivery</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedVelocityCarriers.map((c) => {
                          const rq = c.rate_quote;
                          const ch = rq?.charges;
                          const hasQuote = !!(ch && typeof ch === 'object');
                          const eta = rq?.expected_delivery ? velocityEtaParts(rq.expected_delivery) : null;
                          if (!hasQuote) {
                            return (
                              <tr
                                key={c.carrier_id}
                                className="border-b border-outline-variant/10 bg-surface/40"
                              >
                                <td className="py-2.5 px-3 align-top">
                                  <div className="font-semibold text-gray-900">{c.carrier_name || 'Courier'}</div>
                                  <div className="text-[10px] font-mono text-gray-900-variant mt-0.5 tabular-nums">{c.carrier_id}</div>
                                </td>
                                <td
                                  colSpan={7}
                                  className="py-2.5 px-3 text-gray-900-variant italic"
                                >
                                  No rate quote returned for this carrier (often a weight-slab mismatch).
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr
                              key={c.carrier_id}
                              className="border-b border-outline-variant/10 hover:bg-primary/[0.04]"
                            >
                              <td className="py-2.5 px-3 align-top">
                                <div className="font-semibold text-gray-900 leading-snug">{c.carrier_name || 'Courier'}</div>
                                <div className="text-[10px] font-mono text-gray-900-variant mt-0.5 tabular-nums break-all">{c.carrier_id}</div>
                              </td>
                              <td className="py-2.5 px-2 align-top">
                                <div className="flex flex-wrap gap-1">
                                  {rq.service_level ? (
                                    <span className="rounded-md bg-outline-variant/15 px-1.5 py-0.5 text-[10px] font-medium capitalize text-gray-900">
                                      {rq.service_level}
                                    </span>
                                  ) : (
                                    <span className="text-gray-900-variant">—</span>
                                  )}
                                  {rq.is_fast ? (
                                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">Fast</span>
                                  ) : null}
                                  {rq.is_prime ? (
                                    <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">Prime</span>
                                  ) : null}
                                </div>
                                {Number(rq.platform_fee) > 0 ? (
                                  <div className="text-[10px] text-gray-900-variant mt-1 tabular-nums">
                                    Fee {fmtInr(rq.platform_fee)}
                                  </div>
                                ) : null}
                              </td>
                              <td className="py-2.5 px-2 text-right align-top tabular-nums font-medium text-gray-900">
                                {fmtInr(ch.forward_freight_charges)}
                              </td>
                              <td className="py-2.5 px-2 text-right align-top tabular-nums text-gray-900">
                                {fmtInr(ch.cod_charges)}
                              </td>
                              <td className="py-2.5 px-2 text-right align-top tabular-nums text-gray-900">
                                {fmtInr(ch.rto_charges)}
                              </td>
                              <td className="py-2.5 px-2 text-right align-top tabular-nums font-bold text-gray-900">
                                {fmtInr(ch.total_forward_charges)}
                              </td>
                              <td className="py-2.5 px-2 align-top text-gray-900 leading-snug">
                                <div>{eta?.primaryPickup ?? '—'}</div>
                                {eta?.subPickup ? (
                                  <div className="text-[10px] text-gray-900-variant mt-0.5 tabular-nums">{eta.subPickup}</div>
                                ) : null}
                              </td>
                              <td className="py-2.5 px-3 align-top text-gray-900 leading-snug">
                                <div>{eta?.primaryDelivery ?? '—'}</div>
                                {eta?.subDelivery ? (
                                  <div className="text-[10px] text-gray-900-variant mt-0.5 tabular-nums">{eta.subDelivery}</div>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 lg:p-5 space-y-3 shadow-sm">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">3</span>
                  Create shipment order <span className="text-xs font-normal text-gray-900-variant">(forward-order — no courier selection yet)</span>
                </p>
                <p className="text-xs text-gray-900-variant ml-0 sm:ml-8">
                  Couriers and rates above are <strong>informational</strong>. Velocity creates the shipment record here; you choose the courier in the next step when generating the AWB.
                </p>
                <Button
                  type="button"
                  onClick={createVelocityForwardOrder}
                  disabled={velStep === 'creating_order'}
                  variant="contained"
                  color="primary"
                  sx={{ ml: { xs: 0, sm: 4 }, width: '100%', maxWidth: 520 }}
                >
                  {velStep === 'creating_order' ? 'Creating shipment order...' : 'Create order on Velocity'}
                </Button>
              </div>
            </>
          )}

          {/* Step 4 — Assign courier / manifest (forward-order-shipment only) */}
          {velStep !== 'done' && (velStep === 'pending_assign' || velStep === 'assigning' || !!pendingVelocitySid) && (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 lg:p-5 space-y-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center shrink-0">4</span>
                Select courier and generate AWB
              </p>
              <p className="text-xs text-gray-900-variant ml-0 sm:ml-8 leading-relaxed">
                Velocity shipment id: <span className="font-mono font-bold text-gray-900">{velShipmentId || pendingVelocitySid}</span>
              </p>
              {velError && velStep === 'pending_assign' && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 ml-0 sm:ml-8">{velError}</p>
              )}
              <div className="ml-0 sm:ml-8 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-900-variant">Choose courier</p>
                  <p className="text-[10px] text-gray-900-variant">Tip: select Auto-assign for best-fit carrier by Velocity rules.</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVelCarrierId('')}
                    className={`w-full rounded-xl border p-3 text-left transition-all ${
                      !velCarrierId
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/25 shadow-sm'
                        : 'border-outline-variant/30 bg-white hover:border-primary/40 hover:bg-primary/[0.03]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-gray-900">Auto-assign (recommended)</p>
                        <p className="text-xs text-gray-900-variant mt-0.5">Velocity picks the most suitable carrier automatically.</p>
                      </div>
                      <span className={`material-symbols-outlined ${!velCarrierId ? 'text-primary' : 'text-gray-400'}`}>
                        {!velCarrierId ? 'radio_button_checked' : 'radio_button_unchecked'}
                      </span>
                    </div>
                  </button>
                  {sortedVelocityCarriers.map((c) => {
                    const rq = c.rate_quote;
                    const ch = rq?.charges;
                    const total = ch?.total_forward_charges;
                    const eta = rq?.expected_delivery ? velocityEtaParts(rq.expected_delivery) : null;
                    const selected = velCarrierId === c.carrier_id;
                    return (
                      <button
                        key={c.carrier_id}
                        type="button"
                        onClick={() => setVelCarrierId(c.carrier_id)}
                        className={`w-full rounded-xl border p-3 text-left transition-all ${
                          selected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/25 shadow-sm'
                            : 'border-outline-variant/30 bg-white hover:border-primary/40 hover:bg-primary/[0.03]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 leading-snug truncate">{c.carrier_name || 'Courier'}</p>
                            <p className="text-[10px] font-mono text-gray-900-variant mt-0.5 truncate" title={c.carrier_id}>
                              {c.carrier_id}
                            </p>
                          </div>
                          <span className={`material-symbols-outlined ${selected ? 'text-primary' : 'text-gray-400'}`}>
                            {selected ? 'radio_button_checked' : 'radio_button_unchecked'}
                          </span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          {rq?.service_level ? (
                            <span className="text-[10px] font-semibold capitalize px-2 py-0.5 rounded-md bg-outline-variant/15 text-gray-900">
                              {rq.service_level}
                            </span>
                          ) : null}
                          {rq?.is_fast ? <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">Fast</span> : null}
                          {rq?.is_prime ? <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 font-semibold">Prime</span> : null}
                          {total != null && total !== '' ? (
                            <span className="text-[11px] font-bold text-gray-900 tabular-nums">{fmtInr(total)} total</span>
                          ) : (
                            <span className="text-[10px] text-gray-900-variant italic">No quote</span>
                          )}
                        </div>
                        {(eta?.primaryPickup || eta?.primaryDelivery) && (
                          <p className="mt-2 text-[10px] text-gray-900-variant">
                            Pickup: <span className="font-semibold text-gray-800">{eta?.primaryPickup || '—'}</span>{' '}
                            · Delivery: <span className="font-semibold text-gray-800">{eta?.primaryDelivery || '—'}</span>
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Button
                type="button"
                onClick={assignVelocityCourier}
                disabled={velStep === 'assigning'}
                variant="contained"
                color="primary"
                sx={{ ml: { sm: 4 }, width: '100%', maxWidth: '42rem' }}
              >
                {velStep === 'assigning' ? 'Generating AWB...' : 'Generate AWB'}
              </Button>
            </div>
          )}

          {velocityDonePayload && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <p className="text-sm font-bold text-emerald-800 flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-emerald-600">check_circle</span>
                Shipping created successfully
              </p>
              <div className="space-y-1.5 text-xs text-emerald-800 ml-7">
                <p>AWB: <span className="font-mono font-bold">{velocityDonePayload.awb_code || '—'}</span></p>
                <p>Courier: <span className="font-bold">{velocityDonePayload.courier_name || '—'}</span></p>
                {velocityDoneCharges && (
                  <p>Shipping: <span className="font-bold">₹{velocityDoneCharges.shipping_charges}</span>
                    {Number(velocityDoneCharges.cod_charges) > 0 && (
                      <span>{' '}+ ₹{velocityDoneCharges.cod_charges} COD</span>
                    )}
                  </p>
                )}
              </div>
              {velocityDonePayload.label_url && (
                <a href={velocityDonePayload.label_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 ml-7 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">
                  <span className="material-symbols-outlined text-sm">download</span>
                  Download shipping label
                </a>
              )}
              <p className="text-[10px] text-emerald-900/85 mt-3 ml-7 max-w-xl leading-relaxed">
                Tracking data was fetched from Velocity. Configure Shipfast webhooks so delivery and transit updates sync automatically;
                customers see status on this order page in real time (subscription refresh).
              </p>
            </div>
          )}
        </div>
      )}
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
        <p className="text-gray-900-variant font-medium">{error}</p>
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
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-outline-variant/20">
          <div className="flex items-start gap-4">
            <button onClick={onBack}
              className="mt-1 p-2.5 rounded-2xl bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/30 group shadow-sm transition-colors">
              <span className="material-symbols-outlined text-gray-900 group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
            </button>
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-secondary uppercase mb-1">
                Order Management · Admin
              </p>
              <h1 className="font-brand text-2xl lg:text-3xl text-gray-900 tracking-tight">#{orderId.slice(0, 8)}</h1>
              {isPartialOrder && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">
                  ⚡ Partial fulfillment
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-gray-900-variant">Status</span>
              <Badge
                label={(order?.status || '').replace(/_/g, ' ')}
                colorClass={STATUS_COLORS[order?.status] || STATUS_COLORS.pending}
              />
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-gray-900-variant">Payment</span>
              <Badge
                label={(order?.payment_status || '').replace(/_/g, ' ')}
                colorClass={PAYMENT_COLORS[order?.payment_status] || PAYMENT_COLORS.pending}
              />
            </div>
            <button
              onClick={() => setShowLog((v) => !v)}
              className="px-4 py-2 rounded-xl border border-outline-variant text-xs font-bold text-gray-900-variant hover:bg-surface-container transition-colors">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
          <div className="lg:col-span-2 space-y-6">

            {/* Audit log */}
            {showLog && (
              <section className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm">
                <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-gray-900 mb-4 flex items-center gap-2">
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
            <section className="bg-white rounded-xl p-4 lg:p-4 border border-neutral-200 shadow-sm">
              <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-gray-900 mb-6 flex items-center gap-2">
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
                            <p className={`font-semibold text-sm truncate ${isRejected ? 'line-through text-red-700' : 'text-gray-900'}`}>{s.product_name || s.product_key}</p>
                            <p className="text-xs text-gray-900-variant">
                              {s.quantity * item.quantity} × {fmt(s.unit_price)}
                              {item.lot_name && <span className="ml-2 text-secondary font-bold uppercase text-[10px]">{item.lot_name}</span>}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`font-bold ${isRejected ? 'text-red-600 line-through' : 'text-gray-900'}`}>{fmt(s.unit_price * s.quantity * item.quantity)}</p>
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
                        <p className={`font-semibold text-sm truncate ${isRejected ? 'line-through text-red-700' : 'text-gray-900'}`}>{item.products?.name || item.lot_name || 'Product'}</p>
                        <p className="text-xs text-gray-900-variant">{item.quantity} × {fmt(item.price)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold ${isRejected ? 'text-red-600 line-through' : 'text-gray-900'}`}>{fmt(item.price * item.quantity)}</p>
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
                  <span className="text-sm font-bold uppercase tracking-wider text-gray-900">Total</span>
                  <span className="text-2xl font-brand text-gray-900">{fmt(order?.total_amount)}</span>
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

            <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-900-variant uppercase mb-4">Customer</h3>
              <p className="text-xl font-brand text-gray-900 leading-tight">{customerName}</p>
              <div className="mt-3 space-y-2">
                <p className="text-sm text-gray-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-secondary">mail</span>
                  {order?.profile?.email || '—'}
                </p>
                <p className="text-sm text-gray-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-secondary">call</span>
                  {order?.profile?.phone || '—'}
                </p>
              </div>
            </div>

            {order?.shipping_address && (
              <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm">
                <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-900-variant uppercase mb-4">Delivery Address</h3>
                <div className="text-sm text-gray-900-variant leading-relaxed space-y-0.5">
                  <p className="font-bold text-gray-900">{order.shipping_address.first_name} {order.shipping_address.last_name}</p>
                  <p>{order.shipping_address.address_line1}</p>
                  {order.shipping_address.address_line2 && <p>{order.shipping_address.address_line2}</p>}
                  <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</p>
                  {order.shipping_address.phone && <p className="mt-2 font-mono text-xs bg-surface-container px-2 py-1 rounded inline-block">{order.shipping_address.phone}</p>}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-900-variant uppercase mb-4">Payment</h3>
              <div className="bg-surface-container-low px-4 py-2 rounded-2xl border border-outline-variant/20">
                <Row label="Method" value={(order?.payment_method || '').toUpperCase()} />
                <Row label="Status" value={(order?.payment_status || '').replace(/_/g, ' ')} />
                {order?.razorpay_order_id && <Row label="RP Order" value={order.razorpay_order_id} mono />}
                {order?.razorpay_payment_id && <Row label="RP Payment" value={order.razorpay_payment_id} mono />}
                {order?.refund_amount > 0 && <Row label="Refunded" value={fmt(order.refund_amount)} />}
                {order?.refund_status && order.refund_status !== 'not_required' && <Row label="Refund Status" value={order.refund_status} />}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-gray-900-variant uppercase mb-4">Timeline</h3>
              <div className="relative pl-5 space-y-5 before:absolute before:inset-y-0 before:left-[9px] before:w-[2px] before:bg-outline-variant/30">
                <div className="relative">
                  <span className="w-5 h-5 rounded-full bg-primary absolute -left-5 top-0 -translate-x-1/2 block" />
                  <p className="text-[10px] font-bold uppercase text-gray-900">Placed</p>
                  <p className="text-xs text-gray-900-variant">{fmtDate(order?.created_at)}</p>
                </div>
                {order?.shipped_at && (
                  <div className="relative">
                    <span className="w-5 h-5 rounded-full bg-blue-500 absolute -left-5 top-0 -translate-x-1/2 block" />
                    <p className="text-[10px] font-bold uppercase text-blue-700">Shipped</p>
                    <p className="text-xs text-gray-900-variant">{fmtDate(order.shipped_at)}</p>
                  </div>
                )}
                {order?.processed_at && (
                  <div className="relative">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 absolute -left-5 top-0 -translate-x-1/2 block" />
                    <p className="text-[10px] font-bold uppercase text-emerald-700">Delivered</p>
                    <p className="text-xs text-gray-900-variant">{fmtDate(order.processed_at)}</p>
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
