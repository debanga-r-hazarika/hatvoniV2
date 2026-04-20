import React from 'react';

export default function RecipesTable({ data, onToggleStatus, onEdit, onDelete }) {
  if (data.length === 0) return <div className="text-center py-16 bg-white rounded-xl border border-[#bec9bf]/20 text-sm text-[#3f4942]/60">No recipes found.</div>;

  return (
    <div className="bg-white rounded-xl border border-[#bec9bf]/20 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f5f4eb]/60 border-b border-[#bec9bf]/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Recipe</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Tag</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Prep Time</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Order</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Status</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#bec9bf]/10">
            {data.map((recipe) => (
              <tr key={recipe.id} className="hover:bg-[#004a2b]/[0.01] transition-colors group">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#f5f4eb] flex items-center justify-center overflow-hidden border border-[#bec9bf]/10 flex-shrink-0">
                      {recipe.image_url ? (
                        <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-sm text-[#3f4942]/20">restaurant</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#004a2b] truncate leading-tight">{recipe.title}</p>
                      <p className="text-[10px] text-[#3f4942]/50 truncate max-w-[200px]">{recipe.short_description || '—'}</p>
                    </div>
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#f5f4eb] border border-[#bec9bf]/15 rounded text-[9px] font-medium text-[#3f4942]/70">
                    {recipe.tag || 'Unset'}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 text-[10px] font-medium text-[#3f4942]/60">
                    <span className="material-symbols-outlined text-xs">schedule</span>
                    {recipe.prep_time || '—'}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span className="text-xs font-mono font-bold text-[#004a2b]/60">{recipe.sort_order ?? 999}</span>
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onToggleStatus(recipe)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold uppercase transition-all border ${
                        recipe.is_active
                          ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${recipe.is_active ? 'bg-green-500' : 'bg-slate-400'}`} />
                      {recipe.is_active ? 'Active' : 'Off'}
                    </button>
                    {recipe.is_featured && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                        <span className="material-symbols-outlined text-[10px]">auto_awesome</span>
                        Featured
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onEdit(recipe)} className="w-7 h-7 rounded-md bg-[#f5f4eb] text-[#004a2b] hover:bg-[#004a2b] hover:text-white transition-all flex items-center justify-center" title="Edit">
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                    <button onClick={() => onDelete(recipe)} className="w-7 h-7 rounded-md bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center" title="Delete">
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-[#bec9bf]/15 bg-[#f5f4eb]/30 text-[10px] text-[#3f4942]/40 font-medium">
        {data.length} recipes · {data.filter(r => r.is_active).length} active · {data.filter(r => r.is_featured).length} featured
      </div>
    </div>
  );
}
