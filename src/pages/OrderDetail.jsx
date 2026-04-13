import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { cartService } from '../services/cartService';

const statusFlow = ['placed', 'processed', 'shipped', 'delivered'];

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrency = (value) => `Rs. ${Number(value || 0).toLocaleString()}`;

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }

    const fetchOrder = async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await supabase
          .from('orders')
          .select('*, order_items(*, products(*), lots(*))')
          .eq('id', id)
          .maybeSingle();

        if (fetchError) throw fetchError;
        if (!data) throw new Error('Order not found');

        setOrder(data);
      } catch (err) {
        console.error('Error fetching order detail:', err);
        setError(err.message || 'Unable to load order details');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [authLoading, id, navigate, user]);

  const timeline = useMemo(() => {
    if (!order) return [];
    const displayStatus = order.insider_order_status || order.status;
    const normalizedStatus = displayStatus === 'processing' ? 'processed' : displayStatus;
    const currentIndex = statusFlow.indexOf(normalizedStatus);

    return statusFlow.map((status, idx) => {
      const done = idx <= currentIndex;
      return {
        key: status,
        label: status.charAt(0).toUpperCase() + status.slice(1),
        done,
      };
    });
  }, [order]);

  const summary = useMemo(() => {
    if (!order) return null;

    const subtotal = (order.order_items || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    const shipping = Math.max(Number(order.total_amount || 0) - subtotal, 0);

    return {
      subtotal,
      shipping,
      total: Number(order.total_amount || 0),
    };
  }, [order]);

  const paymentMethod = String(order?.payment_method || order?.shipping_address?.payment_method || 'cod').toLowerCase();
  const paymentStatus = String(order?.payment_status || 'pending').toLowerCase();
  const paymentLabel = paymentMethod === 'razorpay' ? 'Razorpay (Online)' : 'Cash on Delivery';

  const handleReorder = () => {
    if (!order?.order_items?.length) return;

    order.order_items.forEach((item) => {
      if (item.lots?.id || item.lot_id) {
        cartService.addToCart(
          {
            id: item.lot_id || item.lots?.id,
            lot_id: item.lot_id || item.lots?.id,
            lot_name: item.lot_name || item.lots?.lot_name,
            price: Number(item.price || item.lots?.price || 0),
            image_url: item.lots?.image_url || '',
            description: item.lots?.description || '',
            lot_items: item.lot_snapshot || item.lots?.lot_items || [],
          },
          item.quantity,
        );
        return;
      }

      if (!item.products?.id) return;
      cartService.addToCart(
        {
          id: item.products.id,
          name: item.products.name,
          price: item.price,
          image_url: item.products.image_url,
          category: item.products.category,
          description: item.products.description,
        },
        item.quantity,
      );
    });

    navigate('/cart');
  };

  if (loading) {
    return (
      <main className="pt-24 pb-20 min-h-[60vh] grid place-items-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="pt-28 pb-20 max-w-4xl mx-auto px-6 text-center">
        <span className="material-symbols-outlined text-6xl text-error">error</span>
        <h1 className="font-brand text-4xl text-primary mt-4">Order not available</h1>
        <p className="text-on-surface-variant mt-3">{error || 'This order does not exist or you do not have permission to view it.'}</p>
        <Link to="/orders">
          <button className="mt-8 bg-primary text-on-primary px-8 py-3 rounded-xl font-bold">Back to Orders</button>
        </Link>
      </main>
    );
  }

  return (
    <main className="pb-16 md:pb-24 px-5 md:px-12 max-w-screen-xl mx-auto pt-28 md:pt-32">
      {isFreshOrder && (
        <div className="mb-6 md:mb-8 bg-primary-container/20 border border-primary/20 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <div>
            <p className="font-bold text-primary">Order placed successfully</p>
            <p className="text-xs text-on-surface-variant mt-1">
              {freshPaymentMode === 'online'
                ? 'Your payment was verified successfully and the order is now confirmed.'
                : freshPaymentMode === 'pending'
                  ? 'Your order was created, but payment is still pending. Please contact support for retry assistance.'
                  : 'Your COD order is confirmed. Keep exact cash ready at delivery.'}
            </p>
          </div>
        </div>
      )}

      <header className="mb-8 md:mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-secondary uppercase mb-1 md:mb-2 block">Order Information</p>
            <h1 className="font-brand text-3xl md:text-5xl text-primary tracking-tight leading-none mb-3 md:mb-4">#{order.id.slice(0, 8)}</h1>
            <p className="text-on-surface-variant max-w-lg leading-relaxed text-sm md:text-base">Placed on {formatDateTime(order.created_at)}</p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="flex items-center gap-2 bg-secondary-container/20 px-4 py-2 rounded-full">
              <span className="material-symbols-outlined text-secondary text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>local_shipping</span>
              <span className="text-secondary font-bold text-sm capitalize">{order.insider_order_status || order.status}</span>
            </div>
            <span className="text-xs text-on-surface-variant font-medium tracking-wide">PAYMENT: {paymentLabel.toUpperCase()}</span>
            <span className="text-xs text-on-surface-variant font-medium tracking-wide">PAYMENT STATUS: {paymentStatus.toUpperCase()}</span>
            {order.tracking_number && (
              <span className="text-xs text-on-surface-variant font-medium tracking-wide">TRACKING: {order.shipment_provider || 'Carrier'} - {order.tracking_number}</span>
            )}
          </div>
        </div>
      </header>

      {order.insider_notes && (
        <div className={`mb-6 rounded-xl border px-4 py-3 ${String(order.insider_order_status || order.status).toLowerCase() === 'cancelled'
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <p className="font-bold text-sm mb-1">Order update</p>
          <p className="text-sm leading-relaxed">{order.insider_notes}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12">
        <div className="lg:col-span-8 space-y-6 md:space-y-8">
          <h2 className="font-brand text-lg md:text-xl text-primary border-b border-outline-variant/30 pb-4">Items in This Order</h2>

          {(order.order_items || []).map((item) => (
            <article key={item.id} className="group flex gap-4 md:gap-6 p-4 bg-surface-container-low rounded-xl">
              <div className="w-24 h-28 md:w-36 md:h-36 overflow-hidden rounded-lg bg-surface-dim flex-shrink-0">
                <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={item.lot_name || item.products?.name || 'Order item'} src={item.lots?.image_url || item.products?.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80'} />
              </div>
              <div className="flex-1 flex flex-col justify-between py-1">
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="font-headline font-bold text-lg md:text-xl text-primary">{item.lot_name || item.lots?.lot_name || item.products?.name || 'Lot'}</h3>
                    <span className="font-headline font-bold text-base md:text-lg">{formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</span>
                  </div>
                  <p className="text-xs md:text-sm text-on-surface-variant mt-2 line-clamp-2">{item.lots?.description || item.products?.description || 'Traditional bundle from Hatvoni.'}</p>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <span className="px-3 py-1 bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase tracking-widest rounded-full">{item.lots?.status || 'Lot'}</span>
                    <span className="px-3 py-1 bg-surface-container-highest text-on-surface-variant text-[10px] font-bold uppercase tracking-widest rounded-full">Qty: {item.quantity}</span>
                  </div>
                  {item.lot_snapshot?.length > 0 && (
                    <div className="mt-3 rounded-lg bg-white/60 p-3 text-xs text-on-surface-variant space-y-1">
                      {item.lot_snapshot.map((bundleItem) => (
                        <div key={`${item.id}-${bundleItem.product_key || bundleItem.product_name}`} className="flex items-center justify-between gap-3">
                          <span className="font-medium text-primary">{bundleItem.product_name}</span>
                          <span>x{bundleItem.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}

          <div className="bg-surface-container-low p-5 rounded-2xl border border-outline-variant/10">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>timeline</span>
              <span className="text-[10px] font-bold tracking-widest uppercase text-secondary">Order Timeline</span>
            </div>
            <div className="relative pl-6 border-l-2 border-primary/20 space-y-5">
              {timeline.map((step) => (
                <div key={step.key} className="relative">
                  <div className={`absolute -left-[31px] top-1 w-3 h-3 rounded-full ring-4 ring-surface-container-low ${step.done ? 'bg-primary' : 'bg-outline-variant'}`} />
                  <p className={`text-sm font-bold ${step.done ? 'text-primary' : 'text-on-surface-variant/70'}`}>{step.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <button onClick={handleReorder} className="flex items-center justify-center gap-2 bg-primary-container text-on-primary-container px-6 md:px-8 py-4 rounded-xl font-headline font-bold hover:bg-primary transition-all active:scale-95">
              <span className="material-symbols-outlined text-sm">refresh</span>
              Reorder Items
            </button>
            <Link to="/orders" className="flex-1">
              <button className="w-full flex items-center justify-center gap-2 border-2 border-primary text-primary px-6 md:px-8 py-4 rounded-xl font-headline font-bold hover:bg-primary/5 transition-all active:scale-95">
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Back to Orders
              </button>
            </Link>
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-6 md:space-y-8">
          <div className="bg-surface-container-highest/30 p-5 md:p-6 rounded-2xl">
            <h5 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant/60 mb-3">Delivery Address</h5>
            <p className="font-bold text-on-surface">{order.shipping_address?.first_name} {order.shipping_address?.last_name}</p>
            <p className="text-sm text-on-surface-variant">{order.shipping_address?.address_line1}</p>
            {order.shipping_address?.address_line2 && <p className="text-sm text-on-surface-variant">{order.shipping_address?.address_line2}</p>}
            <p className="text-sm text-on-surface-variant">{order.shipping_address?.city}, {order.shipping_address?.state} {order.shipping_address?.postal_code}</p>
            <p className="text-sm text-on-surface-variant mt-2">{order.shipping_address?.phone}</p>
          </div>

          <div className="bg-surface-container-highest/30 p-5 md:p-6 rounded-2xl">
            <h5 className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant/60 mb-3">Payment Mode</h5>
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-primary-container">payments</span>
              <p className="text-sm font-bold text-primary">{paymentLabel}</p>
            </div>
            <p className="text-[10px] text-on-surface-variant font-medium">
              {paymentMethod === 'razorpay'
                ? `Status: ${paymentStatus}`
                : 'Collection on delivery attempt'}
            </p>
          </div>

          <div className="bg-primary text-on-primary p-6 md:p-8 rounded-xl relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-secondary/20 rounded-full blur-3xl" />
            <h4 className="font-brand text-lg mb-5 relative z-10">Bill Summary</h4>
            <div className="space-y-3 relative z-10">
              <div className="flex justify-between text-sm opacity-80">
                <span>Subtotal</span><span>{formatCurrency(summary?.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm opacity-80">
                <span>Shipping &amp; Fees</span><span>{formatCurrency(summary?.shipping)}</span>
              </div>
              <div className="pt-4 mt-4 border-t border-on-primary/10 flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-secondary-fixed-dim">Amount Collected</p>
                  <p className="text-[10px] font-bold tracking-widest uppercase text-secondary-fixed-dim/80 mt-1">{paymentMethod === 'razorpay' ? `Online ${paymentStatus}` : 'Cash on delivery'}</p>
                  <span className="font-brand text-2xl md:text-3xl text-secondary-fixed-dim">{formatCurrency(summary?.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
