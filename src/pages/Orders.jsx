import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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

    // Re-fetch whenever any of the user's orders are updated (e.g. status change from Insider).
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

  const getStatusStyle = (status) => {
    const styles = {
      placed: { bg: 'bg-slate-100', text: 'text-slate-800', dot: 'bg-slate-500' },
      processed: { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' },
      pending: { bg: 'bg-slate-100', text: 'text-slate-800', dot: 'bg-slate-500' },
      processing: { bg: 'bg-amber-100', text: 'text-amber-800', dot: 'bg-amber-500' },
      shipped: { bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500' },
      delivered: { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' },
      cancelled: { bg: 'bg-red-100', text: 'text-red-800', dot: 'bg-red-500' },
    };
    return styles[status] || styles.pending;
  };

  const getPaymentLabel = (order) => {
    const method = String(order.payment_method || order.shipping_address?.payment_method || 'cod').toLowerCase();
    if (method === 'razorpay_upi') return 'Razorpay (UPI)';
    if (method === 'razorpay_cards') return 'Razorpay (Cards/Netbanking)';
    if (method === 'razorpay') return 'Razorpay (Online)';
    return 'Cash on Delivery';
  };

  const getPaymentStatusLabel = (order) => {
    const status = String(order.payment_status || 'pending').toLowerCase();
    if (status === 'paid') return 'Paid';
    if (status === 'failed') return 'Failed';
    if (status === 'refunded') return 'Refunded';
    if (status === 'initiated') return 'Awaiting Payment';
    return 'Pending';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today, ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <main className="pt-24 pb-20 min-h-screen">
        <div className="max-w-screen-xl mx-auto px-6 md:px-12 py-8 md:py-12 flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-24 pb-20">
      <div className="max-w-screen-xl mx-auto px-6 md:px-12 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 md:gap-12">
          <aside className="space-y-6 md:space-y-8">
            <div>
              <h2 className="font-brand text-xl md:text-2xl text-primary mb-4 md:mb-6">Account</h2>
              <nav className="flex flex-row lg:flex-col gap-2 flex-wrap">
                {[
                  { label: 'My Profile', href: '/profile', icon: 'person', active: false },
                  { label: 'My Orders', href: '/orders', icon: 'package_2', active: true },
                  { label: 'Wishlist', href: '/wishlist', icon: 'favorite', active: false },
                ].map(link => (
                  <Link key={link.label} to={link.href}
                    className={`group flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl transition-all text-sm md:text-base ${link.active ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-container-high text-on-surface-variant'}`}>
                    <span className="material-symbols-outlined text-lg md:text-xl" style={link.active ? { fontVariationSettings: "'FILL' 1" } : {}}>{link.icon}</span>
                    <span className="font-headline font-semibold hidden sm:inline">{link.label}</span>
                  </Link>
                ))}
                <div className="pt-2 mt-1 md:mt-2 border-t border-outline-variant/20 w-full">
                  <button
                    onClick={handleLogout}
                    className="group flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl transition-all hover:bg-error-container/20 text-error w-full text-sm md:text-base"
                  >
                    <span className="material-symbols-outlined text-lg md:text-xl">logout</span>
                    <span className="font-headline font-semibold hidden sm:inline">Logout</span>
                  </button>
                </div>
              </nav>
            </div>
            <div className="bg-secondary-container p-5 md:p-6 rounded-2xl relative overflow-hidden hidden lg:block">
              <div className="relative z-10">
                <h4 className="font-headline font-bold text-on-secondary-container mb-2 text-sm">Need assistance?</h4>
                <p className="text-xs text-on-secondary-container/80 mb-4 leading-relaxed">Our heritage experts are available to help with your traditional orders.</p>
                <Link to="/contact">
                  <button className="bg-primary text-on-primary px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-transform active:scale-95">Contact Support</button>
                </Link>
              </div>
              <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-on-secondary-container/10 text-8xl rotate-12">help_center</span>
            </div>
          </aside>

          <section className="min-w-0">
            <header className="mb-8 md:mb-12">
              <h1 className="font-brand text-4xl md:text-6xl text-primary tracking-tighter leading-none mb-3 md:mb-4">My Orders</h1>
              <p className="text-on-surface-variant max-w-xl font-body leading-relaxed text-sm md:text-base">
                A curated history of your journey through the authentic flavors and traditions of North East India.
              </p>
            </header>

            {orders.length === 0 ? (
              <div className="text-center py-16 bg-surface-container-low rounded-2xl">
                <span className="material-symbols-outlined text-8xl text-on-surface-variant/20">package_2</span>
                <h2 className="mt-6 font-headline text-2xl font-bold text-primary">No orders yet</h2>
                <p className="mt-2 text-on-surface-variant max-w-md mx-auto">
                  Start exploring our traditional products and place your first order.
                </p>
                <Link to="/products">
                  <button className="mt-8 bg-secondary text-white px-8 py-4 rounded-xl font-headline font-bold hover:bg-secondary/90 transition-colors">
                    Explore Products
                  </button>
                </Link>
              </div>
            ) : (
              <div className="space-y-6 md:space-y-8">
                {orders.map(order => {
                  const displayStatus = order.insider_order_status || order.status;
                  const statusStyle = getStatusStyle(displayStatus);
                  return (
                    <div key={order.id} className="bg-surface-container-low rounded-2xl md:rounded-[2rem] overflow-hidden transition-all duration-500 hover:shadow-lg">
                      <div className="p-6 md:p-8 lg:p-10">
                        <div className="flex flex-wrap items-start justify-between gap-4 md:gap-6 mb-6 md:mb-10 pb-6 md:pb-8 border-b border-outline-variant/30">
                          <div className="space-y-1 min-w-[100px]">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline">Order Reference</p>
                            <p className="font-brand text-lg md:text-xl text-primary">#{order.id.slice(0, 8)}</p>
                          </div>
                          <div className="space-y-1 min-w-[100px]">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline">Date Placed</p>
                            <p className="font-headline font-bold text-sm md:text-base">{formatDate(order.created_at)}</p>
                          </div>
                          <div className="space-y-1 min-w-[100px]">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline">Total Amount</p>
                            <p className="font-headline font-bold text-secondary text-lg md:text-xl">Rs. {Number(order.total_amount || 0).toLocaleString()}</p>
                          </div>
                          <div className="space-y-1 min-w-[120px]">
                            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-outline">Payment</p>
                            <p className="font-headline font-bold text-sm md:text-base">{getPaymentLabel(order)}</p>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-on-surface-variant font-bold">{getPaymentStatusLabel(order)}</p>
                          </div>
                          <span className={`${statusStyle.bg} ${statusStyle.text} px-3 md:px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 self-start`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
                            {displayStatus}
                          </span>
                        </div>

                        {order.tracking_number && (
                          <div className="mb-6 md:mb-8 p-3 md:p-4 bg-surface-container-highest rounded-xl border border-outline-variant/20 flex flex-wrap items-center gap-2 md:gap-3 text-xs">
                            <span className="font-bold text-primary uppercase tracking-widest">Tracking</span>
                            <span className="font-semibold text-on-surface">{order.shipment_provider || 'Carrier'}: {order.tracking_number}</span>
                            {order.shipment_status && <span className="px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold uppercase">{order.shipment_status}</span>}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
                          <div className="flex gap-4 md:gap-6 overflow-x-auto pb-2">
                            {order.order_items?.length > 0 ? (
                              order.order_items.map(item => (
                                <div key={item.id} className="flex-shrink-0 group">
                                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl md:rounded-2xl bg-surface-container-highest overflow-hidden mb-2 md:mb-3">
                                    <img
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                      src={item.products?.image_url}
                                      alt={item.products?.name}
                                    />
                                  </div>
                                  <p className="text-xs font-bold leading-tight max-w-[96px] md:max-w-[128px]">{item.lot_name || item.lots?.lot_name || item.products?.name}</p>
                                  <p className="text-[10px] text-outline">Qty: {item.quantity}</p>
                                  {item.lot_snapshot?.length > 0 && (
                                    <p className="text-[10px] text-on-surface-variant mt-1 line-clamp-2">
                                      {item.lot_snapshot.map((bundleItem) => bundleItem.product_name).join(', ')}
                                    </p>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="text-sm text-on-surface-variant">No items</div>
                            )}
                          </div>
                          <div className="flex md:justify-end gap-3 md:gap-4 flex-wrap">
                            {displayStatus === 'shipped' && (
                              <button className="px-5 md:px-8 py-3 md:py-4 rounded-xl font-headline font-bold text-xs md:text-sm flex items-center gap-2 bg-primary text-on-primary hover:bg-primary-container shadow-lg shadow-primary/10 transition-all">
                                {order.tracking_number ? `Track ${order.tracking_number}` : 'Track Package'}
                              </button>
                            )}
                            {displayStatus === 'delivered' && (
                              <button className="px-5 md:px-8 py-3 md:py-4 rounded-xl font-headline font-bold text-xs md:text-sm flex items-center gap-2 bg-surface-container-highest text-on-surface-variant hover:bg-outline-variant/20 transition-all">
                                Invoice <span className="material-symbols-outlined text-sm">download</span>
                              </button>
                            )}
                            {(displayStatus === 'pending' || displayStatus === 'processing' || displayStatus === 'placed' || displayStatus === 'processed') && (
                              <button className="px-5 md:px-8 py-3 md:py-4 rounded-xl font-headline font-bold text-xs md:text-sm flex items-center gap-2 bg-surface-container-highest text-on-surface-variant opacity-50 cursor-not-allowed">
                                Processing...
                              </button>
                            )}
                            <Link to={`/order/${order.id}`}>
                              <button className="px-5 md:px-8 py-3 md:py-4 rounded-xl font-headline font-bold text-xs md:text-sm flex items-center gap-2 bg-primary text-on-primary hover:bg-primary-container shadow-lg shadow-primary/10 transition-all">
                                View Details
                              </button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-12 md:mt-20 p-8 md:p-12 rounded-3xl bg-gradient-to-br from-primary to-primary-container text-on-primary flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 relative overflow-hidden">
              <div className="relative z-10 max-w-md">
                <h3 className="font-brand text-2xl md:text-3xl mb-3 md:mb-4 leading-tight">Missing something traditional?</h3>
                <p className="text-on-primary-container/90 font-body text-xs md:text-sm leading-relaxed mb-5 md:mb-6">
                  Explore our new collection of heritage spices and artisanal pantry staples from the heart of the hills.
                </p>
                <Link to="/products">
                  <button className="bg-secondary-container text-on-secondary-container px-8 md:px-10 py-3 md:py-4 rounded-full font-headline font-bold text-sm transition-all hover:shadow-xl active:scale-95">
                    Explore Collections
                  </button>
                </Link>
              </div>
              <div className="relative z-10 hidden md:block">
                <span className="material-symbols-outlined text-[100px] md:text-[120px] opacity-20" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant_menu</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
