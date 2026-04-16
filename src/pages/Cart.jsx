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
    <main className="pt-32 pb-24 md:pt-40 md:pb-32 bg-surface min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-10 md:mb-16 flex flex-wrap items-end justify-between gap-6 border-b border-outline-variant/20 pb-8">
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary">Your Selection</span>
            <h1 className="font-brand text-5xl md:text-7xl text-primary tracking-tighter leading-none">Your Basket</h1>
            <p className="text-on-surface-variant font-medium tracking-wide text-sm leading-relaxed max-w-lg mt-4">
              Review your curated items of authentic North East Indian heritage before proceeding to secure checkout.
            </p>
          </div>
          {items.length > 0 && (
            <button onClick={clearCart} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-red-600 hover:text-red-700 hover:bg-red-50 px-5 py-3 rounded-xl transition-all active:scale-95">
              <span className="material-symbols-outlined text-[16px]">close</span>
              Clear Basket
            </button>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 md:gap-14 items-start">
          <section className="lg:col-span-7 xl:col-span-8 space-y-6 md:space-y-8">
            {items.length === 0 ? (
              <div className="text-center py-24 bg-surface-container-lowest border border-outline-variant/30 rounded-[2rem] shadow-sm relative overflow-hidden flex flex-col items-center group">
                 <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-bl-[150px] -z-10 group-hover:scale-110 transition-transform"></div>
                <span className="material-symbols-outlined text-[80px] text-primary/10 mb-6">shopping_bag</span>
                <h2 className="font-brand text-3xl md:text-4xl text-primary mb-3 leading-tight">Your basket is perfectly empty</h2>
                <p className="text-sm font-medium text-on-surface-variant max-w-md mx-auto mb-8">
                  Fill it with traditional staples and unique heritage ingredients.
                </p>
                <Link to="/products">
                  <button className="bg-primary text-white border-2 border-primary hover:bg-primary/90 px-8 py-4 rounded-2xl font-bold text-[11px] uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center justify-center gap-2">
                     <span className="material-symbols-outlined text-[16px]">explore</span>
                     Explore Collection
                  </button>
                </Link>
              </div>
            ) : (
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-[2rem] p-4 md:p-8 shadow-sm">
                <div className="space-y-6 md:space-y-8">
                  {items.map((item, index) => (
                    <article key={item.id} className={`group flex flex-col sm:flex-row gap-5 md:gap-8 items-start pb-6 md:pb-8 ${index !== items.length - 1 ? 'border-b border-outline-variant/20' : ''}`}>
                      <Link to={item.item_type === 'lot' ? `/lots/${item.entity_id || item.lot_id}` : `/products/${item.entity_id || item.product_id}`} className="w-full sm:w-36 md:w-44 aspect-square overflow-hidden rounded-2xl bg-surface-container relative shrink-0">
                        <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" src={item.image_url || 'https://via.placeholder.com/400'} alt={item.name} />
                        <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </Link>

                      <div className="flex-1 w-full flex flex-col h-full justify-between">
                        <div>
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <p className="text-[10px] font-bold tracking-[0.2em] text-secondary uppercase mb-1">{item.item_type === 'lot' ? 'Heritage Bundle' : (item.category || 'Traditional Staple')}</p>
                              <h3 className="font-brand text-2xl md:text-3xl text-primary leading-[0.94] group-hover:text-secondary transition-colors">{item.name}</h3>
                            </div>
                            <span className="font-bold text-xl md:text-2xl text-primary whitespace-nowrap">₹{(Number(item.price || 0) * item.qty).toLocaleString()}</span>
                          </div>

                          {item.description && (
                            <p className="text-on-surface-variant font-medium leading-relaxed italic text-xs md:text-sm mt-3 hidden md:block line-clamp-2 max-w-md">{item.description}</p>
                          )}

                          {(item.lot_items || []).length > 0 && (
                            <div className="mt-4 rounded-xl bg-surface-container-lowest border border-outline-variant/20 p-3 text-xs space-y-1.5 shadow-sm">
                              <p className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/70 mb-2">Bundle Contents</p>
                              {(item.lot_items || []).slice(0, 4).map((bundleItem) => (
                                <div key={`${item.id}-${bundleItem.product_key || bundleItem.id}`} className="flex items-center justify-between gap-3 text-on-surface-variant">
                                  <span className="font-bold">{bundleItem.products?.name || bundleItem.product_name || bundleItem.product_key}</span>
                                  <span className="text-[10px]">×{bundleItem.quantity}</span>
                                </div>
                              ))}
                              {item.lot_items?.length > 4 && (
                                <div className="text-[10px] font-bold text-secondary tracking-wider pt-1.5 border-t border-outline-variant/20 mt-2">+ {item.lot_items.length - 4} more items</div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between pt-6 mt-auto gap-4">
                          <div className="flex items-center bg-surface-container border border-outline-variant/30 rounded-2xl px-4 py-2 shadow-sm">
                            <button onClick={() => updateQty(item.id, -1)} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-white transition-all active:scale-95" aria-label="Decrease quantity">
                              <span className="material-symbols-outlined text-[16px]">remove</span>
                            </button>
                            <span className="font-bold text-sm md:text-base w-10 text-center tracking-widest">{item.qty}</span>
                            <button onClick={() => updateQty(item.id, 1)} className="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-primary hover:bg-white transition-all active:scale-95" aria-label="Increase quantity">
                              <span className="material-symbols-outlined text-[16px]">add</span>
                            </button>
                          </div>

                          <button onClick={() => removeItem(item.id)} className="text-on-surface-variant font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 hover:text-red-600 transition-colors bg-surface-container-low px-4 py-2.5 rounded-xl border border-transparent hover:border-red-100 hover:bg-red-50">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                            Remove
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-40">
            <div className="bg-primary p-6 md:p-8 rounded-[2rem] shadow-xl relative overflow-hidden group">
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-secondary/20 rounded-full blur-3xl mix-blend-screen group-hover:scale-110 transition-transform duration-1000"></div>
              <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-white/10 rounded-full blur-3xl mix-blend-screen group-hover:scale-110 transition-transform duration-1000"></div>
              
              <h2 className="font-brand text-3xl font-bold text-white border-b border-white/20 pb-6 mb-6 relative z-10 leading-tight">Order Summary</h2>

              <div className="space-y-4 relative z-10 text-white/90">
                <div className="flex justify-between text-sm font-medium">
                  <span>Subtotal ({totals.itemCount} items)</span>
                  <span className="font-bold text-white">₹{totals.subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>Delivery</span>
                  <span className="font-bold text-white">₹{totals.deliveryFee.toLocaleString()}</span>
                </div>
                {totals.freeShippingDiscount > 0 && (
                  <div className="flex justify-between text-secondary text-sm font-bold">
                     <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px]">local_shipping</span> Free Shipping</span>
                    <span>−₹{totals.freeShippingDiscount.toLocaleString()}</span>
                  </div>
                )}
                {totals.subtotal > 0 && totals.subtotal < FREE_DELIVERY_THRESHOLD && (
                  <div className="text-[11px] font-semibold text-secondary leading-relaxed bg-white/10 p-3 rounded-xl backdrop-blur-sm mt-3">
                    Add <span className="font-bold">₹{(FREE_DELIVERY_THRESHOLD - totals.subtotal).toLocaleString()}</span> more to unlock free shipping on this order.
                  </div>
                )}
                {totals.subtotal >= FREE_DELIVERY_THRESHOLD && (
                  <div className="text-[11px] font-bold tracking-widest uppercase text-secondary bg-white/10 p-3 rounded-xl backdrop-blur-sm mt-3 flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Free shipping unlocked
                  </div>
                )}
              </div>

              <div className="pt-6 mt-6 border-t border-white/20 flex justify-between items-end relative z-10">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-bold block mb-1">Pay on Delivery</span>
                  <div className="text-4xl md:text-5xl font-brand text-white leading-none">₹{totals.grandTotal.toLocaleString()}</div>
                </div>
              </div>

              <div className="mt-8 space-y-3 relative z-10">
                <button
                  onClick={handleCheckout}
                  disabled={items.length === 0}
                  className="w-full bg-secondary text-white py-4 md:py-5 rounded-2xl font-bold uppercase tracking-widest text-[11px] hover:bg-secondary/90 transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  Proceed to Checkout
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
                <Link to="/products" className="block">
                  <button className="w-full bg-white/10 backdrop-blur-sm text-white border border-white/20 py-4 rounded-2xl font-bold uppercase tracking-widest text-[11px] hover:bg-white/20 transition-all active:scale-95">
                    Continue Shopping
                  </button>
                </Link>
              </div>
            </div>
            
            <div className="bg-surface-container-lowest border border-outline-variant/30 mt-6 p-5 rounded-2xl flex items-start gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                 <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              </div>
              <p className="text-[11px] font-medium text-on-surface-variant leading-relaxed">
                <strong className="text-primary tracking-wide block mb-0.5">Authenticity Guaranteed</strong>
                Carefully packaged traditional ingredients. Pay exact cash directly at your doorstep on delivery.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
