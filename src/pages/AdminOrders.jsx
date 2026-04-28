// HATVONI ADMIN ORDERS - ORDER WORKFLOW SYSTEM

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import Button from '@mui/material/Button';
import VelocityLotWorkflow from '../components/admin/VelocityLotWorkflow';
import { getOrderDisplayId } from '../lib/orderDisplay';

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
  pending:         'bg-slate-100 text-slate-700 border border-slate-200',
  pending_review:  'bg-slate-100 text-slate-700 border border-slate-200',
  approved:        'bg-emerald-50 text-emerald-700 border border-emerald-200',
  rejected:        'bg-rose-50 text-rose-700 border border-rose-200',
};

const ADMIN_ORDER_SAVED_VIEWS_KEY = 'admin-orders-saved-views-v1';
const ORDER_QUEUE_IDS = ['sla_breach', 'payment_risk', 'awaiting_tracking', 'refund_pending', 'cancel_attention'];

function orderAgeHours(order) {
  const created = Date.parse(order?.created_at || '');
  if (!Number.isFinite(created)) return 0;
  return (Date.now() - created) / 3600000;
}

const LOT_PROCESSING_STATUSES = new Set([
  'pending',
  'processing',
  'ready_for_pickup',
  'pickup_scheduled',
  'not_picked',
  'picked',
  'picked_up',
  'manifested',
]);

const LOT_SHIPPING_STATUSES = new Set([
  'in_transit',
  'out_for_delivery',
  'reattempt_delivery',
  'need_attention',
  'ndr_raised',
  'rto_initiated',
  'rto_in_transit',
]);

function getLotSlaState(lot) {
  const now = Date.now();
  const createdAtMs = Date.parse(String(lot?.created_at || ''));
  const updatedAtMs = Date.parse(String(lot?.updated_at || ''));
  const lastEventMs = Date.parse(String(lot?.last_event_at || ''));
  const status = String(lot?.carrier_shipment_status || '').trim().toLowerCase();
  const hasTracking = String(lot?.tracking_number || '').trim() !== '';
  const hasPendingShipment = String(lot?.velocity_pending_shipment_id || '').trim() !== '';
  const isDelivered = status.includes('delivered') && !status.includes('rto');
  const baselineMs = Number.isFinite(createdAtMs) ? createdAtMs : now;
  const stageUpdatedMs = Number.isFinite(updatedAtMs) ? updatedAtMs : baselineMs;
  const latestUpdateMs = Math.max(
    baselineMs,
    Number.isFinite(stageUpdatedMs) ? stageUpdatedMs : baselineMs,
    Number.isFinite(lastEventMs) ? lastEventMs : baselineMs,
  );

  if (!hasPendingShipment && !hasTracking && !status) {
    const ageHours = (now - baselineMs) / 3600000;
    return { stage: 'placed_to_processing', breached: ageHours >= 24, ageHours, thresholdHours: 24 };
  }

  if (!hasTracking && (hasPendingShipment || LOT_PROCESSING_STATUSES.has(status))) {
    const ageHours = (now - stageUpdatedMs) / 3600000;
    return { stage: 'processing_to_shipping', breached: ageHours >= 36, ageHours, thresholdHours: 36 };
  }

  if (!isDelivered && (hasTracking || LOT_SHIPPING_STATUSES.has(status))) {
    const ageHours = (now - latestUpdateMs) / 3600000;
    return { stage: 'shipping_to_delivery_or_update', breached: ageHours >= (7 * 24), ageHours, thresholdHours: (7 * 24) };
  }

  return { stage: 'healthy', breached: false, ageHours: 0, thresholdHours: 0 };
}

function isSlaBreach(order) {
  const lots = Array.isArray(order?.shipmentLots) ? order.shipmentLots : [];
  if (lots.length === 0) return false;
  return lots.some((lot) => getLotSlaState(lot).breached);
}

function getSlaStageLabel(stage) {
  if (stage === 'placed_to_processing') return 'Placed -> Processing';
  if (stage === 'processing_to_shipping') return 'Processing -> Shipping';
  if (stage === 'shipping_to_delivery_or_update') return 'Shipping -> Delivery/Update';
  return 'Healthy';
}

function getOrderSlaSummary(order) {
  const lots = Array.isArray(order?.shipmentLots) ? order.shipmentLots : [];
  if (!lots.length) return null;
  const states = lots.map((lot) => ({ lot, sla: getLotSlaState(lot) }));
  const sorted = states
    .slice()
    .sort((a, b) => (b.sla.ageHours - b.sla.thresholdHours) - (a.sla.ageHours - a.sla.thresholdHours));
  const top = sorted[0];
  if (!top || !top.thresholdHours) return null;
  const progressPct = Math.max(0, Math.min(100, Math.round((top.sla.ageHours / top.sla.thresholdHours) * 100)));
  const lotLabel = String(top.lot?.label || '').trim() || `Lot ${String(top.lot?.id || '').slice(0, 8)}`;
  return {
    stage: top.sla.stage,
    stageLabel: getSlaStageLabel(top.sla.stage),
    breached: !!top.sla.breached,
    ageHours: top.sla.ageHours,
    thresholdHours: top.sla.thresholdHours,
    progressPct,
    lotId: top.lot?.id || '',
    lotLabel,
  };
}

function isPaymentRisk(order) {
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  const paymentMethod = String(order?.payment_method || '').toLowerCase();
  return ['failed', 'initiated'].includes(paymentStatus) || (paymentMethod.includes('razorpay') && paymentStatus !== 'paid');
}

function isAwaitingTracking(order) {
  const status = String(order?.status || '').toLowerCase();
  return ['processing', 'shipped'].includes(status) && !String(order?.tracking_number || '').trim();
}

function isRefundPending(order) {
  const refundStatus = String(order?.refund_status || '').toLowerCase();
  return refundStatus === 'pending' || refundStatus === 'initiated';
}

function isCancelAttention(order) {
  const status = String(order?.status || '').toLowerCase();
  return status === 'cancelled' && !String(order?.cancellation_reason || '').trim();
}

function inQueue(order, queueId) {
  if (!queueId || queueId === 'all') return true;
  if (queueId === 'sla_breach') return isSlaBreach(order);
  if (queueId === 'payment_risk') return isPaymentRisk(order);
  if (queueId === 'awaiting_tracking') return isAwaitingTracking(order);
  if (queueId === 'refund_pending') return isRefundPending(order);
  if (queueId === 'cancel_attention') return isCancelAttention(order);
  return true;
}

/** Avoids PostgREST passing non-uuid strings (e.g. literal "null") into uuid filters — fixes 22P02. */
function isUuidLike(v) {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Links `seller_pickup_locations` to `warehouses` when Velocity id lives on the pickup row
 * but the warehouse row only has a human label (or vice versa).
 */
function pickupMatchesWarehouseRow(pickup, warehouseRow) {
  if (!pickup || !warehouseRow) return false;
  const pv = String(pickup.velocity_warehouse_id || '').trim();
  const wv = String(warehouseRow.velocity_warehouse_id || '').trim();
  if (pv && wv && pv.toLowerCase() === wv.toLowerCase()) return true;
  const wName = String(warehouseRow.warehouse_name || warehouseRow.name || '').trim();
  const pLocName = String(pickup.warehouse_name || '').trim();
  if (wName && pLocName && wName.toLowerCase() === pLocName.toLowerCase()) return true;
  if (pv && wName && pv.toLowerCase() === wName.toLowerCase()) return true;
  return false;
}

function Badge({ label, colorClass }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold ${colorClass}`}>
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
  const [queueFilter, setQueueFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [savedViews, setSavedViews] = useState([]);
  const [savedViewName, setSavedViewName] = useState('');
  const [activeSavedView, setActiveSavedView] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const clearMessages = () => {
    setNotice('');
    setError('');
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_ORDER_SAVED_VIEWS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setSavedViews(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_ORDER_SAVED_VIEWS_KEY, JSON.stringify(savedViews));
    } catch {
      // non-blocking: browser storage can fail in private contexts
    }
  }, [savedViews]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, display_order_id, status, order_status, payment_status, payment_method, total_amount, created_at, shipping_address, user_id, tracking_number, shipment_status, cancellation_reason, refund_status, refund_amount')
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

      let lotsByOrder = {};
      try {
        const orderIds = (data || []).map((o) => o.id);
        if (orderIds.length > 0) {
          const { data: lots } = await supabase
            .from('order_shipments')
            .select('id, order_id, label, carrier_shipment_status, tracking_number, velocity_pending_shipment_id, created_at, updated_at')
            .in('order_id', orderIds);
          const lotRows = Array.isArray(lots) ? lots : [];
          const lotIds = lotRows.map((l) => l.id);
          let latestEventByLot = {};
          if (lotIds.length > 0) {
            const { data: events } = await supabase
              .from('order_shipment_tracking_events')
              .select('order_shipment_id, event_time, created_at')
              .in('order_shipment_id', lotIds)
              .order('created_at', { ascending: false })
              .limit(5000);
            latestEventByLot = (events || []).reduce((acc, ev) => {
              const lotId = ev.order_shipment_id;
              const eventMs = Date.parse(String(ev.event_time || ev.created_at || ''));
              const prevMs = Date.parse(String(acc[lotId] || ''));
              if (!acc[lotId] || (Number.isFinite(eventMs) && (!Number.isFinite(prevMs) || eventMs > prevMs))) {
                acc[lotId] = ev.event_time || ev.created_at || null;
              }
              return acc;
            }, {});
          }
          lotsByOrder = lotRows.reduce((acc, lot) => {
            if (!acc[lot.order_id]) acc[lot.order_id] = [];
            acc[lot.order_id].push({ ...lot, last_event_at: latestEventByLot[lot.id] || null });
            return acc;
          }, {});
        }
      } catch {
        lotsByOrder = {};
      }

      const mergedOrders = (data || []).map((o) => {
        return {
          ...o,
          profile: profilesById[o.user_id] || null,
          shipmentLots: lotsByOrder[o.id] || [],
        };
      });
      setOrders(mergedOrders);
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
    const fromMs = dateFrom ? Date.parse(`${dateFrom}T00:00:00`) : Number.NaN;
    const toMs = dateTo ? Date.parse(`${dateTo}T23:59:59`) : Number.NaN;
    const min = minAmount === '' ? Number.NaN : Number(minAmount);
    const max = maxAmount === '' ? Number.NaN : Number(maxAmount);
    const now = Date.now();
    return orders.filter((o) => {
      const name = `${o.profile?.first_name || ''} ${o.profile?.last_name || ''}`.trim();
      const created = Date.parse(o.created_at || '');
      const amount = Number(o.total_amount || 0);
      const ageHours = Number.isFinite(created) ? (now - created) / 3600000 : 0;
      const isSlaRisk = ['pending', 'processing'].includes(String(o.status || '').toLowerCase()) && ageHours >= 24;
      const matchSearch = !q
        || o.id.toLowerCase().includes(q)
        || name.toLowerCase().includes(q)
        || (o.profile?.email || '').toLowerCase().includes(q)
        || (o.tracking_number || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchPayment = paymentFilter === 'all' || o.payment_status === paymentFilter;
      const matchQueue = inQueue(o, queueFilter);
      const matchFrom = !Number.isFinite(fromMs) || (Number.isFinite(created) && created >= fromMs);
      const matchTo = !Number.isFinite(toMs) || (Number.isFinite(created) && created <= toMs);
      const matchMin = !Number.isFinite(min) || amount >= min;
      const matchMax = !Number.isFinite(max) || amount <= max;
      const matchRisk = riskFilter === 'all' || (riskFilter === 'sla_risk' ? isSlaRisk : !isSlaRisk);
      return matchSearch && matchStatus && matchPayment && matchQueue && matchFrom && matchTo && matchMin && matchMax && matchRisk;
    });
  }, [orders, search, statusFilter, paymentFilter, queueFilter, dateFrom, dateTo, minAmount, maxAmount, riskFilter]);

  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    processing: orders.filter((o) => o.status === 'processing').length,
    shipped: orders.filter((o) => o.status === 'shipped').length,
    revenue: orders.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + Number(o.total_amount || 0), 0),
  }), [orders]);

  const queueStats = useMemo(() => ([
    { id: 'sla_breach', label: 'SLA Breach', count: orders.filter((o) => isSlaBreach(o)).length, color: 'border-red-200 bg-red-50 text-red-700' },
    { id: 'payment_risk', label: 'Payment Risk', count: orders.filter((o) => isPaymentRisk(o)).length, color: 'border-amber-200 bg-amber-50 text-amber-700' },
    { id: 'awaiting_tracking', label: 'Awaiting Tracking', count: orders.filter((o) => isAwaitingTracking(o)).length, color: 'border-blue-200 bg-blue-50 text-blue-700' },
    { id: 'refund_pending', label: 'Refund Pending', count: orders.filter((o) => isRefundPending(o)).length, color: 'border-purple-200 bg-purple-50 text-purple-700' },
    { id: 'cancel_attention', label: 'Cancel Attention', count: orders.filter((o) => isCancelAttention(o)).length, color: 'border-orange-200 bg-orange-50 text-orange-700' },
  ]), [orders]);

  const slaRiskCount = useMemo(
    () => filtered.filter((o) => isSlaBreach(o)).length,
    [filtered],
  );

  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0;
    if (dateFrom) count += 1;
    if (dateTo) count += 1;
    if (minAmount !== '') count += 1;
    if (maxAmount !== '') count += 1;
    if (riskFilter !== 'all') count += 1;
    return count;
  }, [dateFrom, dateTo, minAmount, maxAmount, riskFilter]);

  const applySavedView = (viewId) => {
    const view = savedViews.find((v) => v.id === viewId);
    if (!view) return;
    clearMessages();
    setActiveSavedView(view.id);
    setSearch(view.filters.search || '');
    setStatusFilter(view.filters.statusFilter || 'all');
    setPaymentFilter(view.filters.paymentFilter || 'all');
    setQueueFilter(ORDER_QUEUE_IDS.includes(view.filters.queueFilter) ? view.filters.queueFilter : '');
    setDateFrom(view.filters.dateFrom || '');
    setDateTo(view.filters.dateTo || '');
    setMinAmount(view.filters.minAmount || '');
    setMaxAmount(view.filters.maxAmount || '');
    setRiskFilter(view.filters.riskFilter || 'all');
  };

  const saveCurrentView = () => {
    clearMessages();
    const name = savedViewName.trim();
    if (!name) {
      setError('Enter a name before saving the view.');
      return;
    }
    const next = {
      id: `${Date.now()}`,
      name,
      filters: {
        search,
        statusFilter,
        paymentFilter,
        queueFilter,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
        riskFilter,
      },
    };
    setSavedViews((prev) => [next, ...prev].slice(0, 12));
    setSavedViewName('');
    setNotice(`Saved view "${name}".`);
  };

  const deleteSavedView = () => {
    clearMessages();
    if (!activeSavedView) return;
    setSavedViews((prev) => prev.filter((v) => v.id !== activeSavedView));
    setActiveSavedView('');
    setNotice('Saved view removed.');
  };

  const resetFilters = () => {
    clearMessages();
    setSearch('');
    setStatusFilter('all');
    setPaymentFilter('all');
    setQueueFilter('');
    setDateFrom('');
    setDateTo('');
    setMinAmount('');
    setMaxAmount('');
    setRiskFilter('all');
    setActiveSavedView('');
  };

  return (
    <div className="min-h-screen bg-surface pt-32 md:pt-40 pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        <header className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-gray-900-variant hover:text-gray-900 transition-colors">
                <span className="material-symbols-outlined text-lg">arrow_back</span>
              </Link>
              <h1 className="font-brand text-2xl md:text-3xl text-gray-900 tracking-tight">Orders</h1>
            </div>
            <p className="text-xs text-gray-900-variant ml-7">Minimal order operations console</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-outline-variant text-xs font-semibold text-gray-900 hover:bg-primary/5 transition-colors">
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 mb-3">
          {[
            { label: 'Total', value: stats.total, color: 'bg-primary' },
            { label: 'Pending', value: stats.pending, color: 'bg-slate-500' },
            { label: 'Processing', value: stats.processing, color: 'bg-amber-500' },
            { label: 'Shipped', value: stats.shipped, color: 'bg-blue-500' },
            { label: 'Revenue', value: fmt(stats.revenue), color: 'bg-emerald-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-lg border border-outline-variant/30 px-3 py-2.5 flex items-center gap-2.5">
              <div className={`${s.color} w-7 h-7 rounded-lg flex items-center justify-center shrink-0`}>
                <span className="material-symbols-outlined text-white text-[12px]">package_2</span>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 leading-none">{s.value}</p>
                <p className="text-[10px] text-gray-900-variant mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2 mb-3">
          {queueStats.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setQueueFilter(q.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${q.color} ${queueFilter === q.id ? 'ring-1 ring-secondary/40' : ''}`}
            >
              <p className="text-[10px] uppercase tracking-wider font-semibold">{q.label}</p>
              <p className="text-sm font-bold mt-0.5">{q.count}</p>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-outline-variant/25 bg-white p-3 mb-3">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-900-variant text-base">search</span>
              <input
                type="text"
                placeholder="Search by order ID, customer, email, tracking..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2.5 border border-outline-variant/40 rounded-md bg-surface w-full text-sm focus:ring-2 focus:ring-secondary/20 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-2 lg:w-[280px]">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-md border border-outline-variant/40 bg-white text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                Filters
                {activeAdvancedFilterCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary text-on-primary text-[10px] font-bold">
                    {activeAdvancedFilterCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={resetFilters}
                className="px-3 py-2.5 rounded-md border border-outline-variant/40 bg-white text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {notice && <p className="text-xs text-emerald-700 font-medium mt-2">{notice}</p>}
          {error && <p className="text-xs text-red-700 font-medium mt-2">{error}</p>}
        </div>

        {showAdvancedFilters && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Advanced Filters">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setShowAdvancedFilters(false)} />
            <div className="relative w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Advanced Filter Panel</p>
                  <h3 className="text-lg font-bold text-slate-900">Refine admin order list</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(false)}
                  className="w-8 h-8 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2.5 border border-outline-variant rounded-md bg-surface text-sm"
                    >
                      <option value="all">All Status</option>
                      {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Payment</label>
                    <select
                      value={paymentFilter}
                      onChange={(e) => setPaymentFilter(e.target.value)}
                      className="w-full px-3 py-2.5 border border-outline-variant rounded-md bg-surface text-sm"
                    >
                      <option value="all">All Payments</option>
                      {['pending', 'initiated', 'paid', 'failed', 'refunded', 'partially_refunded'].map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Queue</label>
                    <select
                      value={queueFilter}
                      onChange={(e) => setQueueFilter(e.target.value)}
                      className="w-full px-3 py-2.5 border border-outline-variant rounded-md bg-surface text-sm"
                    >
                      {queueStats.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Date from</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2.5 border border-outline-variant rounded-md bg-surface text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Date to</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2.5 border border-outline-variant rounded-md bg-surface text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Minimum amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Min amount"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      className="w-full px-3 py-2.5 border border-outline-variant rounded-md bg-surface text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Maximum amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Max amount"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      className="w-full px-3 py-2.5 border border-outline-variant rounded-md bg-surface text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">SLA risk filter</label>
                  <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                    className="w-full px-3 py-2.5 border border-outline-variant rounded-md bg-surface text-sm"
                  >
                    <option value="all">All SLA</option>
                    <option value="sla_risk">SLA risk only</option>
                    <option value="healthy">Healthy only</option>
                  </select>
                </div>

                <div className="border-t border-outline-variant/20 pt-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Saved Views</p>
                  <div className="flex flex-col md:flex-row gap-2">
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={savedViewName}
                        onChange={(e) => setSavedViewName(e.target.value)}
                        placeholder="Save current filters as view"
                        className="flex-1 px-3 py-2 border border-outline-variant rounded-md bg-surface text-xs"
                      />
                      <button
                        type="button"
                        onClick={saveCurrentView}
                        className="px-3 py-2 rounded-md bg-primary text-on-primary text-xs font-semibold"
                      >
                        Save
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <select
                        value={activeSavedView}
                        onChange={(e) => {
                          const id = e.target.value;
                          setActiveSavedView(id);
                          if (id) applySavedView(id);
                        }}
                        className="px-3 py-2 border border-outline-variant rounded-md bg-surface text-xs min-w-[170px]"
                      >
                        <option value="">Apply saved view</option>
                        {savedViews.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={deleteSavedView}
                        disabled={!activeSavedView}
                        className="px-3 py-2 rounded-md border border-outline-variant bg-white text-xs font-semibold disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-4 py-2 rounded-md border border-outline-variant bg-white text-sm font-semibold hover:bg-slate-50"
                >
                  Reset filters
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(false)}
                  className="px-4 py-2 rounded-md bg-primary text-on-primary text-sm font-semibold"
                >
                  Apply filters
                </button>
              </div>
            </div>
          </div>
        )}

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
          <div className="bg-white border border-outline-variant/20 rounded-lg overflow-hidden shadow-none">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-outline-variant/20 bg-surface-container-low/40">
                    {['Order', 'Customer', 'Amount', 'Status', 'Payment', 'Date', ''].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-900-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {filtered.map((order) => {
                    const name = `${order.profile?.first_name || ''} ${order.profile?.last_name || ''}`.trim() || '—';
                    const isSlaRisk = isSlaBreach(order);
                    const slaSummary = getOrderSlaSummary(order);
                    return (
                      <tr key={order.id} className="hover:bg-surface-container-low/40 transition-colors cursor-pointer" onClick={() => onSelect(order.id)}>
                        <td className="px-3 py-2.5 align-top">
                          <p className="font-mono text-[11px] text-gray-900 font-semibold">{getOrderDisplayId(order)}</p>
                          {order.tracking_number && (
                            <p className="text-[10px] text-gray-900-variant mt-0.5">{order.tracking_number}</p>
                          )}
                          {isSlaRisk && (
                            <p className="text-[10px] text-red-700 mt-0.5 font-semibold">Lot SLA breached</p>
                          )}
                          {slaSummary && (
                            <div className="mt-1">
                              <div className="flex items-center justify-between gap-2">
                                <p
                                  className={`text-[10px] font-semibold ${slaSummary.breached ? 'text-red-700' : 'text-emerald-700'}`}
                                  title={slaSummary.lotId ? `Source: ${slaSummary.lotLabel} (${slaSummary.lotId})` : `Source: ${slaSummary.lotLabel}`}
                                >
                                  {slaSummary.stageLabel}
                                </p>
                                <p className="text-[10px] text-gray-900-variant">
                                  {Math.floor(slaSummary.ageHours)}h / {slaSummary.thresholdHours}h
                                </p>
                              </div>
                              <p
                                className="text-[10px] text-gray-900-variant mt-0.5 truncate"
                                title={slaSummary.lotId ? `${slaSummary.lotLabel} (${slaSummary.lotId})` : slaSummary.lotLabel}
                              >
                                {slaSummary.lotLabel}
                              </p>
                              <div className="h-1 w-full rounded-full bg-slate-200 mt-1 overflow-hidden">
                                <div
                                  className={`h-full ${slaSummary.breached ? 'bg-red-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${slaSummary.progressPct}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-top">
                          <p className="text-[13px] font-medium text-gray-900">{name}</p>
                          <p className="text-[11px] text-gray-900-variant">{order.profile?.email || '—'}</p>
                        </td>
                        <td className="px-3 py-2.5 text-[13px] font-semibold text-gray-900 whitespace-nowrap">{fmt(order.total_amount)}</td>
                        <td className="px-3 py-2.5">
                          <Badge label={order.status?.replace(/_/g, ' ')} colorClass={STATUS_COLORS[order.status] || STATUS_COLORS.pending} />
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge label={order.payment_status?.replace(/_/g, ' ')} colorClass={PAYMENT_COLORS[order.payment_status] || PAYMENT_COLORS.pending} />
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-gray-900-variant whitespace-nowrap">{fmtDate(order.created_at)}</td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelect(order.id); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary/90 transition-colors"
                          >
                            Manage
                            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
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
    <section className="bg-white rounded-lg p-4 border border-neutral-200">
      <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-gray-900 mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined">fact_check</span> Item-Level Approval
      </h2>
      <p className="text-xs text-gray-900-variant mb-4">
        All items must be approved or rejected before the order can be finalized.
        Admin can approve/reject own-seller items directly, decide on behalf of third-party sellers (with a mandatory reason), and override any existing seller decision.
      </p>

      <div className="space-y-2.5">
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
            if (isOverridden && sd.decision !== 'pending') {
              // Admin overrode a seller decision, or acted on behalf of a pending seller
              const wasOriginallyPending = !sd.original_decision || sd.original_decision === 'pending';
              decisionSource = wasOriginallyPending ? 'admin_on_behalf' : 'admin_override';
            } else {
              decisionSource = 'seller';
            }
          }

          const statusLabel = {
            pending: 'Pending',
            pending_review: 'Pending Review',
            approved: 'Approved',
            rejected: 'Rejected',
          }[effectiveStatus] || effectiveStatus;

          const statusColor = ITEM_DECISION_COLORS[effectiveStatus] || ITEM_DECISION_COLORS.pending;
          const sourceMeta = decisionSource === 'admin_override'
            ? { label: 'Admin override', className: 'bg-amber-50 text-amber-700 border border-amber-200' }
            : decisionSource === 'admin_on_behalf'
              ? { label: 'Admin (on behalf)', className: 'bg-blue-50 text-blue-700 border border-blue-200' }
              : decisionSource === 'admin'
                ? { label: 'Admin decision', className: 'bg-blue-50 text-blue-700 border border-blue-200' }
                : decisionSource
                  ? { label: 'Seller decision', className: 'bg-violet-50 text-violet-700 border border-violet-200' }
                  : null;

          return (
            <div key={`${line.order_item_id}-${line.product_key}`}
              className="rounded-lg border border-outline-variant/20 p-3 bg-surface">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Product info */}
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  {line.image_url ? (
                    <img src={line.image_url} alt={line.name}
                      className="w-12 h-12 rounded-lg object-cover border border-outline-variant/20 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0 border border-outline-variant/20">
                      <span className="material-symbols-outlined text-outline text-sm">local_mall</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{line.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {line.product_key && (
                        <span className="text-[10px] font-mono text-gray-900-variant bg-surface-container px-1.5 py-0.5 rounded-md">
                          {line.product_key}
                        </span>
                      )}
                      {line.lot_name && (
                        <span className="text-[10px] text-secondary font-bold uppercase tracking-wider">{line.lot_name}</span>
                      )}
                      {/* Show item type: 3rd-party seller vs own-seller */}
                      {isAdminItem ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                          {aa?.sync_with_insider ? '🔄 Insider sync' : '🏠 Own seller'}
                        </span>
                      ) : isSellerItem ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                          🏪 3rd-party seller
                        </span>
                      ) : null}
                      <span className="text-[10px] text-gray-900-variant">
                        {line.qty} × {fmt(line.unit_price)} = {fmt(line.line_total)}
                      </span>
                    </div>
                    {/* Show inventory snapshot if available (sync_with_insider items) */}
                    {aa?.inventory_snapshot && (
                      <div className="mt-1.5 text-[10px] bg-blue-50 border border-blue-200 rounded-md px-2 py-1 text-blue-800">
                        Insider stock: {aa.inventory_snapshot.qty_available ?? '—'} {aa.inventory_snapshot.unit || 'units'} available
                      </div>
                    )}
                  </div>
                </div>

                {/* Decision status */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className="text-right">
                    <Badge label={statusLabel} colorClass={statusColor} />
                    {sourceMeta && (
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 mt-1 text-[10px] font-medium ${sourceMeta.className}`}>
                        {sourceMeta.label}
                      </span>
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
                          className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openAdminDecide(line, 'rejected')}
                          className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {/* Admin items: already decided — allow re-decision */}
                    {isAdminItem && aa.status !== 'pending_review' && (
                      <button
                        onClick={() => openAdminDecide(line, aa.status === 'approved' ? 'rejected' : 'approved')}
                        className="px-3 py-1.5 rounded-md border border-outline-variant text-gray-900-variant text-xs font-semibold hover:bg-surface-container transition-colors"
                      >
                        Change
                      </button>
                    )}

                    {/* Seller items: admin can act on behalf (pending) or override (already decided) */}
                    {!isAdminItem && line.seller_id && (
                      <button
                        onClick={() => {
                          setOverrideTarget({
                            order_item_id: line.order_item_id,
                            product_key: line.product_key,
                            seller_id: sd?.seller_id || line.seller_id,
                            current_decision: sd?.decision || 'pending',
                          });
                          // Default to opposite of current, or 'approved' if pending
                          const defaultDecision = sd?.decision === 'approved' ? 'rejected' : 'approved';
                          setOverrideDecision(defaultDecision);
                          setOverrideReason('');
                          setOverrideError('');
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                          !sd || sd.decision === 'pending'
                            ? 'border border-blue-400 bg-blue-50 text-blue-800 hover:bg-blue-100'
                            : 'border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        {!sd || sd.decision === 'pending' ? 'Decide' : 'Override'}
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
          <div className="bg-white rounded-lg max-w-sm w-full p-5 shadow-sm border border-neutral-200">

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

      {/* Admin Act on Behalf / Override Modal */}
      {overrideTarget && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-neutral-200">
            <div className="flex items-center gap-2 mb-2">
              <span className={`material-symbols-outlined text-xl ${overrideTarget.current_decision === 'pending' ? 'text-blue-500' : 'text-amber-500'}`}>
                {overrideTarget.current_decision === 'pending' ? 'admin_panel_settings' : 'warning'}
              </span>
              <h3 className="font-bold text-lg text-gray-900">
                {overrideTarget.current_decision === 'pending' ? 'Decide on Behalf of Seller' : 'Override Seller Decision'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-1">
              {overrideTarget.current_decision === 'pending'
                ? 'Seller has not yet decided. You are acting on their behalf.'
                : <>Current decision: <strong className="text-gray-900 uppercase">{overrideTarget.current_decision}</strong></>
              }
            </p>
            <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded p-2 mb-4">
              This action is logged in the audit trail with your admin ID, timestamp, and reason.
            </p>
            
            <div className="mb-4">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Decision</label>
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
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={overrideDecision === 'rejected'
                  ? 'Why is this item rejected? (required)'
                  : 'Why are you approving on behalf of the seller? (required)'}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-1 focus:ring-gray-900 focus:border-gray-900 outline-none resize-none"
              />
              <p className="text-[10px] text-gray-400 mt-1">Required — stored in audit log and visible to the seller.</p>
            </div>
            
            {overrideError && (
              <p className="text-red-600 text-xs mb-3">{overrideError}</p>
            )}
            
            <div className="flex gap-2">
              <button onClick={() => { setOverrideTarget(null); setOverrideError(''); }}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleOverride}
                disabled={overriding || !overrideReason.trim()}
                className={`flex-1 py-2.5 rounded-lg text-white text-xs font-bold disabled:opacity-60 transition-all shadow-sm ${
                  overrideDecision === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {overriding ? 'Saving...' : `Confirm ${overrideDecision === 'approved' ? 'Approval' : 'Rejection'}`}
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
    <section className="bg-white rounded-lg p-4 lg:p-5 border border-outline-variant/25">

      <h2 className="text-sm uppercase tracking-[0.15em] font-bold text-gray-900 mb-1 flex items-center gap-2">
        <span className="material-symbols-outlined">rule</span> Order Decision
      </h2>
      <p className="text-xs text-gray-900-variant mb-4">
        Once all items are reviewed, choose how to proceed with this order.
      </p>

      {/* ── Readiness status bar ── */}
      {isPending && (
        <div className={`rounded-lg p-3 mb-4 border ${allDecided ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-base ${allDecided ? 'text-emerald-600' : 'text-amber-600'}`}>
                {allDecided ? 'check_circle' : 'pending'}
              </span>
              <p className={`text-sm font-semibold ${allDecided ? 'text-emerald-800' : 'text-amber-800'}`}>
                {allDecided
                  ? 'All items reviewed — choose an action below'
                  : `${totalPending} item${totalPending !== 1 ? 's' : ''} still pending review`}
              </p>
            </div>
            {/* Compact pill summary */}
            <div className="flex items-center gap-2 flex-wrap">
              {totalApproved > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800">
                  ✓ {totalApproved} approved
                </span>
              )}
              {totalRejected > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-800">
                  ✕ {totalRejected} rejected
                </span>
              )}
              {totalPending > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-800">
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
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-sm border border-outline-variant/20">

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
            <div className={`rounded-lg p-3 mb-4 text-sm ${
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

/** Inline warehouse pills — shows first warehouse, +N more expands on click */
function WarehousePills({ warehouses }) {
  const [expanded, setExpanded] = useState(false);
  if (!warehouses || warehouses.length === 0) {
    return <span className="text-[10px] text-gray-900-variant/50 italic">No warehouse</span>;
  }
  const first = warehouses[0];
  const rest = warehouses.slice(1);
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-container border border-outline-variant/30 text-[10px] font-semibold text-gray-900">
        <span className="material-symbols-outlined text-[11px] text-secondary">warehouse</span>
        {first.name}
        {first.pincode && <span className="text-gray-900-variant font-normal">· {first.pincode}</span>}
        {first.isDefault && <span className="text-[9px] text-secondary font-bold ml-0.5">★</span>}
      </span>
      {rest.length > 0 && !expanded && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-secondary/10 border border-secondary/20 text-[10px] font-bold text-secondary hover:bg-secondary/20 transition-colors"
        >
          +{rest.length} more
        </button>
      )}
      {expanded && rest.map((wh) => (
        <span key={wh.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-container border border-outline-variant/30 text-[10px] font-semibold text-gray-900">
          <span className="material-symbols-outlined text-[11px] text-secondary">warehouse</span>
          {wh.name}
          {wh.pincode && <span className="text-gray-900-variant font-normal">· {wh.pincode}</span>}
          {wh.isDefault && <span className="text-[9px] text-secondary font-bold ml-0.5">★</span>}
        </span>
      ))}
      {expanded && rest.length > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          className="text-[10px] text-gray-900-variant hover:text-gray-900 font-semibold"
        >
          less
        </button>
      )}
    </span>
  );
}

/** One physical lot: manual tracking or Velocity flow (multi-shipment orders). */
function ShipmentLotFulfillmentCard({ lot, orderId, allPickupLocations, onRefresh, onNotice, onError }) {
  const shouldLotStartExpanded = useMemo(() => {
    const status = String(lot?.carrier_shipment_status || '').trim().toLowerCase();
    const tracking = String(lot?.tracking_number || lot?.velocity_awb || '').trim();
    const terminalStates = ['delivered', 'cancel', 'rto_delivered', 'returned', 'lost'];
    const isTerminal = terminalStates.some((token) => status.includes(token));
    if (isTerminal) return false;
    if (!status) return true;
    if (status.includes('pending') || status.includes('pickup') || status.includes('transit') || status.includes('manifest')) {
      return true;
    }
    return tracking.length > 0;
  }, [lot?.carrier_shipment_status, lot?.tracking_number, lot?.velocity_awb]);

  const [lotTab, setLotTab] = useState('manual');
  const [expanded, setExpanded] = useState(shouldLotStartExpanded);
  const [lotTracking, setLotTracking] = useState(() => String(lot?.tracking_number || ''));
  const [savingLot, setSavingLot] = useState(false);
  const [lotProductWarehouses, setLotProductWarehouses] = useState([]);
  const [lotHasScopedProducts, setLotHasScopedProducts] = useState(false);

  // ── Lot items info popover ──
  const [showLotItems, setShowLotItems] = useState(false);
  const [lotItems, setLotItems] = useState(null); // null = not loaded yet
  const [lotItemsLoading, setLotItemsLoading] = useState(false);
  const popoverRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showLotItems) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowLotItems(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLotItems]);

  const openLotItems = async () => {
    setShowLotItems((v) => !v);
    if (lotItems !== null) return; // already loaded
    setLotItemsLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('id, quantity, price, lot_name, lot_snapshot, products(id, key, name, image_url)')
        .eq('order_shipment_id', lot.id);
      if (error) throw error;
      setLotItems(data || []);
    } catch {
      setLotItems([]);
    } finally {
      setLotItemsLoading(false);
    }
  };

  // Flatten items + lot snapshots into display lines
  const lotDisplayLines = useMemo(() => {
    if (!lotItems) return [];
    return lotItems.flatMap((item) => {
      if (Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0) {
        return item.lot_snapshot.map((s) => ({
          key: `${item.id}-${s.product_key}`,
          name: s.product_name || s.product_key || 'Product',
          productKey: s.product_key,
          qty: (s.quantity || 1) * item.quantity,
          unitPrice: s.unit_price,
          lotName: item.lot_name,
          imageUrl: null,
        }));
      }
      return [{
        key: item.id,
        name: item.products?.name || item.lot_name || 'Product',
        productKey: item.products?.key || null,
        qty: item.quantity,
        unitPrice: item.price,
        lotName: item.lot_name || null,
        imageUrl: item.products?.image_url || null,
      }];
    });
  }, [lotItems]);

  useEffect(() => {
    setLotTracking(String(lot?.tracking_number || ''));
  }, [lot?.id, lot?.tracking_number]);

  useEffect(() => {
    setExpanded(shouldLotStartExpanded);
  }, [lot?.id, shouldLotStartExpanded]);

  const lotVelocityLocked = useMemo(
    () => Boolean(
      String(lot?.velocity_pending_shipment_id || '').trim() ||
      String(lot?.velocity_shipment_id || '').trim() ||
      String(lot?.tracking_number || '').trim() ||
      String(lot?.velocity_awb || '').trim(),
    ),
    [lot?.velocity_pending_shipment_id, lot?.velocity_shipment_id, lot?.tracking_number, lot?.velocity_awb],
  );

  useEffect(() => {
    if (lotVelocityLocked && lotTab !== 'velocity') {
      setLotTab('velocity');
    }
  }, [lotVelocityLocked, lotTab]);

  useEffect(() => {
    let active = true;
    const loadLotWarehouses = async () => {
      try {
        const { data: lotOrderItems, error: lotItemsErr } = await supabase
          .from('order_items')
          .select('id, product_id, lot_id, lot_snapshot')
          .eq('order_shipment_id', lot?.id);
        if (lotItemsErr) throw lotItemsErr;
        if (!active) return;

        const productIds = new Set();
        const bundleKeys = new Set();
        const lotIds = new Set();
        for (const item of lotOrderItems || []) {
          if (item?.product_id) productIds.add(item.product_id);
          if (item?.lot_id) lotIds.add(item.lot_id);
          if (Array.isArray(item?.lot_snapshot)) {
            for (const s of item.lot_snapshot) {
              if (isUuidLike(s?.product_id)) productIds.add(String(s.product_id).trim());
              if (isUuidLike(s?.source_product_id)) productIds.add(String(s.source_product_id).trim());
              if (s?.product_key) bundleKeys.add(s.product_key);
            }
          }
        }

        if (lotIds.size > 0) {
          const { data: lotRows, error: lotRowsErr } = await supabase
            .from('lots')
            .select('id, source_product_id')
            .in('id', [...lotIds]);
          if (lotRowsErr) throw lotRowsErr;
          for (const l of lotRows || []) {
            if (l?.source_product_id) productIds.add(l.source_product_id);
          }
        }

        if (bundleKeys.size > 0) {
          const keyVariants = new Set();
          for (const rawKey of bundleKeys) {
            const k = String(rawKey || '').trim();
            if (!k) continue;
            keyVariants.add(k);
            keyVariants.add(k.toLowerCase());
            keyVariants.add(k.toUpperCase());
          }
          const { data: bundleProds, error: bundleErr } = await supabase
            .from('products')
            .select('id, key')
            .in('key', [...keyVariants]);
          if (bundleErr) throw bundleErr;
          for (const p of bundleProds || []) productIds.add(p.id);
        }

        const hasScopedProducts = productIds.size > 0;
        setLotHasScopedProducts(hasScopedProducts);
        if (!hasScopedProducts) {
          setLotProductWarehouses([]);
          return;
        }

        const { data: pwData, error: pwErr } = await supabase
          .from('product_warehouses')
          .select('warehouse_id, warehouses(id, warehouse_name, velocity_warehouse_id, pincode)')
          .in('product_id', [...productIds]);
        if (pwErr) throw pwErr;
        if (!active) return;

        const seen = new Set();
        const whs = [];
        for (const row of pwData || []) {
          const wh = row?.warehouses;
          if (wh?.id && !seen.has(wh.id)) {
            seen.add(wh.id);
            whs.push(wh);
          }
        }
        setLotProductWarehouses(whs);
      } catch {
        if (!active) return;
        setLotHasScopedProducts(false);
        setLotProductWarehouses([]);
      }
    };

    if (lot?.id) loadLotWarehouses();
    return () => { active = false; };
  }, [lot?.id]);

  const filteredPickups = useMemo(() => {
    const rows = allPickupLocations || [];
    if (lotHasScopedProducts) {
      if (lotProductWarehouses.length === 0) return [];
      return rows.filter((r) => lotProductWarehouses.some((wh) => pickupMatchesWarehouseRow(r, wh)));
    }
    const wh = lot?.warehouse;
    if (!wh?.id) return [];
    const matched = rows.filter((r) => pickupMatchesWarehouseRow(r, wh));
    if (matched.length) return matched;
    const wv = String(wh.velocity_warehouse_id || '').trim();
    if (wv) {
      const byVid = rows.filter(
        (r) => String(r.velocity_warehouse_id || '').trim().toLowerCase() === wv.toLowerCase(),
      );
      if (byVid.length) return byVid;
    }
    const wName = String(wh.warehouse_name || wh.name || '').trim();
    if (wName) {
      const byCode = rows.filter(
        (r) => String(r.velocity_warehouse_id || '').trim().toLowerCase() === wName.toLowerCase(),
      );
      if (byCode.length) return byCode;
      const byPickupName = rows.filter(
        (r) => String(r.warehouse_name || '').trim().toLowerCase() === wName.toLowerCase(),
      );
      if (byPickupName.length) return byPickupName;
    }
    return [];
  }, [allPickupLocations, lot?.warehouse, lotHasScopedProducts, lotProductWarehouses]);

  const whLabel = lot?.warehouse?.warehouse_name || lot?.warehouse?.name || 'Warehouse';
  const whPin = lot?.warehouse?.pincode;
  const whVelocity = lot?.warehouse?.velocity_warehouse_id;
  const lotShipmentStatusRaw = String(lot?.carrier_shipment_status || '').trim();
  const lotShipmentStatusLabel = lotShipmentStatusRaw
    ? lotShipmentStatusRaw
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Pending';
  const lotStatusTone = (() => {
    const s = lotShipmentStatusRaw.toLowerCase();
    if (!s || s.includes('pending') || s.includes('ready')) return 'bg-slate-100 text-slate-700 border-slate-200';
    if (s.includes('cancel') || s.includes('lost') || s.includes('rto')) return 'bg-red-50 text-red-700 border-red-200';
    if (s.includes('deliver')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s.includes('transit') || s.includes('pickup') || s.includes('manifest')) return 'bg-blue-50 text-blue-700 border-blue-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  })();

  const saveLotManual = async () => {
    setSavingLot(true);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('order_shipments')
        .update({
          tracking_number: lotTracking.trim() || null,
          updated_at: now,
        })
        .eq('id', lot.id);
      if (error) throw error;
      onNotice(`Saved tracking for ${lot.label || `shipment ${lot.lot_index}`}.`);
      await onRefresh();
    } catch (e) {
      onError(String(e?.message || e || 'Could not save shipment lot.'));
    } finally {
      setSavingLot(false);
    }
  };

  return (
    <div className="rounded-2xl border border-secondary/25 bg-surface-container-lowest/80 overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-outline-variant/20 bg-secondary/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-start gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-secondary">Shipment lot {lot.lot_index}</p>
            <p className="text-sm font-bold text-gray-900">{lot.label || `Shipment ${lot.lot_index}`}</p>
            <p className="text-xs text-gray-900-variant mt-0.5">
              {whLabel}
              {whPin != null && whPin !== '' ? ` · PIN ${whPin}` : ''}
              {whVelocity ? (
                <span className="ml-1 font-mono text-[10px] text-gray-900">· Velocity {whVelocity}</span>
              ) : null}
              {lot.velocity_external_code ? (
                <span className="ml-1 font-mono text-[10px]">· {lot.velocity_external_code}</span>
              ) : null}
            </p>
            <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${lotStatusTone}`}>
              Shipment status: {lotShipmentStatusLabel}
            </span>
          </div>
          {/* ⓘ Products in this lot */}
          <div className="relative mt-0.5" ref={popoverRef}>
            <button
              type="button"
              onClick={openLotItems}
              title="View products assigned to this lot"
              className="w-6 h-6 rounded-full bg-secondary/15 hover:bg-secondary/30 text-secondary flex items-center justify-center transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">info</span>
            </button>
            {showLotItems && (
              <div className="absolute left-0 top-8 z-50 w-72 rounded-2xl border border-outline-variant/30 bg-white shadow-xl p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-secondary mb-2">
                  Products in this lot
                </p>
                {lotItemsLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <span className="material-symbols-outlined animate-spin text-secondary text-base">progress_activity</span>
                    <span className="text-xs text-gray-900-variant">Loading…</span>
                  </div>
                ) : lotDisplayLines.length === 0 ? (
                  <p className="text-xs text-gray-900-variant py-1">No products assigned to this lot yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {lotDisplayLines.map((line) => (
                      <div key={line.key} className="flex items-center gap-2.5 rounded-xl bg-surface-container-low p-2">
                        {line.imageUrl ? (
                          <img src={line.imageUrl} alt={line.name} className="w-9 h-9 rounded-lg object-cover border border-outline-variant/20 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center shrink-0 border border-outline-variant/20">
                            <span className="material-symbols-outlined text-outline text-sm">inventory_2</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900 truncate">{line.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {line.productKey && (
                              <span className="text-[9px] font-mono text-gray-900-variant bg-surface-container px-1 py-0.5 rounded">
                                {line.productKey}
                              </span>
                            )}
                            {line.lotName && (
                              <span className="text-[9px] font-bold text-secondary uppercase tracking-wide">
                                {line.lotName}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-gray-900">×{line.qty}</p>
                          {line.unitPrice != null && (
                            <p className="text-[10px] text-gray-900-variant">₹{Number(line.unitPrice).toLocaleString('en-IN')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-outline-variant/35 bg-white text-xs font-semibold text-gray-700 hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[16px]">{expanded ? 'expand_less' : 'expand_more'}</span>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <div className="flex rounded-xl bg-surface-container-low p-1 gap-1">
          {(lotVelocityLocked
            ? [{ key: 'velocity', label: 'Velocity', icon: 'electric_bolt' }]
            : [
              { key: 'manual', label: 'Manual', icon: 'edit' },
              { key: 'velocity', label: 'Velocity', icon: 'electric_bolt' },
            ]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setLotTab(t.key)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                lotTab === t.key ? 'bg-primary text-on-primary shadow-sm' : 'text-gray-900-variant hover:bg-white/80'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
          </div>
        </div>
      </div>

      {expanded && <div className="p-4">
        {lotTab === 'manual' && (
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-900-variant uppercase tracking-wider mb-1">Tracking / AWB (this lot)</label>
              <input
                type="text"
                value={lotTracking}
                onChange={(e) => setLotTracking(e.target.value)}
                className="w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm font-mono focus:ring-2 focus:ring-secondary"
                placeholder="Carrier tracking or AWB"
              />
            </div>
            <Button variant="contained" color="primary" size="small" onClick={saveLotManual} disabled={savingLot}>
              {savingLot ? 'Saving…' : 'Save lot tracking'}
            </Button>
          </div>
        )}

        {lotTab === 'velocity' && (
          <div className="space-y-2">
            {!whVelocity && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-2">
                Link this warehouse to a Velocity warehouse id so pickup locations can be filtered for this lot.
              </p>
            )}
            <VelocityLotWorkflow
              orderId={orderId}
              lot={lot}
              pickupLocations={filteredPickups}
              onRefresh={onRefresh}
              onNotice={onNotice}
              onError={onError}
            />
          </div>
        )}
      </div>}
    </div>
  );
}

// ─── ShippingPanel ────────────────────────────────────────────────────────────

function ShippingPanel({ order, orderId, items: orderItems, onRefresh, onNotice, onError }) {
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

  const [shipmentLots, setShipmentLots] = useState([]);
  const [activeLotId, setActiveLotId] = useState('');
  const [shipmentLotsLoading, setShipmentLotsLoading] = useState(false);
  const [singleShipmentLot, setSingleShipmentLot] = useState(null);
  const [singleTimelineLoading, setSingleTimelineLoading] = useState(false);
  const [singleTimelineRows, setSingleTimelineRows] = useState([]);
  const [showSingleWebhookInfoModal, setShowSingleWebhookInfoModal] = useState(false);
  const [singleWebhookPage, setSingleWebhookPage] = useState(1);
  const [singleWebhookLive, setSingleWebhookLive] = useState(false);

  // ── Lot builder state (multi-shipment manual assignment) ──
  const [lotBuilderOpen, setLotBuilderOpen] = useState(false);
  const [lotBuilderItems, setLotBuilderItems] = useState([]); // all order items for this order
  const [lotBuilderLots, setLotBuilderLots] = useState([]); // local lot rows (id, label, lot_index)
  // assignment map: order_item_id → lot_id (local, not yet persisted until "Proceed")
  const [lotAssignments, setLotAssignments] = useState({});
  const [lotBuilderLoading, setLotBuilderLoading] = useState(false);
  const [lotBuilderSaving, setLotBuilderSaving] = useState(false);
  const [lotBuilderError, setLotBuilderError] = useState('');
  const [revertingLots, setRevertingLots] = useState(false);

  const [retryingRefund, setRetryingRefund] = useState(false);
  // Warehouses assigned to the order's products (for filtering pickup locations in single-shipment mode)
  const [productWarehouses, setProductWarehouses] = useState([]); // array of warehouse rows
  const [hasScopedProducts, setHasScopedProducts] = useState(false);
  const isPartialOrder = order?.partial_fulfillment === true;
  const isRazorpay = ['razorpay', 'razorpay_upi', 'razorpay_cards'].includes(order?.payment_method);
  const isPaid = order?.payment_status === 'paid';
  const pendingVelocitySidFromOrder = order?.velocity_pending_shipment_id
    ? String(order.velocity_pending_shipment_id).trim()
    : '';

  const activeLot = shipmentLots.find((s) => s.id === activeLotId) || null;
  const pendingVelocitySidFromLot = activeLot?.velocity_pending_shipment_id
    ? String(activeLot.velocity_pending_shipment_id).trim()
    : '';

  const pendingVelocitySid = suppressPendingVelocitySid
    ? ''
    : (order?.fulfillment_mode === 'multi_shipment'
      ? pendingVelocitySidFromLot
      : pendingVelocitySidFromOrder);

  const alreadyShippedViaVelocity =
    order?.fulfillment_mode === 'multi_shipment'
      ? (shipmentLots.length > 0 &&
        shipmentLots.every((l) => String(l.tracking_number || '').trim()))
      : !!(order?.velocity_shipment_id && order?.tracking_number);
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

  const hideGlobalVelocityForLots =
    order?.fulfillment_mode === 'multi_shipment' &&
    (shipmentLotsLoading || shipmentLots.length > 0);

  // True when the order has multiple products or contains a lot (bundle) item —
  // only in those cases do we need to ask Single vs Multiple shipment routing.
  const isMultiProductOrder = useMemo(() => {
    const rows = orderItems || [];
    if (rows.length > 1) return true;
    if (rows.length === 1) {
      const snap = rows[0]?.lot_snapshot;
      return Array.isArray(snap) && snap.length > 1;
    }
    return false;
  }, [orderItems]);

  const showFulfillmentRouting =
    isMultiProductOrder &&
    !lotBuilderOpen &&
    order?.status === 'processing' &&
    !order?.fulfillment_mode &&
    !String(order?.velocity_pending_shipment_id || '').trim() &&
    !String(order?.velocity_shipment_id || '').trim() &&
    !String(order?.tracking_number || '').trim();

  // Show a "change mode" banner when single was chosen but nothing shipped yet
  const showSingleChosenBanner =
    order?.status === 'processing' &&
    order?.fulfillment_mode === 'legacy_single' &&
    !String(order?.velocity_pending_shipment_id || '').trim() &&
    !String(order?.velocity_shipment_id || '').trim() &&
    !String(order?.tracking_number || '').trim();

  // Show a "change mode" banner when multi was chosen but builder is closed and nothing booked yet
  const showMultiChosenBanner =
    order?.status === 'processing' &&
    order?.fulfillment_mode === 'multi_shipment' &&
    !lotBuilderOpen &&
    !hideGlobalVelocityForLots &&
    shipmentLots.length > 0 &&
    shipmentLots.every((l) => !String(l.tracking_number || '').trim() && !String(l.velocity_pending_shipment_id || '').trim()) &&
    !String(order?.velocity_pending_shipment_id || '').trim() &&
    !String(order?.velocity_shipment_id || '').trim() &&
    !String(order?.tracking_number || '').trim();

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
  // Show retry button when refund is pending (was set by admin_finalize_order but edge fn wasn't deployed)
  const needsRefundRetry = isPartialOrder && isRazorpay && isPaid && order?.refund_status === 'pending';

  useEffect(() => {
    let active = true;
    const loadPickupLocations = async () => {
      try {
        // 1. Fetch all warehouses (no seller pickup dependency)
        const { data, error } = await supabase
          .from('warehouses')
          .select('id, warehouse_name, pincode, velocity_warehouse_id')
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (!active) return;
        const rows = data || [];
        setPickupLocations(rows);

        // 2. Resolve product IDs from DB order items (including bundle snapshots)
        const { data: itemRows, error: itemRowsErr } = await supabase
          .from('order_items')
          .select('id, product_id, lot_id, lot_snapshot')
          .eq('order_id', orderId);
        if (itemRowsErr) throw itemRowsErr;
        const productIds = new Set();
        const bundleKeys = new Set();
        const lotIds = new Set();
        for (const item of itemRows) {
          if (item?.product_id) productIds.add(item.product_id);
          if (item?.lot_id) lotIds.add(item.lot_id);
          if (Array.isArray(item.lot_snapshot)) {
            for (const s of item.lot_snapshot) {
              if (isUuidLike(s?.product_id)) productIds.add(String(s.product_id).trim());
              if (isUuidLike(s?.source_product_id)) productIds.add(String(s.source_product_id).trim());
              if (s.product_key) bundleKeys.add(s.product_key);
            }
          }
        }

        if (lotIds.size > 0) {
          const { data: lotRows, error: lotRowsErr } = await supabase
            .from('lots')
            .select('id, source_product_id')
            .in('id', [...lotIds]);
          if (lotRowsErr) throw lotRowsErr;
          for (const l of lotRows || []) {
            if (l?.source_product_id) productIds.add(l.source_product_id);
          }
        }

        // Resolve bundle keys → product IDs
        if (bundleKeys.size > 0) {
          const keyVariants = new Set();
          for (const rawKey of bundleKeys) {
            const k = String(rawKey || '').trim();
            if (!k) continue;
            keyVariants.add(k);
            keyVariants.add(k.toLowerCase());
            keyVariants.add(k.toUpperCase());
          }
          const { data: bundleProds } = await supabase
            .from('products').select('id, key').in('key', [...keyVariants]);
          for (const p of bundleProds || []) productIds.add(p.id);
        }

        if (productIds.size === 0) {
          if (active) setHasScopedProducts(false);
          if (active) setProductWarehouses([]);
          const firstSynced = rows.find((r) => r.velocity_warehouse_id)?.id || '';
          if (active) setPickupLocationId(firstSynced);
          return;
        }
        if (active) setHasScopedProducts(true);

        // 3. Fetch warehouses assigned to those products
        const { data: pwData } = await supabase
          .from('product_warehouses')
          .select('warehouse_id, warehouses(id, warehouse_name, velocity_warehouse_id, pincode)')
          .in('product_id', [...productIds]);
        if (!active) return;

        const seen = new Set();
        const whs = [];
        for (const row of pwData || []) {
          const wh = row.warehouses;
          if (wh && !seen.has(wh.id)) { seen.add(wh.id); whs.push(wh); }
        }
        setProductWarehouses(whs);

        // 4. Auto-select first matching pickup location
        const matchedPickups = whs.length > 0
          ? rows.filter((r) => whs.some((wh) => pickupMatchesWarehouseRow(r, wh)))
          : rows.filter((r) => r.velocity_warehouse_id);
        const firstSynced = matchedPickups.find((r) => r.velocity_warehouse_id)?.id || matchedPickups[0]?.id || '';
        setPickupLocationId(firstSynced);
      } catch {
        if (!active) return;
        setHasScopedProducts(false);
        setPickupLocations([]);
        setPickupLocationId('');
      }
    };

    if (
      shippingMode === 'velocity' ||
      order?.fulfillment_mode === 'multi_shipment'
    ) {
      loadPickupLocations();
    }
    return () => { active = false; };
  }, [shippingMode, order?.fulfillment_mode, order?.status, orderId]);

  useEffect(() => {
    let cancelled = false;
    if (order?.fulfillment_mode !== 'multi_shipment') {
      setShipmentLots([]);
      setActiveLotId('');
      setShipmentLotsLoading(false);
      return undefined;
    }
    setShipmentLotsLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('order_shipments')
          .select(`
            id,
            lot_index,
            label,
            warehouse_id,
            velocity_external_code,
            velocity_pending_shipment_id,
            velocity_shipment_id,
            velocity_fulfillment,
            tracking_number,
            velocity_awb,
            velocity_tracking_url,
            carrier_shipment_status,
            velocity_carrier_name,
            velocity_label_url,
            velocity_tracking_snapshot,
            warehouse:warehouses(id, warehouse_name, velocity_warehouse_id, pincode)
          `)
          .eq('order_id', orderId)
          .order('lot_index', { ascending: true });
        if (cancelled) return;
        const rows = data || [];
        setShipmentLots(rows);
        setActiveLotId((prev) =>
          prev && rows.some((r) => r.id === prev)
            ? prev
            : (rows[0]?.id || ''),
        );
      } finally {
        if (!cancelled) setShipmentLotsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [order?.fulfillment_mode, orderId]);

  useEffect(() => {
    let active = true;
    const loadSingleShipmentTracking = async () => {
      if (order?.fulfillment_mode === 'multi_shipment') {
        if (!active) return;
        setSingleShipmentLot(null);
        setSingleTimelineRows([]);
        setSingleTimelineLoading(false);
        return;
      }
      setSingleTimelineLoading(true);
      try {
        const { data: lotRows } = await supabase
          .from('order_shipments')
          .select(`
            id,
            lot_index,
            label,
            tracking_number,
            velocity_awb,
            velocity_tracking_url,
            velocity_carrier_name,
            carrier_shipment_status,
            velocity_label_url
          `)
          .eq('order_id', orderId)
          .order('lot_index', { ascending: true })
          .limit(1);
        if (!active) return;
        const lot = Array.isArray(lotRows) && lotRows.length > 0 ? lotRows[0] : null;
        setSingleShipmentLot(lot);
        if (!lot?.id) {
          setSingleTimelineRows([]);
          return;
        }
        const { data: events } = await supabase
          .from('order_shipment_tracking_events')
          .select('id, source, activity, location, carrier_remark, event_time, created_at, raw_payload')
          .eq('order_shipment_id', lot.id)
          .in('source', ['webhook', 'cancel_api'])
          .order('event_time', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(50);
        if (!active) return;
        setSingleTimelineRows(Array.isArray(events) ? events : []);
      } catch {
        if (!active) return;
        setSingleShipmentLot(null);
        setSingleTimelineRows([]);
      } finally {
        if (active) setSingleTimelineLoading(false);
      }
    };
    if (
      order?.fulfillment_mode !== 'multi_shipment' &&
      (shippingMode === 'velocity' || alreadyShippedViaVelocity)
    ) {
      loadSingleShipmentTracking();
    } else {
      setSingleShipmentLot(null);
      setSingleTimelineRows([]);
      setSingleTimelineLoading(false);
    }
    return () => { active = false; };
  }, [order?.fulfillment_mode, shippingMode, alreadyShippedViaVelocity, orderId]);

  const velocityResumeKeyRef = useRef('');
  const velocityAutoResumeKeyRef = useRef('');

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
    const loc = velocityPickupOptions.find((r) => r.id === pickupLocationId);
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

  const serviceabilitySummary = useMemo(() => {
    const svc = velServiceability && typeof velServiceability === 'object' ? velServiceability : null;
    if (!svc) return null;
    const details = svc.rates_shipment_details && typeof svc.rates_shipment_details === 'object'
      ? svc.rates_shipment_details
      : null;
    const chargeValues = (svc.carriers || [])
      .map((c) => Number(c?.rate_quote?.charges?.total_forward_charges))
      .filter((v) => Number.isFinite(v));
    const minCharge = chargeValues.length ? Math.min(...chargeValues) : null;
    const maxCharge = chargeValues.length ? Math.max(...chargeValues) : null;
    return {
      zone: String(svc.zone || details?.zone || '—'),
      paymentMode: String(svc.payment_mode || details?.payment_method || '—').toUpperCase(),
      customerPincode: String(svc.customer_pincode || details?.destination_pincode || '—'),
      pickupLocation: String(svc.pickup_location || '—'),
      pickupPincode: String(svc.pickup_pincode || details?.origin_pincode || '—'),
      pickupSource: String(svc.pickup_source || '—').replace(/_/g, ' '),
      deadWeight: details?.dead_weight ?? null,
      volumetricWeight: details?.volumetric_weight ?? null,
      applicableWeight: details?.applicable_weight ?? null,
      minCharge,
      maxCharge,
      ratesNote: typeof svc.rates_note === 'string' ? svc.rates_note : '',
    };
  }, [velServiceability]);

  /** Pickup locations filtered to warehouses assigned to this order's products (single-shipment mode). */
  const velocityPickupOptions = useMemo(() => {
    const all = pickupLocations || [];
    if (hasScopedProducts && productWarehouses.length === 0) return [];
    if (productWarehouses.length === 0) return all.filter((r) => r.velocity_warehouse_id);
    return all.filter((r) =>
      productWarehouses.some((wh) => pickupMatchesWarehouseRow(r, wh)),
    );
  }, [pickupLocations, productWarehouses, hasScopedProducts]);

  useEffect(() => {
    if (!pickupLocationId) return;
    if (velocityPickupOptions.some((r) => r.id === pickupLocationId)) return;
    const first = velocityPickupOptions.find((r) => r.velocity_warehouse_id)?.id || '';
    setPickupLocationId(first);
  }, [velocityPickupOptions, pickupLocationId]);

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
    if (
      lower.includes('unsupported jwt algorithm') ||
      lower.includes('unsupported_token_algorithm') ||
      lower.includes('unauthorized_unsupported_token_algorithm')
    ) {
      return 'Session token was rejected by the edge gateway. Refresh the page or sign in again; if it persists, confirm velocity-orchestrator allows your JWT (verify_jwt false in config / dashboard).';
    }
    return msg;
  };

  const confirmLegacySingleFulfillment = async () => {
    onError('');
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          fulfillment_mode: 'legacy_single',
          updated_at: new Date().toISOString(),
          admin_updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
      if (error) throw error;
      onNotice('Single-shipment mode selected. Continue with Velocity or manual entry below.');
      await onRefresh();
    } catch (e) {
      onError(toUserError(e, 'Could not update fulfillment mode.'));
    }
  };

  /** Reset fulfillment_mode back to null so admin can re-choose — only safe when nothing has shipped yet */
  const resetFulfillmentMode = async () => {
    onError('');
    try {
      const { error } = await supabase
        .from('orders')
        .update({
          fulfillment_mode: null,
          updated_at: new Date().toISOString(),
          admin_updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);
      if (error) throw error;
      await onRefresh();
    } catch (e) {
      onError(toUserError(e, 'Could not reset fulfillment mode.'));
    }
  };

  // ── Lot builder helpers ──────────────────────────────────────────────────────

  const openLotBuilder = async () => {
    setLotBuilderLoading(true);
    setLotBuilderError('');
    try {
      const { data: itemRows, error: itemErr } = await supabase
        .from('order_items')
        .select('id, quantity, price, lot_name, lot_snapshot, order_shipment_id, products(id, key, name, image_url)')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (itemErr) throw itemErr;

      const { error: rpcErr } = await supabase.rpc('admin_create_empty_shipment_lots', {
        p_order_id: orderId,
        p_lot_count: 2,
      });
      if (rpcErr) throw rpcErr;

      const { data: lotRows, error: lotErr } = await supabase
        .from('order_shipments')
        .select('id, lot_index, label, velocity_external_code')
        .eq('order_id', orderId)
        .order('lot_index', { ascending: true });
      if (lotErr) throw lotErr;

      // ── Collect all product keys from bundle snapshots to resolve their IDs ──
      const bundleProductKeys = new Set();
      for (const item of itemRows || []) {
        if (Array.isArray(item.lot_snapshot)) {
          for (const s of item.lot_snapshot) {
            if (s.product_key) bundleProductKeys.add(s.product_key);
          }
        }
      }

      // Resolve bundle product keys → product IDs
      let bundleKeyToId = {};
      if (bundleProductKeys.size > 0) {
        const { data: bundleProds } = await supabase
          .from('products')
          .select('id, key')
          .in('key', [...bundleProductKeys]);
        for (const p of bundleProds || []) bundleKeyToId[p.key] = p.id;
      }

      // ── Collect all product IDs (plain + bundle) ──
      const allProductIds = new Set();
      for (const item of itemRows || []) {
        if (item.products?.id) allProductIds.add(item.products.id);
        if (Array.isArray(item.lot_snapshot)) {
          for (const s of item.lot_snapshot) {
            const pid = bundleKeyToId[s.product_key];
            if (pid) allProductIds.add(pid);
          }
        }
      }

      // ── Fetch warehouses for all products ──
      let warehousesByProductId = {};
      if (allProductIds.size > 0) {
        const { data: pwRows } = await supabase
          .from('product_warehouses')
          .select('product_id, is_default, warehouse:warehouses(id, warehouse_name, pincode)')
          .in('product_id', [...allProductIds])
          .order('is_default', { ascending: false });
        for (const pw of pwRows || []) {
          if (!pw.warehouse) continue;
          if (!warehousesByProductId[pw.product_id]) warehousesByProductId[pw.product_id] = [];
          warehousesByProductId[pw.product_id].push({
            id: pw.warehouse.id,
            name: pw.warehouse.warehouse_name,
            pincode: pw.warehouse.pincode,
            isDefault: pw.is_default,
          });
        }
      }

      // ── Expand every order_item into individual assignable rows ──
      const displayItems = (itemRows || []).flatMap((item) => {
        const isBundle = Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0;
        if (isBundle) {
          return item.lot_snapshot.map((s) => {
            const pid = bundleKeyToId[s.product_key];
            return {
              id: `${item.id}::${s.product_key}`,
              orderId: item.id,
              productKey: s.product_key,
              quantity: (s.quantity || 1) * item.quantity,
              price: s.unit_price || 0,
              order_shipment_id: item.order_shipment_id,
              name: s.product_name || s.product_key || 'Product',
              imageUrl: null,
              bundleParent: item.lot_name || 'Bundle',
              warehouses: pid ? (warehousesByProductId[pid] || []) : [],
            };
          });
        }
        return [{
          id: item.id,
          orderId: item.id,
          productKey: item.products?.key || null,
          quantity: item.quantity,
          price: item.price,
          order_shipment_id: item.order_shipment_id,
          name: item.products?.name || item.lot_name || 'Product',
          imageUrl: item.products?.image_url || null,
          bundleParent: null,
          warehouses: item.products?.id ? (warehousesByProductId[item.products.id] || []) : [],
        }];
      });

      const seedAssignments = {};
      for (const item of displayItems) {
        if (item.order_shipment_id) seedAssignments[item.id] = item.order_shipment_id;
      }

      setLotBuilderItems(displayItems);
      setLotBuilderLots(lotRows || []);
      setLotAssignments(seedAssignments);
      setLotBuilderOpen(true);
      // NOTE: intentionally NOT calling onRefresh() here — the builder manages
      // its own local state. onRefresh() would cause a parent re-render that
      // races with setLotBuilderOpen(true) and hides the builder.
      // onRefresh() is called after commitLotAssignments() instead.
    } catch (e) {
      setLotBuilderError(toUserError(e, 'Could not open lot builder.'));
    } finally {
      setLotBuilderLoading(false);
    }
  };

  const addLotToBuilder = async () => {
    setLotBuilderError('');
    try {
      const { error } = await supabase.rpc('admin_add_shipment_lot', { p_order_id: orderId });
      if (error) throw error;
      const { data: lotRows } = await supabase
        .from('order_shipments')
        .select('id, lot_index, label, velocity_external_code')
        .eq('order_id', orderId)
        .order('lot_index', { ascending: true });
      setLotBuilderLots(lotRows || []);
    } catch (e) {
      setLotBuilderError(toUserError(e, 'Could not add lot.'));
    }
  };

  const removeLotFromBuilder = async (lotId) => {
    setLotBuilderError('');
    try {
      const { error } = await supabase.rpc('admin_remove_shipment_lot', { p_order_shipment_id: lotId });
      if (error) throw error;
      // Remove from local lots list and clear any assignments to this lot
      setLotBuilderLots((prev) => prev.filter((l) => l.id !== lotId));
      setLotAssignments((prev) => {
        const next = { ...prev };
        for (const [itemId, assignedLotId] of Object.entries(next)) {
          if (assignedLotId === lotId) delete next[itemId];
        }
        return next;
      });
    } catch (e) {
      setLotBuilderError(toUserError(e, 'Could not remove lot.'));
    }
  };

  const assignItemToLot = (itemId, lotId) => {
    setLotAssignments((prev) => ({ ...prev, [itemId]: lotId }));
  };

  const unassignItem = (itemId) => {
    setLotAssignments((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const allItemsAssigned = lotBuilderItems.length > 0 &&
    lotBuilderItems.every((item) => !!lotAssignments[item.id]);

  const commitLotAssignments = async () => {
    if (!allItemsAssigned) return;
    setLotBuilderSaving(true);
    setLotBuilderError('');
    try {
      // Build a map of orderId → lotId (deduplicated for bundle products).
      // Bundle products from the same order_item all share the same orderId —
      // they must all go to the same lot (validated by allItemsAssigned check).
      const orderItemToLot = {};
      for (const [virtualId, lotId] of Object.entries(lotAssignments)) {
        const item = lotBuilderItems.find((i) => i.id === virtualId);
        if (!item) continue;
        orderItemToLot[item.orderId] = lotId;
      }
      for (const [orderItemId, lotId] of Object.entries(orderItemToLot)) {
        const { error } = await supabase.rpc('admin_assign_item_to_lot', {
          p_order_item_id: orderItemId,
          p_order_shipment_id: lotId,
        });
        if (error) throw error;
      }
      setLotBuilderOpen(false);
      onNotice('Shipment lots configured. Book each lot below.');
      await onRefresh();
    } catch (e) {
      setLotBuilderError(toUserError(e, 'Could not save lot assignments.'));
    } finally {
      setLotBuilderSaving(false);
    }
  };

  const revertLots = async () => {
    setRevertingLots(true);
    onError('');
    try {
      const { error } = await supabase.rpc('admin_revert_shipment_lots', { p_order_id: orderId });
      if (error) throw error;
      setLotBuilderOpen(false);
      setLotBuilderItems([]);
      setLotBuilderLots([]);
      setLotAssignments({});
      onNotice('Shipment lots reverted. Choose fulfillment mode again.');
      await onRefresh();
    } catch (e) {
      onError(toUserError(e, 'Could not revert lots.'));
    } finally {
      setRevertingLots(false);
    }
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
    const { data, error } = await supabase
      .from('orders')
      .update({
        velocity_fulfillment: next,
        updated_at: new Date().toISOString(),
        admin_updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Could not update Velocity workflow metadata for this order.');
  };

  const syncVelocityTrackingFromApi = async () => {
    setSyncingVelTrack(true);
    onError('');
    try {
      const trackPayload =
        order?.fulfillment_mode === 'multi_shipment'
          ? (activeLotId ? { order_shipment_id: activeLotId } : {})
          : (singleShipmentLot?.id ? { order_shipment_id: singleShipmentLot.id } : {});
      if (!trackPayload.order_shipment_id) {
        throw new Error('Shipment refresh requires a shipment lot id. Please reload and retry.');
      }
      await callVelocityFn({ action: 'track_order', payload: trackPayload });
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
    const existing = singleShipmentLot?.velocity_label_url || order.velocity_label_url;
    if (existing && /^https?:\/\//i.test(String(existing))) {
      window.open(String(existing).trim(), '_blank', 'noopener,noreferrer');
      return;
    }
    setPrintingLabel(true);
    onError('');
    try {
      const trackPayload =
        order?.fulfillment_mode === 'multi_shipment'
          ? (activeLotId ? { order_shipment_id: activeLotId } : {})
          : (singleShipmentLot?.id ? { order_shipment_id: singleShipmentLot.id } : {});
      if (!trackPayload.order_shipment_id) {
        throw new Error('Label fetch requires a shipment lot id. Please reload and retry.');
      }
      const raw = await callVelocityFn({ action: 'track_order', payload: trackPayload });
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

  /** Cancels only the targeted shipment on Velocity (lot/single), never the full customer order. */
  const cancelVelocityPickup = async () => {
    const isMultiShipment = order?.fulfillment_mode === 'multi_shipment';
    const targetShipmentId = isMultiShipment ? activeLotId : singleShipmentLot?.id;
    if (!targetShipmentId) {
      onError(
        isMultiShipment
          ? 'Select a shipping lot first. Cancel courier works per lot and will not cancel the full order.'
          : 'Shipment record not found for this order. Refresh once and try again.',
      );
      return;
    }
    const cancelPayload = { order_shipment_id: targetShipmentId };
    const ok = window.confirm(
      isMultiShipment
        ? 'Cancel courier only for the selected shipping lot? This will void the AWB for that lot only.'
        : 'Cancel courier for this shipment only? This will void AWB/pickup for this shipment and will not cancel the customer order.',
    );
    if (!ok) return;
    setCancellingPickup(true);
    onError('');
    try {
      await callVelocityFn({ action: 'cancel_order', payload: cancelPayload });
      onNotice(
        isMultiShipment
          ? 'Courier cancelled for the selected shipping lot.'
          : 'Courier cancelled for this shipment only. Customer order stays active.',
      );
      setEditTracking('');
      setEditProvider('');
      if (!isMultiShipment) setEditStatus('processing');
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
    if (order?.fulfillment_mode === 'multi_shipment' && !activeLotId) {
      setVelError('Choose a shipment lot — rate quotes use that lot\'s declared value.');
      return;
    }
    setVelStep('checking');
    setVelError('');
    setVelServiceability(null);
    setVelResult(null);
    try {
      const svcPayload = {
        pickup_location_id: pickupLocationId,
        length: parseFloat(velLength),
        breadth: parseFloat(velBreadth),
        height: parseFloat(velHeight),
        weight: parseFloat(velWeight),
      };
      if (order?.fulfillment_mode === 'multi_shipment') {
        svcPayload.order_shipment_id = activeLotId;
      }
      const data = await callVelocityFn({
        action: 'check_serviceability',
        payload: svcPayload,
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
      const createPayload = {
        pickup_location_id: pickupLocationId,
        length: parseFloat(velLength),
        breadth: parseFloat(velBreadth),
        height: parseFloat(velHeight),
        weight: parseFloat(velWeight),
        serviceability_snapshot: velServiceability,
      };
      if (order?.fulfillment_mode === 'multi_shipment') {
        if (!activeLotId) throw new Error('Choose a shipment lot before creating the Velocity shipment order.');
        createPayload.order_shipment_id = activeLotId;
      }
      const data = await callVelocityFn({
        action: 'create_forward_order',
        payload: createPayload,
      });
      const inner = velocityInnerPayload(data);
      const sid = String(inner.shipment_id || '').trim();
      if (!sid) {
        throw new Error('Velocity did not return a shipment_id. Check Velocity API logs.');
      }
      setVelShipmentId(sid);
      setVelStep('pending_assign');
      if (order?.fulfillment_mode !== 'multi_shipment') {
        await persistVelocityFulfillmentMeta((meta) => ({
          ...meta,
          method_locked_after_order: true,
          workflow_stage: 'order_created',
          latest_velocity_shipment_id: sid,
        }));
      }
      await onRefresh();
      const lotHint = order?.fulfillment_mode === 'multi_shipment'
        ? ` — lot ${activeLot?.label || ''} (${activeLot?.velocity_external_code || ''})`.trim()
        : '';
      onNotice(`Velocity shipment order created${lotHint}. Shipment ID: ${sid}. Continue with courier assignment for this lot.`);
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
      await callVelocityFn({
        action: 'reinitiate_shipping',
        payload: { shipment_id: historicalSid, mode: 'resume_existing' },
      });
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

  // After reinitiate (workflow_stage=selection), choosing Velocity should resume the existing shipment order.
  useEffect(() => {
    if (shippingMode !== 'velocity') return;
    if (pendingVelocitySid) return;
    const workflowStage = String(velocityFulfillment?.workflow_stage || '');
    if (workflowStage !== 'selection') return;
    const historicalSid = String(latestHistoricalVelocityOrder?.shipment_id || '').trim();
    if (!historicalSid) return;
    const key = `${orderId}:${historicalSid}:${workflowStage}`;
    if (velocityAutoResumeKeyRef.current === key) return;
    velocityAutoResumeKeyRef.current = key;
    void continueWithExistingVelocityOrder();
  }, [shippingMode, pendingVelocitySid, velocityFulfillment?.workflow_stage, latestHistoricalVelocityOrder?.shipment_id, orderId]);

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
      await callVelocityFn({
        action: 'reinitiate_shipping',
        payload: { shipment_id: sid },
      });
      // Immediately unlock step UI locally; DB refresh will reconcile shortly after.
      setSuppressPendingVelocitySid(true);
      velocityResumeKeyRef.current = '';
      setVelShipmentId('');
      setVelStep('idle');
      setVelServiceability(null);
      setVelResult(null);
      setVelCarrierId('');
      setShippingMode('manual');
      onNotice('Shipping workflow reinitiated. Choose shipping mode again (Manual or Velocity).');
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
      const assignPayload = {
        shipment_id: sid,
        carrier_id: velCarrierId || '',
      };
      if (order?.fulfillment_mode === 'multi_shipment' && activeLotId) {
        assignPayload.order_shipment_id = activeLotId;
      }
      const data = await callVelocityFn({
        action: 'assign_courier',
        payload: assignPayload,
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
            const cancelPayload = order?.fulfillment_mode === 'multi_shipment' && activeLotId
              ? { order_shipment_id: activeLotId }
              : {};
            await callVelocityFn({ action: 'cancel_order', payload: cancelPayload });
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
  const formatShipmentStatusLabel = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '—';
    const compact = raw.replace(/\s+/g, '').toLowerCase();
    if (compact === 'readyforreceive' || compact === 'readyforpickup') {
      return 'Ready for Receive/Pickup';
    }
    return raw
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };
  const statusStageKey = (label) => {
    const s = String(label || '').toLowerCase();
    if (s.includes('deliver')) return 'delivered';
    if (s.includes('transit') || s.includes('out for delivery')) return 'transit';
    if (s.includes('pickup') || s.includes('receive') || s.includes('manifest')) return 'ready_pickup';
    if (s.includes('cancel')) return 'cancelled';
    return 'confirmed';
  };
  const resolveShipmentEventLocation = (ev) => {
    if (typeof ev?.location === 'string' && ev.location.trim()) return ev.location.trim();
    const payload = ev?.raw_payload && typeof ev.raw_payload === 'object' ? ev.raw_payload : null;
    if (!payload) return '';
    const candidates = [
      payload.location,
      payload.current_location,
      payload.location_name,
      payload.city,
      payload.current_city,
      payload.pickup_city,
      payload.hub,
      payload.hub_name,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    return '';
  };
  const parseSingleWebhookStatusChange = (rawPayload, fallbackTs, ev = null) => {
    const root = rawPayload && typeof rawPayload === 'object' ? rawPayload : null;
    const data = root && root.data && typeof root.data === 'object' ? root.data : (root || {});
    const statusRaw = String(data.status || data.shipment_status || ev?.activity || '').trim();
    if (!statusRaw) return null;
    const eventTs = String((root && root.event_timestamp) || fallbackTs || '').trim();
    const eventMs = eventTs ? Date.parse(eventTs) : Number.NaN;
    return {
      eventId: String((root && root.event_id) || ev?.id || `${eventTs}:${statusRaw}:${ev?.source || ''}`).trim(),
      source: String(ev?.source || '').toLowerCase(),
      eventTimestamp: eventTs,
      eventMs,
      latestStatus: statusRaw,
      ndrReason: String(data.ndr_reason || data.reason || '').trim(),
      originalEdd: String(data.original_edd || data.promised_delivery_date || '').trim(),
      updatedEdd: String(data.estimated_delivery_date || data.updated_estimated_delivery_date || '').trim(),
      carrierName: String(data.carrier_name || '').trim(),
      trackingNumber: String(data.tracking_number || data.awb || '').trim(),
      rawPayload: rawPayload && typeof rawPayload === 'object' ? rawPayload : null,
    };
  };
  const singleVelocityAwb = String(
    singleShipmentLot?.tracking_number ||
    singleShipmentLot?.velocity_awb ||
    order?.tracking_number ||
    order?.velocity_awb ||
    velocityDonePayload?.awb_code ||
    '',
  ).trim();
  const singleVelocityCarrier = String(
    singleShipmentLot?.velocity_carrier_name ||
    order?.velocity_carrier_name ||
    velocityDonePayload?.courier_name ||
    '',
  ).trim();
  const singleVelocityStatusRaw = String(
    singleShipmentLot?.carrier_shipment_status ||
    order?.shipment_status ||
    '',
  ).trim();
  const singleVelocityTrackingUrl = String(
    singleShipmentLot?.velocity_tracking_url ||
    order?.velocity_tracking_url ||
    '',
  ).trim();
  const showSingleVelocityControlCenter =
    order?.fulfillment_mode !== 'multi_shipment' &&
    !!singleVelocityAwb;
  const singleCancelBlocked = pickupCancelBlocked.has(singleVelocityStatusRaw.toLowerCase());
  const canCancelSingleCourier =
    showSingleVelocityControlCenter &&
    order?.status !== 'cancelled' &&
    !singleCancelBlocked;
  const singleWebhookStatusRows = useMemo(() => (
    singleTimelineRows
      .map((ev) => parseSingleWebhookStatusChange(ev?.raw_payload, ev?.event_time || ev?.created_at, ev))
      .filter(Boolean)
  ), [singleTimelineRows]);
  const singleAvailableWebhookStatuses = useMemo(() => {
    const uniq = new Set(singleWebhookStatusRows.map((r) => formatShipmentStatusLabel(r.latestStatus || '')).filter(Boolean));
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [singleWebhookStatusRows]);
  const [singleWebhookSearch, setSingleWebhookSearch] = useState('');
  const [singleWebhookStatusFilter, setSingleWebhookStatusFilter] = useState('all');
  const [singleWebhookFromDate, setSingleWebhookFromDate] = useState('');
  const [singleWebhookToDate, setSingleWebhookToDate] = useState('');
  const [singleWebhookSortDir, setSingleWebhookSortDir] = useState('desc');
  const [singleSelectedWebhookRowId, setSingleSelectedWebhookRowId] = useState('');
  const filteredSingleWebhookRows = useMemo(() => {
    const q = singleWebhookSearch.trim().toLowerCase();
    const fromMs = singleWebhookFromDate ? Date.parse(`${singleWebhookFromDate}T00:00:00`) : Number.NaN;
    const toMs = singleWebhookToDate ? Date.parse(`${singleWebhookToDate}T23:59:59`) : Number.NaN;
    const rows = singleWebhookStatusRows.filter((row) => {
      if (singleWebhookStatusFilter !== 'all' && formatShipmentStatusLabel(row.latestStatus || '') !== singleWebhookStatusFilter) return false;
      if (Number.isFinite(fromMs) && (!Number.isFinite(row.eventMs) || row.eventMs < fromMs)) return false;
      if (Number.isFinite(toMs) && (!Number.isFinite(row.eventMs) || row.eventMs > toMs)) return false;
      if (!q) return true;
      const hay = [
        row.latestStatus,
        row.ndrReason,
        row.carrierName,
        row.trackingNumber,
        row.originalEdd,
        row.updatedEdd,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
    rows.sort((a, b) => {
      const av = Number.isFinite(a.eventMs) ? a.eventMs : 0;
      const bv = Number.isFinite(b.eventMs) ? b.eventMs : 0;
      return singleWebhookSortDir === 'asc' ? av - bv : bv - av;
    });
    return rows;
  }, [singleWebhookFromDate, singleWebhookSearch, singleWebhookSortDir, singleWebhookStatusFilter, singleWebhookStatusRows, singleWebhookToDate]);
  const singleSelectedWebhookRow = useMemo(
    () => filteredSingleWebhookRows.find((r) => r.eventId === singleSelectedWebhookRowId) || null,
    [filteredSingleWebhookRows, singleSelectedWebhookRowId],
  );
  const singleWebhookSourceSummary = useMemo(() => {
    const summary = { webhook: 0, cancelApi: 0 };
    for (const ev of singleTimelineRows) {
      const src = String(ev?.source || '').toLowerCase();
      if (src === 'webhook') summary.webhook += 1;
      if (src === 'cancel_api') summary.cancelApi += 1;
    }
    return summary;
  }, [singleTimelineRows]);
  const singleWebhookRowsPerPage = 12;
  const singleWebhookTotalPages = Math.max(1, Math.ceil(filteredSingleWebhookRows.length / singleWebhookRowsPerPage));
  const pagedSingleWebhookRows = useMemo(() => {
    const start = (singleWebhookPage - 1) * singleWebhookRowsPerPage;
    return filteredSingleWebhookRows.slice(start, start + singleWebhookRowsPerPage);
  }, [filteredSingleWebhookRows, singleWebhookPage]);
  const singleSelectedWebhookRowIdx = useMemo(
    () => filteredSingleWebhookRows.findIndex((r) => r.eventId === singleSelectedWebhookRowId),
    [filteredSingleWebhookRows, singleSelectedWebhookRowId],
  );
  const singlePreviousWebhookRow = useMemo(
    () => (singleSelectedWebhookRowIdx >= 0 ? filteredSingleWebhookRows[singleSelectedWebhookRowIdx + 1] || null : null),
    [filteredSingleWebhookRows, singleSelectedWebhookRowIdx],
  );
  const singleRowSlaRisk = (row) => {
    const original = row?.originalEdd ? Date.parse(row.originalEdd) : Number.NaN;
    const updated = row?.updatedEdd ? Date.parse(row.updatedEdd) : Number.NaN;
    if (!Number.isFinite(original) || !Number.isFinite(updated)) return { label: '—', tone: 'slate' };
    const diffDays = Math.round((updated - original) / 86400000);
    if (diffDays <= 0) return { label: 'On track', tone: 'emerald' };
    if (diffDays <= 1) return { label: `+${diffDays}d minor slip`, tone: 'amber' };
    return { label: `+${diffDays}d delay`, tone: 'red' };
  };
  const exportSingleWebhookCsv = () => {
    if (!filteredSingleWebhookRows.length) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['event_timestamp', 'latest_status', 'ndr_reason', 'original_edd', 'updated_edd', 'carrier_name', 'tracking_number', 'source', 'sla_risk'];
    const lines = filteredSingleWebhookRows.map((r) => {
      const risk = singleRowSlaRisk(r).label;
      return [
        r.eventTimestamp,
        formatShipmentStatusLabel(r.latestStatus || ''),
        r.ndrReason || '',
        r.originalEdd || '',
        r.updatedEdd || '',
        r.carrierName || '',
        r.trackingNumber || '',
        r.source || '',
        risk,
      ].map(esc).join(',');
    });
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `single-shipment-webhook-updates-${orderId || 'order'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  useEffect(() => {
    if (singleWebhookFromDate && singleWebhookToDate && singleWebhookFromDate > singleWebhookToDate) {
      setSingleWebhookToDate(singleWebhookFromDate);
    }
  }, [singleWebhookFromDate, singleWebhookToDate]);
  useEffect(() => {
    setSingleWebhookPage(1);
  }, [singleWebhookSearch, singleWebhookStatusFilter, singleWebhookFromDate, singleWebhookToDate, singleWebhookSortDir]);
  useEffect(() => {
    if (!showSingleWebhookInfoModal) {
      setSingleWebhookLive(false);
    }
  }, [showSingleWebhookInfoModal]);
  const singleTimelineDisplayRows = useMemo(() => {
    const rows = [...singleTimelineRows];
    const collapsed = [];
    for (const ev of rows) {
      const status = formatShipmentStatusLabel(ev?.activity || 'Status updated');
      const src = String(ev?.source || '').toLowerCase();
      const location = resolveShipmentEventLocation(ev);
      const prev = collapsed[collapsed.length - 1];
      if (prev && prev.status === status && prev.source === src && prev.location === location) {
        continue;
      }
      const ts = String(ev?.event_time || ev?.created_at || '').trim();
      const dayKey = ts ? new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown date';
      collapsed.push({
        id: ev?.id,
        ts,
        dayKey,
        source: src,
        status,
        location,
        remark: String(ev?.carrier_remark || '').trim(),
      });
    }
    return collapsed;
  }, [singleTimelineRows]);
  const singleTimelineStageProgress = useMemo(() => {
    const stages = ['confirmed', 'ready_pickup', 'transit', 'delivered'];
    let highest = 0;
    for (const row of singleTimelineDisplayRows) {
      const k = statusStageKey(row.status);
      const i = stages.indexOf(k);
      if (i > highest) highest = i;
    }
    return stages.map((k, i) => ({
      key: k,
      label: k === 'ready_pickup' ? 'Ready for Pickup' : k === 'transit' ? 'Transit' : k === 'delivered' ? 'Delivered' : 'Confirmed',
      done: i <= highest,
    }));
  }, [singleTimelineDisplayRows]);
  useEffect(() => {
    if (!showSingleWebhookInfoModal || !singleWebhookLive) return undefined;
    const timer = setInterval(() => {
      void syncVelocityTrackingFromApi();
    }, 15000);
    return () => clearInterval(timer);
  }, [showSingleWebhookInfoModal, singleWebhookLive]);
  useEffect(() => {
    if (!showSingleWebhookInfoModal) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowSingleWebhookInfoModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSingleWebhookInfoModal]);
  useEffect(() => {
    if (singleWebhookPage > singleWebhookTotalPages) setSingleWebhookPage(singleWebhookTotalPages);
  }, [singleWebhookPage, singleWebhookTotalPages]);

  return (
    <section className="bg-white rounded-lg p-4 lg:p-5 border border-outline-variant/25 relative overflow-hidden">
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
            <span className={`font-semibold ${velEnvHealth.velocity_api_credentials_configured ? 'text-emerald-700' : 'text-amber-800'}`}>
              Velocity API: {velEnvHealth.velocity_api_credentials_configured ? 'secrets present' : 'secrets missing'}
            </span>
          </div>
          {velEnvHealth.velocity_probe && (
            <div className="mt-1 pt-2 border-t border-outline-variant/20 text-[10px] text-gray-800 space-y-1.5">
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
            A previous shipping order exists for this order: <span className="font-mono">{String(latestHistoricalVelocityOrder?.shipment_id || '—')}</span>
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

      {showSingleVelocityControlCenter && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Shipment Control Center</p>
              <p className="text-lg font-bold text-slate-900">Shipment tracking and actions</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Shipment Status</p>
              <p className="text-sm font-bold text-slate-900 mt-1">{formatShipmentStatusLabel(singleVelocityStatusRaw)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Courier Details</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{singleVelocityCarrier || '—'}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tracking ID (AWB)</p>
              <p className="text-sm font-mono text-slate-900 mt-1 break-all">{singleVelocityAwb}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <button
                type="button"
                onClick={() => setShowSingleWebhookInfoModal(true)}
                className="w-full text-left"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">More Info</p>
                <p className="text-sm font-bold text-slate-900 mt-1">See more updates &amp; info</p>
                <p className="text-[10px] text-slate-500 mt-1">{singleWebhookStatusRows.length} status change event{singleWebhookStatusRows.length !== 1 ? 's' : ''}</p>
              </button>
            </div>
          </div>
          {singleShipmentLot && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs font-bold text-slate-900 mb-2">Shipment Lot Status Panel</p>
              <div className="overflow-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[520px] text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-[10px] uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-3 py-2 font-semibold">Lot</th>
                      <th className="px-3 py-2 font-semibold">Shipment Status</th>
                      <th className="px-3 py-2 font-semibold">AWB</th>
                      <th className="px-3 py-2 font-semibold">Carrier</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-xs text-slate-700">
                      <td className="px-3 py-2.5">{singleShipmentLot.label || `Shipment ${singleShipmentLot.lot_index || 1}`}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-900">{formatShipmentStatusLabel(singleVelocityStatusRaw)}</td>
                      <td className="px-3 py-2.5 font-mono">{singleVelocityAwb || '—'}</td>
                      <td className="px-3 py-2.5">{singleVelocityCarrier || '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={cancelVelocityPickup}
              disabled={cancellingPickup || printingLabel || syncingVelTrack || !canCancelSingleCourier}
              variant="outlined"
              color="error"
              size="small"
            >
              {cancellingPickup ? 'Cancelling...' : 'Cancel courier'}
            </Button>
            <Button
              type="button"
              variant="outlined"
              color="inherit"
              size="small"
              onClick={printShippingLabel}
              disabled={printingLabel || syncingVelTrack || cancellingPickup || !singleVelocityAwb}
            >
              {printingLabel ? 'Fetching label...' : 'Print label'}
            </Button>
            {singleVelocityTrackingUrl && (
              <a href={singleVelocityTrackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800">
                Tracking page link
              </a>
            )}
          </div>
          {!canCancelSingleCourier && (
            <p className="text-[11px] text-slate-500">
              Cancel courier is disabled because pickup has already started for this shipment.
            </p>
          )}
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold text-slate-900 mb-1">Tracking timeline/history for this specific shipment</p>
            <p className="text-[11px] text-slate-500 mb-3">Showing webhook and cancellation updates only.</p>
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {singleTimelineStageProgress.map((s) => (
                  <span key={s.key} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.done ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                    <span className="material-symbols-outlined text-[11px]">{s.done ? 'check_circle' : 'radio_button_unchecked'}</span>
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
            {singleTimelineLoading ? (
              <p className="text-xs text-slate-500">Loading timeline...</p>
            ) : singleTimelineDisplayRows.length === 0 ? (
              <p className="text-xs text-slate-500">No tracking history yet for this shipment.</p>
            ) : (
              <div className="max-h-80 overflow-auto pr-1">
                {singleTimelineDisplayRows.map((ev, idx) => {
                  const isWebhook = ev.source === 'webhook';
                  const prevDay = idx > 0 ? singleTimelineDisplayRows[idx - 1].dayKey : null;
                  const showDay = prevDay !== ev.dayKey;
                  return (
                    <div key={ev.id} className="relative">
                      {showDay && (
                        <div className="sticky top-0 z-10 mb-2 bg-white/95 backdrop-blur px-2 py-1 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-500 inline-flex">
                          {ev.dayKey}
                        </div>
                      )}
                      <div className="relative pl-9 pb-4 last:pb-0">
                      <div className="absolute left-3 top-6 bottom-0 w-px bg-slate-200 last:hidden" />
                      <div className={`absolute left-0.5 top-1 h-5 w-5 rounded-full border flex items-center justify-center ${isWebhook ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        <span className="material-symbols-outlined text-[12px]">{isWebhook ? 'radio_button_checked' : 'block'}</span>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(2,6,23,0.04)]">
                        <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{ev.status}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isWebhook ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                          {isWebhook ? 'Webhook' : 'Cancelled'}
                        </span>
                      </div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {ev.location && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Location</p>
                            <p className="text-[11px] text-slate-700 mt-1">{ev.location}</p>
                          </div>
                        )}
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Event timestamp</p>
                          <p className="text-[11px] text-slate-700 mt-1">{ev.ts ? new Date(ev.ts).toLocaleString('en-IN') : '—'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Courier remarks</p>
                          <p className="text-[11px] text-slate-700 mt-1">{ev.remark || 'No remarks'}</p>
                        </div>
                      </div>
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {showSingleWebhookInfoModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="More info webhook updates">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setShowSingleWebhookInfoModal(false)} />
          <div className="relative w-full max-w-6xl rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">More Info</p>
                <h3 className="text-lg font-bold text-slate-900">Shipment Webhook Updates</h3>
              </div>
              <button type="button" onClick={() => setShowSingleWebhookInfoModal(false)} className="w-8 h-8 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <div className="p-5">
              {singleWebhookStatusRows.length === 0 ? (
                <p className="text-sm text-slate-500">No webhook status_change payload rows found yet for this shipment.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500 font-semibold">Total rows</p>
                      <p className="text-sm font-bold text-slate-900 mt-1">{singleWebhookStatusRows.length}</p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-blue-600 font-semibold">Webhook events</p>
                      <p className="text-sm font-bold text-blue-900 mt-1">{singleWebhookSourceSummary.webhook}</p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-red-600 font-semibold">Cancel API events</p>
                      <p className="text-sm font-bold text-red-900 mt-1">{singleWebhookSourceSummary.cancelApi}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSingleWebhookLive((v) => !v)}
                        className={`px-2.5 py-1.5 text-[11px] rounded-lg border font-semibold ${singleWebhookLive ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600'}`}
                      >
                        {singleWebhookLive ? 'Live refresh: ON' : 'Live refresh: OFF'}
                      </button>
                      <button
                        type="button"
                        onClick={exportSingleWebhookCsv}
                        className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
                      >
                        Export CSV
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">Page {singleWebhookPage} of {singleWebhookTotalPages}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                    <input
                      type="text"
                      value={singleWebhookSearch}
                      onChange={(e) => setSingleWebhookSearch(e.target.value)}
                      placeholder="Search status/carrier/tracking"
                      className="md:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                    <select
                      value={singleWebhookStatusFilter}
                      onChange={(e) => setSingleWebhookStatusFilter(e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    >
                      <option value="all">All statuses</option>
                      {singleAvailableWebhookStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input
                      type="date"
                      value={singleWebhookFromDate}
                      onChange={(e) => setSingleWebhookFromDate(e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={singleWebhookToDate}
                        onChange={(e) => setSingleWebhookToDate(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setSingleWebhookSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                        className="px-2.5 py-2 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
                        title="Toggle date sort"
                      >
                        {singleWebhookSortDir === 'desc' ? 'Newest' : 'Oldest'}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[980px] text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
                        <th className="px-3 py-2 font-semibold">Event Timestamp</th>
                        <th className="px-3 py-2 font-semibold">Latest Shipment Status</th>
                        <th className="px-3 py-2 font-semibold">NDR Reason</th>
                        <th className="px-3 py-2 font-semibold">Original / Promised Delivery Date</th>
                        <th className="px-3 py-2 font-semibold">Updated EDD</th>
                        <th className="px-3 py-2 font-semibold">Carrier Name</th>
                        <th className="px-3 py-2 font-semibold">Tracking Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedSingleWebhookRows.map((row, idx) => (
                        <tr
                          key={`single-webhook-row-${idx}`}
                          onClick={() => setSingleSelectedWebhookRowId(row.eventId || `idx-${idx}`)}
                          className="border-b border-slate-100 last:border-0 text-xs text-slate-700 cursor-pointer hover:bg-slate-50"
                        >
                          <td className="px-3 py-2.5">{row.eventTimestamp || '—'}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{formatShipmentStatusLabel(row.latestStatus || '—')}</td>
                          <td className="px-3 py-2.5">{row.ndrReason || '—'}</td>
                          <td className="px-3 py-2.5">{row.originalEdd || '—'}</td>
                          <td className="px-3 py-2.5">
                            <div>{row.updatedEdd || '—'}</div>
                            {(() => {
                              const risk = singleRowSlaRisk(row);
                              return risk.label !== '—' ? (
                                <span className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-[10px] border ${
                                  risk.tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : risk.tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700'
                                      : 'bg-red-50 border-red-200 text-red-700'
                                }`}>{risk.label}</span>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-3 py-2.5">{row.carrierName || '—'}</td>
                          <td className="px-3 py-2.5 font-mono">{row.trackingNumber || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={singleWebhookPage <= 1}
                    onClick={() => setSingleWebhookPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={singleWebhookPage >= singleWebhookTotalPages}
                    onClick={() => setSingleWebhookPage((p) => Math.min(singleWebhookTotalPages, p + 1))}
                    className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
                {singleSelectedWebhookRow && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500 font-semibold mb-1">Selected row payload</p>
                    {singlePreviousWebhookRow && (
                      <p className="text-[11px] text-slate-600 mb-2">
                        Diff from previous: status <span className="font-semibold">{formatShipmentStatusLabel(singlePreviousWebhookRow.latestStatus || '—')}</span> {'->'} <span className="font-semibold">{formatShipmentStatusLabel(singleSelectedWebhookRow.latestStatus || '—')}</span>
                      </p>
                    )}
                    <pre className="text-[11px] text-slate-700 overflow-auto max-h-48 whitespace-pre-wrap">
{JSON.stringify(singleSelectedWebhookRow.rawPayload || {}, null, 2)}
                    </pre>
                  </div>
                )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showSingleChosenBanner && (
        <div className="rounded-lg border border-outline-variant/25 bg-surface-container-low p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[20px]">inventory</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Single shipment selected</p>
              <p className="text-xs text-gray-900-variant mt-0.5">Changed your mind? You can switch to multiple shipments — nothing has been booked yet.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetFulfillmentMode}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-secondary/40 bg-white text-secondary text-xs font-bold hover:bg-secondary/5 transition-colors shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
            Change mode
          </button>
        </div>
      )}

      {showMultiChosenBanner && (
        <div className="rounded-lg border border-secondary/25 bg-secondary/5 p-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-secondary/15 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-secondary text-[20px]">splitscreen</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900">Multiple shipments selected</p>
              <p className="text-xs text-gray-900-variant mt-0.5">Changed your mind? You can switch to single shipment — nothing has been booked yet.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={revertLots}
            disabled={revertingLots}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant/40 bg-white text-gray-900 text-xs font-bold hover:bg-surface-container transition-colors shrink-0 whitespace-nowrap disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
            {revertingLots ? 'Switching…' : 'Change mode'}
          </button>
        </div>
      )}

      {showFulfillmentRouting && (
        <div className="rounded-lg border border-outline-variant/25 bg-white p-4 space-y-3 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-[22px]">warehouse</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-900-variant mb-1">Fulfillment routing</p>
              <p className="text-sm font-bold text-gray-900 leading-snug">How should this order ship?</p>
              <p className="text-xs text-gray-900-variant mt-1.5 leading-relaxed">
                <strong className="text-gray-900">Single shipment</strong> — one package from one location.{' '}
                <strong className="text-gray-900">Multiple shipments</strong> — split into separate lots, each booked independently.
              </p>
            </div>
          </div>
          {lotBuilderError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{lotBuilderError}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outlined" color="primary" onClick={confirmLegacySingleFulfillment} sx={{ flex: 1 }}>
              <span className="material-symbols-outlined text-base mr-1">inventory</span>
              Single shipment
            </Button>
            <Button
              variant="contained"
              color="primary"
              disabled={lotBuilderLoading}
              onClick={openLotBuilder}
              sx={{ flex: 1 }}
            >
              {lotBuilderLoading
                ? <><span className="material-symbols-outlined animate-spin text-base mr-1">progress_activity</span>Opening…</>
                : <><span className="material-symbols-outlined text-base mr-1">splitscreen</span>Multiple shipments</>
              }
            </Button>
          </div>
        </div>
      )}

      {/* ── Lot Builder — inline manual assignment UI ── */}
      {lotBuilderOpen && (
        <div className="rounded-lg border border-secondary/30 bg-white mb-4 overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 bg-secondary/5 border-b border-secondary/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-secondary">Lot Builder</p>
              <p className="text-sm font-bold text-gray-900">Assign every product to a shipment lot</p>
              <p className="text-xs text-gray-900-variant mt-0.5">Each product must be in exactly one lot. Bundle products are listed individually.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={revertLots}
                disabled={revertingLots}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-gray-900 text-xs font-bold hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
                {revertingLots ? 'Switching…' : 'Change mode'}
              </button>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {lotBuilderError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{lotBuilderError}</p>
            )}

            {/* Unassigned pool */}
            {(() => {
              const unassigned = lotBuilderItems.filter((item) => !lotAssignments[item.id]);
              if (unassigned.length === 0) return null;
              return (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">warning</span>
                    Unassigned ({unassigned.length})
                  </p>
                  <div className="space-y-1.5">
                    {unassigned.map((item) => (
                      <div key={item.id} className="flex items-start gap-2.5 bg-white rounded-xl px-3 py-2.5 border border-amber-100 shadow-sm">
                        <span className="material-symbols-outlined text-amber-400 text-[18px] shrink-0 mt-0.5">package_2</span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-gray-900">{item.name}</span>
                            <span className="text-[10px] text-gray-900-variant">×{item.quantity}</span>
                          </div>
                          {item.bundleParent && (
                            <span className="text-[9px] text-secondary font-bold uppercase tracking-wide block">from {item.bundleParent}</span>
                          )}
                          <WarehousePills warehouses={item.warehouses} />
                        </div>
                        <div className="flex gap-1 shrink-0 mt-0.5">
                          {lotBuilderLots.map((lot) => (
                            <button
                              key={lot.id}
                              type="button"
                              onClick={() => assignItemToLot(item.id, lot.id)}
                              className="px-2.5 py-1.5 rounded-lg bg-primary text-on-primary text-[10px] font-bold hover:bg-primary/90 transition-colors"
                            >
                              → L{lot.lot_index}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Lot columns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lotBuilderLots.map((lot) => {
                const assignedItems = lotBuilderItems.filter((item) => lotAssignments[item.id] === lot.id);
                const canRemove = lot.lot_index > 2;
                return (
                  <div key={lot.id} className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
                    <div className="px-3 py-2 bg-primary/5 border-b border-outline-variant/20 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wider text-primary">Shipment Lot {lot.lot_index}</p>
                        <p className="text-xs font-bold text-gray-900">{lot.label}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-gray-900-variant hidden sm:block">{lot.velocity_external_code}</span>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => removeLotFromBuilder(lot.id)}
                            title="Remove this lot"
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-2 min-h-[80px] space-y-1.5">
                      {assignedItems.length === 0 ? (
                        <p className="text-[11px] text-gray-900-variant/50 text-center py-4">No products assigned</p>
                      ) : (
                        assignedItems.map((item) => (
                          <div key={item.id} className="flex items-start gap-2 bg-white rounded-lg px-2.5 py-2 border border-outline-variant/20 group">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="w-7 h-7 rounded-md object-cover shrink-0 mt-0.5" />
                            ) : (
                              <span className="material-symbols-outlined text-[16px] text-gray-900-variant shrink-0 mt-0.5">package_2</span>
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold text-gray-900 truncate">{item.name}</span>
                                <span className="text-[10px] text-gray-900-variant shrink-0">×{item.quantity}</span>
                              </div>
                              {item.bundleParent && (
                                <span className="text-[9px] text-secondary font-bold uppercase tracking-wide block">from {item.bundleParent}</span>
                              )}
                              <WarehousePills warehouses={item.warehouses} />
                            </div>
                            <button
                              type="button"
                              onClick={() => unassignItem(item.id)}
                              title="Remove from this lot"
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-red-400 hover:text-red-600 mt-0.5"
                            >
                              <span className="material-symbols-outlined text-[15px]">close</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add lot + Proceed row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-outline-variant/15">
              <button
                type="button"
                onClick={addLotToBuilder}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-dashed border-primary/40 text-primary text-xs font-bold hover:bg-primary/5 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add lot
              </button>
              <div className="flex-1" />
              {!allItemsAssigned && (
                <p className="text-[11px] text-amber-700 font-semibold text-center sm:text-right">
                  Assign all products before proceeding
                </p>
              )}
              <Button
                variant="contained"
                color="primary"
                disabled={!allItemsAssigned || lotBuilderSaving}
                onClick={commitLotAssignments}
                sx={{ minWidth: 140 }}
              >
                {lotBuilderSaving
                  ? <><span className="material-symbols-outlined animate-spin text-base mr-1">progress_activity</span>Saving…</>
                  : <><span className="material-symbols-outlined text-base mr-1">check_circle</span>Proceed</>
                }
              </Button>
            </div>
          </div>
        </div>
      )}

      {hideGlobalVelocityForLots && !lotBuilderOpen && (
        <div className="space-y-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-900 uppercase tracking-wider">Fulfillment by shipment lot</p>
              <p className="text-[11px] text-gray-900-variant mt-0.5">Each lot ships from one warehouse. Book Velocity or enter tracking separately per lot below.</p>
            </div>
            <button
              type="button"
              onClick={revertLots}
              disabled={revertingLots}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant/40 bg-white text-gray-900 text-xs font-bold hover:bg-surface-container transition-colors disabled:opacity-50 shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
              {revertingLots ? 'Switching…' : 'Change mode'}
            </button>
          </div>
          {shipmentLotsLoading && shipmentLots.length === 0 && (
            <div className="rounded-lg border border-outline-variant/25 bg-white p-3 flex items-center gap-2.5">
              <span className="material-symbols-outlined animate-spin text-secondary text-[18px]">progress_activity</span>
              <p className="text-xs text-gray-900-variant">Loading shipment lots...</p>
            </div>
          )}
          {!shipmentLotsLoading && shipmentLots.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs text-amber-900">
                No shipment lots found yet. Use "Change mode" to rebuild routing if needed.
              </p>
            </div>
          )}
          {shipmentLots.map((lot) => (
            <ShipmentLotFulfillmentCard
              key={lot.id}
              lot={lot}
              orderId={orderId}
              allPickupLocations={pickupLocations}
              onRefresh={onRefresh}
              onNotice={onNotice}
              onError={onError}
            />
          ))}
        </div>
      )}

      {/* Mode tabs — locked after Velocity order creation */}
      {!alreadyShippedViaVelocity && order.status === 'processing' && !shouldHideManualMethod && !hideGlobalVelocityForLots && !lotBuilderOpen && !showFulfillmentRouting && (
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
      {(shippingMode === 'manual' || order.status !== 'processing') &&
        !shouldHideManualMethod &&
        !lotBuilderOpen &&
        !showFulfillmentRouting &&
        !(hideGlobalVelocityForLots && order.status === 'processing') && (
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
      {shippingMode === 'velocity' &&
        !alreadyShippedViaVelocity &&
        order.status === 'processing' &&
        !hideGlobalVelocityForLots &&
        !lotBuilderOpen &&
        !showFulfillmentRouting && (
        <div className="space-y-5">

          {velocityMethodLocked && null}

          <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low/50 p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-900-variant mb-3">Fulfillment steps</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'dims', label: 'Package & pickup', done: velocityDimsValid() && velocityPickupReady() },
                { id: 'svc', label: 'Check serviceability', done: !!velServiceability },
                {
                  id: 'fo',
                  label: 'Shipment order only',
                  done: order?.fulfillment_mode === 'multi_shipment'
                    ? !!(pendingVelocitySidFromLot || velShipmentId)
                    : !!(pendingVelocitySid || velShipmentId),
                },
                {
                  id: 'awb',
                  label: 'AWB & courier',
                  done: order?.fulfillment_mode === 'multi_shipment'
                    ? velStep === 'done' || !!(activeLot?.tracking_number || '').trim()
                    : velStep === 'done' || !!order.tracking_number,
                },
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
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 md:p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-900/90 mb-1">Fulfillment in progress</p>
                <p className="text-sm font-bold text-blue-950">
                  Shipment ID{' '}
                  <span className="font-mono">{velShipmentId || pendingVelocitySid}</span>
                </p>
                <p className="text-xs text-blue-900/85 mt-1 leading-relaxed max-w-2xl">
                  Shipment order is already created on Velocity. Continue with courier assignment to generate the AWB and label.
                  Use <strong> Reinitiate shipping </strong> if you need to restart this workflow while keeping historical Velocity records.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 shrink-0 w-full sm:w-auto">
                <Button
                  size="small"
                  variant="outlined"
                  color="primary"
                  onClick={trackVelocityShipment}
                  disabled={trackingVelocity || !order.tracking_number}
                  title={!order.tracking_number ? 'Available after a courier assigns an AWB' : 'Pull latest tracking from Velocity'}
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
            <div className="rounded-lg border border-outline-variant/30 bg-white p-3 lg:p-4">
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
                        title={pendingVelocitySid ? 'Use Reinitiate shipping to change dimensions.' : ''}
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
                    title={pendingVelocitySid ? 'Use Reinitiate shipping to change pickup.' : ''}
                    className={`w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary ${pendingVelocitySid ? 'opacity-75 cursor-not-allowed' : ''}`}
                  >
                    {velocityPickupOptions.length === 0 && (
                      <option value="">No warehouses mapped for these products</option>
                    )}
                    {velocityPickupOptions.map((loc) => (
                      <option key={loc.id} value={loc.id} disabled={!loc.velocity_warehouse_id}>
                        {loc.warehouse_name} · PIN {loc.pincode}
                        {loc.velocity_warehouse_id ? ` · ${loc.velocity_warehouse_id}` : ' (not synced to Velocity)'}
                      </option>
                    ))}
                  </select>
                  {null}
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Serviceability (hidden while pending order exists — avoids duplicate SHI) */}
          {velStep === 'idle' && !pendingVelocitySid && (
            <div className="rounded-lg border border-outline-variant/30 bg-white p-3 lg:p-4">
              <p className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">2</span>
                Check serviceability
              </p>
              {null}
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
            <div className="rounded-lg border border-outline-variant/30 bg-white p-3 lg:p-4 flex items-center gap-3">
              <span className="material-symbols-outlined animate-spin text-gray-900 text-xl">progress_activity</span>
              <p className="text-sm text-gray-900-variant">Checking serviceability with Velocity Shipping...</p>
            </div>
          )}

          {velStep === 'error' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
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
              {null}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-emerald-900">Route is serviceable</p>
                    <p className="text-xs text-emerald-800 mt-1">
                      {serviceabilitySummary?.pickupPincode || '—'} → {serviceabilitySummary?.customerPincode || '—'} · Zone {serviceabilitySummary?.zone || '—'} · {velServiceability.carriers?.length || 0} couriers
                    </p>
                  </div>
                  {serviceabilitySummary?.minCharge != null && serviceabilitySummary?.maxCharge != null && (
                    <div className="shrink-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-right">
                      <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Shipping fee range</p>
                      <p className="text-sm font-bold text-emerald-900">
                        {fmtInr(serviceabilitySummary.minCharge)} - {fmtInr(serviceabilitySummary.maxCharge)}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Pickup</p>
                    <p className="text-xs font-semibold text-gray-900 truncate">{serviceabilitySummary?.pickupLocation || '—'}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Pickup source</p>
                    <p className="text-xs font-semibold text-gray-900 capitalize">{serviceabilitySummary?.pickupSource || '—'}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Payment mode</p>
                    <p className="text-xs font-semibold text-gray-900">{serviceabilitySummary?.paymentMode || '—'}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Dead wt (g)</p>
                    <p className="text-xs font-semibold text-gray-900">{serviceabilitySummary?.deadWeight ?? '—'}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Volumetric (g)</p>
                    <p className="text-xs font-semibold text-gray-900">{serviceabilitySummary?.volumetricWeight ?? '—'}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Applicable wt (g)</p>
                    <p className="text-xs font-semibold text-gray-900">{serviceabilitySummary?.applicableWeight ?? '—'}</p>
                  </div>
                </div>
                {serviceabilitySummary?.ratesNote && (
                  <p className="text-[11px] text-emerald-800 mt-3">{serviceabilitySummary.ratesNote}</p>
                )}
              </div>

              {sortedVelocityCarriers.length > 0 && (
                <div className="rounded-lg border border-outline-variant/30 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <p className="text-[11px] font-bold text-gray-900 uppercase tracking-wider">
                      Available couriers &amp; quotes
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

              <div className="rounded-lg border border-outline-variant/30 bg-white p-3 lg:p-4 space-y-3">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">3</span>
                  Create shipment order <span className="text-xs font-normal text-gray-900-variant">(forward-order — no courier selection yet)</span>
                </p>
                {null}
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
            <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3 lg:p-4 space-y-4">
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
                  {null}
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
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
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
              {null}
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
    <div className="min-h-screen bg-surface pt-24 md:pt-28 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-3 pb-4 border-b border-outline-variant/15">
          <div className="flex items-start gap-4">
            <button onClick={onBack}
              className="mt-1 p-2 rounded-md bg-white hover:bg-slate-50 border border-outline-variant/25 group transition-colors">
              <span className="material-symbols-outlined text-gray-900 group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
            </button>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-secondary uppercase mb-1">
                Order Management · Admin
              </p>
              <h1 className="font-brand text-xl lg:text-2xl text-gray-900 tracking-tight">{getOrderDisplayId(order || { id: orderId })}</h1>
              {isPartialOrder && (
                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-orange-100 text-orange-800">
                  ⚡ Partial fulfillment
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-white border border-outline-variant/25 rounded-md px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-gray-900-variant">Status</span>
              <Badge
                label={(order?.status || '').replace(/_/g, ' ')}
                colorClass={STATUS_COLORS[order?.status] || STATUS_COLORS.pending}
              />
            </div>
            <div className="bg-white border border-outline-variant/25 rounded-md px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-gray-900-variant">Payment</span>
              <Badge
                label={(order?.payment_status || '').replace(/_/g, ' ')}
                colorClass={PAYMENT_COLORS[order?.payment_status] || PAYMENT_COLORS.pending}
              />
            </div>
            <button
              onClick={() => setShowLog((v) => !v)}
              className="px-3 py-1.5 rounded-md border border-outline-variant/25 text-xs font-semibold text-gray-900-variant hover:bg-slate-50 transition-colors">
              {showLog ? 'Hide' : 'Show'} Audit Log
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-4 px-3 py-2.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2.5">
            <span className="material-symbols-outlined text-emerald-600">check_circle</span>
            <p className="font-medium flex-1">{notice}</p>
            <button onClick={() => setNotice('')} className="text-emerald-600 hover:text-emerald-800 font-bold">✕</button>
          </div>
        )}
        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2.5">
            <span className="material-symbols-outlined text-red-600">error</span>
            <p className="font-medium flex-1">{error}</p>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800 font-bold">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
          <div className="lg:col-span-2 space-y-4">

            {/* Audit log */}
            {showLog && (
              <section className="bg-white rounded-lg p-4 border border-neutral-200">
                <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-gray-900 mb-3 flex items-center gap-2">
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
                items={items}
                onRefresh={load}
                onNotice={setNotice}
                onError={setError}
              />
            )}

            {/* Order items summary */}
            <section className="bg-white rounded-lg p-4 border border-neutral-200">
              <h2 className="text-xs uppercase tracking-[0.12em] font-semibold text-gray-900 mb-4 flex items-center gap-2">
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
    if (!loading && !isAdmin && !hasModule?.('orders')) navigate('/access-denied');
  }, [isAdmin, hasModule, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
      </div>
    );
  }

  if (!isAdmin && !hasModule?.('orders')) return <Navigate to="/access-denied" replace />;

  if (selectedId) {
    return <OrderDetail orderId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return <OrdersList onSelect={(id) => setSelectedId(id)} />;
}
