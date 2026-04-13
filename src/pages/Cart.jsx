import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cartService } from '../services/cartService';

const DELIVERY_FEE = 79;
const FREE_DELIVERY_THRESHOLD = 500;

export default function Cart() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => cartService.getCartItems());

  useEffect(() => {
    const unsubscribe = cartService.subscribe(setItems);
    return unsubscribe;
  }, []);

  const totals = useMemo(() => {
    const itemCount = items.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);
    const deliveryFee = itemCount > 0 ? DELIVERY_FEE : 0;
    const freeShippingDiscount = subtotal >= FREE_DELIVERY_THRESHOLD && deliveryFee > 0 ? deliveryFee : 0;
    const shipping = Math.max(0, deliveryFee - freeShippingDiscount);
    const grandTotal = subtotal + shipping;

    return {
      itemCount,
      subtotal,
      deliveryFee,
      freeShippingDiscount,
      shipping,
      grandTotal,
    };
  }, [items]);

  const updateQty = (id, delta) => {
    const current = items.find((item) => item.id === id);
    if (!current) return;
    cartService.updateCartItemQty(id, Math.max(1, current.qty + delta));
  };

  const removeItem = (id) => {
    cartService.removeCartItem(id);
  };

  const clearCart = () => {
    cartService.clearCart();
  };

  const handleCheckout = () => {
    if (items.length === 0) return;
    navigate('/checkout');
  };

  return (
    <main className="pt-24 pb-20 max-w-7xl mx-auto px-6 md:px-8">
      <header className="mb-10 md:mb-14 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tighter leading-none">Your Basket</h1>
          <p className="text-on-surface-variant font-medium tracking-wide text-xs md:text-sm uppercase">Review items before secure COD checkout</p>
        </div>
        {items.length > 0 && (
          <button onClick={clearCart} className="text-sm text-error font-semibold hover:opacity-70 transition-opacity">
            Clear Basket
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-14 items-start">
        <section className="lg:col-span-8 space-y-6 md:space-y-8">
          {items.length === 0 && (
            <div className="text-center py-24 bg-surface-container-low rounded-2xl">
              <span className="material-symbols-outlined text-6xl text-on-surface-variant mb-4 block">shopping_basket</span>
              <p className="font-headline text-xl text-on-surface-variant mb-6">Your basket is empty</p>
              <Link to="/products">
                <button className="bg-primary text-on-primary px-8 py-4 rounded-xl font-bold">Browse Products</button>
              </Link>
            </div>
          )}

          {items.map((item) => (
            <article key={item.id} className="group flex flex-col sm:flex-row gap-6 md:gap-8 items-center sm:items-start bg-surface-container-low p-4 md:p-6 rounded-2xl">
              <Link to={item.item_type === 'lot' ? `/lots/${item.entity_id || item.lot_id}` : `/products/${item.entity_id || item.product_id}`} className="w-full sm:w-36 md:w-44 aspect-square overflow-hidden rounded-xl bg-surface-container-lowest flex-shrink-0">
                <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={item.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80'} alt={item.name} />
              </Link>

              <div className="flex-1 space-y-3 md:space-y-4 w-full">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="font-headline text-xl md:text-2xl font-bold text-primary">{item.name}</h3>
                    <p className="text-on-surface-variant text-xs md:text-sm mt-1">{item.item_type === 'lot' ? 'Lot Bundle' : (item.category || 'Product')}</p>
                  </div>
                  <span className="font-headline font-bold text-lg md:text-xl whitespace-nowrap">Rs. {(Number(item.price || 0) * item.qty).toLocaleString()}</span>
                </div>

                {item.description && (
                  <p className="text-on-surface-variant leading-relaxed max-w-lg italic text-xs md:text-sm hidden md:block line-clamp-2">{item.description}</p>
                )}

                {(item.lot_items || []).length > 0 && (
                  <div className="rounded-xl bg-white/60 p-3 text-xs text-on-surface-variant space-y-1">
                    {(item.lot_items || []).slice(0, 4).map((bundleItem) => (
                      <div key={`${item.id}-${bundleItem.product_key || bundleItem.id}`} className="flex items-center justify-between gap-3">
                        <span className="font-medium text-primary">{bundleItem.products?.name || bundleItem.product_name || bundleItem.product_key}</span>
                        <span>x{bundleItem.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 md:pt-4">
                  <div className="flex items-center bg-surface-container-high rounded-full px-4 py-2 space-x-5">
                    <button onClick={() => updateQty(item.id, -1)} className="text-primary hover:text-secondary transition-colors" aria-label="Decrease quantity">
                      <span className="material-symbols-outlined text-sm">remove</span>
                    </button>
                    <span className="font-headline font-bold text-sm md:text-base w-4 text-center">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="text-primary hover:text-secondary transition-colors" aria-label="Increase quantity">
                      <span className="material-symbols-outlined text-sm">add</span>
                    </button>
                  </div>

                  <button onClick={() => removeItem(item.id)} className="text-error font-medium text-xs md:text-sm flex items-center space-x-1 hover:opacity-70 transition-opacity">
                    <span className="material-symbols-outlined text-base md:text-lg">delete</span>
                    <span>REMOVE</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <aside className="lg:col-span-4 lg:sticky top-28 space-y-4">
          <div className="bg-surface-container-low p-6 md:p-8 rounded-xl space-y-6 shadow-[0_10px_40px_-10px_rgba(27,28,23,0.15)]">
            <h2 className="font-headline text-lg md:text-xl font-bold text-primary border-b border-outline-variant/30 pb-4">Order Summary</h2>

            <div className="space-y-3 md:space-y-4">
              <div className="flex justify-between text-on-surface-variant text-sm">
                  <span>Subtotal ({totals.itemCount} items)</span>
                <span className="font-medium text-on-surface">Rs. {totals.subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant text-sm">
                <span>Delivery</span>
                <span className="font-medium text-on-surface">Rs. {totals.deliveryFee.toLocaleString()}</span>
              </div>
              {totals.freeShippingDiscount > 0 && (
                <div className="flex justify-between text-primary text-sm font-semibold">
                  <span>Free Shipping</span>
                  <span>-Rs. {totals.freeShippingDiscount.toLocaleString()}</span>
                </div>
              )}
              {totals.subtotal > 0 && totals.subtotal < FREE_DELIVERY_THRESHOLD && (
                <div className="text-xs text-secondary font-semibold">
                  Shop for Rs. {FREE_DELIVERY_THRESHOLD.toLocaleString()} to get free shipping. Add Rs. {(FREE_DELIVERY_THRESHOLD - totals.subtotal).toLocaleString()} more.
                </div>
              )}
              {totals.subtotal >= FREE_DELIVERY_THRESHOLD && (
                <div className="text-xs text-primary font-semibold">
                  Free shipping applied automatically.
                </div>
              )}
            </div>

            <div className="pt-4 md:pt-6 border-t border-outline-variant/30 flex justify-between items-end">
              <div>
                <span className="text-xs uppercase tracking-widest text-on-surface-variant font-bold">Pay on Delivery</span>
                <div className="text-2xl md:text-3xl font-headline font-bold text-primary mt-1">Rs. {totals.grandTotal.toLocaleString()}</div>
              </div>
              <span className="text-xs text-secondary-fixed-dim font-bold">COD ONLY</span>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleCheckout}
                disabled={items.length === 0}
                className="w-full bg-primary-container text-on-primary-container py-4 md:py-5 rounded-xl font-headline font-bold text-base md:text-lg hover:bg-primary hover:text-white transition-colors duration-300 flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Proceed to Checkout</span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
              <Link to="/products">
                <button className="w-full border-2 border-primary/10 text-primary py-3 md:py-4 rounded-xl font-medium hover:bg-white transition-all text-sm md:text-base">Continue Shopping</button>
              </Link>
            </div>

            <div className="bg-white/50 p-3 md:p-4 rounded-lg flex items-start space-x-3">
              <span className="material-symbols-outlined text-secondary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              <p className="text-xs text-on-surface-variant leading-relaxed">You can inspect the bundle and pay by cash at your doorstep. Delivery partner accepts exact amount only.</p>
            </div>
          </div>

        </aside>
      </div>
    </main>
  );
}
