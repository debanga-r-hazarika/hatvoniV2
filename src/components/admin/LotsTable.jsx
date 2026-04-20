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
  if (data.length === 0) return <div className="text-center py-16 bg-white rounded-xl border border-[#bec9bf]/20 text-sm text-[#3f4942]/60">No lots found.</div>;

  return (
    <div className="bg-white rounded-xl border border-[#bec9bf]/20 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f5f4eb]/60 border-b border-[#bec9bf]/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Lot</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Items</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Value</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Status</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#bec9bf]/10">
            {data.map((lot) => {
              const totalValue = calculateLotPriceFromItems(lot.lot_items || [], catalogProducts);
              const itemCount = lot.lot_items?.length || 0;

              return (
                <tr key={lot.id} className="hover:bg-[#004a2b]/[0.01] transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-1.5 flex-shrink-0">
                        {lot.lot_items?.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="w-7 h-7 rounded-md border border-white bg-[#f5f4eb] flex items-center justify-center overflow-hidden shadow-sm">
                            {item.products?.image_url ? (
                              <img src={item.products.image_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-[10px] text-[#3f4942]/20">inventory_2</span>
                            )}
                          </div>
                        ))}
                        {itemCount > 3 && (
                          <div className="w-7 h-7 rounded-md border border-white bg-[#815500] text-white flex items-center justify-center text-[8px] font-bold shadow-sm">
                            +{itemCount - 3}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#004a2b] truncate leading-tight">{lot.lot_name}</p>
                        <p className="text-[10px] text-[#3f4942]/50 truncate max-w-[200px]">{lot.description || 'No description'}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-[#004a2b]">{itemCount}</span>
                    <span className="text-[10px] text-[#3f4942]/40 ml-1">items</span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-[#004a2b]">₹{totalValue.toLocaleString('en-IN')}</span>
                  </td>

                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggleStatus(lot)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold uppercase transition-all border ${
                        lot.status === 'active'
                          ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xs">{lot.status === 'active' ? 'check_circle' : 'do_not_disturb_on'}</span>
                      {lot.status === 'active' ? 'Active' : 'Archived'}
                    </button>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onEdit(lot)} className="w-7 h-7 rounded-md bg-[#f5f4eb] text-[#004a2b] hover:bg-[#004a2b] hover:text-white transition-all flex items-center justify-center" title="Edit">
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button onClick={() => onDelete(lot)} className="w-7 h-7 rounded-md bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center" title="Delete">
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
        {data.length} lots · {data.filter(l => l.status === 'active').length} active
      </div>
    </div>
  );
}
