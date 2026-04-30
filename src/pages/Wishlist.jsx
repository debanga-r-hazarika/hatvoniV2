import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import AccountSidebar from '../components/AccountSidebar';

export default function Wishlist() {
  const [wishlistItems, setWishlistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchWishlist();
  }, [user, navigate]);

  const fetchWishlist = async () => {
    try {
      const { data, error } = await supabase
        .from('wishlists')
        .select('*, products(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWishlistItems(data || []);
    } catch (error) {
      console.error('Error fetching wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFromWishlist = async (wishlistId) => {
    try {
      const { error } = await supabase
        .from('wishlists')
        .delete()
        .eq('id', wishlistId);

      if (error) throw error;
      setWishlistItems(prev => prev.filter(item => item.id !== wishlistId));
    } catch (error) {
      console.error('Error removing from wishlist:', error);
    }
  };

  if (loading) {
    return (
      <main className="pt-8 pb-24 md:pt-12 md:pb-16 min-h-screen bg-surface">
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-8 md:py-12 flex items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-8 pb-24 md:pt-12 md:pb-24 bg-surface min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
          <AccountSidebar />

          <div className="min-w-0 space-y-10 lg:space-y-12">
            <header className="mb-10 lg:mb-12 border-b border-outline-variant/20 pb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
              <div className="max-w-2xl">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-secondary mb-2 flex items-center gap-2">
                  Your Collection <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> Hatvoni
                </span>
                <h1 className="font-brand text-5xl md:text-6xl text-primary tracking-tighter leading-[0.94] mb-4 uppercase">
                  Wishlist
                </h1>
                <p className="text-on-surface-variant font-medium max-w-xl leading-relaxed">
                  Traditional heirlooms of North East India, carefully curated for your kitchen.
                </p>
              </div>
              {wishlistItems.length > 0 && (
                <div className="flex gap-3 w-full md:w-auto mt-4 md:mt-0">
                  <button className="flex-1 md:flex-none uppercase tracking-widest font-bold text-[11px] flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl border border-outline-variant hover:border-primary text-primary transition-all">
                    <span className="material-symbols-outlined text-[16px]">share</span> Share
                  </button>
                  <button className="flex-1 md:flex-none bg-primary text-white uppercase tracking-widest font-bold text-[11px] px-8 py-3.5 rounded-2xl hover:bg-primary/90 transition-all shadow-md active:scale-95 text-center flex items-center justify-center gap-2">
                     <span className="material-symbols-outlined text-[16px]">shopping_cart_checkout</span> Add All
                  </button>
                </div>
              )}
            </header>

            <section>
              {wishlistItems.length === 0 ? (
                <div className="text-center py-24 bg-surface-container-lowest rounded-3xl border-2 border-dashed border-outline-variant/30 flex flex-col items-center">
                  <span className="material-symbols-outlined text-8xl text-primary/10 mb-6">favorite</span>
                  <h2 className="font-brand text-4xl text-primary leading-[0.94] tracking-tight mb-2">Your wishlist is empty</h2>
                  <p className="mt-3 text-on-surface-variant font-medium max-w-md mx-auto">
                    Start adding authentic traditional products you love and they will appear here.
                  </p>
                  <Link to="/products">
                    <button className="mt-8 bg-secondary text-white px-8 py-3.5 rounded-2xl font-bold uppercase tracking-widest text-[11px] hover:bg-secondary/90 transition-all active:scale-95 shadow-md flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">search</span> Explore Products
                    </button>
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6 lg:gap-8">
                  {wishlistItems.map((item) => (
                    <article key={item.id} className="group relative bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-4 transition-all duration-500 hover:shadow-[0_20px_40px_rgba(0,123,71,0.06)] hover:-translate-y-1">
                      <button
                        onClick={() => removeFromWishlist(item.id)}
                        className="absolute top-6 right-6 z-10 w-9 h-9 rounded-full bg-white/60 backdrop-blur-md flex items-center justify-center text-on-surface-variant hover:text-red-500 hover:bg-white shadow-sm transition-all hover:scale-110"
                      >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                      </button>
                      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl mb-5 shadow-sm bg-surface-container-low">
                        <img
                          alt={item.products?.name}
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                          src={item.products?.image_url || 'https://via.placeholder.com/600'}
                        />
                        {item.products?.stock_quantity < 10 && (
                          <div className="absolute top-4 left-4">
                             <span className="inline-flex items-center px-3 py-1 rounded-full bg-secondary text-white text-[9px] font-bold uppercase tracking-widest shadow-md">
                               Low Stock
                             </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                      </div>
                      <div className="px-1 mb-5">
                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-secondary mb-1">
                           {item.products?.category || 'Heritage Collection'}
                        </p>
                        <h3 className="font-brand text-3xl text-primary leading-[0.9] mb-2 tracking-tight group-hover:text-secondary transition-colors line-clamp-1">
                           {item.products?.name}
                        </h3>
                        <div className="flex items-center justify-between">
                           <p className="font-brand text-xl text-primary">
                              ₹{Number(item.products?.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                           </p>
                           {item.products?.unit && <span className="text-xs font-medium text-on-surface-variant">{item.products?.unit}</span>}
                        </div>
                      </div>
                      <Link to={`/products/${item.products?.id}`}>
                        <button className="w-full bg-surface-container-low border border-outline-variant/30 text-primary py-4 rounded-xl font-bold text-[11px] tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-all active:scale-95">
                          <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                          Add to Cart
                        </button>
                      </Link>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {wishlistItems.length > 0 && (
              <section className="mt-16 bg-surface-container-lowest border border-outline-variant/30 rounded-3xl p-8 md:p-12 text-center flex flex-col items-center shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-32 h-32 bg-primary/5 rounded-br-[100px] -z-10 group-hover:scale-110 transition-transform"></div>
                <div className="absolute bottom-0 right-0 w-40 h-40 bg-secondary/5 rounded-tl-[100px] -z-10 group-hover:scale-110 transition-transform"></div>
                <h3 className="font-brand text-4xl text-primary leading-[0.94] tracking-tight mb-4">Complete your heritage journey.</h3>
                <p className="text-on-surface-variant font-medium mb-8 max-w-lg leading-relaxed">
                  Add all items to cart. Standard orders dispatch within 2 business days.
                </p>
                <button className="bg-primary text-white border-2 border-primary hover:bg-primary/90 px-8 py-4 rounded-2xl font-bold uppercase tracking-widest text-[11px] transition-all active:scale-95 shadow-md flex items-center gap-3">
                  <span className="material-symbols-outlined">local_mall</span>
                  Add All &mdash; ₹{wishlistItems.reduce((sum, item) => sum + (parseFloat(item.products?.price) || 0), 0).toFixed(2)}
                </button>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
