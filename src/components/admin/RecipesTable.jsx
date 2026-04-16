import React from 'react';

export default function RecipesTable({ data, onToggleStatus, onEdit, onDelete }) {
  if (data.length === 0) return <div className="text-center py-16 bg-surface-container-lowest rounded-3xl border border-outline-variant/30 text-on-surface-variant font-medium">No recipes cataloged.</div>;

  return (
    <div className="bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/30">
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Culinary Asset</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Classification</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Timing</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Sort Tier</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Visibility</th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Management</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {data.map((recipe) => (
              <tr key={recipe.id} className="hover:bg-primary/[0.02] transition-colors group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center shrink-0 overflow-hidden border border-outline-variant/10 shadow-inner group-hover:scale-105 transition-transform duration-500">
                      {recipe.image_url ? (
                        <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant/30">restaurant</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-brand font-bold text-primary text-base leading-tight">{recipe.title}</p>
                      <p className="text-xs text-on-surface-variant line-clamp-1 mt-1 opacity-70 leading-relaxed max-w-[240px]">{recipe.short_description || 'No meta description provided.'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                   <span className="inline-flex items-center gap-2 px-3 py-1 bg-surface-container-low border border-outline-variant/20 rounded-full text-[10px] font-black tracking-widest text-on-surface-variant uppercase shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                      {recipe.tag || 'Unset'}
                   </span>
                </td>
                <td className="px-6 py-5">
                   <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                      <span className="material-symbols-outlined text-sm opacity-60">schedule</span>
                      {recipe.prep_time || 'N/A'}
                   </div>
                </td>
                <td className="px-6 py-5">
                   <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center font-brand font-black text-primary border border-primary/10">
                      {recipe.sort_order ?? 999}
                   </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => onToggleStatus(recipe)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all border ${
                        recipe.is_active 
                          ? 'bg-green-50 text-green-700 border-green-100 hover:bg-green-100' 
                          : 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${recipe.is_active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
                      {recipe.is_active ? 'Active' : 'Offline'}
                    </button>
                    {recipe.is_featured && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase bg-amber-50 text-amber-700 border border-amber-100 shadow-sm animate-pulse">
                        <span className="material-symbols-outlined text-sm">auto_awesome</span>
                        Featured
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-5">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => onEdit(recipe)} 
                      className="w-10 h-10 rounded-xl bg-surface-container-low text-primary hover:bg-primary hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm border border-outline-variant/10" 
                      title="Edit Story"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit_note</span>
                    </button>
                    <button 
                      onClick={() => onDelete(recipe)} 
                      className="w-10 h-10 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm border border-red-100" 
                      title="Delete Content"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="px-8 py-4 bg-surface-container-low/30 border-t border-outline-variant/20">
         <p className="text-[10px] text-on-surface-variant/40 font-black uppercase tracking-widest text-center">Hatvoni Culinary Stories Management Console</p>
      </div>
    </div>
  );
}
