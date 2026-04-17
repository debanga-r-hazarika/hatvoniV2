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
      <div className="text-center py-20 bg-surface-container-lowest rounded-3xl border border-outline-variant/30">
        <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30 block mb-3">store</span>
        <p className="text-on-surface-variant font-medium">No sellers found.</p>
      </div>
    );
  }

  const ownSellerCount = data.filter(s => s.is_own_seller).length;
  const thirdPartyCount = data.length - ownSellerCount;
  const bannedCount = data.filter(s => s.is_banned).length;

  return (
    <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/30">
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Seller Business</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Management Type</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Product Stats</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Performance</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Pickup Locations</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Status</th>
              <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {data.map((seller) => {
              const fullName = seller.first_name || seller.last_name
                ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim()
                : null;
              const initials = (seller.first_name?.[0] || seller.email?.[0] || '?').toUpperCase();
              const joinDate = new Date(seller.created_at);
              const productCount = sellerProductCounts[seller.id] || 0;
              const pickupCount = sellerPickupLocationCounts[seller.id] || 0;
              const defaultPickupTitle = sellerDefaultPickupLocationTitles[seller.id] || null;

              return (
                <tr key={seller.id} className="hover:bg-primary/[0.02] transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 font-brand font-bold text-xl border-2 ${
                        seller.is_banned ? 'bg-red-50 text-red-600 border-red-100'
                        : seller.is_own_seller ? 'bg-primary-container/30 text-primary border-primary-container/50'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-brand font-bold text-primary text-base leading-tight">
                          {fullName || <span className="text-on-surface-variant italic font-normal">Registered Partner</span>}
                        </p>
                        <p className="text-xs text-on-surface-variant font-medium mt-1 uppercase tracking-tighter opacity-70">RID: {seller.id?.slice(0, 12)}</p>
                        <div className="flex items-center gap-3 mt-1.5 font-body text-[11px] text-on-surface-variant/80">
                           <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">mail</span>{seller.email}</span>
                           <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">calendar_today</span> {joinDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-5">
                    <button
                      onClick={() => onToggleOwnSeller(seller)}
                      className={`group/type inline-flex flex-col items-start gap-1 p-3 rounded-2xl transition-all border w-full max-w-[140px] ${
                        seller.is_own_seller
                          ? 'bg-primary/5 border-primary/20 text-primary'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px]">{seller.is_own_seller ? 'new_releases' : 'storefront'}</span>
                        <span className="text-[10px] font-black uppercase tracking-widest">{seller.is_own_seller ? 'Brand Managed' : 'Marketplace'}</span>
                      </div>
                      <span className="text-[9px] opacity-70 leading-tight text-left">Click to switch management model</span>
                    </button>
                  </td>

                  <td className="px-6 py-5">
                    <div className="space-y-2">
                       <div className="flex items-center gap-2">
                          <span className={`text-2xl font-brand font-bold ${productCount === 0 ? 'text-on-surface-variant/30' : 'text-primary'}`}>
                            {productCount}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-tighter text-on-surface-variant/60">Live Items</span>
                       </div>
                       <div className="w-24 h-1.5 bg-surface-container rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${seller.is_own_seller ? 'bg-primary' : 'bg-emerald-500'}`} 
                            style={{ width: `${Math.min((productCount / 20) * 100, 100)}%` }}
                          />
                       </div>
                    </div>
                  </td>

                  <td className="px-6 py-5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-[14px] text-secondary">place</span>
                        Total: <span className="font-bold text-primary">{pickupCount}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span className="material-symbols-outlined text-[14px] text-secondary">flag</span>
                        Default: <span className="font-bold text-primary">{defaultPickupTitle || 'None'}</span>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-5">
                     <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${
                      seller.is_banned
                        ? 'bg-red-50 text-red-700 border-red-100'
                        : 'bg-green-50 text-green-700 border-green-100'
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${seller.is_banned ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                      {seller.is_banned ? 'SUSPENDED' : 'OPERATIONAL'}
                    </span>
                  </td>

                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onToggleBan(seller)}
                        className={`w-10 h-10 rounded-xl transition-all active:scale-95 flex items-center justify-center shadow-sm border ${
                          seller.is_banned
                            ? 'bg-green-50 text-green-600 border-green-100 hover:bg-green-500 hover:text-white'
                            : 'bg-red-50 text-red-500 border-red-100 hover:bg-red-500 hover:text-white'
                        }`}
                        title={seller.is_banned ? 'Reactivate Partner' : 'Suspend Partner'}
                      >
                        <span className="material-symbols-outlined text-[18px]">{seller.is_banned ? 'lock_open' : 'block'}</span>
                      </button>
                      
                      <button 
                        onClick={() => onManagePickupLocations?.(seller)}
                        className="w-10 h-10 rounded-xl bg-surface-container-low text-primary hover:bg-primary hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm border border-outline-variant/20"
                        title="Manage Pickup Locations"
                      >
                        <span className="material-symbols-outlined text-[18px]">pin_drop</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-8 py-6 border-t border-outline-variant/20 bg-surface-container-low/30 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-8">
           <div className="flex flex-col">
              <span className="text-[10px] text-on-surface-variant/60 font-black uppercase tracking-widest">Total Partners</span>
              <span className="text-2xl font-brand font-bold text-primary">{data.length}</span>
           </div>
           <div className="flex items-center gap-6 py-1 px-4 bg-white/50 rounded-2xl border border-outline-variant/20">
              <div className="flex flex-col">
                 <span className="text-[9px] text-primary/70 font-bold uppercase tracking-widest">Hatvoni Own</span>
                 <span className="text-sm font-black text-primary">{ownSellerCount}</span>
              </div>
              <div className="w-px h-6 bg-outline-variant/30"></div>
              <div className="flex flex-col">
                 <span className="text-[9px] text-emerald-600/70 font-bold uppercase tracking-widest">Third Party</span>
                 <span className="text-sm font-black text-emerald-700">{thirdPartyCount}</span>
              </div>
           </div>
        </div>
        
        <div className="flex items-center gap-3">
           <div className="flex items-center -space-x-3">
              {data.slice(0, 5).map((s, i) => (
                <div key={i} className="w-8 h-8 rounded-full bg-surface border-2 border-white flex items-center justify-center text-[10px] font-bold text-primary shadow-sm overflow-hidden">
                   {(s.first_name?.[0] || s.email?.[0] || '?').toUpperCase()}
                </div>
              ))}
              {data.length > 5 && (
                <div className="w-8 h-8 rounded-full bg-primary text-white border-2 border-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                   +{data.length - 5}
                </div>
              )}
           </div>
           <span className="text-xs font-bold text-on-surface-variant/70">Verified Merchants</span>
        </div>
      </div>
    </div>
  );
}
