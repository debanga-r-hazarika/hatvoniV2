import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { isLikelyTrackingId, velocityTrackingPageUrl } from '../lib/velocityTracking';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { cartService } from '../services/cartService';
import AccountSidebar from '../components/AccountSidebar';

/* ─────────────── constants ─────────────── */
const statusFlow = ['placed', 'processing', 'shipped', 'delivered'];

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
  partially_shipped:   { icon: 'inventory_2',    label: 'Partially shipped',    color: '#0369a1', bg: '#f0f9ff', pill: 'bg-sky-50 text-sky-800 border-sky-200' },
  partially_delivered: { icon: 'move_item',       label: 'Partially delivered', color: '#0f766e', bg: '#ecfdfa', pill: 'bg-teal-50 text-teal-800 border-teal-200' },
  delivered:           { icon: 'check_circle',    label: 'Delivered',           color: '#047857', bg: '#ecfdf5', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled:           { icon: 'cancel',          label: 'Cancelled',           color: '#dc2626', bg: '#fef2f2', pill: 'bg-red-50 text-red-700 border-red-200' },
};

const stepIcons = {
  placed:     'receipt_long',
  processing: 'autorenew',
  shipped:    'local_shipping',
  delivered:  'check_circle',
};

const humanizeShipmentStatus = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

function resolveLatestCarrierStatus(order, trackingSnap) {
  const direct = order?.shipment_status;
  if (direct && String(direct).trim()) return humanizeShipmentStatus(String(direct));
  if (!trackingSnap || typeof trackingSnap !== 'object') return '';
  const snap = trackingSnap;
  const fromTd = snap.tracking_data && typeof snap.tracking_data === 'object'
    ? snap.tracking_data.shipment_status : null;
  const top = snap.shipment_status;
  return humanizeShipmentStatus(String(fromTd || top || ''));
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

function resolveCustomerStatus(order) {
  if (!order) return 'placed';
  const cs = String(order.customer_status || '').toLowerCase();
  if (cs && cs !== 'unknown') return cs;
  const s = String(order.order_status || order.status || 'placed').toLowerCase();
  if (s === 'processed')          return 'processing';
  if (s === 'partially_approved') return 'processing';
  if (s === 'partially_shipped')  return 'partially_shipped';
  if (s === 'partially_delivered') return 'partially_delivered';
  if (s === 'rejected')           return 'cancelled';
  return s;
}

/* ─────────────── sub-components ─────────────── */

function SectionCard({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-outline-variant/12 shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, badge }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline-variant/10 bg-surface-container-low/30">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-secondary text-[18px]">{icon}</span>
        <h2 className="text-[11px] font-black uppercase tracking-[0.12em] text-on-surface-variant/60 font-body">{title}</h2>
      </div>
      {badge}
    </div>
  );
}

function InfoRow({ label, value, mono, highlight }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-outline-variant/8 last:border-0">
      <span className="text-xs text-on-surface-variant/55 font-body shrink-0">{label}</span>
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
  const [trackingEmbedLoaded, setTrackingEmbedLoaded] = useState(false);
  const [showFullTracking, setShowFullTracking] = useState(false);

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

  useEffect(() => { setTrackingEmbedLoaded(false); }, [order?.tracking_number]);

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
    if (displayStatus === 'partially_shipped') cur = Math.max(cur, statusFlow.indexOf('shipped'));
    if (displayStatus === 'partially_delivered') cur = Math.max(cur, statusFlow.indexOf('shipped'));
    if (cur < 0) cur = 0;
    return statusFlow.map((s, i) => ({
      key: s,
      label: statusConfig[s]?.label || (s.charAt(0).toUpperCase() + s.slice(1)),
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
    navigator.clipboard.writeText(order.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ── Loading State ── */
  if (loading) {
    return (
      <main className="pt-28 pb-20 md:pt-36 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
            <AccountSidebar />
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
                <p className="text-xs text-on-surface-variant/50 font-body">Loading order details…</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* ── Error State ── */
  if (error || !order) {
    return (
      <main className="pt-28 pb-20 md:pt-36 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
            <AccountSidebar />
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-surface-container-low flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/25">receipt_long</span>
              </div>
              <div>
                <h1 className="font-headline text-xl font-bold text-primary mb-1.5">Order not found</h1>
                <p className="text-sm text-on-surface-variant/60 font-body max-w-xs">{error || 'This order does not exist or you do not have permission to view it.'}</p>
              </div>
              <Link to="/orders" className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl font-headline font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all">
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
  const shippingFee = Number(bb.shipping_fee ?? order.shipping_charge ?? 0);
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
  const trackingEmbedOk     = !!(order?.tracking_number && isLikelyTrackingId(order.tracking_number));
  const trackingEmbedSrc    = trackingEmbedOk ? velocityTrackingPageUrl(order.tracking_number) : '';
  const hasTracking         = !!(order?.tracking_number);
  const visibleActivities   = showFullTracking ? trackActivities : trackActivities.slice(0, 5);

  /* ─────────────── RENDER ─────────────── */
  return (
    <main className="pt-28 pb-20 md:pt-36 md:pb-16 bg-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          <AccountSidebar />

          <section className="min-w-0 space-y-5 animate-fade-up">

            {/* ══ Breadcrumb + Order Header ══ */}
            <div>
              <Link
                to="/orders"
                className="inline-flex items-center gap-1.5 text-on-surface-variant/50 hover:text-secondary transition-colors group mb-4"
              >
                <span className="material-symbols-outlined text-[17px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                <span className="text-xs font-semibold font-body">My Orders</span>
              </Link>

              {/* Hero header card */}
              <div
                className="rounded-2xl p-5 sm:p-6 border"
                style={{
                  background: isCancelled
                    ? 'linear-gradient(135deg, #fef2f2 0%, #fff 60%)'
                    : displayStatus === 'delivered'
                    ? 'linear-gradient(135deg, #ecfdf5 0%, #fff 60%)'
                    : displayStatus === 'partially_delivered'
                    ? 'linear-gradient(135deg, #ecfdfa 0%, #fff 65%)'
                    : displayStatus === 'partially_shipped'
                    ? 'linear-gradient(135deg, #e0f2fe 0%, #fff 65%)'
                    : displayStatus === 'shipped'
                    ? 'linear-gradient(135deg, #eff6ff 0%, #fff 60%)'
                    : displayStatus === 'processing'
                    ? 'linear-gradient(135deg, #fffbeb 0%, #fff 60%)'
                    : 'linear-gradient(135deg, #f8f7f2 0%, #fff 60%)',
                  borderColor: isCancelled ? '#fecaca'
                    : displayStatus === 'delivered' ? '#a7f3d0'
                    : displayStatus === 'partially_delivered' ? '#99f6e4'
                    : displayStatus === 'partially_shipped' ? '#7dd3fc'
                    : displayStatus === 'shipped' ? '#bfdbfe'
                    : displayStatus === 'processing' ? '#fde68a'
                    : 'rgba(0,74,43,0.1)',
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* Status icon circle */}
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
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
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <h1 className="font-headline text-lg font-bold text-primary">
                          Order #{order.id.slice(0, 8).toUpperCase()}
                        </h1>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${sMeta.pill}`}
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
                      <p className="text-xs text-on-surface-variant/60 font-body">
                        {formatDate(order.created_at)} · {formatTime(order.created_at)} · {payLabel}
                        {payStatus === 'paid' && <span className="text-emerald-600 font-semibold ml-1">· Paid</span>}
                        {payStatus === 'refunded' && <span className="text-blue-600 font-semibold ml-1">· Refunded</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
                    <p className="font-headline text-2xl font-bold text-primary">{money(grandTotal)}</p>
                    <p className="text-[10px] text-on-surface-variant/45 font-body">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>
            </div>

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
                <SectionHeader icon="timeline" title="Order Status" />
                <div className="p-5">
                  {/* Stepper */}
                  <div className="relative flex items-start justify-between mb-6">
                    {/* Connector line */}
                    <div className="absolute top-5 left-0 right-0 h-0.5 bg-outline-variant/15 z-0">
                      <div
                        className="h-full bg-secondary transition-all duration-700 ease-out rounded-full"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    {timeline.map((step) => (
                      <div key={step.key} className="relative z-10 flex flex-col items-center gap-2 flex-1">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-sm ${
                            step.active
                              ? 'bg-secondary border-secondary text-white shadow-secondary/25 shadow-md'
                              : step.past
                              ? 'bg-secondary/10 border-secondary/40 text-secondary'
                              : 'bg-white border-outline-variant/20 text-on-surface-variant/25'
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
                          className={`text-[10px] font-semibold font-body text-center leading-tight max-w-[60px] ${
                            step.active ? 'text-secondary' : step.past ? 'text-on-surface-variant' : 'text-on-surface-variant/30'
                          }`}
                        >
                          {step.label}
                        </span>
                        {step.active && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-60" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Status summary row */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-outline-variant/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-on-surface-variant/50 font-body">Current status:</span>
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
                  title="Shipment lots"
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
                    const label =
                      humanizeShipmentStatus(String(lot.carrier_shipment_status || '').trim())
                      || 'Awaiting carrier scan update';

                    return (
                      <div key={lot.id} className="px-5 py-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-secondary font-body">
                              Lot {lot.lot_index}
                              {lot.label ? ` · ${lot.label}` : ''}
                            </p>
                            <p className="font-headline text-lg font-bold text-primary mt-1">{label || 'Awaiting dispatch'}</p>
                            <p className="text-[10px] font-mono text-on-surface-variant/55 mt-0.5">{lot.velocity_external_code}</p>
                          </div>
                          {lot.tracking_number ? (
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <code className="text-xs font-mono font-bold text-primary bg-surface-container-low px-2 py-1 rounded-lg border border-outline-variant/15">
                                {lot.tracking_number}
                              </code>
                              <Link
                                to={`/track/${encodeURIComponent(lot.tracking_number)}`}
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-secondary text-on-secondary text-[11px] font-bold font-headline hover:opacity-90 transition"
                              >
                                Track
                              </Link>
                              <a
                                href={velocityTrackingPageUrl(lot.tracking_number)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-outline-variant/25 bg-white text-[11px] font-bold text-primary"
                              >
                                Carrier
                              </a>
                            </div>
                          ) : (
                            <p className="text-xs text-on-surface-variant/55 font-body">AWB pending for this lot</p>
                          )}
                        </div>

                        {timelineSrc.length > 0 && (
                          <div className="relative">
                            <div className="absolute left-3 top-0 bottom-0 w-px bg-outline-variant/20" />
                            <ul className="space-y-0">
                              {timelineSrc.slice(0, 8).map((ev, idx) => (
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
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <span className="text-[10px] font-bold text-emerald-600 font-body">Live</span>
                    </div>
                  }
                />

                {/* Carrier status hero */}
                <div className="px-5 pt-5 pb-4">
                  <div className="rounded-xl bg-gradient-to-br from-primary/[0.05] to-secondary/[0.03] border border-primary/10 p-4 mb-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-secondary font-body mb-1.5">
                      Carrier Status · Velocity
                    </p>
                    <p className="font-headline text-xl font-bold text-primary leading-snug mb-2">
                      {latestCarrierLabel || 'Awaiting carrier scan update'}
                    </p>
                    <p className="text-[11px] text-on-surface-variant/60 font-body">
                      {order.updated_at && (
                        <>Updated <span className="font-semibold text-on-surface">{formatRelativeShort(order.updated_at)}</span> · </>
                      )}
                      Auto-refreshes via Velocity webhook.
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

                  {/* Tracking iframe */}
                  {trackingEmbedOk && trackingEmbedSrc && (
                    <div className="mt-4 rounded-xl border border-outline-variant/20 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-container-low/50 border-b border-outline-variant/10">
                        <p className="text-[11px] font-bold text-on-surface font-headline flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-secondary text-[16px]">map</span>
                          Live Tracking Map
                        </p>
                        <p className="text-[10px] text-on-surface-variant/50 font-body">If blank, use "Carrier" button above</p>
                      </div>
                      <div className="relative bg-white" style={{ minHeight: '380px' }}>
                        {!trackingEmbedLoaded && (
                          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface-container-low/50 backdrop-blur-[2px]">
                            <div className="w-7 h-7 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
                            <span className="text-xs text-on-surface-variant/50 font-body">Loading tracking…</span>
                          </div>
                        )}
                        <iframe
                          title="Velocity shipment tracking"
                          src={trackingEmbedSrc}
                          className="w-full border-0 block bg-white"
                          style={{ minHeight: '380px' }}
                          onLoad={() => setTrackingEmbedLoaded(true)}
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    </div>
                  )}

                  {/* Tracking Events Timeline */}
                  {trackActivities.length > 0 && (
                    <div className="mt-5">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-on-surface-variant/50 font-body mb-3">Tracking Events</p>
                      <div className="relative">
                        <div className="absolute left-3 top-0 bottom-0 w-px bg-outline-variant/20" />
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
                          className="mt-1 ml-9 inline-flex items-center gap-1 text-[11px] font-bold text-secondary hover:text-secondary/80 font-body transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {showFullTracking ? 'expand_less' : 'expand_more'}
                          </span>
                          {showFullTracking ? 'Show less' : `Show all ${trackActivities.length} events`}
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
                    title={`${items.length} Item${items.length !== 1 ? 's' : ''} in this order`}
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

                      return (
                        <div key={item.id} className={`flex items-start gap-4 px-5 py-4 hover:bg-surface-container-low/30 transition-colors ${isVoid ? 'opacity-50' : ''}`}>
                          <div className="w-14 h-14 rounded-xl overflow-hidden bg-surface-container-low shrink-0 relative border border-outline-variant/10">
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
                              <h3 className={`text-sm font-semibold font-headline leading-snug ${isVoid ? 'text-red-500 line-through' : 'text-on-surface'}`}>
                                {name}
                              </h3>
                              <span className={`text-sm font-bold font-headline shrink-0 ${isVoid ? 'text-red-400' : 'text-primary'}`}>
                                {money(lineTotal)}
                              </span>
                            </div>
                            <p className="text-[11px] text-on-surface-variant/50 font-body mt-0.5">
                              {item.quantity} × {money(item.price)}
                            </p>
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
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleReorder}
                    disabled={!items.length}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-headline font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[17px]">shopping_cart</span>
                    Reorder Items
                  </button>
                  {canCancel && !isCancelled && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-red-200 text-red-600 font-headline font-semibold text-sm hover:bg-red-50 hover:border-red-300 transition-all active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-[17px]">close</span>
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT — Info Sidebar */}
              <aside className="lg:col-span-2 space-y-4">

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
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-body ${
                        payStatus === 'paid'     ? 'bg-emerald-100 text-emerald-700' :
                        payStatus === 'refunded' ? 'bg-blue-100 text-blue-700' :
                        payStatus === 'failed'   ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {payStatus.charAt(0).toUpperCase() + payStatus.slice(1)}
                      </span>
                    </div>

                    {isRazorpay && order.razorpay_payment_id && (
                      <div className="p-2.5 bg-surface-container-low rounded-xl border border-outline-variant/12">
                        <p className="text-[9px] text-on-surface-variant/40 font-body uppercase tracking-wider mb-0.5">Payment ID</p>
                        <code className="text-[11px] font-mono font-medium text-primary break-all">{order.razorpay_payment_id}</code>
                      </div>
                    )}

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
                    <InfoRow label="Order ID" value={<code className="font-mono text-[10px] text-primary/80 break-all">{order.id}</code>} />
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
              </aside>
            </div>
          </section>
        </div>
      </div>

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
