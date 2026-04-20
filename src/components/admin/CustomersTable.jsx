import React from 'react';

export default function CustomersTable({ data, onToggleBan, onEdit, onDelete }) {
  if (data.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-[#bec9bf]/20">
        <span className="material-symbols-outlined text-3xl text-[#3f4942]/20 block mb-2">group</span>
        <p className="text-sm text-[#3f4942]/60">No customers found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#bec9bf]/20 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f5f4eb]/60 border-b border-[#bec9bf]/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Customer</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Role</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Joined</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">ID</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Status</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#bec9bf]/10">
            {data.map((user) => {
              const name = user.first_name || user.last_name
                ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : null;
              const initial = (user.first_name?.[0] || user.email?.[0] || '?').toUpperCase();
              const joinDate = new Date(user.created_at);
              const isNew = (Date.now() - joinDate.getTime()) < 7 * 24 * 60 * 60 * 1000;

              return (
                <tr key={user.id} className="hover:bg-[#004a2b]/[0.01] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${
                        user.is_banned ? 'bg-red-50 text-red-500 border-red-100' : 'bg-[#004a2b]/[0.06] text-[#004a2b] border-[#004a2b]/10'
                      }`}>{initial}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#004a2b] leading-tight truncate">
                          {name || <span className="text-[#3f4942]/40 italic font-normal">Unnamed</span>}
                        </p>
                        <p className="text-[10px] text-[#3f4942]/50 truncate">{user.email || '—'}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {user.is_admin && <span className="text-[8px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded uppercase">Admin</span>}
                      {user.is_seller && <span className="text-[8px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded uppercase">Seller</span>}
                      {!user.is_admin && !user.is_seller && <span className="text-[8px] font-semibold bg-slate-50 text-slate-500 border border-slate-100 px-1.5 py-0.5 rounded uppercase">Customer</span>}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium text-[#004a2b]">{joinDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
                      {isNew && <span className="text-[7px] bg-emerald-500 text-white px-1 py-px rounded font-bold uppercase">New</span>}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <p className="text-[10px] text-[#3f4942]/50 font-mono">{user.id.slice(0, 8)}</p>
                  </td>

                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggleBan(user)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-semibold uppercase transition-all border ${
                        user.is_banned
                          ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                          : 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${user.is_banned ? 'bg-red-500' : 'bg-green-500'}`} />
                      {user.is_banned ? 'Banned' : 'Active'}
                    </button>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => onEdit(user)} className="w-7 h-7 rounded-md bg-[#f5f4eb] text-[#004a2b] hover:bg-[#004a2b] hover:text-white transition-all flex items-center justify-center" title="Edit">
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button onClick={() => onDelete(user)} className="w-7 h-7 rounded-md bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center" title="Delete">
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

      <div className="px-4 py-3 border-t border-[#bec9bf]/15 flex items-center justify-between bg-[#f5f4eb]/30">
        <div className="flex items-center gap-4 text-[10px] text-[#3f4942]/50 font-medium">
          <span>Total: <strong className="text-[#004a2b]">{data.length}</strong></span>
          <span>Active: <strong className="text-green-700">{data.filter(u => !u.is_banned).length}</strong></span>
          <span>Banned: <strong className="text-red-600">{data.filter(u => u.is_banned).length}</strong></span>
        </div>
        <span className="text-[10px] text-[#3f4942]/30 font-medium">Page 1 of 1</span>
      </div>
    </div>
  );
}
