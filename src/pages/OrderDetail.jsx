import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isLikelyTrackingId, velocityTrackingPageUrl } from '../lib/velocityTracking';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { cartService } from '../services/cartService';
import AccountSidebar from '../components/AccountSidebar';
import { getOrderDisplayId } from '../lib/orderDisplay';
import { formatShipmentStatusForDisplay } from '../lib/velocityShipmentStatusCatalog';

/* ─────────────── constants ─────────────── */
const statusFlow = ['placed', 'processing', 'in_transit', 'delivered'];

const formatDate = (v) => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const formatTime = (v) => {
  if (!v) return '';
  return new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const cancelReasons = [
  'Change in plans',
  'Ordered by mistake',
  'Delivery timeline no longer works for me',
  'I found an alternative option',
  'Payment or checkout issue',
  'Other personal reason',
];

const REFUND_LABELS = {
  pending:      { label: 'Refund pending',                  badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  initiated:    { label: 'Refund initiated',                badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed:    { label: 'Refund completed',                badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed:       { label: 'Refund failed — contact support', badge: 'bg-red-50 text-red-700 border-red-200' },
  not_required: null,
};

const statusConfig = {
  placed:               { icon: 'receipt_long',    label: 'Order Placed',        color: '#78716c', bg: '#f5f5f4', pill: 'bg-stone-100 text-stone-600 border-stone-200' },
  processing:          { icon: 'autorenew',       label: 'Processing',          color: '#b45309', bg: '#fffbeb', pill: 'bg-amber-50 text-amber-700 border-amber-200' },
  shipped:             { icon: 'local_shipping',  label: 'Shipped',             color: '#1d4ed8', bg: '#eff6ff', pill: 'bg-blue-50 text-blue-700 border-blue-200' },
  partially_delivered: { icon: 'inventory_2',     label: 'Partially Delivered', color: '#2563eb', bg: '#eff6ff', pill: 'bg-blue-50 text-blue-700 border-blue-200' },
  partially_returning: { icon: 'undo',            label: 'Partially Returning', color: '#7c3aed', bg: '#f5f3ff', pill: 'bg-violet-50 text-violet-700 border-violet-200' },
  partially_failed:    { icon: 'error',           label: 'Partially Failed',    color: '#b91c1c', bg: '#fff1f2', pill: 'bg-rose-50 text-rose-700 border-rose-200' },
  in_transit:          { icon: 'local_shipping',  label: 'In Transit',          color: '#1d4ed8', bg: '#eff6ff', pill: 'bg-blue-50 text-blue-700 border-blue-200' },
  attention_required:  { icon: 'warning',         label: 'Attention Required',  color: '#c2410c', bg: '#fff7ed', pill: 'bg-orange-50 text-orange-700 border-orange-200' },
  failed:              { icon: 'cancel',          label: 'Failed',              color: '#b91c1c', bg: '#fff1f2', pill: 'bg-rose-50 text-rose-700 border-rose-200' },
  delivered:           { icon: 'check_circle',    label: 'Delivered',           color: '#047857', bg: '#ecfdf5', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled:           { icon: 'cancel',          label: 'Cancelled',           color: '#dc2626', bg: '#fef2f2', pill: 'bg-red-50 text-red-700 border-red-200' },
};

const stepIcons = {
  placed:     'receipt_long',
  processing: 'autorenew',
  in_transit: 'local_shipping',
  delivered:  'check_circle',
};

/** Short labels for the four-step customer journey (distinct from detailed status chips). */
const customerStepLabels = {
  placed: 'Placed',
  processing: 'Processing',
  in_transit: 'In transit',
  delivered: 'Delivered',
};

function getOrderHeroStyles(displayStatus, isCancelled) {
  if (isCancelled) {
    return {
      background: 'linear-gradient(145deg, #fef2f2 0%, #fefcf8 55%, #ffffff 100%)',
      borderColor: 'rgba(220, 38, 38, 0.22)',
    };
  }
  switch (displayStatus) {
    case 'delivered':
      return {
        background: 'linear-gradient(145deg, #ecfdf5 0%, #f5f9f6 50%, #ffffff 100%)',
        borderColor: 'rgba(4, 120, 87, 0.22)',
      };
    case 'partially_delivered':
      return {
        background: 'linear-gradient(145deg, #ecfdf5 0%, #fbfaf1 52%, #ffffff 100%)',
        borderColor: 'rgba(0, 74, 43, 0.18)',
      };
    case 'shipped':
    case 'partially_shipped':
    case 'in_transit':
      return {
        background: 'linear-gradient(145deg, #e4eee8 0%, #fbfaf1 48%, #ffffff 100%)',
        borderColor: 'rgba(0, 74, 43, 0.14)',
      };
    case 'processing':
      return {
        background: 'linear-gradient(145deg, #fff8ec 0%, #fbfaf1 52%, #ffffff 100%)',
        borderColor: 'rgba(129, 85, 0, 0.2)',
      };
    case 'partially_returning':
      return {
        background: 'linear-gradient(145deg, #f5f3ff 0%, #fbfaf1 55%, #ffffff 100%)',
        borderColor: 'rgba(124, 58, 237, 0.2)',
      };
    case 'partially_failed':
    case 'failed':
      return {
        background: 'linear-gradient(145deg, #fff1f2 0%, #fbfaf1 55%, #ffffff 100%)',
        borderColor: 'rgba(185, 28, 28, 0.2)',
      };
    case 'attention_required':
      return {
        background: 'linear-gradient(145deg, #fff7ed 0%, #fbfaf1 55%, #ffffff 100%)',
        borderColor: 'rgba(194, 65, 12, 0.22)',
      };
    default:
      return {
        background: 'linear-gradient(145deg, #f5f4eb 0%, #fbfaf1 45%, #ffffff 100%)',
        borderColor: 'rgba(0, 74, 43, 0.12)',
      };
  }
}

function resolveLatestCarrierStatus(order, trackingSnap) {
  const direct = order?.shipment_status;
  if (direct && String(direct).trim()) return formatShipmentStatusForDisplay(String(direct));
  if (!trackingSnap || typeof trackingSnap !== 'object') return '';
  const snap = trackingSnap;
  const fromTd = snap.tracking_data && typeof snap.tracking_data === 'object'
    ? snap.tracking_data.shipment_status : null;
  const top = snap.shipment_status;
  const merged = String(fromTd || top || '').trim();
  return merged ? formatShipmentStatusForDisplay(merged) : '';
}

function formatRelativeShort(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 45) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  return formatDate(iso);
}

function isVelocityShipmentLot(lot) {
  return Boolean(
    String(lot?.velocity_shipment_id || '').trim()
    || String(lot?.velocity_pending_shipment_id || '').trim(),
  );
}

function manualEstimatedArrivalFromLot(lot) {
  const m = lot?.velocity_fulfillment && typeof lot.velocity_fulfillment === 'object'
    ? lot.velocity_fulfillment
    : null;
  return m?.manual_estimated_arrival || null;
}

function resolveCustomerStatus(order) {
  if (!order) return 'placed';
  const cs = String(order.customer_status || '').toLowerCase();
  if (cs && cs !== 'unknown') return cs;
  const s = String(order.order_status || order.status || 'placed').toLowerCase();
  if (s === 'processed')          return 'processing';
  if (s === 'partially_approved') return 'processing';
  if (s === 'partially_shipped')  return 'shipped';
  if (s === 'partially_delivered') return 'partially_delivered';
  if (s === 'partially_returning') return 'partially_returning';
  if (s === 'partially_failed') return 'partially_failed';
  if (s === 'attention_required') return 'attention_required';
  if (s === 'in_transit') return 'in_transit';
  if (s === 'failed') return 'failed';
  if (s === 'rejected')           return 'cancelled';
  return s;
}

/* ─────────────── sub-components ─────────────── */

function SectionCard({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-outline-variant/12 bg-white shadow-[0_2px_24px_rgba(27,28,23,0.04)] ring-1 ring-primary/[0.04] transition-[box-shadow] duration-300 hover:shadow-[0_8px_32px_rgba(27,28,23,0.07)] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-outline-variant/10 bg-gradient-to-r from-surface-container-low/95 via-surface-container-lowest/85 to-surface-container-low/40">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-secondary/25 bg-secondary-fixed/35 text-secondary shadow-sm">
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </div>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/85 font-headline truncate">{title}</h2>
      </div>
      {badge}
    </div>
  );
}

function InfoRow({ label, value, mono, highlight }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-outline-variant/8 last:border-0">
      <span className="text-xs text-on-surface-variant/55 font-body shrink-0 tracking-wide">{label}</span>
      <span className={`text-xs text-right font-body leading-relaxed ${mono ? 'font-mono' : 'font-medium'} ${highlight ? 'text-secondary font-semibold' : 'text-on-surface'}`}>
        {value}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isFreshOrder = searchParams.get('placed') === '1';
  const freshPaymentMode = searchParams.get('payment') || '';
  const { user, loading: authLoading } = useAuth();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFullTracking, setShowFullTracking] = useState(false);
  const [expandedTrackingLots, setExpandedTrackingLots] = useState({});
  const [activeProduct, setActiveProduct] = useState(null);
  const [activeShipment, setActiveShipment] = useState(null);
  const [loadingProductShipment, setLoadingProductShipment] = useState(false);

  /* fetch + realtime */
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }

    const fetchOrder = async (silentRefetch = false) => {
      try {
        if (!silentRefetch) setLoading(true);
        const { data, error: e } = await supabase
          .from('orders')
          .select(`
            *,
            order_items(*, products(*), lots(*)),
            order_shipments(
              *,
              order_shipment_tracking_events(*)
            )
          `)
          .eq('id', id)
          .maybeSingle();
        if (e) throw e;
        if (!data) throw new Error('Order not found');
        setOrder(data);
      } catch (err) {
        setError(err.message || 'Unable to load order details');
      } finally {
        if (!silentRefetch) setLoading(false);
      }
    };

    fetchOrder(false);

    const ch = supabase
      .channel('customer-order-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => fetchOrder(true))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_shipments', filter: `order_id=eq.${id}` },
        () => fetchOrder(true),
      )
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [authLoading, id, navigate, user]);

  /* derived data */
  const displayStatus = useMemo(() => resolveCustomerStatus(order), [order]);
  const isCancelled   = displayStatus === 'cancelled';
  const sMeta         = statusConfig[displayStatus] || statusConfig.placed;

  const multiShipments = useMemo(() => {
    const raw = order?.order_shipments;
    if (!Array.isArray(raw)) return [];
    return [...raw].sort((a, b) => (a.lot_index || 0) - (b.lot_index || 0));
  }, [order?.order_shipments]);

  const showMultiShipmentTracking =
    order?.fulfillment_mode === 'multi_shipment' && multiShipments.length > 0;

  const timeline = useMemo(() => {
    if (isCancelled) return [];
    let cur = statusFlow.indexOf(displayStatus);
    if (displayStatus === 'shipped' || displayStatus === 'partially_shipped') cur = Math.max(cur, statusFlow.indexOf('in_transit'));
    if (displayStatus === 'partially_delivered') cur = Math.max(cur, statusFlow.indexOf('in_transit'));
    if (displayStatus === 'partially_returning' || displayStatus === 'partially_failed' || displayStatus === 'attention_required' || displayStatus === 'in_transit') {
      cur = Math.max(cur, statusFlow.indexOf('in_transit'));
    }
    if (displayStatus === 'failed') {
      cur = Math.max(cur, statusFlow.indexOf('processing'));
    }
    if (cur < 0) cur = 0;
    return statusFlow.map((s, i) => ({
      key: s,
      label: customerStepLabels[s] || (s.charAt(0).toUpperCase() + s.slice(1)),
      icon: stepIcons[s],
      done: i <= cur,
      active: i === cur,
      past: i < cur,
    }));
  }, [displayStatus, isCancelled]);

  const paymentMethod = String(order?.payment_method || order?.shipping_address?.payment_method || 'cod').toLowerCase();
  const isRazorpay    = paymentMethod.startsWith('razorpay') || paymentMethod === 'online';
  const payLabel      = isRazorpay ? 'Online · Razorpay' : 'Cash on Delivery';
  const payStatus     = String(order?.payment_status || 'pending').toLowerCase();
  const canCancel     = ['pending', 'placed'].includes(displayStatus);

  const summary = useMemo(() => {
    if (!order) return null;
    const sub = (order.order_items || []).reduce((a, i) => a + Number(i.price || 0) * Number(i.quantity || 0), 0);
    return { subtotal: sub, total: Number(order.total_amount || 0) };
  }, [order]);

  const rejectedItems = useMemo(() => {
    if (!order?.rejected_items) return [];
    try { return Array.isArray(order.rejected_items) ? order.rejected_items : JSON.parse(order.rejected_items); }
    catch { return []; }
  }, [order]);

  const rejectedKeys = useMemo(() => new Set(rejectedItems.map((r) => r.product_key).filter(Boolean)), [rejectedItems]);
  const isPartial    = order?.partial_fulfillment && rejectedItems.length > 0;
  const refundAmount = Number(order?.refund_amount || 0);
  const refundInfo   = order?.refund_status ? REFUND_LABELS[order.refund_status] : null;
  const normalizeShipmentStatus = (value) => String(value || '').toLowerCase().trim();
  const resolveItemStatus = (item) => {
    const s = normalizeShipmentStatus(item?.order_shipment?.carrier_shipment_status || item?.shipment_status || '');
    if (s.includes('cancel') || s.includes('reject') || s.includes('lost')) return 'cancelled';
    if (s.includes('deliver')) return 'delivered';
    if (item?.order_shipment_id || s) return 'shipped';
    if (String(order?.status || '').toLowerCase() === 'pending') return 'pending';
    return 'processing';
  };
  const itemStatusPill = (status) => {
    if (status === 'delivered') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'shipped') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (status === 'cancelled') return 'bg-red-50 text-red-700 border-red-200';
    if (status === 'pending') return 'bg-stone-100 text-stone-600 border-stone-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  /* actions */
  const handleCancel = async () => {
    if (!order || !canCancel || cancelling) return;
    if (!cancelReason) { alert('Please select a reason.'); return; }
    try {
      setCancelling(true);
      const { data, error: e } = await supabase.rpc('cancel_customer_order', { p_order_id: order.id, p_reason: cancelReason });
      if (e) throw e;
      const updated = data || { ...order, status: 'cancelled', order_status: 'cancelled', cancellation_reason: cancelReason };
      if (isRazorpay && payStatus === 'paid') {
        const { data: sd, error: se } = await supabase.auth.getSession();
        if (se || !sd?.session?.access_token) throw new Error('Session expired. Sign in again to request refund.');
        supabase.functions.setAuth(sd.session.access_token);
        const { data: rd, error: re } = await supabase.functions.invoke('refund-razorpay-cancelled-order', {
          body: { order_id: order.id, reason: cancelReason },
        });
        if (re) { console.warn('Refund error:', re); alert('Order cancelled but Razorpay refund failed. Contact support.'); }
        else if (rd) {
          if (rd.ok === false) alert('Order cancelled but Razorpay refund failed. Contact support.');
          updated.refund_status = rd.refund_status || updated.refund_status;
          updated.refund_amount = rd.refund_amount ?? updated.refund_amount;
          if (rd.refund_status === 'completed') updated.payment_status = 'refunded';
        }
      }
      setOrder(updated);
      setShowCancelModal(false);
    } catch (err) {
      alert(err.message || 'Unable to cancel right now.');
    } finally {
      setCancelling(false);
    }
  };

  const handleReorder = () => {
    if (!order?.order_items?.length) return;
    order.order_items.forEach((item) => {
      if (item.lots?.id || item.lot_id) {
        cartService.addToCart({
          id: item.lot_id || item.lots?.id, lot_id: item.lot_id || item.lots?.id,
          lot_name: item.lot_name || item.lots?.lot_name,
          price: Number(item.price || item.lots?.price || 0),
          image_url: item.lots?.image_url || '', description: item.lots?.description || '',
          lot_items: item.lot_snapshot || item.lots?.lot_items || [],
        }, item.quantity);
        return;
      }
      if (!item.products?.id) return;
      cartService.addToCart({
        id: item.products.id, name: item.products.name, price: item.price,
        image_url: item.products.image_url, category: item.products.category,
        description: item.products.description,
      }, item.quantity);
    });
    navigate('/cart');
  };

  const copyOrderId = () => {
    navigator.clipboard.writeText(getOrderDisplayId(order));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const toggleLotTrackingEvents = (lotId) => {
    setExpandedTrackingLots((prev) => ({ ...prev, [lotId]: !prev[lotId] }));
  };

  const openProductModal = async (item) => {
    setActiveProduct(item);
    setActiveShipment(null);
    if (!item?.order_shipment_id) return;
    try {
      setLoadingProductShipment(true);
      const { data, error: e } = await supabase
        .from('order_shipments')
        .select('id, tracking_number, carrier_shipment_status, velocity_tracking_url, velocity_carrier_name, velocity_fulfillment, label, shipment_provider, order_shipment_tracking_events(activity, location, carrier_remark, event_time, created_at)')
        .eq('id', item.order_shipment_id)
        .maybeSingle();
      if (e) throw e;
      setActiveShipment(data || null);
    } catch (err) {
      console.warn('Unable to load product shipment', err);
    } finally {
      setLoadingProductShipment(false);
    }
  };

  /* ── Loading State ── */
  if (loading) {
    return (
      <main className="pt-8 pb-20 md:pt-12 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
            <AccountSidebar />
            <section className="space-y-4">
              <div className="h-36 rounded-2xl border border-outline-variant/15 bg-white animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl border border-outline-variant/15 bg-white animate-pulse" />
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                <div className="lg:col-span-3 h-[420px] rounded-2xl border border-outline-variant/15 bg-white animate-pulse" />
                <div className="lg:col-span-2 h-[420px] rounded-2xl border border-outline-variant/15 bg-white animate-pulse" />
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  /* ── Error State ── */
  if (error || !order) {
    return (
      <main className="pt-8 pb-20 md:pt-12 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
            <AccountSidebar />
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-surface-container-low to-surface-container flex items-center justify-center border border-outline-variant/10">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/25">receipt_long</span>
              </div>
              <div>
                <h1 className="font-headline text-xl font-bold text-primary mb-1.5">Order not found</h1>
                <p className="text-sm text-on-surface-variant/60 font-body max-w-xs">{error || 'This order does not exist or you do not have permission to view it.'}</p>
              </div>
              <Link to="/orders" className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-headline font-semibold text-sm hover:bg-primary/90 hover:shadow-md active:scale-[0.98] transition-all">
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Back to Orders
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ── Derived billing data ── */
  const bb          = order.billing_breakdown || {};
  const bbSub       = Number(bb.subtotal || summary?.subtotal || 0);
  const deliveryFee = Number(bb.delivery_fee || 0);
  const shippingFee = Number(bb.shipping_fee ?? 0);
  const codFee      = Number(bb.cod_fee || 0);
  const couponDisc  = Number(bb.coupon_discount || order.discount_amount || 0);
  const couponCode  = bb.coupon_code || order.coupon_code || '';
  const freeShip    = bb.free_shipping_applied || false;
  const grandTotal  = Number(bb.total || summary?.total || 0);
  const addr        = order.shipping_address || {};
  const items       = order.order_items || [];

  const completedSteps = timeline.filter((t) => t.done).length;
  const progressPct    = timeline.length ? Math.round((completedSteps / timeline.length) * 100) : 0;

  const trackingSnap = order?.velocity_tracking_snapshot && typeof order.velocity_tracking_snapshot === 'object'
    ? order.velocity_tracking_snapshot : null;
  const trackActivities = Array.isArray(trackingSnap?.shipment_track_activities)
    ? trackingSnap.shipment_track_activities : [];

  const latestCarrierLabel  = resolveLatestCarrierStatus(order, trackingSnap);
  const hasTracking         = !!(order?.tracking_number);
  const visibleActivities   = showFullTracking ? trackActivities : trackActivities.slice(0, 5);

  /* ─────────────── RENDER ─────────────── */
  return (
    <main className="pt-8 pb-20 md:pt-12 md:pb-16 bg-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          <AccountSidebar />

          <section className="min-w-0 space-y-6 animate-fade-up">

            {/* ══ Breadcrumb + Order Header ══ */}
            <div>
              <Link
                to="/orders"
                className="inline-flex items-center gap-1.5 text-on-surface-variant/55 hover:text-secondary transition-colors group mb-5"
              >
                <span className="material-symbols-outlined text-[17px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                <span className="text-[13px] font-semibold font-body tracking-wide">My orders</span>
              </Link>

              {/* Hero header card */}
              <div
                className="rounded-2xl p-5 sm:p-7 border shadow-[0_8px_40px_rgba(0,74,43,0.06)]"
                style={getOrderHeroStyles(displayStatus, isCancelled)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                  <div className="flex items-start sm:items-center gap-4 sm:gap-5">
                    {/* Status icon circle */}
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md ring-1 ring-white/80"
                      style={{ background: sMeta.bg, color: sMeta.color }}
                    >
                      <span
                        className="material-symbols-outlined text-[22px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {sMeta.icon}
                      </span>
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5 mb-1">
                        <h1 className="font-headline text-xl sm:text-2xl font-bold text-primary tracking-tight">
                          Order {getOrderDisplayId(order)}
                        </h1>
                        <span
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold border tracking-wide ${sMeta.pill}`}
                        >
                          <span
                            className="material-symbols-outlined text-[11px]"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            {sMeta.icon}
                          </span>
                          {sMeta.label}
                        </span>
                      </div>
                      <p className="text-[13px] text-on-surface-variant/65 font-body leading-relaxed">
                        {formatDate(order.created_at)} · {formatTime(order.created_at)} · {payLabel}
                        {payStatus === 'paid' && <span className="text-emerald-700 font-semibold ml-1">· Paid</span>}
                        {payStatus === 'refunded' && <span className="text-primary font-semibold ml-1">· Refunded</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-1 shrink-0 sm:pl-4">
                    <p className="font-headline text-2xl sm:text-3xl font-bold text-primary tabular-nums">{money(grandTotal)}</p>
                    <p className="text-[11px] text-on-surface-variant/50 font-body tracking-wide">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>
            </div>

            {!isCancelled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-primary/10 bg-surface-container-low/80 px-4 py-3 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/50 font-semibold font-headline">Order ID</p>
                  <p className="text-xs font-mono text-primary mt-1.5 break-all font-medium">{getOrderDisplayId(order)}</p>
                </div>
                <div className="rounded-xl border border-secondary/20 bg-secondary-fixed/25 px-4 py-3 shadow-sm">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-secondary font-semibold font-headline">Shipment</p>
                  <p className="text-xs font-semibold text-on-secondary-container mt-1.5 font-headline">{hasTracking ? 'Tracking active' : 'Preparing dispatch'}</p>
                </div>
                <div className="rounded-xl border border-primary/12 bg-white px-4 py-3 shadow-sm ring-1 ring-primary/[0.04]">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/50 font-semibold font-headline">Payment</p>
                  <p className="text-xs font-semibold text-primary mt-1.5 font-headline">{payStatus === 'paid' ? 'Confirmed' : payStatus === 'refunded' ? 'Refunded' : 'Pending'}</p>
                </div>
              </div>
            )}

            {/* ══ Alert Banners ══ */}
            {isFreshOrder && !isCancelled && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-emerald-600 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                </div>
                <div>
                  <p className="text-sm font-semibold font-headline text-emerald-900">Order placed successfully!</p>
                  <p className="text-xs text-emerald-700/70 font-body mt-0.5">
                    {freshPaymentMode === 'online' ? 'Payment verified — your order is being prepared.' :
                     freshPaymentMode === 'pending' ? 'Complete your payment to begin processing.' :
                     'COD request received. Our team may call to confirm.'}
                  </p>
                </div>
              </div>
            )}

            {isCancelled && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-red-600 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold font-headline text-red-900">Order Cancelled</p>
                  {order.order_notes && <p className="text-xs text-red-700/80 font-body mt-0.5">{order.order_notes}</p>}
                  <p className="text-xs text-red-600/60 font-body mt-0.5">
                    {isRazorpay ? 'Your refund will be processed within 5–7 business days.' : 'No further action is required.'}
                  </p>
                  {refundInfo && (
                    <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${refundInfo.badge}`}>
                      {refundInfo.label}
                    </span>
                  )}
                </div>
              </div>
            )}

            {isPartial && !isCancelled && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-amber-600 text-[18px]">inventory</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold font-headline text-amber-900">Partial Fulfillment</p>
                  <p className="text-xs text-amber-700/70 font-body mt-0.5">
                    {rejectedItems.length} item{rejectedItems.length !== 1 ? 's' : ''} unavailable — remaining items are being processed.
                  </p>
                  {rejectedItems.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rejectedItems.map((r, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-semibold font-body">
                          ✕ {r.product_key || `Item ${i + 1}`}
                        </span>
                      ))}
                    </div>
                  )}
                  {isRazorpay && refundAmount > 0 && (
                    <span className="inline-flex mt-2 px-2.5 py-0.5 rounded-full bg-white border border-amber-200 text-[11px] font-semibold text-amber-800 font-body">
                      Partial refund: {money(refundAmount)}
                    </span>
                  )}
                  {refundInfo && (
                    <span className={`inline-flex items-center gap-1 ml-1 mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${refundInfo.badge}`}>
                      {refundInfo.label}
                    </span>
                  )}
                </div>
              </div>
            )}

            {order.order_notes && !isCancelled && !isPartial && (
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-primary/[0.03] border border-primary/10">
                <span className="material-symbols-outlined text-primary/40 text-[18px] mt-0.5">sticky_note_2</span>
                <p className="text-xs text-on-surface-variant italic font-body leading-relaxed">"{order.order_notes}"</p>
              </div>
            )}

            {/* ══ Order Progress Timeline ══ */}
            {!isCancelled && (
              <SectionCard>
                <SectionHeader icon="timeline" title="Your order journey" />
                <div className="p-5 sm:p-6">
                  {/* Stepper */}
                  <div className="relative flex items-start justify-between mb-8 px-0.5">
                    {/* Connector line */}
                    <div className="absolute top-[22px] left-[8%] right-[8%] h-[3px] bg-outline-variant/20 z-0 rounded-full">
                      <div
                        className="h-full bg-gradient-to-r from-secondary via-secondary to-primary/35 transition-all duration-700 ease-out rounded-full"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    {timeline.map((step) => (
                      <div key={step.key} className="relative z-10 flex flex-col items-center gap-2.5 flex-1 min-w-0">
                        <div
                          className={`w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-sm ${
                            step.active
                              ? 'bg-secondary border-secondary text-white shadow-[0_4px_14px_rgba(129,85,0,0.35)]'
                              : step.past
                              ? 'bg-secondary/12 border-secondary/45 text-secondary'
                              : 'bg-surface-container-lowest border-outline-variant/25 text-on-surface-variant/30'
                          }`}
                        >
                          <span
                            className="material-symbols-outlined text-[16px]"
                            style={step.past ? { fontVariationSettings: "'FILL' 1" } : {}}
                          >
                            {step.past ? 'check' : step.icon}
                          </span>
                        </div>
                        <span
                          className={`text-[11px] font-semibold font-headline text-center leading-snug max-w-[5.5rem] sm:max-w-[6.5rem] tracking-wide ${
                            step.active ? 'text-secondary' : step.past ? 'text-on-surface-variant' : 'text-on-surface-variant/35'
                          }`}
                        >
                          {step.label}
                        </span>
                        {step.active && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary-container opacity-70" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Status summary row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-5 border-t border-outline-variant/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-on-surface-variant/55 font-body tracking-wide">Current status</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${sMeta.pill}`}
                      >
                        {sMeta.label}
                      </span>
                    </div>
                    {order.expected_delivery_date && (
                      <div className="flex items-center gap-1.5 text-xs font-body text-on-surface-variant/70">
                        <span className="material-symbols-outlined text-[14px] text-secondary">calendar_month</span>
                        Expected: <span className="font-semibold text-on-surface">{formatDate(order.expected_delivery_date)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ══ Multi-shipment tracking (aggregated order status above; lots detailed here) ══ */}
            {showMultiShipmentTracking && !isCancelled && (
              <SectionCard>
                <SectionHeader
                  icon="local_shipping"
                  title="Shipment Tracking by Package"
                  badge={
                    <span className="text-[10px] font-bold text-on-surface-variant/70 font-body">
                      {multiShipments.length} package{multiShipments.length !== 1 ? 's' : ''}
                    </span>
                  }
                />
                <div className="divide-y divide-outline-variant/10">
                  {multiShipments.map((lot) => {
                    const lotSnap = lot?.velocity_tracking_snapshot && typeof lot.velocity_tracking_snapshot === 'object'
                      ? lot.velocity_tracking_snapshot
                      : null;
                    const nestedTd = lotSnap?.last_event && typeof lotSnap.last_event === 'object'
                      ? lotSnap.last_event.tracking_data
                      : null;
                    const nestedActs = nestedTd && typeof nestedTd === 'object' && Array.isArray(nestedTd.shipment_track_activities)
                      ? nestedTd.shipment_track_activities
                      : [];
                    const dbEvents = Array.isArray(lot.order_shipment_tracking_events)
                      ? [...lot.order_shipment_tracking_events].sort((a, b) => {
                          const ta = Date.parse(a.event_time || a.created_at || 0);
                          const tb = Date.parse(b.event_time || b.created_at || 0);
                          return tb - ta;
                        })
                      : [];
                    const timelineSrc = nestedActs.length ? nestedActs : dbEvents.map((r) => ({
                      activity: r.activity,
                      date: r.event_time || r.created_at,
                      location: r.location,
                      description: r.carrier_remark,
                    }));
                    const rawLotStatus = String(lot.carrier_shipment_status || '').trim();
                    const statusHeadline = formatShipmentStatusForDisplay(rawLotStatus || 'processing');
                    const carrierName = String(lot.velocity_carrier_name || lot.shipment_provider || '').trim();
                    const etaRaw = manualEstimatedArrivalFromLot(lot);
                    const etaLabel = etaRaw ? formatDate(etaRaw) : null;
                    const velLot = isVelocityShipmentLot(lot);
                    const extUrl = String(lot.velocity_tracking_url || '').trim();
                    const trk = String(lot.tracking_number || '').trim();
                    const primaryTrackHref = extUrl.startsWith('http')
                      ? extUrl
                      : (trk ? `/track/${encodeURIComponent(trk)}` : '');
                    const showVelocityPortal = velLot && trk && isLikelyTrackingId(trk);

                    return (
                      <div key={lot.id} className="px-5 py-5 space-y-4">
                        <div className="rounded-xl bg-gradient-to-br from-primary/[0.06] via-surface-container-low/50 to-secondary-fixed/20 border border-primary/12 p-5 shadow-sm">
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-secondary font-headline mb-2">
                            Package {lot.lot_index}
                            {lot.label ? ` · ${lot.label}` : ''}
                          </p>
                          <p className="font-headline text-xl sm:text-2xl font-bold text-primary leading-snug mb-3 tracking-tight">
                            {statusHeadline}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {carrierName && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/85 border border-outline-variant/15 text-[11px] font-semibold text-on-surface font-body">
                                <span className="material-symbols-outlined text-[15px] text-secondary">local_shipping</span>
                                {carrierName}
                              </span>
                            )}
                            {etaLabel && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/85 border border-outline-variant/15 text-[11px] font-semibold text-on-surface font-body">
                                <span className="material-symbols-outlined text-[15px] text-secondary">calendar_month</span>
                                Est. delivery {etaLabel}
                              </span>
                            )}
                            {!velLot && trk && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] font-bold text-emerald-900 font-headline">
                                Manual dispatch
                              </span>
                            )}
                          </div>
                        </div>

                        {trk ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="text-xs font-mono font-bold text-primary bg-surface-container-low px-2 py-1 rounded-lg border border-outline-variant/15">
                              {trk}
                            </code>
                            {primaryTrackHref.startsWith('http') ? (
                              <a
                                href={primaryTrackHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-secondary text-on-secondary text-[11px] font-bold font-headline hover:opacity-90 transition"
                              >
                                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                Track package
                              </a>
                            ) : (
                              <Link
                                to={primaryTrackHref}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-secondary text-on-secondary text-[11px] font-bold font-headline hover:opacity-90 transition"
                              >
                                <span className="material-symbols-outlined text-[14px]">open_in_full</span>
                                Track package
                              </Link>
                            )}
                            {showVelocityPortal && (
                              <a
                                href={velocityTrackingPageUrl(trk)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-outline-variant/25 bg-white text-[11px] font-bold text-primary hover:bg-surface-container-low transition"
                              >
                                Carrier portal
                              </a>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-on-surface-variant/55 font-body">AWB pending for this lot</p>
                        )}

                        {timelineSrc.length > 0 && (
                          <div className="relative rounded-xl border border-outline-variant/12 bg-surface-container-low/40 p-4 sm:p-5">
                            {timelineSrc.length > 3 && (
                              <div className="mb-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => toggleLotTrackingEvents(lot.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-primary/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-secondary font-headline shadow-sm hover:bg-surface-container-low/80 transition"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    {expandedTrackingLots[lot.id] ? 'expand_less' : 'expand_more'}
                                  </span>
                                  {expandedTrackingLots[lot.id] ? 'Collapse events' : `Show all ${timelineSrc.length} events`}
                                </button>
                              </div>
                            )}
                            <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-secondary/35 via-outline-variant/25 to-transparent" />
                            <ul className="space-y-0">
                              {(expandedTrackingLots[lot.id] ? timelineSrc : timelineSrc.slice(0, 3)).map((ev, idx) => (
                                <li key={`${lot.id}-ev-${idx}`} className="relative flex gap-4 pb-4 pl-9">
                                  <div
                                    className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center border-2 z-10 ${
                                      idx === 0
                                        ? 'bg-secondary border-secondary text-white shadow-sm shadow-secondary/30'
                                        : 'bg-white border-outline-variant/25 text-on-surface-variant/40'
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-[11px]">{idx === 0 ? 'location_on' : 'radio_button_unchecked'}</span>
                                  </div>
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <p className={`text-sm font-semibold font-headline leading-snug ${idx === 0 ? 'text-primary' : 'text-on-surface/80'}`}>
                                      {ev.activity || ev.description || 'Update'}
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                      {(ev.date || ev.event_time) && (
                                        <span className="text-[10px] font-mono text-on-surface-variant/50">
                                          {String(ev.date || ev.event_time).replace('T', ' ').slice(0, 16)}
                                        </span>
                                      )}
                                      {ev.location && (
                                        <>
                                          <span className="w-1 h-1 rounded-full bg-outline-variant/40 inline-block" />
                                          <span className="text-[10px] text-on-surface-variant/60 font-body">{ev.location}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}

            {/* ══ Tracking Card (single shipment / legacy) ══ */}
            {hasTracking && !isCancelled && !showMultiShipmentTracking && (
              <SectionCard>
                <SectionHeader
                  icon="local_shipping"
                  title="Shipment Tracking"
                  badge={
                    <div className="flex items-center gap-1.5 rounded-full border border-secondary/25 bg-secondary-fixed/30 px-2.5 py-1">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-60" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
                      </span>
                      <span className="text-[10px] font-bold text-secondary font-headline tracking-wide">Live</span>
                    </div>
                  }
                />

                {/* Carrier status hero */}
                <div className="px-5 pt-5 pb-4">
                  <div className="rounded-xl bg-gradient-to-br from-primary/[0.06] via-surface-container-low/50 to-secondary-fixed/20 border border-primary/12 p-5 mb-4 shadow-sm">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-secondary font-headline mb-2">
                      Carrier status
                    </p>
                    <p className="font-headline text-xl sm:text-2xl font-bold text-primary leading-snug mb-2 tracking-tight">
                      {latestCarrierLabel || 'Awaiting carrier scan update'}
                    </p>
                    <p className="text-[11px] text-on-surface-variant/60 font-body">
                      {order.updated_at && (
                        <>Updated <span className="font-semibold text-on-surface">{formatRelativeShort(order.updated_at)}</span> · </>
                      )}
                      Live tracking updates are shown automatically.
                    </p>
                  </div>

                  {/* Tracking meta row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-outline-variant/10">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[15px] text-secondary">qr_code_scanner</span>
                        <span className="text-[10px] text-on-surface-variant/50 font-body">Tracking Number</span>
                      </div>
                      <code className="text-sm font-mono font-bold text-primary ml-6">{order.tracking_number}</code>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.shipment_provider && (
                        <span className="px-2.5 py-1 rounded-lg bg-surface-container-low text-[11px] font-semibold text-on-surface-variant font-body border border-outline-variant/15">
                          {order.shipment_provider}
                        </span>
                      )}
                      <Link
                        to={`/track/${encodeURIComponent(order.tracking_number)}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-secondary text-on-secondary text-[11px] font-bold font-headline hover:opacity-90 transition"
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_full</span>
                        Full Track
                      </Link>
                      <a
                        href={velocityTrackingPageUrl(order.tracking_number)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-outline-variant/25 bg-white text-[11px] font-bold text-primary hover:bg-surface-container-low transition"
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                        Carrier
                      </a>
                    </div>
                  </div>

                  {/* Tracking Events Timeline */}
                  {trackActivities.length > 0 && (
                    <div className="mt-6 rounded-xl border border-outline-variant/12 bg-surface-container-low/35 p-4 sm:p-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary/70 font-headline mb-4">Tracking events</p>
                      <div className="relative">
                        <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-secondary/35 via-outline-variant/25 to-transparent" />
                        <ul className="space-y-0">
                          {visibleActivities.map((ev, idx) => {
                            const isFirst = idx === 0;
                            return (
                              <li key={`${ev.date || ''}-${idx}`} className="relative flex gap-4 pb-4 pl-9">
                                {/* Dot */}
                                <div
                                  className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center border-2 z-10 ${
                                    isFirst
                                      ? 'bg-secondary border-secondary text-white shadow-sm shadow-secondary/30'
                                      : 'bg-white border-outline-variant/25 text-on-surface-variant/40'
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-[11px]" style={isFirst ? { fontVariationSettings: "'FILL' 1" } : {}}>
                                    {isFirst ? 'location_on' : 'radio_button_unchecked'}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0 pt-0.5">
                                  <p className={`text-sm font-semibold font-headline leading-snug ${isFirst ? 'text-primary' : 'text-on-surface/80'}`}>
                                    {ev.activity || ev.description || 'Status Update'}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    {ev.date && (
                                      <span className="text-[10px] font-mono text-on-surface-variant/50">
                                        {String(ev.date).replace('T', ' ').slice(0, 16)}
                                      </span>
                                    )}
                                    {ev.location && (
                                      <>
                                        <span className="w-1 h-1 rounded-full bg-outline-variant/40 inline-block" />
                                        <span className="text-[10px] text-on-surface-variant/60 font-body flex items-center gap-0.5">
                                          <span className="material-symbols-outlined text-[10px]">location_on</span>
                                          {ev.location}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {trackActivities.length > 5 && (
                        <button
                          onClick={() => setShowFullTracking(!showFullTracking)}
                          className="mt-3 ml-9 inline-flex items-center gap-1 rounded-lg border border-primary/10 bg-white px-3 py-1.5 text-[11px] font-bold text-secondary font-headline shadow-sm hover:bg-surface-container-low/80 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {showFullTracking ? 'expand_less' : 'expand_more'}
                          </span>
                          {showFullTracking ? 'Collapse events' : `Show all ${trackActivities.length} events`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Optional: velocity_tracking_url as footer link */}
                  {order.velocity_tracking_url && (
                    <div className="mt-4 pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                      <span className="text-[11px] text-on-surface-variant/40 font-body">Direct carrier tracking page</span>
                      <a
                        href={order.velocity_tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-secondary hover:underline underline-offset-2 font-body"
                      >
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                        Open link
                      </a>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {/* ══ Main Two-Column Content ══ */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* LEFT — Items */}
              <div className="lg:col-span-3 space-y-4">
                <SectionCard>
                  <SectionHeader
                    icon="shopping_bag"
                    title={`${items.length} item${items.length !== 1 ? 's' : ''} in your order`}
                  />
                  <div className="divide-y divide-outline-variant/10">
                    {items.map((item) => {
                      const name      = item.lot_name || item.lots?.lot_name || item.products?.name || 'Item';
                      const img       = item.lots?.image_url || item.products?.image_url || 'https://placehold.co/80x80?text=Item';
                      const isVoid    = isPartial && (
                        rejectedKeys.has(item.products?.key) ||
                        rejectedItems.some((r) => r.order_item_id === item.id)
                      );
                      const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);
                      const itemRefundStatus = String(item.refund_status || '').toLowerCase();
                      const hasItemRefund = itemRefundStatus && itemRefundStatus !== 'not_required';

                      return (
                        <button
                          type="button"
                          onClick={() => openProductModal(item)}
                          className={`w-full text-left flex items-start gap-4 px-5 py-4 hover:bg-surface-container-low/30 transition-all duration-200 hover:translate-x-0.5 ${isVoid ? 'opacity-50' : ''}`}
                        >
                          <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface-container-low shrink-0 relative border border-outline-variant/10">
                            <img
                              className={`w-full h-full object-cover ${isVoid ? 'grayscale' : ''}`}
                              src={img}
                              alt={name}
                              loading="lazy"
                            />
                            {isVoid && (
                              <div className="absolute inset-0 flex items-center justify-center bg-red-900/40">
                                <span className="text-[8px] font-bold uppercase bg-red-600 text-white px-1.5 py-0.5 rounded font-body">Void</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex justify-between items-start gap-2">
                              <h3 className={`text-sm sm:text-[15px] font-semibold font-headline leading-snug ${isVoid ? 'text-red-500 line-through' : 'text-on-surface'}`}>
                                {name}
                              </h3>
                              <span className={`text-sm font-bold font-headline shrink-0 ${isVoid ? 'text-red-400' : 'text-primary'}`}>
                                {money(lineTotal)}
                              </span>
                            </div>
                            <p className="text-[11px] text-on-surface-variant/50 font-body mt-0.5">
                              {item.quantity} × {money(item.price)}
                            </p>
                            <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${itemStatusPill(resolveItemStatus(item))}`}>
                              {resolveItemStatus(item)}
                            </span>
                            {hasItemRefund && (
                              <span className={`inline-flex mt-2 ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${refundInfo?.badge || 'bg-secondary-fixed/40 text-secondary border-secondary/25'}`}>
                                Refund: {itemRefundStatus.replace(/_/g, ' ')}
                                {Number(item.refund_amount || 0) > 0 ? ` · ${money(item.refund_amount)}` : ''}
                              </span>
                            )}
                            {item.lot_snapshot?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {item.lot_snapshot.slice(0, 4).map((b) => (
                                  <span
                                    key={`${item.id}-${b.product_key || b.product_name}`}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-surface-container-low text-[10px] font-medium text-on-surface-variant/60 font-body border border-outline-variant/12"
                                  >
                                    {b.product_name}
                                    <span className="text-secondary font-semibold ml-0.5">×{b.quantity}</span>
                                  </span>
                                ))}
                                {item.lot_snapshot.length > 4 && (
                                  <span className="text-[10px] text-on-surface-variant/40 font-body self-center">+{item.lot_snapshot.length - 4} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </SectionCard>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleReorder}
                    disabled={!items.length}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-headline font-semibold text-sm hover:bg-primary/90 hover:shadow-md transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[17px]">shopping_cart</span>
                    Reorder Items
                  </button>
                  {canCancel && !isCancelled && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-red-200 text-red-600 font-headline font-semibold text-sm hover:bg-red-50 hover:border-red-300 hover:shadow-sm transition-all active:scale-[0.98] sm:min-w-[140px]"
                    >
                      <span className="material-symbols-outlined text-[17px]">close</span>
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT — Info Sidebar */}
              <aside className="lg:col-span-2 space-y-4 lg:sticky lg:top-28 self-start">

                {/* Order Summary */}
                <SectionCard>
                  <SectionHeader icon="receipt" title="Order Summary" />
                  <div className="p-5 space-y-0">
                    <InfoRow label="Subtotal" value={money(bbSub)} />
                    {(deliveryFee > 0 || shippingFee > 0) && (
                      <InfoRow
                        label="Shipping"
                        value={freeShip
                          ? <span className="flex items-center gap-1 justify-end"><s className="text-on-surface-variant/30 text-[10px]">{money(deliveryFee)}</s><span className="text-emerald-600 font-semibold">Free</span></span>
                          : money(shippingFee || deliveryFee)}
                      />
                    )}
                    {codFee > 0 && <InfoRow label="COD fee" value={money(codFee)} />}
                    {couponDisc > 0 && (
                      <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-outline-variant/8">
                        <span className="text-xs text-emerald-700 font-body flex items-center gap-1 shrink-0">
                          <span className="material-symbols-outlined text-[12px]">local_offer</span>
                          {couponCode || 'Coupon'}
                        </span>
                        <span className="text-xs text-emerald-700 font-semibold text-right font-body">−{money(couponDisc)}</span>
                      </div>
                    )}
                    {isPartial && refundAmount > 0 && (
                      <div className="flex items-baseline justify-between gap-4 py-2.5 border-b border-outline-variant/8">
                        <span className="text-xs text-amber-700 font-body shrink-0">Partial Refund</span>
                        <span className="text-xs text-amber-700 font-semibold text-right font-body">−{money(refundAmount)}</span>
                      </div>
                    )}
                    <div className="pt-3 mt-1 border-t-2 border-outline-variant/15 flex justify-between items-center">
                      <span className="text-sm font-bold text-on-surface font-headline">{isCancelled ? 'Refunded' : 'Total Paid'}</span>
                      <span className="font-headline text-xl font-bold text-primary">
                        {isCancelled ? money(grandTotal) : isPartial ? money(Math.max(0, grandTotal - refundAmount)) : money(grandTotal)}
                      </span>
                    </div>
                  </div>
                </SectionCard>

                {/* Payment */}
                <SectionCard>
                  <SectionHeader icon="payments" title="Payment" />
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center">
                          <span className="material-symbols-outlined text-primary text-[16px]">
                            {isRazorpay ? 'credit_card' : 'local_atm'}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-on-surface font-headline">
                            {isRazorpay ? 'Razorpay' : 'Cash on Delivery'}
                          </p>
                          <p className="text-[10px] text-on-surface-variant/40 font-body">
                            {isRazorpay ? 'Online payment' : 'Pay at doorstep'}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-headline tracking-wide ${
                        payStatus === 'paid'     ? 'bg-emerald-100 text-emerald-800' :
                        payStatus === 'refunded' ? 'bg-primary/10 text-primary border border-primary/15' :
                        payStatus === 'failed'   ? 'bg-red-100 text-red-700' :
                        'bg-secondary-fixed/50 text-on-secondary-container border border-secondary/20'
                      }`}>
                        {payStatus.charAt(0).toUpperCase() + payStatus.slice(1)}
                      </span>
                    </div>

                    {refundInfo && (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold font-body ${refundInfo.badge}`}>
                        <span className="material-symbols-outlined text-[14px]">refresh</span>
                        {refundInfo.label}
                      </div>
                    )}

                    {order.coupon_code && (
                      <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <span className="material-symbols-outlined text-emerald-500 text-[15px]">redeem</span>
                        <span className="text-xs font-bold text-emerald-800 font-headline tracking-wide uppercase">{order.coupon_code}</span>
                        <span className="text-[10px] text-emerald-600 font-body ml-auto">Applied</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <div className="rounded-lg border border-outline-variant/15 bg-surface-container-low/40 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-on-surface-variant/45 font-semibold">Payment security</p>
                        <p className="text-[11px] text-on-surface-variant/75 mt-0.5">Encrypted and verified through trusted gateways.</p>
                      </div>
                      <div className="rounded-lg border border-outline-variant/15 bg-surface-container-low/40 px-2.5 py-2">
                        <p className="text-[9px] uppercase tracking-[0.12em] text-on-surface-variant/45 font-semibold">Refund assurance</p>
                        <p className="text-[11px] text-on-surface-variant/75 mt-0.5">If eligible, refunds are tracked here automatically.</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* Delivery Address */}
                <SectionCard>
                  <SectionHeader icon="location_on" title="Delivery Address" />
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>home</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-surface font-headline">{addr.first_name} {addr.last_name}</p>
                        <p className="text-xs text-on-surface-variant/70 font-body mt-1 leading-relaxed">
                          {addr.address_line1}
                          {addr.address_line2 && <>, {addr.address_line2}</>}
                        </p>
                        <p className="text-xs text-on-surface-variant/70 font-body">
                          {[addr.city, addr.state, addr.postal_code].filter(Boolean).join(', ')}
                        </p>
                        {addr.phone && (
                          <div className="flex items-center gap-1.5 mt-2 text-xs text-on-surface-variant/60 font-body">
                            <span className="material-symbols-outlined text-[13px] text-secondary">call</span>
                            {addr.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </SectionCard>

                {/* Order Meta */}
                <SectionCard>
                  <SectionHeader icon="info" title="Order Info" />
                  <div className="px-5 py-3 space-y-0">
                    <InfoRow label="Order ID" value={<code className="font-mono text-[10px] text-primary/80 break-all">{getOrderDisplayId(order)}</code>} />
                    <InfoRow label="Placed on" value={formatDateTime(order.created_at)} />
                    {order.updated_at && order.updated_at !== order.created_at && (
                      <InfoRow label="Last update" value={formatDateTime(order.updated_at)} />
                    )}
                    {order.tracking_number && (
                      <InfoRow label="AWB / Tracking" value={<code className="font-mono text-[11px] text-primary font-bold">{order.tracking_number}</code>} />
                    )}
                    {order.shipment_provider && (
                      <InfoRow label="Carrier" value={order.shipment_provider} />
                    )}
                  </div>
                  <div className="px-5 pb-4">
                    <button
                      onClick={copyOrderId}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-outline-variant/20 hover:bg-surface-container-low transition-all active:scale-[0.98] text-xs font-semibold text-on-surface-variant font-body"
                    >
                      <span className="material-symbols-outlined text-[14px]">{copied ? 'check' : 'content_copy'}</span>
                      {copied ? 'Copied!' : 'Copy Order ID'}
                    </button>
                  </div>
                </SectionCard>

                <SectionCard>
                  <SectionHeader icon="support_agent" title="Need Help?" />
                  <div className="p-5 space-y-3">
                    <p className="text-xs text-on-surface-variant/70 leading-relaxed">
                      Our order support team can help with shipment updates, delivery exceptions, and payment/refund questions.
                    </p>
                    <div className="space-y-2">
                      <a
                        href="mailto:support@hatvoni.com?subject=Order%20Support%20Request"
                        className="w-full inline-flex items-center justify-between rounded-xl border border-outline-variant/20 px-3 py-2.5 hover:bg-surface-container-low transition-all"
                      >
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface">
                          <span className="material-symbols-outlined text-[15px] text-secondary">mail</span>
                          support@hatvoni.com
                        </span>
                        <span className="material-symbols-outlined text-[15px] text-on-surface-variant/40">open_in_new</span>
                      </a>
                      <div className="w-full inline-flex items-center justify-between rounded-xl border border-outline-variant/20 px-3 py-2.5 bg-surface-container-low/30">
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface">
                          <span className="material-symbols-outlined text-[15px] text-secondary">schedule</span>
                          Support hours
                        </span>
                        <span className="text-[11px] text-on-surface-variant/70">Mon-Sat, 10 AM - 7 PM</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-on-surface-variant/55">
                      Include your order ID <span className="font-mono text-primary">{getOrderDisplayId(order)}</span> for faster resolution.
                    </p>
                  </div>
                </SectionCard>
              </aside>
            </div>
          </section>
        </div>
      </div>

      {activeProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setActiveProduct(null); setActiveShipment(null); }} />
          <div className="relative bg-white rounded-3xl w-full max-w-2xl border border-outline-variant/15 shadow-2xl overflow-auto max-h-[85vh]">
            <div className="p-5 border-b border-outline-variant/10 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant/50">Product Details</p>
                <p className="text-base font-semibold text-on-surface">
                  {activeProduct.lot_name || activeProduct.lots?.lot_name || activeProduct.products?.name || 'Product'}
                </p>
                <p className="text-xs text-on-surface-variant/60 mt-0.5">
                  {getOrderDisplayId(order)} · {activeProduct.quantity} × {money(activeProduct.price)}
                </p>
              </div>
              <button onClick={() => { setActiveProduct(null); setActiveShipment(null); }} className="material-symbols-outlined text-on-surface-variant/60 hover:text-on-surface">close</button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant/60">Current status</span>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border capitalize ${itemStatusPill(resolveItemStatus(activeProduct))}`}>
                  {resolveItemStatus(activeProduct)}
                </span>
              </div>

              {!activeProduct.order_shipment_id && (
                <p className="text-xs text-on-surface-variant/70 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This product is processing and will stay in Processing until shipment lot assignment and AWB generation.
                </p>
              )}

              {activeProduct.order_shipment_id && (
                <>
                  {loadingProductShipment ? (
                    <p className="text-xs text-on-surface-variant/70">Loading shipment details...</p>
                  ) : (
                    <>
                      <div className="rounded-xl border border-outline-variant/15 p-3 bg-gradient-to-br from-primary/[0.04] to-surface-container-low/60">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 mb-1">Shipment</p>
                        <p className="text-xs text-on-surface-variant/75">
                          {(activeShipment?.velocity_carrier_name || activeShipment?.shipment_provider || order?.shipment_provider || 'Courier')}
                          {' · '}
                          AWB: <span className="font-mono text-primary font-semibold">{activeShipment?.tracking_number || 'Pending'}</span>
                        </p>
                        {manualEstimatedArrivalFromLot(activeShipment) && (
                          <p className="text-[11px] text-on-surface-variant/70 mt-1.5">
                            Est. delivery: <span className="font-semibold text-on-surface">{formatDate(manualEstimatedArrivalFromLot(activeShipment))}</span>
                          </p>
                        )}
                        {(activeShipment?.velocity_tracking_url || activeShipment?.tracking_number) && (
                          <a
                            href={activeShipment?.velocity_tracking_url || `/track/${encodeURIComponent(activeShipment?.tracking_number || '')}`}
                            className="inline-flex mt-2 text-[11px] font-semibold text-secondary hover:underline"
                            target={activeShipment?.velocity_tracking_url ? '_blank' : undefined}
                            rel={activeShipment?.velocity_tracking_url ? 'noopener noreferrer' : undefined}
                          >
                            Track shipment
                          </a>
                        )}
                      </div>

                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 mb-2">Shipping timeline</p>
                        {(activeShipment?.order_shipment_tracking_events || []).length === 0 ? (
                          <p className="text-xs text-on-surface-variant/60">No tracking events available yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {[...(activeShipment?.order_shipment_tracking_events || [])]
                              .sort((a, b) => new Date(b.event_time || b.created_at || 0) - new Date(a.event_time || a.created_at || 0))
                              .slice(0, 8)
                              .map((ev, idx) => (
                                <div key={idx} className="rounded-lg border border-outline-variant/12 p-2.5">
                                  <p className="text-xs font-semibold text-on-surface">{ev.activity || 'Update'}</p>
                                  <p className="text-[11px] text-on-surface-variant/70">
                                    {[ev.location, ev.carrier_remark].filter(Boolean).join(' · ') || '—'}
                                  </p>
                                  <p className="text-[10px] text-on-surface-variant/50 mt-0.5">
                                    {new Date(ev.event_time || ev.created_at).toLocaleString('en-IN')}
                                  </p>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ CANCEL MODAL ═══════════ */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !cancelling && setShowCancelModal(false)}
          />
          <div className="relative bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-outline-variant/15 animate-scale-in">
            {/* Close */}
            <button
              onClick={() => setShowCancelModal(false)}
              disabled={cancelling}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant/50 transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[17px]">close</span>
            </button>

            {/* Icon + Title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-red-600 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
              </div>
              <div>
                <h2 className="font-headline text-lg font-bold text-on-surface">Cancel this order?</h2>
                <p className="text-xs text-on-surface-variant/50 font-body">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-sm text-on-surface-variant/70 mb-5 font-body leading-relaxed bg-surface-container-low/60 rounded-xl p-3 border border-outline-variant/10">
              {isRazorpay
                ? '💳 Your online payment refund will be processed within 5–7 business days after cancellation.'
                : '📦 For a COD order — no payment will be collected. You\'ll receive a confirmation.'}
            </p>

            <div className="space-y-3">
              <div className="relative">
                <label className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/50 font-body mb-1.5 block">
                  Reason for cancellation
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-xl border-2 border-outline-variant/25 bg-white px-4 py-3 text-sm font-body text-on-surface outline-none appearance-none cursor-pointer hover:border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all"
                >
                  <option value="">Select a reason…</option>
                  {cancelReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-3.5 top-[calc(50%+9px)] -translate-y-1/2 text-on-surface-variant/30 pointer-events-none text-[18px]">
                  unfold_more
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="flex-1 py-3 rounded-xl font-headline font-semibold text-sm text-on-surface-variant hover:bg-surface-container-low transition-all border border-outline-variant/20"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling || !cancelReason}
                  className="flex-1 py-3 rounded-xl bg-red-600 text-white font-headline font-semibold text-sm transition-all hover:bg-red-700 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {cancelling ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Cancelling…
                    </>
                  ) : 'Cancel Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
