import React from 'react';

export default function CustomersTable({ data, onToggleBan, onEdit, onDelete }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-20 bg-surface-container-lowest rounded-3xl border border-outline-variant/30">
        <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30 block mb-3">group</span>
        <p className="text-on-surface-variant font-medium">No customers found.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/30">
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Customer</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Contact & Role</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Joined</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Account Info</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Status</th>
              <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {data.map((user) => {
              const fullName = user.first_name || user.last_name
                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                : null;
              const initials = (user.first_name?.[0] || user.email?.[0] || '?').toUpperCase();
              const joinDate = new Date(user.created_at);
              const isRecent = (Date.now() - joinDate.getTime()) < 7 * 24 * 60 * 60 * 1000;

              return (
                <tr key={user.id} className="hover:bg-primary/[0.02] transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-[1.25rem] flex items-center justify-center shrink-0 font-brand font-bold text-lg border-2 ${
                        user.is_banned 
                          ? 'bg-red-50 text-red-600 border-red-100' 
                          : 'bg-primary-container/30 text-primary border-primary-container/50'
                      }`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-brand font-bold text-primary text-base leading-tight">
                          {fullName || <span className="text-on-surface-variant italic font-normal">Unnamed Customer</span>}
                        </p>
                        <p className="text-xs text-on-surface-variant truncate mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] opacity-60">mail</span>
                          {user.email || 'No email provided'}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-5">
                    <div className="space-y-2">
                       {user.phone && (
                         <p className="flex items-center gap-2 text-sm text-on-surface-variant">
                           <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">call</span>
                           {user.phone}
                         </p>
                       )}
                       <div className="flex flex-wrap gap-1.5">
                        {user.is_admin && (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                            <span className="material-symbols-outlined text-[11px]">shield</span>Admin
                          </span>
                        )}
                        {user.is_seller && (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                            <span className="material-symbols-outlined text-[11px]">storefront</span>Seller
                          </span>
                        )}
                        {!user.is_admin && !user.is_seller && (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-slate-50 text-slate-600 border border-slate-100 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">
                            Customer
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-5">
                    <div>
                      <p className="text-sm text-primary font-bold">{joinDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{joinDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                      {isRecent && (
                        <span className="mt-1.5 inline-block text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest scale-90 origin-left">New</span>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-5">
                     <div className="space-y-1">
                        <p className="text-[11px] text-on-surface-variant/70 uppercase font-black tracking-tighter">ID: {user.id.slice(0, 8)}...</p>
                        <p className="text-[11px] text-on-surface-variant">Orders: <span className="font-bold text-primary">N/A</span></p>
                        <p className="text-[11px] text-on-surface-variant">Last Activity: <span className="font-bold text-primary">Recently</span></p>
                     </div>
                  </td>

                  <td className="px-6 py-5">
                    <button
                      onClick={() => onToggleBan(user)}
                      className={`group/btn inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        user.is_banned
                          ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                          : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-100'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full animate-pulse ${user.is_banned ? 'bg-red-500' : 'bg-green-500'}`} />
                      {user.is_banned ? 'Banned' : 'Active'}
                      <span className="material-symbols-outlined text-[14px] opacity-0 group-hover/btn:opacity-100 transition-opacity">
                        {user.is_banned ? 'lock_open' : 'block'}
                      </span>
                    </button>
                  </td>

                  <td className="px-6 py-5">
                    <div className="flex items-center justify-end gap-2">
                       <button
                        onClick={() => onEdit(user)}
                        className="w-10 h-10 rounded-xl bg-surface-container-low text-primary hover:bg-primary hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm"
                        title="Edit Profile"
                      >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                      </button>
                      <button
                        onClick={() => onDelete(user)}
                        className="w-10 h-10 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm"
                        title="Delete User"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-8 py-5 border-t border-outline-variant/20 flex flex-col sm:flex-row items-center justify-between gap-4 bg-surface-container-low/30">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-on-surface-variant/60 font-black uppercase tracking-widest">Total Population</span>
            <span className="text-xl font-brand font-bold text-primary">{data.length}</span>
          </div>
          <div className="h-8 w-px bg-outline-variant/30 hidden sm:block"></div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-green-600/70 font-black uppercase tracking-widest">Active</span>
              <span className="text-sm font-bold text-green-700">{data.filter(u => !u.is_banned).length}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-red-600/70 font-black uppercase tracking-widest">Restricted</span>
              <span className="text-sm font-bold text-red-700">{data.filter(u => u.is_banned).length}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           {/* Pagination placeholder if needed */}
           <div className="text-[11px] text-on-surface-variant font-medium">
             Viewing page 1 of 1
           </div>
        </div>
      </div>
    </div>
  );
}
