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

  const getStatusStyle = (status) => {
    const styles = {
      placed: { bg: 'bg-surface-container-low', text: 'text-on-surface-variant', border: 'border-outline-variant/30', icon: 'pending_actions' },
      processed: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200/50', icon: 'auto_awesome' },
      pending: { bg: 'bg-surface-container-low', text: 'text-on-surface-variant', border: 'border-outline-variant/30', icon: 'pending_actions' },
      processing: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/50', icon: 'settings_cinematic_blur' },
      shipped: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200/50', icon: 'local_shipping' },
      delivered: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200/50', icon: 'done_all' },
      cancelled: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200/50', icon: 'cancel' },
    };
    return styles[status] || styles.pending;
  };

  const getPaymentLabel = (order) => {
    const method = String(order.payment_method || order.shipping_address?.payment_method || 'cod').toLowerCase();
    if (method === 'razorpay_upi') return 'Razorpay UPI';
    if (method === 'razorpay_cards') return 'Online Payment';
    if (method === 'razorpay') return 'Online Payment';
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

  const getDisplayStatus = (order) => String(order.order_status || order.status || '').toLowerCase();

  const getStatusLabel = (order) => {
    const displayStatus = getDisplayStatus(order);
    if (displayStatus === 'placed') return 'Placed';
    return displayStatus ? displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1) : 'Pending';
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
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <main className="pt-32 pb-24 md:pt-40 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-screen-xl mx-auto px-6 md:px-12 py-8 md:py-12 flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-32 pb-24 md:pt-40 md:pb-16 bg-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
          <AccountSidebar />

          <section className="min-w-0">
            <header className="mb-10 lg:mb-12 border-b border-outline-variant/20 pb-8">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-2 block">Order History</span>
              <h1 className="font-brand text-5xl md:text-6xl text-primary tracking-tighter leading-[0.94] mb-4 uppercase">My Orders</h1>
              <p className="text-on-surface-variant font-medium max-w-xl leading-relaxed">
                A curated history of your journey through the authentic flavors and traditions of North East India.
              </p>
            </header>

            {orders.length === 0 ? (
              <div className="text-center py-20 bg-surface-container-lowest border-2 border-dashed border-outline-variant/30 rounded-3xl">
                <span className="material-symbols-outlined text-8xl text-primary/10 mb-4">package_2</span>
                <h2 className="font-brand text-4xl text-primary leading-[0.94] tracking-tight mb-2">No orders yet</h2>
                <p className="text-on-surface-variant font-medium max-w-md mx-auto mb-8">
                  Start exploring our traditional products and place your first order.
                </p>
                <Link to="/products">
                  <button className="bg-secondary text-white px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-secondary/90 transition-all shadow-md active:scale-95">
                    Explore Heritage Collection
                  </button>
                </Link>
              </div>
            ) : (
              <div className="space-y-8">
                {orders.map(order => {
                  const displayStatus = getDisplayStatus(order);
                  const statusStyle = getStatusStyle(displayStatus);
                  const primaryItem = order.order_items?.[0];
                  const itemCount = order.order_items?.length || 0;
                  return (
                    <div key={order.id} className="group bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,123,71,0.04)] hover:-translate-y-1 relative">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-10 group-hover:bg-primary/10 transition-colors"></div>
                      <div className="p-6 md:p-8">
                        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-8">
                          
                          <div className="flex flex-col sm:flex-row gap-6 min-w-0 flex-1">
                            {/* Product Image */}
                            <div className="relative flex-shrink-0 w-full sm:w-40 md:w-48 aspect-square rounded-2xl overflow-hidden bg-surface-container border border-outline-variant/20 shadow-sm">
                              <img
                                className="w-full h-full object-cover"
                                src={primaryItem?.lots?.image_url || primaryItem?.products?.image_url || 'https://via.placeholder.com/400'}
                                alt={primaryItem?.lot_name || primaryItem?.products?.name || 'Order item'}
                              />
                              <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px] text-primary">inventory_2</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                              </div>
                            </div>

                            {/* Order Details */}
                            <div className="min-w-0 flex-1 space-y-6">
                              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-outline-variant/20 pb-5">
                                <div>
                                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-on-surface-variant mb-1">Order #{order.id.slice(0, 8)}</p>
                                  <h3 className="font-brand text-3xl text-primary leading-[0.9] tracking-tight">Placed {formatDate(order.created_at)}</h3>
                                </div>
                                <div className={`px-4 py-2 rounded-xl flex items-center gap-2 border ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text}`}>
                                  <span className="material-symbols-outlined text-[16px]">{statusStyle.icon}</span>
                                  <span className="text-[10px] font-bold uppercase tracking-widest">{getStatusLabel(order)}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                <div>
                                  <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-on-surface-variant mb-1">Total</p>
                                  <p className="font-brand text-xl text-primary drop-shadow-sm">₹{Number(order.total_amount || 0).toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase font-bold tracking-[0.2em] text-on-surface-variant mb-1">Payment</p>
                                  <p className="text-sm font-semibold text-on-surface mb-0.5">{getPaymentLabel(order)}</p>
                                  <p className={`text-[10px] font-bold uppercase tracking-widest ${order.payment_status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{getPaymentStatusLabel(order)}</p>
                                </div>
                              </div>

                              {order.tracking_number && (
                                <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
                                  <div className="flex items-center gap-3">
                                     <span className="material-symbols-outlined text-secondary">local_shipping</span>
                                     <div>
                                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Tracking AWB</p>
                                        <p className="text-sm font-semibold text-primary font-mono tracking-wider">{order.tracking_number}</p>
                                     </div>
                                  </div>
                                  <span className="bg-on-surface text-surface px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">{order.shipment_provider || 'Carrier'}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-col sm:flex-row xl:flex-col gap-3 min-w-[200px] border-t xl:border-t-0 xl:border-l border-outline-variant/20 pt-6 xl:pt-0 xl:pl-8">
                            <Link to={`/order/${order.id}`} className="w-full">
                              <button className="w-full px-6 py-4 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant font-bold text-xs uppercase tracking-widest hover:bg-surface-container transition-all active:scale-95 flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                                Details
                              </button>
                            </Link>
                            
                            {(displayStatus === 'shipped' || displayStatus === 'delivered') && (
                               <button className="w-full px-6 py-4 rounded-xl bg-secondary text-white font-bold text-xs uppercase tracking-widest hover:bg-secondary/90 shadow-md transition-all active:scale-95 flex items-center justify-center gap-2">
                                  <span className="material-symbols-outlined text-[18px]">{displayStatus === 'shipped' ? 'location_on' : 'download'}</span>
                                  {displayStatus === 'shipped' ? 'Track' : 'Invoice'}
                               </button>
                            )}
                          </div>

                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-16 bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-8 md:p-12 text-center flex flex-col items-center relative overflow-hidden group">
               <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-[150px] -z-10 group-hover:scale-110 transition-transform"></div>
               <span className="material-symbols-outlined text-5xl text-primary/20 mb-4">storefront</span>
               <h3 className="font-brand text-4xl text-primary leading-[0.94] tracking-tight mb-3">Craving authentic flavors?</h3>
               <p className="text-on-surface-variant font-medium mb-8 max-w-md leading-relaxed">
                 Explore our latest collection of heritage spices and artisanal pantry staples curated fresh from North East India.
               </p>
               <Link to="/products">
                 <button className="bg-primary text-white border-2 border-primary hover:bg-primary/90 px-8 py-3.5 rounded-2xl font-bold text-[11px] uppercase tracking-widest transition-all active:scale-95 shadow-md flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">explore</span>
                    Browse Staples
                 </button>
               </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
