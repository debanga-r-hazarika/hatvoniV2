import React from 'react';

export default function ProductsTable({ data, sellerOptions, onToggleStatus, onEdit, onDelete }) {
  const sellerById = (sellerOptions || []).reduce((acc, s) => { acc[s.id] = s; return acc; }, {});

  if (data.length === 0) return <div className="text-center py-16 bg-white rounded-xl border border-[#bec9bf]/20 text-sm text-[#3f4942]/60">No products found.</div>;

  return (
    <div className="bg-white rounded-xl border border-[#bec9bf]/20 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f5f4eb]/60 border-b border-[#bec9bf]/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Product</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Category</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Price</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Stock</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Seller</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Status</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#bec9bf]/10">
            {data.map((product) => {
              const seller = sellerById[product.seller_id];
              const sellerName = seller ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.email : '—';

              return (
                <tr key={product.id} className="hover:bg-[#004a2b]/[0.01] transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[#f5f4eb] flex items-center justify-center overflow-hidden border border-[#bec9bf]/10 flex-shrink-0">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-sm text-[#3f4942]/20">inventory_2</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#004a2b] truncate leading-tight">{product.name}</p>
                        <p className="text-[9px] font-mono text-[#3f4942]/40">{product.key || '—'}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-[10px] font-medium text-[#3f4942]/70">{product.category || '—'}</span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-[#004a2b]">₹{Number(product.price).toLocaleString('en-IN')}</span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${product.stock_quantity < 10 ? (product.stock_quantity === 0 ? 'text-red-600' : 'text-amber-600') : 'text-[#004a2b]'}`}>
                        {product.stock_quantity}
                      </span>
                      {product.sync_with_insider && (
                        <span className="material-symbols-outlined text-[10px] text-[#815500]" title="Synced">sync</span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[10px] text-[#3f4942]/30">{seller?.is_own_seller ? 'verified' : 'storefront'}</span>
                      <span className="text-[10px] font-medium text-[#3f4942]/60 truncate max-w-[100px]">{sellerName}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggleStatus(product)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold uppercase transition-all border ${
                        product.is_active
                          ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xs">{product.is_active ? 'visibility' : 'visibility_off'}</span>
                      {product.is_active ? 'Active' : 'Hidden'}
                    </button>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onEdit(product)} className="w-7 h-7 rounded-md bg-[#f5f4eb] text-[#004a2b] hover:bg-[#004a2b] hover:text-white transition-all flex items-center justify-center" title="Edit">
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button onClick={() => onDelete(product)} className="w-7 h-7 rounded-md bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center" title="Delete">
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-[#bec9bf]/15 bg-[#f5f4eb]/30 text-[10px] text-[#3f4942]/40 font-medium">
        {data.length} products · {data.filter(p => p.is_active).length} active · {data.filter(p => p.stock_quantity === 0).length} out of stock
      </div>
    </div>
  );
}
