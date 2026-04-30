import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { cartService } from '../services/cartService';

const calculateLotPrice = (lot) => {
  const lotItems = Array.isArray(lot?.lot_items) ? lot.lot_items : [];
  if (lotItems.length === 0) return Number(lot?.price || 0);

  let hasPricedItem = false;
  const total = lotItems.reduce((sum, item) => {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    const unitPrice = Number(item?.products?.price || item?.unit_price || item?.price || 0);
    if (unitPrice > 0) hasPricedItem = true;
    return sum + (unitPrice * quantity);
  }, 0);

  return hasPricedItem ? total : Number(lot?.price || 0);
};

function LotCard({ lot }) {
  const previewItems = (lot.lot_items || []).slice(0, 3);
  const lotPrice = calculateLotPrice(lot);

  return (
    <article className="group flex flex-col rounded-3xl overflow-hidden border border-outline-variant/20 bg-surface-container-low shadow-sm transition hover:shadow-lg">
      <Link to={`/lots/${lot.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-container-lowest">
          <img
            src={lot.image_url || previewItems[0]?.products?.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80'}
            alt={lot.lot_name}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
          />
          <div className="absolute left-4 top-4 rounded-full bg-primary px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
            Lot
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold text-primary">{lot.lot_name}</h3>
            <p className="mt-1 text-sm text-on-surface-variant line-clamp-2">{lot.description || 'Bundle of products curated for customer purchase.'}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-secondary">₹{Number(lotPrice || 0).toLocaleString('en-IN')}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{(lot.lot_items || []).length} items</p>
          </div>
        </div>

        <div className="space-y-2 rounded-2xl bg-white/60 p-4">
          {(previewItems.length > 0 ? previewItems : [{ products: { name: 'Bundle details available in lot detail view' }, quantity: 1 }]).map((item) => (
            <div key={`${lot.id}-${item.products?.key || item.products?.name || item.quantity}`} className="flex items-center justify-between text-sm">
              <span className="font-medium text-primary">{item.products?.name || 'Included product'}</span>
              <span className="text-on-surface-variant">x{item.quantity}</span>
            </div>
          ))}
        </div>

        <div className="mt-auto flex gap-3">
          <button
            type="button"
            onClick={() => cartService.addToCart({ ...lot, item_type: 'lot' }, 1)}
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition hover:opacity-90"
          >
            Add Lot
          </button>
          <Link to={`/lots/${lot.id}`} className="flex-1">
            <button type="button" className="w-full rounded-xl border border-primary/15 bg-white px-4 py-3 text-sm font-bold text-primary transition hover:bg-primary/5">
              View Details
            </button>
          </Link>
        </div>
      </div>
    </article>
  );
}

export default function Lots() {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchLots = async () => {
      try {
        const { data, error } = await supabase
          .from('lots')
          .select('*, lot_items(id, quantity, product_key, products(name, key, image_url, category, price, seller_id))')
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setLots(data || []);
      } catch (error) {
        console.error('Error fetching lots:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLots();
  }, []);

  const filteredLots = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return lots;
    return lots.filter((lot) => {
      const name = lot.lot_name?.toLowerCase() || '';
      const description = lot.description?.toLowerCase() || '';
      return name.includes(term) || description.includes(term);
    });
  }, [lots, search]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 pt-8 lg:px-20">
      <section className="mb-12 space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-px w-12 bg-secondary" />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-secondary">Lot Catalog</span>
        </div>
        <h1 className="max-w-4xl font-headline text-5xl leading-none tracking-tight text-primary md:text-7xl lg:text-8xl">
          Curated <br />
          <span className="text-secondary">buying lots</span>
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-on-surface-variant md:text-xl">
          Discover curated bundles for better value. You can also buy individual products from the products catalog.
        </p>
        <div className="max-w-xl">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lots"
            className="w-full rounded-2xl border border-outline-variant bg-white px-5 py-4 text-sm outline-none transition focus:border-primary"
          />
        </div>
      </section>

      {loading ? (
        <div className="grid place-items-center py-24">
          <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
        </div>
      ) : filteredLots.length === 0 ? (
        <div className="rounded-3xl bg-surface-container-low py-20 text-center">
          <span className="material-symbols-outlined text-6xl text-on-surface-variant/40">inventory_2</span>
          <p className="mt-4 text-lg text-on-surface-variant">No lots available yet.</p>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
          {filteredLots.map((lot) => (
            <LotCard key={lot.id} lot={lot} />
          ))}
        </section>
      )}
    </main>
  );
}
