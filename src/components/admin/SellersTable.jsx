import React from 'react';

export default function SellersTable({
  data,
  sellerProductCounts,
  sellerPickupLocationCounts = {},
  sellerDefaultPickupLocationTitles = {},
  onToggleBan,
  onToggleOwnSeller,
  onManagePickupLocations,
}) {
  if (data.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-[#bec9bf]/20">
        <span className="material-symbols-outlined text-3xl text-[#3f4942]/20 block mb-2">storefront</span>
        <p className="text-sm text-[#3f4942]/60">No sellers found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#bec9bf]/20 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f5f4eb]/60 border-b border-[#bec9bf]/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Seller</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Type</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Products</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Pickup</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Status</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#bec9bf]/10">
            {data.map((seller) => {
              const name = seller.first_name || seller.last_name
                ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim() : null;
              const initial = (seller.first_name?.[0] || seller.email?.[0] || '?').toUpperCase();
              const productCount = sellerProductCounts[seller.id] || 0;
              const pickupCount = sellerPickupLocationCounts[seller.id] || 0;
              const defaultPickup = sellerDefaultPickupLocationTitles[seller.id] || null;

              return (
                <tr key={seller.id} className="hover:bg-[#004a2b]/[0.01] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border flex-shrink-0 ${
                        seller.is_banned ? 'bg-red-50 text-red-500 border-red-100'
                        : seller.is_own_seller ? 'bg-[#004a2b]/[0.06] text-[#004a2b] border-[#004a2b]/10'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>{initial}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#004a2b] leading-tight truncate">{name || <span className="text-[#3f4942]/40 italic font-normal">Partner</span>}</p>
                        <p className="text-[10px] text-[#3f4942]/50 truncate">{seller.email}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggleOwnSeller(seller)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold uppercase transition-all border ${
                        seller.is_own_seller
                          ? 'bg-[#004a2b]/[0.05] border-[#004a2b]/15 text-[#004a2b]'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                      title="Click to toggle"
                    >
                      <span className="material-symbols-outlined text-xs">{seller.is_own_seller ? 'verified' : 'storefront'}</span>
                      {seller.is_own_seller ? 'Own' : '3rd Party'}
                    </button>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${productCount === 0 ? 'text-[#3f4942]/20' : 'text-[#004a2b]'}`}>{productCount}</span>
                      <div className="w-16 h-1 bg-[#f5f4eb] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${seller.is_own_seller ? 'bg-[#004a2b]' : 'bg-emerald-500'}`} style={{ width: `${Math.min((productCount / 20) * 100, 100)}%` }} />
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="text-[10px] text-[#3f4942]/60">
                      <span className="font-medium">{pickupCount} locations</span>
                      {defaultPickup && <p className="text-[9px] text-[#3f4942]/40 truncate max-w-[100px]">{defaultPickup}</p>}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-semibold uppercase border ${
                      seller.is_banned ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-700 border-green-100'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${seller.is_banned ? 'bg-red-500' : 'bg-green-500'}`} />
                      {seller.is_banned ? 'Suspended' : 'Active'}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onToggleBan(seller)}
                        className={`w-7 h-7 rounded-md transition-all flex items-center justify-center border ${
                          seller.is_banned ? 'bg-green-50 text-green-600 border-green-100 hover:bg-green-500 hover:text-white' : 'bg-red-50 text-red-500 border-red-100 hover:bg-red-500 hover:text-white'
                        }`}
                        title={seller.is_banned ? 'Reactivate' : 'Suspend'}
                      >
                        <span className="material-symbols-outlined text-sm">{seller.is_banned ? 'lock_open' : 'block'}</span>
                      </button>
                      <button
                        onClick={() => onManagePickupLocations?.(seller)}
                        className="w-7 h-7 rounded-md bg-[#f5f4eb] text-[#004a2b] hover:bg-[#004a2b] hover:text-white transition-all flex items-center justify-center border border-[#bec9bf]/15"
                        title="Pickup Locations"
                      >
                        <span className="material-symbols-outlined text-sm">pin_drop</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-[#bec9bf]/15 flex items-center justify-between bg-[#f5f4eb]/30">
        <div className="flex items-center gap-4 text-[10px] text-[#3f4942]/50 font-medium">
          <span>Total: <strong className="text-[#004a2b]">{data.length}</strong></span>
          <span>Own: <strong className="text-[#004a2b]">{data.filter(s => s.is_own_seller).length}</strong></span>
          <span>3rd Party: <strong className="text-emerald-700">{data.length - data.filter(s => s.is_own_seller).length}</strong></span>
        </div>
      </div>
    </div>
  );
}
