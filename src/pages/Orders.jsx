import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AccountSidebar from '../components/AccountSidebar';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
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

  const getStatusConfig = (status) => {
    const s = {
      placed:     { label: 'Placed',     icon: 'schedule',        style: 'bg-surface-container-low text-on-surface-variant border-outline-variant/20' },
      processed:  { label: 'Processed',  icon: 'check_circle',    style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      pending:    { label: 'Pending',     icon: 'schedule',        style: 'bg-surface-container-low text-on-surface-variant border-outline-variant/20' },
      processing: { label: 'Processing', icon: 'autorenew',       style: 'bg-amber-50 text-amber-700 border-amber-200' },
      shipped:    { label: 'Shipped',     icon: 'local_shipping',  style: 'bg-blue-50 text-blue-700 border-blue-200' },
      delivered:  { label: 'Delivered',   icon: 'check_circle',    style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      cancelled:  { label: 'Cancelled',   icon: 'cancel',          style: 'bg-red-50 text-red-600 border-red-200' },
    };
    return s[status] || s.pending;
  };

  const getPaymentLabel = (order) => {
    const method = String(order.payment_method || order.shipping_address?.payment_method || 'cod').toLowerCase();
    if (method.includes('razorpay') || method === 'online') return 'Online';
    return 'COD';
  };

  const getDisplayStatus = (order) => String(order.order_status || order.status || '').toLowerCase();

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return `Today, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <main className="pt-28 pb-20 md:pt-36 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-secondary text-3xl">progress_activity</span>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-28 pb-20 md:pt-36 md:pb-16 bg-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
          <AccountSidebar />

          <section className="min-w-0 space-y-5">

            {/* Header */}
            <div className="pb-4 border-b border-outline-variant/15">
              <h1 className="font-headline text-lg font-bold text-primary">Order History</h1>
              <p className="text-xs text-on-surface-variant/60 font-body mt-0.5">
                {orders.length} {orders.length === 1 ? 'order' : 'orders'} placed
              </p>
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
              <div className="space-y-3">
                {orders.map(order => {
                  const displayStatus = getDisplayStatus(order);
                  const statusConfig = getStatusConfig(displayStatus);
                  const primaryItem = order.order_items?.[0];
                  const itemCount = order.order_items?.length || 0;
                  const img = primaryItem?.lots?.image_url || primaryItem?.products?.image_url || '';
                  const payStatus = String(order.payment_status || 'pending').toLowerCase();

                  return (
                    <Link key={order.id} to={`/order/${order.id}`} className="block">
                      <div className="bg-white rounded-xl border border-outline-variant/15 p-4 hover:border-outline-variant/30 hover:shadow-sm transition-all group">
                        <div className="flex items-center gap-3">

                          {/* Thumbnail */}
                          {img && (
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface-container-low shrink-0">
                              <img className="w-full h-full object-cover" src={img} alt="" loading="lazy" />
                            </div>
                          )}
                          {!img && (
                            <div className="w-12 h-12 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-primary/30 text-xl">package_2</span>
                            </div>
                          )}

                          {/* Order info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="text-sm font-semibold font-headline text-on-surface truncate">
                                #{order.id.slice(0, 8).toUpperCase()}
                              </h3>
                              <span className="text-sm font-bold font-headline text-on-surface shrink-0">
                                {money(order.total_amount)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-on-surface-variant/50 font-body">{formatDate(order.created_at)}</span>
                              <span className="text-on-surface-variant/20">·</span>
                              <span className="text-xs text-on-surface-variant/50 font-body">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                              <span className="text-on-surface-variant/20">·</span>
                              <span className="text-xs text-on-surface-variant/50 font-body">{getPaymentLabel(order)}</span>
                              {payStatus === 'paid' && <span className="text-[10px] text-emerald-600 font-semibold font-body">Paid</span>}
                              {payStatus === 'refunded' && <span className="text-[10px] text-blue-600 font-semibold font-body">Refunded</span>}
                            </div>
                          </div>

                          {/* Status badge */}
                          <span className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold border shrink-0 font-body ${statusConfig.style}`}>
                            <span className="material-symbols-outlined text-[12px]">{statusConfig.icon}</span>
                            {statusConfig.label}
                          </span>

                          {/* Chevron */}
                          <span className="material-symbols-outlined text-on-surface-variant/20 group-hover:text-primary transition-colors text-[18px]">chevron_right</span>
                        </div>

                        {/* Tracking bar (if shipped) */}
                        {order.tracking_number && (
                          <div className="mt-3 pt-3 border-t border-outline-variant/10 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[14px] text-secondary">local_shipping</span>
                            <span className="text-[11px] font-semibold text-on-surface-variant/60 font-body">
                              {order.shipment_provider || 'AWB'}: <span className="font-mono text-primary">{order.tracking_number}</span>
                            </span>
                          </div>
                        )}

                        {/* Mobile status badge */}
                        <div className="sm:hidden mt-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border font-body ${statusConfig.style}`}>
                            <span className="material-symbols-outlined text-[11px]">{statusConfig.icon}</span>
                            {statusConfig.label}
                          </span>
                        </div>
                      </div>
                    </Link>
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
                <Link to="/products">
                  <button className="bg-primary text-white px-6 py-2.5 rounded-lg font-headline font-semibold text-sm hover:bg-primary/90 transition-all active:scale-[0.98] inline-flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">explore</span>
                    Browse Products
                  </button>
                </Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
