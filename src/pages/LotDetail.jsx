import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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

export default function LotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [lot, setLot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLot = async () => {
      try {
        let data = null;
        let error = null;

        if (id) {
          const result = await supabase
            .from('lots')
            .select('*, lot_items(id, quantity, product_key, products(name, key, image_url, category, price, description, seller_id))')
            .eq('id', id)
            .maybeSingle();
          data = result.data;
          error = result.error;
        } else {
          const result = await supabase
            .from('lots')
            .select('*, lot_items(id, quantity, product_key, products(name, key, image_url, category, price, description, seller_id))')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          data = result.data;
          error = result.error;
        }

        if (error) throw error;
        setLot(data || null);
      } catch (error) {
        console.error('Error fetching lot detail:', error);
        setLot(null);
      } finally {
        setLoading(false);
      }
    };

    fetchLot();
  }, [id]);

  const fallbackLot = {
    id: 'legacy-lot',
    lot_name: 'Starter Lot',
    description: 'A starter bundle prepared from the current active catalog.',
    price: 549,
    status: 'active',
    lot_items: [{ quantity: 1, products: { name: 'Sample Product', key: 'SAMPLE_KEY' } }],
  };

  const selectedLot = lot || fallbackLot;
  const bundleItems = useMemo(() => selectedLot.lot_items || [], [selectedLot]);
  const lotPrice = useMemo(() => calculateLotPrice(selectedLot), [selectedLot]);

  const handleAddToCart = () => {
    cartService.addToCart({ ...selectedLot, item_type: 'lot' }, qty);
    navigate('/cart');
  };

  if (loading) {
    return (
      <main className="pt-32 md:pt-40 pb-20 min-h-[60vh] grid place-items-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
      </main>
    );
  }

  return (
    <main className="pt-32 md:pt-40 pb-20">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 text-sm text-on-surface-variant flex items-center gap-2">
        <Link to="/" className="hover:text-primary transition-colors">Home</Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <Link to="/lots" className="hover:text-primary transition-colors">Lots</Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-primary font-semibold">{selectedLot.lot_name}</span>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-12 md:gap-16">
        <div className="lg:col-span-7 flex flex-col gap-6 md:gap-8">
          <div className="relative group overflow-hidden rounded-xl">
            <div className="absolute -top-4 -left-4 w-24 h-24 bg-secondary-container/20 rounded-full blur-3xl" />
            <img
              alt={`${selectedLot.lot_name} bundle image`}
              className="w-full h-[350px] md:h-[500px] object-cover rounded-xl shadow-sm bg-surface-container-low transition-transform duration-700 group-hover:scale-[1.01]"
              src={selectedLot.image_url || bundleItems[0]?.products?.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80'}
            />
          </div>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6 md:gap-8 lg:sticky lg:top-24 h-fit">
          <div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4">
              <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-xs font-bold tracking-tighter">LOT</span>
              <span className="bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-full text-xs font-bold tracking-tighter">CURATED BUNDLE</span>
            </div>
            <h1 className="font-brand text-5xl md:text-6xl text-primary leading-[0.9] tracking-tighter mb-4">{selectedLot.lot_name}</h1>
            <p className="font-headline text-lg md:text-xl text-secondary font-medium italic">Bundle purchase only</p>
          </div>

          <div className="h-px bg-outline-variant/30 w-full" />

          <p className="font-body text-on-surface-variant leading-relaxed text-sm md:text-base">
            {selectedLot.description || 'This lot contains multiple products bundled for customer purchase.'}
          </p>

          <div className="bg-surface-container-low p-5 md:p-6 rounded-xl border border-outline-variant/10 space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="font-brand text-3xl md:text-4xl text-primary">₹{Number(lotPrice || 0).toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Qty</span>
              <div className="flex items-center bg-surface-container-high rounded-full px-4 py-2 space-x-4">
                <button onClick={() => setQty(Math.max(1, qty - 1))} className="text-primary hover:text-secondary transition-colors"><span className="material-symbols-outlined text-sm">remove</span></button>
                <span className="font-headline font-bold w-4 text-center">{qty}</span>
                <button onClick={() => setQty(qty + 1)} className="text-primary hover:text-secondary transition-colors"><span className="material-symbols-outlined text-sm">add</span></button>
              </div>
            </div>
            <button onClick={handleAddToCart} className="w-full bg-primary-container text-on-primary py-4 px-8 rounded-xl font-headline font-bold flex items-center justify-center gap-3 hover:bg-primary transition-all active:scale-95 shadow-lg shadow-primary-container/20">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_bag</span>
              ADD LOT TO CART
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            {[['inventory_2', 'Bundle'], ['verified_user', 'Fulfilled Together'], ['package_2', 'Order Snapshot']].map(([icon, label]) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-secondary">{icon}</span>
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="max-w-7xl mx-auto px-6 md:px-8 mt-20 md:mt-32">
        <h2 className="font-brand text-3xl md:text-4xl text-primary mb-8 md:mb-12 text-center">Included Products</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
          {bundleItems.length > 0 ? bundleItems.map((item) => (
            <div key={`${selectedLot.id}-${item.id || item.product_key}`} className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10">
              <h3 className="font-brand text-2xl text-primary mb-2">{item.products?.name || item.product_key}</h3>
              <p className="text-sm text-on-surface-variant mb-4">Key: {item.product_key}</p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-on-surface-variant">Quantity</span>
                <span className="font-bold text-primary">{item.quantity}</span>
              </div>
            </div>
          )) : (
            <div className="md:col-span-3 text-center text-on-surface-variant">No included items defined for this lot yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}
