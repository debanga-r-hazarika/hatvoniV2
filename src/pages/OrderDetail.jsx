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
  pending:      { label: 'Refund pending',                  badge: 'bg-amber-50 text-amber-800 border-amber-200' },
  initiated:    { label: 'Refund initiated',                badge: 'bg-blue-50 text-blue-800 border-blue-200' },
  completed:    { label: 'Refund completed',                badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  failed:       { label: 'Refund failed — contact support', badge: 'bg-red-50 text-red-800 border-red-200' },
  not_required: null,
};

const statusMeta = {
  placed:     { icon: 'pending_actions', color: 'bg-surface-container-low text-on-surface-variant border-outline-variant/30' },
  processing: { icon: 'settings',        color: 'bg-amber-50 text-amber-800 border-amber-200' },
  shipped:    { icon: 'local_shipping',  color: 'bg-blue-50 text-blue-800 border-blue-200' },
  delivered:  { icon: 'done_all',        color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cancelled:  { icon: 'cancel',         color: 'bg-red-50 text-red-800 border-red-200' },
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
  const payLabel      = isRazorpay ? 'Online (Razorpay)' : 'Cash on Delivery';
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

  // Build a Set of rejected product_keys for fast lookup
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

  /* ── Loading ── */
  if (loading) {
    return (
      <main className="pt-32 pb-24 md:pt-40 md:pb-16 min-h-screen bg-surface">
        <div className="flex items-center justify-center min-h-[40vh]">
          <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
        </div>
      </main>
    );
  }

  /* ── Error ── */
  if (error || !order) {
    return (
      <main className="pt-32 pb-24 md:pt-40 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-4xl mx-auto px-6 text-center py-20">
          <span className="material-symbols-outlined text-6xl text-error/40 mb-4">error</span>
          <h1 className="font-brand text-3xl text-primary mb-2">Order not found</h1>
          <p className="text-on-surface-variant text-sm font-medium mb-8">{error || 'This order does not exist or you do not have permission to view it.'}</p>
          <Link to="/orders">
            <button className="bg-secondary text-white px-8 py-3 rounded-xl font-bold uppercase tracking-widest text-[11px] hover:bg-secondary/90 active:scale-95 transition-all">Back to Orders</button>
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

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <main className="pt-32 pb-24 md:pt-40 md:pb-16 bg-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
          <AccountSidebar />

          <section className="min-w-0">

            {/* ── back ── */}
            <Link to="/orders" className="inline-flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors mb-6 group">
              <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
              <span className="text-[11px] font-bold uppercase tracking-widest">Back to Orders</span>
            </Link>

            {/* ── header ── */}
            <header className="mb-8 border-b border-outline-variant/20 pb-8">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-1.5">Order #{order.id.slice(0, 8)}</p>
                  <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tighter leading-[0.94] uppercase mb-2">
                    Order Details
                  </h1>
                  <p className="text-sm text-on-surface-variant font-medium">
                    Placed on {formatDate(order.created_at)} at {formatTime(order.created_at)}
                  </p>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                  {/* Status badge */}
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest ${sMeta.color}`}>
                    <span className="material-symbols-outlined text-[16px]">{sMeta.icon}</span>
                    {isCancelled ? 'Cancelled' : displayStatus}
                  </div>
                  {/* Payment chip */}
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${payStatus === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      {payLabel} · <span className={payStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}>{payStatus}</span>
                    </span>
                  </div>
                </div>
              </div>
            </header>

            {/* ── TRACKING — top section ── */}
            {!isCancelled && (
              <div className="mb-8 bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 p-5 md:p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Order Progress</p>
                  {order.tracking_number && (
                    <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-xl border border-outline-variant/20">
                      <span className="material-symbols-outlined text-[14px] text-secondary">local_shipping</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                        {order.shipment_provider || 'AWB'}: <span className="text-primary font-mono">{order.tracking_number}</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* progress bar */}
                <div className="mb-5">
                  <div className="h-1 w-full bg-outline-variant/15 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-secondary rounded-full transition-all duration-700"
                      style={{ width: timeline.length ? `${Math.round((timeline.filter(t => t.done).length / timeline.length) * 100)}%` : '0%' }}
                    />
                  </div>
                </div>

                {/* steps */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {timeline.map((step) => (
                    <div key={step.key} className={`flex items-center gap-2.5 p-3 rounded-xl transition-all ${
                      step.active ? 'bg-secondary/5 border border-secondary/20' :
                      step.done ? 'opacity-100' : 'opacity-30'
                    }`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                        step.active ? 'bg-secondary text-white' : step.done ? 'bg-secondary/10 text-secondary' : 'bg-outline-variant/15 text-on-surface-variant/40'
                      }`}>
                        <span className="material-symbols-outlined text-[14px]">
                          {step.key === 'placed' ? 'pending_actions' : step.key === 'processing' ? 'settings' : step.key === 'shipped' ? 'local_shipping' : 'done_all'}
                        </span>
                      </div>
                      <div>
                        <p className={`text-[11px] font-bold ${step.done ? 'text-primary' : 'text-on-surface-variant/40'}`}>{step.label}</p>
                        {step.active && <p className="text-[9px] font-bold text-secondary">Current</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── BANNERS ── */}
            <div className="space-y-4 mb-8">
              {isFreshOrder && !isCancelled && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-4">
                  <span className="material-symbols-outlined text-emerald-600 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <div>
                    <p className="text-sm font-bold text-emerald-900 mb-0.5">Order Confirmed</p>
                    <p className="text-xs text-emerald-800/70 leading-relaxed">
                      {freshPaymentMode === 'online' ? 'Payment verified. Your order is being prepared.'
                       : freshPaymentMode === 'pending' ? 'Semi-confirmed. Complete payment to begin processing.'
                       : 'COD request received. We may call you to confirm.'}
                    </p>
                  </div>
                </div>
              )}

              {isCancelled && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-4">
                  <span className="material-symbols-outlined text-red-600 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>cancel</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-900 mb-0.5">Order Cancelled</p>
                    {order.order_notes && <p className="text-xs text-red-800 mb-1">Reason: {order.order_notes}</p>}
                    <p className="text-xs text-red-700/70">{isRazorpay ? 'Refund processing. Allow 5-7 banking days.' : 'No further action required.'}</p>
                    {refundInfo && (
                      <span className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${refundInfo.badge}`}>
                        {refundInfo.label}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {isPartial && !isCancelled && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-4">
                  <span className="material-symbols-outlined text-amber-600 mt-0.5">inventory</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-900 mb-0.5">Partial Fulfillment</p>
                    <p className="text-xs text-amber-800/70 mb-2">
                      {rejectedItems.length} item{rejectedItems.length !== 1 ? 's were' : ' was'} unavailable and removed from your order. The remaining items are being processed.
                    </p>
                    {/* Show rejected item keys */}
                    {rejectedItems.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {rejectedItems.map((r, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-100 text-red-800 text-[10px] font-bold border border-red-200">
                            ✕ {r.product_key || `Item ${i + 1}`}
                            {r.reason && <span className="font-normal opacity-70"> · {r.reason}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                    {isRazorpay && refundAmount > 0 && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white border border-amber-200 text-[10px] font-bold text-amber-900">
                        Partial Refund: {money(refundAmount)}
                      </span>
                    )}
                    {!isRazorpay && (
                      <span className="inline-flex px-3 py-1 rounded-full bg-amber-100 border border-amber-200 text-[10px] font-bold text-amber-800">
                        COD total adjusted
                      </span>
                    )}
                    {refundInfo && (
                      <span className={`ml-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${refundInfo.badge}`}>
                        {refundInfo.label}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {order.order_notes && !isCancelled && !isPartial && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-start gap-4">
                  <span className="material-symbols-outlined text-primary mt-0.5">sticky_note_2</span>
                  <div>
                    <p className="text-sm font-bold text-primary mb-0.5">Note</p>
                    <p className="text-xs text-on-surface-variant italic leading-relaxed">"{order.order_notes}"</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── MAIN GRID ── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">

              {/* LEFT — items + actions */}
              <div className="xl:col-span-7 space-y-6">

                {/* items */}
                <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 p-5 md:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">{items.length} {items.length === 1 ? 'Item' : 'Items'}</p>
                  </div>

                  <div className="divide-y divide-outline-variant/15">
                    {items.map((item) => {
                      const name = item.lot_name || item.lots?.lot_name || item.products?.name || 'Item';
                      const img = item.lots?.image_url || item.products?.image_url || 'https://via.placeholder.com/400';
                      // Check if this item was rejected — match by product_key or order_item_id
                      const isVoid = isPartial && (
                        rejectedKeys.has(item.products?.key) ||
                        rejectedItems.some((r) => r.order_item_id === item.id)
                      );
                      const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);

                      return (
                        <div key={item.id} className={`flex gap-4 py-4 first:pt-0 last:pb-0 ${isVoid ? 'opacity-50' : ''}`}>
                          <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-surface-container-low shrink-0 relative">
                            <img className={`w-full h-full object-cover ${isVoid ? 'grayscale' : ''}`} src={img} alt={name} />
                            {isVoid && (
                              <div className="absolute inset-0 flex items-center justify-center bg-red-900/30">
                                <span className="text-[8px] font-bold uppercase tracking-widest bg-error text-white px-2 py-0.5 rounded-full">Void</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                              <h3 className={`text-sm font-bold leading-tight truncate ${isVoid ? 'text-error line-through' : 'text-primary'}`}>{name}</h3>
                              <span className={`text-sm font-bold shrink-0 ${isVoid ? 'text-error' : 'text-primary'}`}>{money(lineTotal)}</span>
                            </div>
                            <p className="text-xs text-on-surface-variant/70 mt-0.5 line-clamp-1">
                              {item.lots?.description || item.products?.description || ''}
                            </p>
                            <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest">
                              <span>Qty: {item.quantity}</span>
                              <span>·</span>
                              <span>{money(item.price)} each</span>
                            </div>

                            {item.lot_snapshot?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {item.lot_snapshot.map((b) => (
                                  <span key={`${item.id}-${b.product_key || b.product_name}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-surface-container-low border border-outline-variant/15 text-[10px] font-semibold text-on-surface-variant">
                                    {b.product_name} <span className="text-secondary font-bold">×{b.quantity}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* reorder */}
                <button
                  onClick={handleReorder}
                  disabled={!items.length}
                  className="w-full flex items-center justify-center gap-2.5 bg-primary text-white py-4 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-primary/90 transition-all active:scale-[0.98] shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
                  Reorder These Items
                </button>

                {/* ── CANCEL — at the bottom ── */}
                {canCancel && !isCancelled && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="w-full flex items-center justify-center gap-2.5 bg-error/10 text-error border border-error/20 py-4 rounded-xl font-bold text-[11px] uppercase tracking-widest hover:bg-error/20 transition-all active:scale-[0.98] mt-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">block</span>
                    Cancel Order
                  </button>
                )}
              </div>

              {/* RIGHT — sidebar */}
              <aside className="xl:col-span-5 space-y-6">

                {/* Bill Summary */}
                <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 p-5 md:p-6 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-5">Bill Summary</p>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-on-surface-variant">Subtotal</span>
                      <span className="font-semibold text-primary">{money(bbSub)}</span>
                    </div>

                    {(deliveryFee > 0 || shippingFee > 0) && (
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant">Shipping</span>
                        <span className="font-semibold text-primary">
                          {freeShip ? (
                            <span className="flex items-center gap-1.5"><s className="text-on-surface-variant/40 text-xs">{money(deliveryFee)}</s> <span className="text-emerald-600 font-bold text-xs">Free</span></span>
                          ) : money(shippingFee || deliveryFee)}
                        </span>
                      </div>
                    )}

                    {codFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-on-surface-variant">COD Fee</span>
                        <span className="font-semibold text-primary">{money(codFee)}</span>
                      </div>
                    )}

                    {couponDisc > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span className="flex items-center gap-1 font-medium">
                          <span className="material-symbols-outlined text-[14px]">local_offer</span>
                          Coupon{couponCode ? ` (${couponCode})` : ''}
                        </span>
                        <span className="font-bold">−{money(couponDisc)}</span>
                      </div>
                    )}

                    {isPartial && refundAmount > 0 && (
                      <div className="flex justify-between text-amber-700">
                        <span className="font-medium">Partial refund</span>
                        <span className="font-bold">−{money(refundAmount)}</span>
                      </div>
                    )}

                    <div className="pt-4 mt-1 border-t border-outline-variant/20 flex justify-between">
                      <span className="font-bold text-primary">
                        {isCancelled ? 'Refund Total' : 'Total'}
                      </span>
                      <span className="font-brand text-xl text-primary">
                        {isCancelled ? money(grandTotal) : isPartial ? money(Math.max(0, grandTotal - refundAmount)) : money(grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payment */}
                <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 p-5 md:p-6 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-4">Payment</p>

                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center">
                        <span className="material-symbols-outlined text-[16px]">{isRazorpay ? 'credit_card' : 'local_atm'}</span>
                      </div>
                      <span className="text-sm font-semibold text-primary">{isRazorpay ? 'Razorpay' : 'Cash on Delivery'}</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white ${
                      payStatus === 'paid' ? 'bg-emerald-500' :
                      payStatus === 'refunded' ? 'bg-blue-500' :
                      payStatus === 'failed' ? 'bg-error' :
                      'bg-amber-500'
                    }`}>{payStatus}</span>
                  </div>

                  {isRazorpay && order.razorpay_payment_id && (
                    <div className="mt-3 p-3 bg-surface-container-low rounded-xl border border-outline-variant/15">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-1">Payment ID</p>
                      <code className="text-[11px] font-mono font-semibold text-primary break-all">{order.razorpay_payment_id}</code>
                    </div>
                  )}

                  {refundInfo && (
                    <div className={`mt-3 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[10px] font-bold ${refundInfo.badge}`}>
                      <span className="material-symbols-outlined text-[14px]">refresh</span>
                      {refundInfo.label}
                    </div>
                  )}

                  {order.coupon_code && (
                    <div className="mt-3 flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                      <span className="material-symbols-outlined text-emerald-600 text-[16px]">redeem</span>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-800/50">Coupon</p>
                        <p className="text-xs font-bold text-emerald-900 uppercase">{order.coupon_code}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Shipping address */}
                <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 p-5 md:p-6 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-4">Delivery Address</p>

                  <p className="text-sm font-bold text-primary mb-1">{addr.first_name} {addr.last_name}</p>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    {addr.address_line1}
                    {addr.address_line2 && <><br />{addr.address_line2}</>}
                  </p>
                  <p className="text-sm font-semibold text-primary mt-1">
                    {addr.city}, {addr.state} {addr.postal_code}
                  </p>

                  <div className="mt-4 pt-4 border-t border-outline-variant/15 space-y-2">
                    {addr.phone && (
                      <div className="flex items-center gap-2.5 text-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">call</span>
                        <span className="font-semibold">{addr.phone}</span>
                      </div>
                    )}
                    {addr.email && (
                      <div className="flex items-center gap-2.5 text-xs text-on-surface-variant break-all">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant/40">mail</span>
                        <span className="font-semibold">{addr.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Order ID */}
                <div className="bg-surface-container-low rounded-xl border border-outline-variant/15 p-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/40 mb-2">Order ID</p>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] font-mono font-semibold text-primary break-all flex-1">{order.id}</code>
                    <button
                      onClick={() => navigator.clipboard.writeText(order.id)}
                      className="p-1.5 rounded-lg hover:bg-primary/10 text-on-surface-variant/30 hover:text-primary transition-all active:scale-95"
                      title="Copy"
                    >
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    </button>
                  </div>
                </div>

              </aside>
            </div>
          </section>
        </div>
      </div>
      
      {/* ── CANCEL MODAL ── */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-scrim/40 backdrop-blur-sm" onClick={() => !cancelling && setShowCancelModal(false)}></div>
          <div className="relative bg-surface rounded-[2rem] w-full max-w-md p-6 sm:p-8 shadow-2xl border border-outline-variant/20">
            <button
              onClick={() => setShowCancelModal(false)}
              disabled={cancelling}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-surface-container hover:bg-surface-container-high transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
            
            <div className="flex items-center gap-3 mb-4 text-error">
              <span className="material-symbols-outlined text-3xl">warning</span>
              <h2 className="font-brand text-3xl leading-none">Cancel Order</h2>
            </div>
            
            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              Are you sure you want to cancel this order? This action cannot be undone. 
              {isRazorpay ? ' Your refund will be initiated automatically and may take 5-7 business days to reflect.' : ''}
            </p>
            
            <div className="space-y-6">
              <div className="relative">
                <select
                  id="modal-cancellation-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-xl border-2 border-outline-variant/30 bg-white px-4 py-3.5 text-sm font-semibold text-primary outline-none appearance-none cursor-pointer hover:border-red-300 focus:border-error transition-colors"
                >
                  <option value="">Please select a reason...</option>
                  {cancelReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 pointer-events-none">unfold_more</span>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="px-6 py-3.5 rounded-xl font-bold text-[11px] uppercase tracking-widest text-on-surface-variant hover:bg-surface-container transition-all"
                >
                  Keep Order
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling || !cancelReason}
                  className="px-6 py-3.5 rounded-xl bg-error text-white font-bold text-[11px] uppercase tracking-[0.15em] transition-all hover:bg-error/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md"
                >
                  {cancelling ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                      Cancelling...
                    </>
                  ) : (
                    'Confirm Cancellation'
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
