import React from 'react';

export default function ProductsTable({ data, sellerOptions, onToggleStatus, onEdit, onDelete }) {
  const sellerById = (sellerOptions || []).reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  if (data.length === 0) return <div className="text-center py-16 bg-surface-container-lowest rounded-3xl border border-outline-variant/30 text-on-surface-variant font-medium">No products found.</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {data.map((product) => {
        const seller = sellerById[product.seller_id];
        const sellerName = seller ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.email : 'Unassigned';
        
        return (
          <article key={product.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-[2rem] p-5 shadow-sm hover:shadow-xl transition-all flex flex-col relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[80px] -z-10 group-hover:scale-110 transition-transform"></div>
            
            <div className="flex gap-5 mb-4">
              <div className="w-24 h-28 rounded-2xl bg-surface-container flex items-center justify-center shrink-0 overflow-hidden mix-blend-multiply border border-outline-variant/10 shadow-inner">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                ) : (
                  <span className="material-symbols-outlined text-primary/30 text-[40px]">inventory_2</span>
                )}
              </div>
              <div className="flex-1 pr-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary/70 truncate mb-1">{product.category || 'Standard Catalog'}</p>
                <h3 className="font-brand font-bold text-primary text-[22px] leading-[1.1] mb-2 line-clamp-2 tracking-tight">{product.name}</h3>
                <div className="flex items-center gap-2 flex-wrap">
                   <span className="text-[10px] font-mono text-on-surface-variant/70 bg-surface-container-low border border-outline-variant/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">key</span>
                      {product.key || 'N/A'}
                   </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-surface-container-low rounded-2xl p-3 border border-outline-variant/10 group-hover:bg-primary-container/20 transition-colors">
                 <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60 block mb-1">MSRP Price</span>
                 <span className="text-lg font-brand font-bold text-primary">₹{Number(product.price).toLocaleString('en-IN')}</span>
              </div>
              <div className="bg-surface-container-low rounded-2xl p-3 border border-outline-variant/10 group-hover:bg-primary-container/20 transition-colors">
                 <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60 block mb-1">Stock Level</span>
                 {product.sync_with_insider ? (
                   <div className="flex flex-col">
                      <span className={`text-base font-bold flex items-center gap-1 ${product.stock_quantity < 10 ? 'text-red-600' : 'text-primary'}`}>
                        {product.stock_quantity}
                        <span className="material-symbols-outlined text-[13px] text-secondary animate-spin-slow" title="Synced from Insider">sync</span>
                      </span>
                      <span className="text-[8px] font-bold text-secondary uppercase tracking-tighter">Synced</span>
                   </div>
                 ) : (
                   <span className={`text-base font-bold ${product.stock_quantity < 10 ? 'text-red-600' : 'text-primary'}`}>{product.stock_quantity} <span className="text-[10px] font-medium opacity-60">units</span></span>
                 )}
              </div>
            </div>
            
            <div className="mb-5 p-3 rounded-xl bg-surface/50 border border-outline-variant/10 flex items-center gap-3">
               <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${seller?.is_own_seller ? 'bg-primary/10 text-primary' : 'bg-emerald-50 text-emerald-600'}`}>
                  <span className="material-symbols-outlined text-[18px]">{seller?.is_own_seller ? 'verified' : 'storefront'}</span>
               </div>
               <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/60 leading-none mb-1">Merchant</p>
                  <p className="text-xs font-bold text-primary truncate leading-none">{sellerName}</p>
               </div>
            </div>

            <div className="mt-auto border-t border-outline-variant/10 pt-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                 <button
                   onClick={() => onToggleStatus(product)}
                   className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                     product.is_active 
                       ? 'bg-green-50 text-green-700 hover:bg-green-500 hover:text-white border-green-100 hover:border-green-500 shadow-sm' 
                       : 'bg-red-50 text-red-700 hover:bg-red-500 hover:text-white border-red-100 hover:border-red-500 shadow-sm'
                   }`}
                 >
                    <span className="material-symbols-outlined text-[16px]">{product.is_active ? 'visibility' : 'visibility_off'}</span>
                    {product.is_active ? 'Public' : 'Hidden'}
                 </button>
                 
                 {!product.show_as_individual_product && (
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center border border-slate-200" title="Bundle Only product">
                       <span className="material-symbols-outlined text-[18px]">apps</span>
                    </div>
                 )}
              </div>

              <div className="flex gap-2">
                 <button 
                  onClick={() => onEdit(product)} 
                  className="w-9 h-9 rounded-xl bg-surface-container text-primary hover:bg-primary hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm border border-outline-variant/10" 
                  title="Edit"
                >
                   <span className="material-symbols-outlined text-[18px]">edit</span>
                 </button>
                 <button 
                  onClick={() => onDelete(product)} 
                  className="w-9 h-9 rounded-xl bg-red-50 text-red-600 hover:bg-red-500 hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm border border-red-100" 
                  title="Delete"
                >
                   <span className="material-symbols-outlined text-[18px]">delete</span>
                 </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
