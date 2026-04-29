import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AccountSidebar from '../components/AccountSidebar';
import { getOrderDisplayId } from '../lib/orderDisplay';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState(null);
  const [activeShipment, setActiveShipment] = useState(null);
  const [loadingItem, setLoadingItem] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*, products(*), lots(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchOrders();

    const channel = supabase
      .channel('orders-list-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `user_id=eq.${user.id}` },
        () => { fetchOrders(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, navigate, fetchOrders]);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const getPaymentLabel = (order) => {
    const method = String(order.payment_method || order.shipping_address?.payment_method || 'cod').toLowerCase();
    if (method.includes('razorpay') || method === 'online') return 'Online';
    return 'COD';
  };

  const normalizeShipmentStatus = (value) => String(value || '').toLowerCase().trim();
  const aggregateToVisualStatus = (value) => {
    const s = normalizeShipmentStatus(value);
    if (['delivered'].includes(s)) return 'delivered';
    if (['failed', 'cancelled', 'rejected', 'partially_failed'].includes(s)) return 'cancelled';
    if (['attention_required'].includes(s)) return 'attention';
    if (['in_transit', 'partially_delivered', 'partially_returning'].includes(s)) return 'shipped';
    if (['processing', 'pre_shipping', 'pending', 'placed'].includes(s)) return 'processing';
    return '';
  };
  const isDeliveredState = (s) => s.includes('delivered');
  const isCancelledState = (s) => s.includes('cancel') || s.includes('reject') || s.includes('lost');

  const resolveProductStatus = (order, item) => {
    const orderStatus = normalizeShipmentStatus(order?.customer_status || order?.order_status || order?.status || '');
    const shipmentStatus = normalizeShipmentStatus(item?.shipment_status || order?.shipment_status || '');
    if (isCancelledState(shipmentStatus)) return 'cancelled';
    if (isDeliveredState(shipmentStatus)) return 'delivered';
    const aggregateVisual = aggregateToVisualStatus(orderStatus);
    if (aggregateVisual) return aggregateVisual;
    if (orderStatus.includes('cancel') || orderStatus.includes('reject')) return 'cancelled';
    if (orderStatus.includes('delivered')) return 'delivered';
    if (item?.order_shipment_id || order?.tracking_number || shipmentStatus.includes('ship') || orderStatus.includes('ship')) return 'shipped';
    if (orderStatus === 'pending' || orderStatus === 'placed') return 'pending';
    return 'processing';
  };

  const statusPill = (status) => {
    if (status === 'delivered') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'shipped') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (status === 'attention') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (status === 'cancelled') return 'bg-red-50 text-red-700 border-red-200';
    if (status === 'pending') return 'bg-surface-container-low text-on-surface-variant/70 border-outline-variant/20';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  const prettyStatus = (status) => {
    if (!status) return 'Processing';
    if (status === 'pending') return 'Processing';
    if (status === 'attention') return 'Attention Required';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return `Today, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  const openProductModal = async (order, item) => {
    setActiveItem({ order, item });
    setActiveShipment(null);
    if (!item?.order_shipment_id) return;
    try {
      setLoadingItem(true);
      const { data, error } = await supabase
        .from('order_shipments')
        .select('id, tracking_number, carrier_shipment_status, velocity_tracking_url, label, shipment_provider, order_shipment_tracking_events(activity, location, carrier_remark, event_time, created_at)')
        .eq('id', item.order_shipment_id)
        .maybeSingle();
      if (error) throw error;
      setActiveShipment(data || null);
    } catch (err) {
      console.warn('Unable to load shipment details', err);
    } finally {
      setLoadingItem(false);
    }
  };

  if (loading) {
    return (
      <main className="pt-28 pb-20 md:pt-36 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
            <AccountSidebar />
            <section className="space-y-4">
              <div className="h-14 rounded-2xl bg-white border border-outline-variant/15 animate-pulse" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-white border border-outline-variant/15 animate-pulse" />
                ))}
              </div>
              <div className="space-y-3.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-40 rounded-2xl bg-white border border-outline-variant/15 animate-pulse" />
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-28 pb-20 md:pt-36 md:pb-16 bg-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          <AccountSidebar />

          <section className="min-w-0 space-y-6">

            {/* Header */}
            <div className="pb-4 border-b border-outline-variant/15 flex items-end justify-between gap-3">
              <div>
                <h1 className="font-headline text-lg font-bold text-primary">Order History</h1>
                <p className="text-xs text-on-surface-variant/60 font-body mt-0.5">
                  {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed
                </p>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-surface-container-low border border-outline-variant/20 text-on-surface-variant/70">
                <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                Recent first
              </span>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-5xl text-on-surface-variant/15 block mb-3">package_2</span>
                <h2 className="font-headline text-base font-bold text-on-surface mb-1">No orders yet</h2>
                <p className="text-sm text-on-surface-variant/60 font-body mb-6 max-w-xs mx-auto">
                  Start exploring our traditional products.
                </p>
                <Link to="/products">
                  <button className="bg-primary text-white px-6 py-2.5 rounded-lg font-headline font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.98]">
                    Browse Products
                  </button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3.5">
                {orders.map(order => {
                  const primaryItem = order.order_items?.[0];
                  const itemCount = order.order_items?.length || 0;
                  const img = primaryItem?.lots?.image_url || primaryItem?.products?.image_url || '';
                  const payStatus = String(order.payment_status || 'pending').toLowerCase();

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl border border-outline-variant/15 overflow-hidden hover:border-outline-variant/30 hover:shadow-sm transition-all group"
                    >
                    <div className="block px-4 py-3.5 sm:px-5">
                        <div className="flex items-center gap-2.5">

                          {/* Thumbnail */}
                          <div className="relative w-12 h-12 shrink-0">
                            {img ? (
                              <div className="w-full h-full rounded-lg overflow-hidden border border-outline-variant/15 bg-surface-container-low">
                                <img
                                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                                  src={img}
                                  alt=""
                                  loading="lazy"
                                />
                              </div>
                            ) : (
                              <div className="w-full h-full rounded-lg bg-gradient-to-br from-surface-container-low to-surface-container flex items-center justify-center border border-outline-variant/15">
                                <span className="material-symbols-outlined text-primary/35 text-[18px]">package_2</span>
                              </div>
                            )}
                          </div>

                          {/* Order info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-sm sm:text-[15px] font-semibold font-headline text-on-surface truncate">
                                {getOrderDisplayId(order)}
                              </h3>
                              <span className="text-sm sm:text-[15px] font-bold font-headline text-on-surface shrink-0">
                                {money(order.total_amount)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                              <span className="text-xs text-on-surface-variant/50 font-body">{formatDate(order.created_at)}</span>
                              <span className="text-on-surface-variant/20">·</span>
                              <span className="text-xs text-on-surface-variant/50 font-body">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                              <span className="text-on-surface-variant/20">·</span>
                              <span className="text-xs text-on-surface-variant/50 font-body">{getPaymentLabel(order)}</span>
                              {payStatus === 'paid' && <span className="text-[10px] text-emerald-600 font-semibold font-body">Paid</span>}
                              {payStatus === 'refunded' && <span className="text-[10px] text-blue-600 font-semibold font-body">Refunded</span>}
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-low border border-outline-variant/15 text-[10px] text-on-surface-variant/70">
                                <span className="material-symbols-outlined text-[11px]">payments</span>
                                {getPaymentLabel(order)}
                              </span>
                              {order.tracking_number && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/10 border border-secondary/15 text-[10px] text-secondary">
                                  <span className="material-symbols-outlined text-[11px]">local_shipping</span>
                                  Live tracking
                                </span>
                              )}
                            </div>
                          </div>

                          <Link to={`/order/${order.id}`} className="material-symbols-outlined text-on-surface-variant/25 group-hover:text-primary transition-all duration-200 group-hover:translate-x-0.5 text-[20px]">
                            chevron_right
                          </Link>
                        </div>

                        <div className="mt-3.5 border-t border-outline-variant/10 pt-3 space-y-2">
                          {(order.order_items || []).slice(0, 3).map((item, idx) => {
                            const pStatus = resolveProductStatus(order, item);
                            const pName = item?.lot_name || item?.lots?.lot_name || item?.products?.name || `Product ${idx + 1}`;
                            return (
                              <button
                                key={item.id || idx}
                                type="button"
                                onClick={() => openProductModal(order, item)}
                                className="w-full flex items-center justify-between gap-2 text-left hover:bg-surface-container-low rounded-xl px-2.5 py-2 transition-all duration-200 hover:translate-x-0.5"
                              >
                                <span className="text-xs text-on-surface/90 truncate font-body">{pName}</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border font-body ${statusPill(pStatus)}`}>
                                  {prettyStatus(pStatus)}
                                </span>
                              </button>
                            );
                          })}
                          {itemCount > 3 && (
                            <span className="text-[11px] text-on-surface-variant/60 font-body px-2">
                              +{itemCount - 3} more products
                            </span>
                          )}
                        </div>
                    </div>
                    {order.tracking_number && (
                      <div className="px-5 pb-3.5 -mt-0.5 border-t border-outline-variant/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-surface-container-low/30">
                        <div className="flex items-center gap-2 pt-3.5">
                          <span className="material-symbols-outlined text-[14px] text-secondary shrink-0">local_shipping</span>
                          <span className="text-[11px] font-semibold text-on-surface-variant/70 font-body">
                            {order.shipment_provider || 'AWB'}: <span className="font-mono text-primary">{order.tracking_number}</span>
                          </span>
                        </div>
                        <Link
                          to={`/track/${encodeURIComponent(order.tracking_number)}`}
                          className="inline-flex items-center justify-center gap-1.5 shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold text-secondary bg-white border border-secondary/20 hover:bg-secondary/10 hover:shadow-sm transition-all duration-200 sm:mt-3.5 self-end sm:self-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="material-symbols-outlined text-[14px]">travel_explore</span>
                          Tracking page
                        </Link>
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* CTA footer */}
            {orders.length > 0 && (
              <div className="bg-surface-container-low rounded-xl p-6 text-center mt-6">
                <p className="text-sm font-semibold text-on-surface font-headline mb-1">Explore more</p>
                <p className="text-xs text-on-surface-variant/60 font-body mb-4">
                  Heritage spices and artisanal pantry staples from North East India.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-outline-variant/20 text-[10px] text-on-surface-variant/70">
                    <span className="material-symbols-outlined text-[12px] text-emerald-600">verified</span>
                    Secure checkout
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-outline-variant/20 text-[10px] text-on-surface-variant/70">
                    <span className="material-symbols-outlined text-[12px] text-blue-600">local_shipping</span>
                    Live shipment updates
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-outline-variant/20 text-[10px] text-on-surface-variant/70">
                    <span className="material-symbols-outlined text-[12px] text-amber-600">support_agent</span>
                    Quick support
                  </span>
                </div>
                <Link to="/products">
                  <button className="bg-primary text-white px-6 py-2.5 rounded-lg font-headline font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] inline-flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">explore</span>
                    Browse Products
                  </button>
                </Link>
                <div className="mt-4 pt-4 border-t border-outline-variant/10 flex flex-wrap items-center justify-center gap-3 text-[11px]">
                  <a href="mailto:support@hatvoni.com" className="inline-flex items-center gap-1 text-secondary hover:underline">
                    <span className="material-symbols-outlined text-[13px]">mail</span>
                    support@hatvoni.com
                  </a>
                  <span className="text-on-surface-variant/30">|</span>
                  <span className="inline-flex items-center gap-1 text-on-surface-variant/60">
                    <span className="material-symbols-outlined text-[13px]">schedule</span>
                    Mon-Sat, 10 AM - 7 PM
                  </span>
                </div>
              </div>
            )}

            {activeItem && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/40" onClick={() => { setActiveItem(null); setActiveShipment(null); }} />
                <div className="relative bg-white rounded-2xl border border-outline-variant/20 w-full max-w-2xl max-h-[85vh] overflow-auto">
                  <div className="p-4 border-b border-outline-variant/10 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-bold">Product detail</p>
                      <p className="text-sm font-semibold text-on-surface">
                        {activeItem.item?.lot_name || activeItem.item?.lots?.lot_name || activeItem.item?.products?.name || 'Product'}
                      </p>
                      <p className="text-xs text-on-surface-variant/60 mt-0.5">
                        {getOrderDisplayId(activeItem.order)} · {money(Number(activeItem.item?.price || 0) * Number(activeItem.item?.quantity || 0))}
                      </p>
                    </div>
                    <button type="button" onClick={() => { setActiveItem(null); setActiveShipment(null); }} className="material-symbols-outlined text-on-surface-variant/70 hover:text-on-surface">close</button>
                  </div>

                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-on-surface-variant/60">Current status</span>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${statusPill(resolveProductStatus(activeItem.order, activeItem.item))}`}>
                        {prettyStatus(resolveProductStatus(activeItem.order, activeItem.item))}
                      </span>
                    </div>

                    {!activeItem.item?.order_shipment_id && (
                      <p className="text-xs text-on-surface-variant/70 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        This product is processing and awaiting shipment assignment (AWB not generated yet).
                      </p>
                    )}

                    {activeItem.item?.order_shipment_id && (
                      <>
                        {loadingItem ? (
                          <p className="text-xs text-on-surface-variant/70">Loading shipment updates...</p>
                        ) : (
                          <>
                            <div className="rounded-lg border border-outline-variant/15 p-3 bg-surface-container-low/30">
                              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-bold mb-1">Shipment</p>
                              <p className="text-xs text-on-surface-variant/80">
                                {(activeShipment?.shipment_provider || activeItem.order?.shipment_provider || 'Courier')} · AWB: <span className="font-mono text-primary">{activeShipment?.tracking_number || 'Pending'}</span>
                              </p>
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
                              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-bold mb-2">Timeline</p>
                              {(activeShipment?.order_shipment_tracking_events || []).length === 0 ? (
                                <p className="text-xs text-on-surface-variant/60">No tracking events yet.</p>
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
          </section>
        </div>
      </div>
    </main>
  );
}
