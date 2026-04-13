import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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
      <main className="pt-24 pb-24 md:pt-28 md:pb-16 min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-8 flex items-center justify-center py-32">
          <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-24 pb-24 md:pt-28 md:pb-16">
      <section className="max-w-screen-2xl mx-auto px-6 md:px-8 mb-10 md:mb-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="max-w-2xl">
            <span className="text-secondary font-label font-bold tracking-widest uppercase text-xs mb-3 block">
              Your Collection
            </span>
            <h1 className="font-brand text-4xl md:text-6xl text-primary leading-none tracking-tight">
              Wishlist
            </h1>
            <p className="mt-4 text-on-surface-variant text-sm md:text-lg leading-relaxed max-w-[80%] md:max-w-xl">
              Traditional heirlooms of North East India, curated for your kitchen.
            </p>
          </div>
          {wishlistItems.length > 0 && (
            <div className="flex gap-3 w-full md:w-auto">
              <button className="flex items-center gap-2 px-4 md:px-6 py-3 border-b-2 border-outline-variant hover:border-primary transition-all font-medium text-sm">
                <span className="material-symbols-outlined text-sm">share</span> Share
              </button>
              <button className="flex-1 md:flex-none bg-primary-container text-on-primary-container px-6 md:px-8 py-3 rounded-xl font-semibold text-sm hover:bg-primary transition-colors">
                Add All to Cart
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="max-w-screen-2xl mx-auto px-6 md:px-8">
        {wishlistItems.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-8xl text-on-surface-variant/20">favorite</span>
            <h2 className="mt-6 font-headline text-2xl font-bold text-primary">Your wishlist is empty</h2>
            <p className="mt-2 text-on-surface-variant max-w-md mx-auto">
              Start adding products you love to your wishlist and they'll appear here.
            </p>
            <Link to="/products">
              <button className="mt-8 bg-secondary text-white px-8 py-4 rounded-xl font-headline font-bold hover:bg-secondary/90 transition-colors">
                Explore Products
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-12">
            {wishlistItems.map((item) => (
              <article key={item.id} className="group relative bg-surface-container-low rounded-xl p-4 transition-all duration-300 hover:-translate-y-2">
                <button
                  onClick={() => removeFromWishlist(item.id)}
                  className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/80 backdrop-blur-md flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
                <div className="relative aspect-[4/5] overflow-hidden rounded-lg mb-6">
                  <img
                    alt={item.products?.name}
                    className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105"
                    src={item.products?.image_url}
                  />
                  {item.products?.stock_quantity < 10 && (
                    <div className="absolute bottom-4 left-4">
                      <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">
                        Low Stock
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-start mb-4">
                  <div className="space-y-1">
                    <h3 className="font-headline font-extrabold text-lg md:text-xl text-primary">
                      {item.products?.name}
                    </h3>
                    <p className="text-on-surface-variant text-sm font-medium italic">
                      {item.products?.category}
                    </p>
                  </div>
                  <p className="font-headline font-bold text-lg text-primary">
                    ₹{item.products?.price}
                  </p>
                </div>
                <Link to={`/products/${item.products?.id}`}>
                  <button className="w-full bg-primary-container text-on-primary-container h-12 md:h-14 rounded-xl font-headline font-bold text-xs md:text-sm tracking-widest uppercase flex items-center justify-center gap-2 hover:bg-primary transition-colors active:scale-95 duration-150">
                    <span className="material-symbols-outlined">add_shopping_cart</span>
                    Add to Cart
                  </button>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      {wishlistItems.length > 0 && (
        <section className="mt-16 md:mt-32 pt-12 md:pt-20 border-t border-outline-variant/15">
          <div className="max-w-screen-2xl mx-auto px-6 md:px-8">
            <div className="bg-gradient-to-br from-primary to-primary-container rounded-2xl p-8 md:p-12 text-on-primary">
              <div className="max-w-2xl">
                <h3 className="font-brand text-3xl md:text-4xl mb-4">Ready to complete your collection?</h3>
                <p className="text-on-primary-container/80 mb-8 leading-relaxed">
                  Add all your wishlist items to cart and enjoy free shipping on orders over ₹1000.
                </p>
                <button className="bg-white text-primary px-8 py-4 rounded-xl font-headline font-bold hover:bg-white/90 transition-colors">
                  Add All to Cart - ₹{wishlistItems.reduce((sum, item) => sum + (parseFloat(item.products?.price) || 0), 0).toFixed(2)}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
