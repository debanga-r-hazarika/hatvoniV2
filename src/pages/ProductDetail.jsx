import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { cartService } from '../services/cartService';

const getProductKeyCandidates = (product) => [
  product?.key,
  product?.external_product_id,
  product?.id,
]
  .filter(Boolean)
  .map((value) => String(value));

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

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [relatedLots, setRelatedLots] = useState([]);
  const [loadingLots, setLoadingLots] = useState(false);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        let data = null;
        let error = null;

        if (id) {
          const result = await supabase
            .from('products')
            .select('*')
            .eq('id', id)
            .eq('is_active', true)
            .eq('show_as_individual_product', true)
            .maybeSingle();
          data = result.data;
          error = result.error;
        } else {
          const result = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .eq('show_as_individual_product', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          data = result.data;
          error = result.error;
        }

        if (error) throw error;
        setProduct(data || null);
      } catch (error) {
        console.error('Error fetching product detail:', error);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [id]);

  const fallbackProduct = {
    id: 'legacy-kola-khar',
    name: 'Kola Khar',
    category: 'Traditional Method',
    description: 'Kola Khar is a unique liquid extract prepared by filtering water through the ashes of the sun-dried peels of Bhim Kol. This ancient alkaline preparation is the soul of Assamese cuisine, celebrated for its distinct flavor and profound digestive properties.',
    price: 549,
    key: 'KOLA_KHAR',
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB9-tfjrp4nAjA3WbE5Lk_kz1YsL3sWCYJtBWpdjLRO7BK_Slb-Uw1tWKwyNYw6PJIX3aITl8ZWFJl5iLUxYgSvL4oSzFabuSB7MlKVyXZo2QL7oKTI2BSog3bZnuPFnG8Nm7lyO6G-5d7cOhC05y02X4js-AbFUI9n0dqEMGNpxLmTczKs5aPysrxWWjZGL6NHhucPOREzzGouDGq3dOM3Fyk_J0tI5iPZ2Efg9nwyd2lWbHkpAm_o2d0n-TQD_vS0WfbFxuHGZrSW',
  };

  const selectedProduct = useMemo(() => product || fallbackProduct, [product]);
  const productKeyCandidates = useMemo(() => getProductKeyCandidates(selectedProduct), [selectedProduct]);

  useEffect(() => {
    const fetchRelatedLots = async () => {
      if (productKeyCandidates.length === 0) {
        setRelatedLots([]);
        return;
      }

      setLoadingLots(true);
      try {
        const { data, error } = await supabase
          .from('lot_items')
          .select('lot_id, product_key, lots(id, lot_name, description, image_url, status, price, lot_items(id, quantity, product_key, products(name, key, image_url, price)))')
          .in('product_key', productKeyCandidates)
          .eq('lots.status', 'active');

        if (error) throw error;

        const uniqueLots = [];
        const seen = new Set();
        (data || []).forEach((entry) => {
          const lot = entry.lots;
          if (!lot?.id || seen.has(lot.id)) return;
          seen.add(lot.id);
          uniqueLots.push(lot);
        });

        setRelatedLots(uniqueLots);
      } catch (error) {
        console.error('Error fetching related lots:', error);
        setRelatedLots([]);
      } finally {
        setLoadingLots(false);
      }
    };

    fetchRelatedLots();
  }, [productKeyCandidates]);

  const handleAddToCart = () => {
    cartService.addToCart({ ...selectedProduct, item_type: 'product' }, qty);
    navigate('/cart');
  };

  if (loading) {
    return (
      <main className="pt-8 md:pt-12 pb-20 min-h-[60vh] grid place-items-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
      </main>
    );
  }

  return (
    <main className="pt-8 md:pt-12 pb-20">
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 text-sm text-on-surface-variant flex items-center gap-2">
        <Link to="/" className="hover:text-primary transition-colors">Home</Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <Link to="/products" className="hover:text-primary transition-colors">Our Products</Link>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-primary font-semibold">{selectedProduct.name}</span>
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-12 md:gap-16">
        {/* Left: Image Showcase */}
        <div className="lg:col-span-7 flex flex-col gap-6 md:gap-8">
          <div className="relative group overflow-hidden rounded-xl">
            <div className="absolute -top-4 -left-4 w-24 h-24 bg-secondary-container/20 rounded-full blur-3xl" />
            <img
              alt={`${selectedProduct.name} product image`}
              className="w-full h-[350px] md:h-[500px] object-cover rounded-xl shadow-sm bg-surface-container-low transition-transform duration-700 group-hover:scale-[1.01]"
              src={selectedProduct.image_url || fallbackProduct.image_url}
            />
          </div>
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            <img
              alt="Traditional Process"
              className="w-full h-44 md:h-64 object-cover rounded-xl shadow-sm hover:brightness-105 transition-all"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAIvI_BnLq2ez3uw0FZcS0Vw6Fby7FbSvo92l2rbZz3bpXeFMajns8dsc90wRHpmIp7RCAFVQ6QPYz9d8AgKDAHsgjdiHbymZuvzMa8WmDv_3tvD3_IrkKts_NC__WtZMDUondoEFzuekiFSRbw3BBen-fhCx_s8BFh_HXC3sJwzg_-fuNPbiJ9vp0CJ0l4hSDXiXHv6WNKir8z2z9KaRWCI-DAmzwM8W3fPhp_bSf3Sz4B9V0EdrX-8sTnTQ8EcFyEW9Z9DNucAIDr"
            />
            <div className="bg-primary-container rounded-xl flex flex-col justify-center items-center p-6 md:p-8 text-on-primary text-center">
              <span className="material-symbols-outlined text-3xl md:text-4xl mb-3 md:mb-4" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              <p className="font-headline font-bold text-base md:text-lg uppercase tracking-widest">100% Ancestral</p>
              <p className="font-body text-xs md:text-sm opacity-80 mt-2">Passed down through generations of Assamese kitchens.</p>
            </div>
          </div>
        </div>

        {/* Right: Product Details (Sticky on desktop) */}
        <div className="lg:col-span-5 flex flex-col gap-6 md:gap-8 lg:sticky lg:top-24 h-fit">
          <div>
            <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-4">
              <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-xs font-bold tracking-tighter">{(selectedProduct.category || 'Traditional Method').toUpperCase()}</span>
              <span className="bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-full text-xs font-bold tracking-tighter">ETHNOBOTANICAL</span>
            </div>
            <h1 className="font-brand text-5xl md:text-6xl text-primary leading-[0.9] tracking-tighter mb-4">{selectedProduct.name}</h1>
            <p className="font-headline text-lg md:text-xl text-secondary font-medium italic">The Sacred Alkaline Essence of Assam</p>
          </div>

          <div className="h-px bg-outline-variant/30 w-full" />

          <div className="flex flex-col gap-4">
            <p className="font-body text-on-surface-variant leading-relaxed text-sm md:text-base">
              {selectedProduct.description || fallbackProduct.description}
            </p>
            <div className="space-y-3">
              <h3 className="font-headline font-bold text-sm uppercase tracking-widest text-primary">Health Benefits</h3>
              <ul className="space-y-2">
                {['Natural antacid that aids in smooth digestion.', 'Rich in essential minerals like potassium and magnesium.', 'Helps maintain healthy gut pH levels when used in traditional recipes.'].map((b) => (
                  <li key={b} className="flex items-start gap-3 text-sm">
                    <span className="material-symbols-outlined text-secondary text-base mt-0.5">check_circle</span>
                    <span className="text-on-surface-variant">{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Price + Actions */}
          <div className="bg-surface-container-low p-5 md:p-6 rounded-xl border border-outline-variant/10">
            <div className="flex items-baseline gap-2 mb-6">
              <span className="font-brand text-3xl md:text-4xl text-primary">₹{Number(selectedProduct.price || 0).toLocaleString()}</span>
              <span className="text-on-surface-variant text-sm line-through decoration-secondary/50">₹{Math.round(Number(selectedProduct.price || 0) * 1.24).toLocaleString()}</span>
              <span className="text-secondary text-xs font-bold ml-auto bg-secondary-fixed px-2 py-0.5 rounded">SAVE 21%</span>
            </div>

            <div className="space-y-3 mb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Available Buying Options</p>
              <div className="rounded-xl border border-primary/15 bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-primary">Buy Individual Product</p>
                    <p className="text-xs text-on-surface-variant">Purchase this product directly.</p>
                  </div>
                  <span className="text-sm font-bold text-secondary">₹{Number(selectedProduct.price || 0).toLocaleString('en-IN')}</span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center bg-surface-container-high rounded-full px-4 py-2 space-x-4">
                    <button onClick={() => setQty(Math.max(1, qty - 1))} className="text-primary hover:text-secondary transition-colors"><span className="material-symbols-outlined text-sm">remove</span></button>
                    <span className="font-headline font-bold w-4 text-center">{qty}</span>
                    <button onClick={() => setQty(qty + 1)} className="text-primary hover:text-secondary transition-colors"><span className="material-symbols-outlined text-sm">add</span></button>
                  </div>
                  <button onClick={handleAddToCart} className="rounded-xl bg-primary-container text-on-primary px-4 py-2 text-sm font-bold hover:bg-primary hover:text-white transition">
                    Add Individual
                  </button>
                </div>
              </div>

              {loadingLots ? (
                <p className="text-xs text-on-surface-variant">Loading lots containing this product...</p>
              ) : relatedLots.length > 0 ? (
                <div className="space-y-3">
                  {relatedLots.map((lot) => (
                    <div key={lot.id} className="rounded-xl border border-outline-variant/20 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-primary">{lot.lot_name}</p>
                          <p className="text-xs text-on-surface-variant line-clamp-1">{lot.description || 'Bundle option containing this product.'}</p>
                        </div>
                        <span className="text-sm font-bold text-secondary">₹{calculateLotPrice(lot).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => cartService.addToCart({ ...lot, item_type: 'lot' }, 1)}
                          className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:opacity-90"
                        >
                          Add Lot
                        </button>
                        <Link to={`/lots/${lot.id}`} className="flex-1">
                          <button type="button" className="w-full rounded-lg border border-primary/20 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5">
                            View Lot
                          </button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant">No active lots currently include this product.</p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button onClick={handleAddToCart} className="w-full bg-primary-container text-on-primary py-4 px-8 rounded-xl font-headline font-bold flex items-center justify-center gap-3 hover:bg-primary transition-all active:scale-95 shadow-lg shadow-primary-container/20">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_bag</span>
                BUY INDIVIDUAL NOW
              </button>
              <Link to="/lots">
                <button className="w-full bg-surface-container-lowest text-primary border border-primary/20 py-4 px-8 rounded-xl font-headline font-bold hover:bg-surface-container transition-all">
                  EXPLORE LOT OPTIONS
                </button>
              </Link>
            </div>
          </div>

          {/* Trust icons */}
          <div className="grid grid-cols-3 gap-4 text-center">
            {[['local_shipping', 'Express Shipping'], ['verified_user', 'Purity Tested'], ['history_edu', 'Handcrafted']].map(([icon, label]) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-secondary">{icon}</span>
                <span className="text-[10px] uppercase font-bold tracking-widest opacity-60">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Heritage Bento */}
      <section className="max-w-7xl mx-auto px-6 md:px-8 mt-20 md:mt-32">
        <h2 className="font-brand text-3xl md:text-4xl text-primary mb-8 md:mb-12 text-center">Crafting the Heritage</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <div className="md:col-span-2 bg-surface-container-low p-8 md:p-10 rounded-xl relative overflow-hidden flex flex-col justify-end min-h-[300px] md:min-h-[400px]">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #004a2b 1px, transparent 0)', backgroundSize: '24px 24px' }} />
            <div className="relative z-10">
              <h3 className="font-brand text-2xl md:text-3xl text-primary mb-4">Sun-Dried Rituals</h3>
              <p className="font-body text-on-surface-variant max-w-lg text-sm md:text-base">Every batch begins with the peeling of Bhim Kol bananas, air-dried under the intense North Eastern sun for 7 days until they reach a deep obsidian charcoal hue.</p>
            </div>
          </div>
          <div className="bg-secondary-container p-8 md:p-10 rounded-xl flex flex-col gap-4 md:gap-6 text-on-secondary-container">
            <span className="material-symbols-outlined text-4xl md:text-5xl">science</span>
            <h3 className="font-headline font-bold text-xl md:text-2xl uppercase italic">The Alchemy</h3>
            <p className="font-body text-sm leading-relaxed">Unlike industrial additives, Kola Khar provides a natural alkalinity that tenderizes lentils and greens while adding a smoky, umami depth that defines Assamese soul food.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
