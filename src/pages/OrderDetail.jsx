import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { cartService } from '../services/cartService';
import AccountSidebar from '../components/AccountSidebar';

/* ── constants ── */
const statusFlow = ['placed', 'processing', 'shipped', 'delivered'];

const formatDate = (v) => {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const formatTime = (v) => {
  if (!v) return '';
  return new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

const statusMeta = {
  placed:     { icon: 'schedule',         label: 'Placed',     color: 'text-on-surface-variant' },
  processing: { icon: 'autorenew',        label: 'Processing', color: 'text-amber-700' },
  shipped:    { icon: 'local_shipping',   label: 'Shipped',    color: 'text-blue-700' },
  delivered:  { icon: 'check_circle',     label: 'Delivered',  color: 'text-emerald-700' },
  cancelled:  { icon: 'cancel',           label: 'Cancelled',  color: 'text-red-700' },
};

/* ── helpers ── */
function resolveCustomerStatus(order) {
  if (!order) return 'placed';
  const cs = String(order.customer_status || '').toLowerCase();
  if (cs && cs !== 'unknown') return cs;
  const s = String(order.order_status || order.status || 'placed').toLowerCase();
  if (s === 'processed')          return 'processing';
  if (s === 'partially_approved') return 'processing';
  if (s === 'rejected')           return 'cancelled';
  return s;
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

  /* fetch + realtime */
  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }

    const fetchOrder = async () => {
      try {
        setLoading(true);
        const { data, error: e } = await supabase
          .from('orders')
          .select('*, order_items(*, products(*), lots(*))')
          .eq('id', id)
          .maybeSingle();
        if (e) throw e;
        if (!data) throw new Error('Order not found');
        setOrder(data);
      } catch (err) {
        setError(err.message || 'Unable to load order details');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();

    const ch = supabase
      .channel('customer-order-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => fetchOrder())
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, [authLoading, id, navigate, user]);

  /* derived data */
  const displayStatus = useMemo(() => resolveCustomerStatus(order), [order]);
  const isCancelled   = displayStatus === 'cancelled';
  const sMeta         = statusMeta[displayStatus] || statusMeta.placed;

  const timeline = useMemo(() => {
    if (isCancelled) return [];
    const cur = statusFlow.indexOf(displayStatus);
    return statusFlow.map((s, i) => ({ key: s, label: s.charAt(0).toUpperCase() + s.slice(1), done: i <= cur, active: i === cur }));
  }, [displayStatus, isCancelled]);

  const paymentMethod = String(order?.payment_method || order?.shipping_address?.payment_method || 'cod').toLowerCase();
  const isRazorpay    = paymentMethod.startsWith('razorpay') || paymentMethod === 'online';
  const payLabel      = isRazorpay ? 'Online' : 'COD';
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

  const rejectedKeys = useMemo(() => {
    return new Set(rejectedItems.map((r) => r.product_key).filter(Boolean));
  }, [rejectedItems]);

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
        if (re) {
          console.warn('Refund error:', re);
          alert('Order cancelled but Razorpay refund failed. Contact support.');
        } else if (rd) {
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

  /* ── Loading ── */
  if (loading) {
    return (
      <main className="pt-28 pb-20 md:pt-36 md:pb-16 min-h-screen bg-surface">
        <div className="flex items-center justify-center min-h-[40vh]">
          <span className="material-symbols-outlined animate-spin text-3xl text-secondary">progress_activity</span>
        </div>
      </main>
    );
  }

  /* ── Error ── */
  if (error || !order) {
    return (
      <main className="pt-28 pb-20 md:pt-36 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-lg mx-auto px-6 text-center py-20">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/20 block mb-4">receipt_long</span>
          <h1 className="font-headline text-xl font-bold text-primary mb-2">Order not found</h1>
          <p className="text-on-surface-variant text-sm mb-8">{error || 'This order does not exist or you do not have permission.'}</p>
          <Link to="/orders">
            <button className="bg-primary text-white px-6 py-2.5 rounded-lg font-headline font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all">
              Back to Orders
            </button>
          </Link>
        </div>
      </main>
    );
  }

  /* billing */
  const bb             = order.billing_breakdown || {};
  const bbSub          = Number(bb.subtotal || summary?.subtotal || 0);
  const deliveryFee    = Number(bb.delivery_fee || 0);
  const shippingFee    = Number(bb.shipping_fee ?? order.shipping_charge ?? 0);
  const codFee         = Number(bb.cod_fee || 0);
  const couponDisc     = Number(bb.coupon_discount || order.discount_amount || 0);
  const couponCode     = bb.coupon_code || order.coupon_code || '';
  const freeShip       = bb.free_shipping_applied || false;
  const grandTotal     = Number(bb.total || summary?.total || 0);
  const addr           = order.shipping_address || {};
  const items          = order.order_items || [];

  const completedSteps = timeline.filter(t => t.done).length;
  const progressPct    = timeline.length ? Math.round((completedSteps / timeline.length) * 100) : 0;

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <main className="pt-28 pb-20 md:pt-36 md:pb-16 bg-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          <AccountSidebar />

          <section className="min-w-0 space-y-5">

            {/* ─── Top Bar: Back + Order ID + Status ─── */}
            <div className="flex items-center justify-between">
              <Link to="/orders" className="inline-flex items-center gap-1.5 text-on-surface-variant/60 hover:text-primary transition-colors group">
                <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                <span className="text-xs font-semibold font-body">Orders</span>
              </Link>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold font-body border ${
                  isCancelled ? 'bg-red-50 text-red-700 border-red-200' :
                  displayStatus === 'delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  displayStatus === 'shipped' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  displayStatus === 'processing' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                }`}>
                  <span className="material-symbols-outlined text-[14px]">{sMeta.icon}</span>
                  {sMeta.label}
                </span>
              </div>
            </div>

            {/* ─── Header Row ─── */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b border-outline-variant/15">
              <div>
                <h1 className="font-headline text-lg font-bold text-primary">Order #{order.id.slice(0, 8).toUpperCase()}</h1>
                <p className="text-xs text-on-surface-variant/60 font-body mt-0.5">
                  {formatDate(order.created_at)} · {formatTime(order.created_at)} · {payLabel}
                  {payStatus === 'paid' && <span className="text-emerald-600 ml-1">· Paid</span>}
                  {payStatus === 'refunded' && <span className="text-blue-600 ml-1">· Refunded</span>}
                </p>
              </div>
              <p className="font-headline text-xl font-bold text-primary">{money(grandTotal)}</p>
            </div>

            {/* ─── Fresh Order Confirmation ─── */}
            {isFreshOrder && !isCancelled && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50/80 border border-emerald-100">
                <span className="material-symbols-outlined text-emerald-600 text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <div>
                  <p className="text-sm font-semibold font-headline text-emerald-900">Order confirmed</p>
                  <p className="text-xs text-emerald-700/70 font-body">
                    {freshPaymentMode === 'online' ? 'Payment verified — your order is being prepared.' :
                     freshPaymentMode === 'pending' ? 'Complete payment to begin processing.' :
                     'COD request received. We may call to confirm.'}
                  </p>
                </div>
              </div>
            )}

            {/* ─── Cancelled Banner ─── */}
            {isCancelled && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50/80 border border-red-100">
                <span className="material-symbols-outlined text-red-500 text-lg mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold font-headline text-red-900">Order cancelled</p>
                  {order.order_notes && <p className="text-xs text-red-700/80 font-body mt-0.5">{order.order_notes}</p>}
                  <p className="text-xs text-red-600/60 font-body mt-0.5">
                    {isRazorpay ? 'Refund processing — allow 5-7 banking days.' : 'No further action required.'}
                  </p>
                  {refundInfo && (
                    <span className={`inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${refundInfo.badge}`}>
                      {refundInfo.label}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ─── Partial Fulfillment Banner ─── */}
            {isPartial && !isCancelled && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50/80 border border-amber-100">
                <span className="material-symbols-outlined text-amber-600 text-lg mt-0.5">inventory</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold font-headline text-amber-900">Partial fulfillment</p>
                  <p className="text-xs text-amber-700/70 font-body mt-0.5">
                    {rejectedItems.length} item{rejectedItems.length !== 1 ? 's' : ''} unavailable — remaining items are being processed.
                  </p>
                  {rejectedItems.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rejectedItems.map((r, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100/80 text-red-700 text-[10px] font-semibold font-body">
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
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/[0.03] border border-primary/10">
                <span className="material-symbols-outlined text-primary/50 text-lg mt-0.5">sticky_note_2</span>
                <p className="text-xs text-on-surface-variant italic font-body leading-relaxed">"{order.order_notes}"</p>
              </div>
            )}

            {/* ─── Progress Tracker (compact horizontal) ─── */}
            {!isCancelled && (
              <div className="bg-white rounded-xl border border-outline-variant/15 p-4">
                {/* Tracking info */}
                {order.tracking_number && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/10">
                    <span className="material-symbols-outlined text-[16px] text-secondary">local_shipping</span>
                    <span className="text-xs font-semibold text-on-surface-variant font-body">
                      {order.shipment_provider || 'AWB'}: <span className="font-mono text-primary">{order.tracking_number}</span>
                    </span>
                  </div>
                )}

                {/* Progress bar */}
                <div className="h-1 w-full bg-outline-variant/10 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-secondary rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                {/* Steps */}
                <div className="flex justify-between">
                  {timeline.map((step, i) => (
                    <div key={step.key} className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        step.active ? 'bg-secondary text-white shadow-sm' :
                        step.done ? 'bg-secondary/10 text-secondary' :
                        'bg-outline-variant/10 text-on-surface-variant/25'
                      }`}>
                        <span className="material-symbols-outlined text-[13px]">
                          {step.done && !step.active ? 'check' :
                           step.key === 'placed' ? 'schedule' :
                           step.key === 'processing' ? 'autorenew' :
                           step.key === 'shipped' ? 'local_shipping' : 'check_circle'}
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold font-body ${
                        step.active ? 'text-secondary' : step.done ? 'text-on-surface-variant' : 'text-on-surface-variant/30'
                      }`}>{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Two-Column Content ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* LEFT — Items */}
              <div className="lg:col-span-3 space-y-4">

                {/* Items list */}
                <div className="bg-white rounded-xl border border-outline-variant/15 overflow-hidden">
                  <div className="px-4 py-3 border-b border-outline-variant/10">
                    <p className="text-xs font-semibold text-on-surface-variant/60 font-body">{items.length} {items.length === 1 ? 'item' : 'items'}</p>
                  </div>

                  <div className="divide-y divide-outline-variant/10">
                    {items.map((item) => {
                      const name = item.lot_name || item.lots?.lot_name || item.products?.name || 'Item';
                      const img = item.lots?.image_url || item.products?.image_url || 'https://via.placeholder.com/400';
                      const isVoid = isPartial && (
                        rejectedKeys.has(item.products?.key) ||
                        rejectedItems.some((r) => r.order_item_id === item.id)
                      );
                      const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);

                      return (
                        <div key={item.id} className={`flex items-center gap-3 px-4 py-3 ${isVoid ? 'opacity-40' : ''}`}>
                          <div className="w-11 h-11 rounded-lg overflow-hidden bg-surface-container-low shrink-0 relative">
                            <img className={`w-full h-full object-cover ${isVoid ? 'grayscale' : ''}`} src={img} alt={name} loading="lazy" />
                            {isVoid && (
                              <div className="absolute inset-0 flex items-center justify-center bg-red-900/30">
                                <span className="text-[7px] font-bold uppercase bg-error text-white px-1.5 py-0.5 rounded font-body">Void</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline gap-2">
                              <h3 className={`text-sm font-semibold font-headline leading-snug truncate ${isVoid ? 'text-red-600 line-through' : 'text-on-surface'}`}>{name}</h3>
                              <span className={`text-sm font-bold font-headline shrink-0 ${isVoid ? 'text-red-500' : 'text-on-surface'}`}>{money(lineTotal)}</span>
                            </div>
                            <p className="text-[11px] text-on-surface-variant/50 font-body mt-0.5">
                              {item.quantity} × {money(item.price)}
                            </p>
                            {item.lot_snapshot?.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {item.lot_snapshot.slice(0, 3).map((b) => (
                                  <span key={`${item.id}-${b.product_key || b.product_name}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-surface-container-low text-[10px] font-medium text-on-surface-variant/60 font-body">
                                    {b.product_name} <span className="text-secondary font-semibold">×{b.quantity}</span>
                                  </span>
                                ))}
                                {item.lot_snapshot.length > 3 && (
                                  <span className="text-[10px] text-on-surface-variant/40 font-body">+{item.lot_snapshot.length - 3} more</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={handleReorder}
                    disabled={!items.length}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-2.5 rounded-lg font-headline font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[16px]">shopping_cart</span>
                    Reorder
                  </button>
                  {canCancel && !isCancelled && (
                    <button
                      onClick={() => setShowCancelModal(true)}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-red-200 text-red-600 font-headline font-semibold text-sm hover:bg-red-50 transition-all active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* RIGHT — Summary sidebar */}
              <aside className="lg:col-span-2 space-y-4">

                {/* Bill Summary */}
                <div className="bg-white rounded-xl border border-outline-variant/15 p-4">
                  <p className="text-xs font-semibold text-on-surface-variant/50 font-body mb-3">Summary</p>

                  <div className="space-y-2 text-sm font-body">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant/70">Subtotal</span>
                      <span className="font-semibold text-on-surface">{money(bbSub)}</span>
                    </div>

                    {(deliveryFee > 0 || shippingFee > 0) && (
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant/70">Shipping</span>
                        <span className="font-semibold text-on-surface">
                          {freeShip ? (
                            <span className="flex items-center gap-1"><s className="text-on-surface-variant/30 text-xs">{money(deliveryFee)}</s> <span className="text-emerald-600 text-xs font-semibold">Free</span></span>
                          ) : money(shippingFee || deliveryFee)}
                        </span>
                      </div>
                    )}

                    {codFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant/70">COD fee</span>
                        <span className="font-semibold text-on-surface">{money(codFee)}</span>
                      </div>
                    )}

                    {couponDisc > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span className="flex items-center gap-1 font-medium">
                          <span className="material-symbols-outlined text-[13px]">local_offer</span>
                          {couponCode || 'Coupon'}
                        </span>
                        <span className="font-semibold">−{money(couponDisc)}</span>
                      </div>
                    )}

                    {isPartial && refundAmount > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span className="font-medium">Refund</span>
                        <span className="font-semibold">−{money(refundAmount)}</span>
                      </div>
                    )}

                    <div className="pt-3 mt-1 border-t border-outline-variant/10 flex justify-between items-baseline">
                      <span className="font-semibold text-on-surface text-sm">{isCancelled ? 'Refund' : 'Total'}</span>
                      <span className="font-headline text-lg font-bold text-primary">
                        {isCancelled ? money(grandTotal) : isPartial ? money(Math.max(0, grandTotal - refundAmount)) : money(grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment */}
                <div className="bg-white rounded-xl border border-outline-variant/15 p-4">
                  <p className="text-xs font-semibold text-on-surface-variant/50 font-body mb-3">Payment</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-primary text-[14px]">{isRazorpay ? 'credit_card' : 'local_atm'}</span>
                      </div>
                      <span className="text-sm font-semibold text-on-surface font-headline">{isRazorpay ? 'Razorpay' : 'Cash on Delivery'}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold font-body ${
                      payStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' :
                      payStatus === 'refunded' ? 'bg-blue-100 text-blue-700' :
                      payStatus === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{payStatus}</span>
                  </div>

                  {isRazorpay && order.razorpay_payment_id && (
                    <div className="mt-2.5 p-2 bg-surface-container-low rounded-lg">
                      <p className="text-[10px] text-on-surface-variant/40 font-body mb-0.5">Payment ID</p>
                      <code className="text-[11px] font-mono font-medium text-primary break-all">{order.razorpay_payment_id}</code>
                    </div>
                  )}

                  {refundInfo && (
                    <div className={`mt-2.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold font-body ${refundInfo.badge}`}>
                      <span className="material-symbols-outlined text-[13px]">refresh</span>
                      {refundInfo.label}
                    </div>
                  )}

                  {order.coupon_code && (
                    <div className="mt-2.5 flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                      <span className="material-symbols-outlined text-emerald-500 text-[14px]">redeem</span>
                      <span className="text-xs font-semibold text-emerald-800 font-body uppercase">{order.coupon_code}</span>
                    </div>
                  )}
                </div>

                {/* Delivery Address */}
                <div className="bg-white rounded-xl border border-outline-variant/15 p-4">
                  <p className="text-xs font-semibold text-on-surface-variant/50 font-body mb-3">Delivery</p>
                  <p className="text-sm font-semibold text-on-surface font-headline">{addr.first_name} {addr.last_name}</p>
                  <p className="text-xs text-on-surface-variant/70 font-body mt-1 leading-relaxed">
                    {addr.address_line1}
                    {addr.address_line2 && <>, {addr.address_line2}</>}
                    <br />
                    {addr.city}, {addr.state} {addr.postal_code}
                  </p>
                  {addr.phone && (
                    <p className="text-xs text-on-surface-variant/60 font-body mt-2 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[13px]">call</span>
                      {addr.phone}
                    </p>
                  )}
                </div>

                {/* Order ID */}
                <div className="bg-surface-container-low rounded-lg p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-on-surface-variant/40 font-body mb-0.5">Order ID</p>
                    <code className="text-[10px] font-mono text-primary/70 break-all">{order.id}</code>
                  </div>
                  <button
                    onClick={copyOrderId}
                    className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant/30 hover:text-primary transition-all active:scale-90 shrink-0"
                    title="Copy"
                  >
                    <span className="material-symbols-outlined text-[14px]">{copied ? 'check' : 'content_copy'}</span>
                  </button>
                </div>

              </aside>
            </div>
          </section>
        </div>
      </div>

      {/* ── CANCEL MODAL ── */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !cancelling && setShowCancelModal(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-outline-variant/20">
            <button
              onClick={() => setShowCancelModal(false)}
              disabled={cancelling}
              className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant/50 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-600 text-lg">warning</span>
              </div>
              <h2 className="font-headline text-lg font-bold text-on-surface">Cancel order?</h2>
            </div>

            <p className="text-sm text-on-surface-variant/70 mb-5 font-body leading-relaxed">
              This can't be undone.{isRazorpay ? ' Your refund will be processed within 5-7 business days.' : ''}
            </p>

            <div className="space-y-4">
              <div className="relative">
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant/30 bg-white px-3.5 py-3 text-sm font-body text-on-surface outline-none appearance-none cursor-pointer hover:border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-100 transition-all"
                >
                  <option value="">Select a reason…</option>
                  {cancelReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/30 pointer-events-none text-[18px]">unfold_more</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="flex-1 py-2.5 rounded-lg font-headline font-semibold text-sm text-on-surface-variant hover:bg-surface-container-low transition-all border border-outline-variant/20"
                >
                  Keep order
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling || !cancelReason}
                  className="flex-1 py-2.5 rounded-lg bg-red-600 text-white font-headline font-semibold text-sm transition-all hover:bg-red-700 active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {cancelling ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>
                      Cancelling…
                    </>
                  ) : (
                    'Cancel order'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
