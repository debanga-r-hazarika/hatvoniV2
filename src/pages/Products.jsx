import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

function WishlistButton({ productId, wishlistIds, onToggle }) {
  const isActive = wishlistIds.has(productId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        onToggle(productId);
      }}
      className="h-10 w-10 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm grid place-items-center text-primary transition hover:scale-105"
      aria-label={isActive ? 'Remove from wishlist' : 'Add to wishlist'}
    >
      <span
        className={`material-symbols-outlined ${isActive ? 'text-red-500' : 'text-primary'}`}
        style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        favorite
      </span>
    </button>
  );
}

function ProductCard({ product, wishlistIds, onToggleWishlist }) {
  return (
    <article className="group flex flex-col">
      <Link to={`/products/${product.id}`} className="block">
        <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-surface-container-low mb-6">
          <img
            src={product.image_url || 'https://images.unsplash.com/photo-1582582494700-ff9fc5052dbb?auto=format&fit=crop&w=900&q=80'}
            alt={product.name}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
          <div className="absolute top-4 left-4">
            <span className="rounded-full bg-secondary-container px-3 py-1 text-[10px] font-black uppercase tracking-widest text-on-secondary-container">
              {product.category || 'Heritage'}
            </span>
          </div>
          <div className="absolute top-4 right-4">
            <WishlistButton productId={product.id} wishlistIds={wishlistIds} onToggle={onToggleWishlist} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-brand text-2xl font-extrabold text-primary">{product.name}</h3>
            <span className="text-xl font-bold text-secondary">Rs. {Number(product.price || 0).toLocaleString()}</span>
          </div>
          <p className="text-sm leading-relaxed text-on-surface-variant line-clamp-3">
            {product.description || 'Traditional product prepared using time-honored methods from North East India.'}
          </p>
        </div>
      </Link>
      <Link
        to={`/products/${product.id}`}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-container py-4 font-bold text-on-primary-container transition hover:bg-primary hover:text-white"
      >
        <span className="material-symbols-outlined">add_shopping_cart</span>
        View Product
      </Link>
    </article>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('all');
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const { user } = useAuth();

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    const loadWishlist = async () => {
      if (!user) {
        setWishlistIds(new Set());
        return;
      }

      try {
        const { data, error } = await supabase
          .from('wishlists')
          .select('product_id')
          .eq('user_id', user.id);

        if (error) throw error;
        setWishlistIds(new Set((data || []).map((item) => item.product_id)));
      } catch (error) {
        console.error('Error fetching wishlist:', error);
      }
    };

    loadWishlist();
  }, [user]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('show_as_individual_product', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleWishlist = async (productId) => {
    if (!user) {
      alert('Please login to manage your wishlist.');
      return;
    }

    const exists = wishlistIds.has(productId);

    try {
      if (exists) {
        const { error } = await supabase
          .from('wishlists')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
        if (error) throw error;

        setWishlistIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      } else {
        const { error } = await supabase
          .from('wishlists')
          .insert({ user_id: user.id, product_id: productId });
        if (error) throw error;

        setWishlistIds((prev) => new Set([...prev, productId]));
      }
    } catch (error) {
      console.error('Error updating wishlist:', error);
    }
  };

  const categories = useMemo(() => {
    const c = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    return ['all', ...c];
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (activeCategory === 'all') return products;
    return products.filter((product) => product.category === activeCategory);
  }, [products, activeCategory]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-16 pt-32 md:pt-40 lg:px-20">
      <section className="mb-20 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-px w-12 bg-secondary" />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Authentic Heritage</span>
        </div>
        <h1 className="max-w-4xl font-brand text-5xl leading-none tracking-tight text-primary md:text-7xl lg:text-8xl">
          The Essence of <br />
          <span className="text-secondary">North East India</span>
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-on-surface-variant md:text-xl">
          Experience the soulful alchemy of traditional alkaline preparations. Sustainably harvested, naturally filtered, and rooted in the ancestral wisdom of the Seven Sisters.
        </p>
      </section>

      <section className="mb-16 flex flex-wrap gap-4">
        {categories.map((category) => {
          const active = category === activeCategory;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={`rounded-full px-6 py-2 text-sm transition ${
                active
                  ? 'bg-primary text-white font-bold'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-secondary-container hover:text-on-secondary-container'
              }`}
            >
              {category === 'all' ? 'All Products' : category}
            </button>
          );
        })}
      </section>

      <section className="mb-12 flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/25 bg-surface-container-low p-5">
        <p className="text-sm text-on-surface-variant">Looking for bundles? Explore curated lots and combo packs.</p>
        <Link to="/lots" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-primary hover:text-white transition">
          Browse Lots
          <span className="material-symbols-outlined text-base">north_east</span>
        </Link>
      </section>

      {loading ? (
        <div className="grid place-items-center py-24">
          <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-3xl bg-surface-container-low py-20 text-center">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/40">inventory_2</span>
          <p className="mt-4 text-lg text-on-surface-variant">No products available in this category yet.</p>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-x-12 gap-y-20 md:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              wishlistIds={wishlistIds}
              onToggleWishlist={toggleWishlist}
            />
          ))}
        </section>
      )}

      <section className="mt-24 flex flex-col gap-12 rounded-[2rem] bg-surface-container-low p-10 md:mt-32 md:flex-row md:items-center md:p-12">
        <div className="w-full md:w-1/2">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuA8wan-l7ficzoaIjduD_ejjdkbILKx4zfsLHYMRj9mtyHajIHKqkocx3q90ikGpbWgQprNd13aWXXOBLpguig0SwYgIq7ME3k4lfK0pSFeH3u8d3D2-Ewhr5wh5kfm50V3a_JLEaano-5Ul5kIl-KhMNXREpxhQ65luHkt5prb29lk4snfgJa2hHGkp7StBSB4Nr94lhZgwV7IblP9qGhVeBz-jA89sVdJAdyfhpbfKumZPTmO9oVbsno0skVZETmLBEDNz0ttM_IK"
            alt="Hatvoni heritage ingredients"
            className="rounded-2xl shadow-[0_20px_40px_rgba(28,28,25,0.06)]"
          />
        </div>
        <div className="w-full space-y-6 md:w-1/2">
          <h2 className="font-brand text-3xl text-primary">More than a flavor.</h2>
          <p className="leading-loose text-on-surface-variant">
            In North East Indian households, Khar is not just an ingredient. It is a ritual tied to balance, nourishment, and continuity. Every Hatvoni product supports living culinary traditions and local farming communities.
          </p>
          <Link to="/about" className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-widest text-primary">
            Discover Our Story
            <span className="material-symbols-outlined">trending_flat</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
