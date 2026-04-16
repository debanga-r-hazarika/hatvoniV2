import React from 'react';

const getCatalogProductKeyCandidates = (product) => [
  product?.key,
  product?.external_product_id,
  product?.id,
]
  .filter(Boolean)
  .map((value) => String(value));

const calculateLotPriceFromItems = (lotItems, catalogProducts = []) => {
  if (!Array.isArray(lotItems) || lotItems.length === 0) return 0;

  const priceByKey = (catalogProducts || []).reduce((acc, product) => {
    const numericPrice = Number(product?.price || 0);
    getCatalogProductKeyCandidates(product).forEach((candidateKey) => {
      acc[candidateKey] = numericPrice;
    });
    return acc;
  }, {});

  return lotItems.reduce((sum, item) => {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    const productKey = String(item?.product_key || '');
    const fallbackPrice = Number(item?.products?.price || item?.unit_price || item?.price || 0);
    const unitPrice = Number.isFinite(priceByKey[productKey]) ? priceByKey[productKey] : fallbackPrice;
    return sum + (unitPrice * quantity);
  }, 0);
};

export default function LotsTable({ data, catalogProducts, onToggleStatus, onEdit, onDelete }) {
  if (data.length === 0) return <div className="text-center py-16 bg-surface-container-lowest rounded-3xl border border-outline-variant/30 text-on-surface-variant font-medium">No lots found.</div>;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {data.map((lot) => {
        const calculatedPrice = calculateLotPriceFromItems(lot.lot_items || [], catalogProducts);
        return (
          <article key={lot.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-[2.5rem] p-7 shadow-sm hover:shadow-xl transition-all flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-secondary/5 rounded-bl-[100px] -z-10 group-hover:scale-110 transition-transform"></div>
            
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                 <span className="text-[10px] font-black uppercase tracking-[0.25em] text-secondary">Curated Collection</span>
                 <div className="flex -space-x-2">
                    {lot.lot_items?.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center overflow-hidden shadow-sm">
                         {item.products?.image_url ? (
                           <img src={item.products.image_url} alt="" className="w-full h-full object-cover" />
                         ) : (
                           <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                         )}
                      </div>
                    ))}
                    {lot.lot_items?.length > 3 && (
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-secondary text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                         +{lot.lot_items.length - 3}
                      </div>
                    )}
                 </div>
              </div>
              <h3 className="font-brand font-bold text-primary text-2xl leading-tight mb-3 line-clamp-2 tracking-tight">{lot.lot_name}</h3>
              <p className="text-sm text-on-surface-variant/80 line-clamp-2 font-medium leading-relaxed mb-4">{lot.description || 'A thoughtfully assembled collection of Hatvoni premium products.'}</p>
            </div>

            <div className="bg-surface-container-low rounded-[2rem] p-5 border border-outline-variant/10 mb-6 relative overflow-hidden group-hover:bg-secondary/5 transition-colors">
               <div className="absolute -right-4 -bottom-4 opacity-[0.03] rotate-12 group-hover:rotate-0 transition-transform duration-700">
                  <span className="material-symbols-outlined text-[120px]">all_inclusive</span>
               </div>
               <div className="flex items-end justify-between relative z-10">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50 block mb-1">Lot Total Value</span>
                    <span className="text-2xl font-brand font-bold text-primary tracking-tighter">₹{calculatedPrice.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50 block mb-1">Configuration</span>
                    <span className="text-sm font-bold text-secondary uppercase tracking-tighter">{lot.lot_items?.length || 0} unique items</span>
                  </div>
               </div>
            </div>

            <div className="mt-auto border-t border-outline-variant/10 pt-5 flex items-center justify-between gap-3">
              <button
                onClick={() => onToggleStatus(lot)}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                  lot.status === 'active' 
                    ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-500 hover:text-white hover:border-green-500 shadow-sm' 
                    : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-500 hover:text-white hover:border-red-500 shadow-sm'
                }`}
              >
                 <span className="material-symbols-outlined text-[16px]">{lot.status === 'active' ? 'check_circle' : 'do_not_disturb_on'}</span>
                 {lot.status === 'active' ? 'Active' : 'Archived'}
              </button>
              
              <div className="flex gap-2">
                 <button 
                  onClick={() => onEdit(lot)} 
                  className="w-10 h-10 rounded-xl bg-surface-container text-primary hover:bg-primary hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm border border-outline-variant/10" 
                  title="Edit Bundle"
                >
                   <span className="material-symbols-outlined text-[20px]">edit</span>
                 </button>
                 <button 
                  onClick={() => onDelete(lot)} 
                  className="w-10 h-10 rounded-xl bg-red-50 text-red-500 hover:bg-red-600 hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm border border-red-100" 
                  title="Delete Lot"
                >
                   <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                 </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
