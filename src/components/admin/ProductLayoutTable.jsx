import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

const variantOptions = [
  { value: 'auto', label: 'Default', desc: 'Standard grid cells' },
  { value: 'featured', label: 'Featured', desc: 'Large 2-column card' },
  { value: 'compact', label: 'Compact', desc: 'Smaller dense card' },
  { value: 'wide', label: 'Wide', desc: 'Full-width panoramic' },
];

export default function ProductLayoutTable({ data, onUpdate }) {
  const [editState, setEditState] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (id, field, value) => {
    setEditState((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [field]: value },
    }));
  };

  const handleSave = async (id) => {
    const updates = editState[id];
    if (!updates) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('products').update(updates).eq('id', id);
      if (error) throw error;
      setEditState((prev) => { const n = { ...prev }; delete n[id]; return n; });
      onUpdate();
    } catch (error) {
      alert('Failed to update: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getVariantLabel = (v) => variantOptions.find((o) => o.value === v)?.label || 'Default';

  return (
    <div className="bg-white rounded-xl border border-[#bec9bf]/20 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-[#f5f4eb]/60 border-b border-[#bec9bf]/20">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Product</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Layout</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Sort</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Lock</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#bec9bf]/10">
            {data.map((product) => {
              const edits = editState[product.id];
              const isEditing = !!edits;
              return (
                <tr key={product.id} className="hover:bg-[#004a2b]/[0.01] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-[#f5f4eb] flex items-center justify-center border border-[#bec9bf]/10 overflow-hidden flex-shrink-0">
                        {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : <span className="material-symbols-outlined text-xs text-[#3f4942]/20">image</span>}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#004a2b] leading-tight">{product.name}</p>
                        <p className="text-[9px] text-[#3f4942]/40">{product.category || '—'}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {isEditing ? (
                      <select
                        value={edits.layout_variant || product.layout_variant || 'auto'}
                        onChange={(e) => handleChange(product.id, 'layout_variant', e.target.value)}
                        className="h-7 px-2 border border-[#bec9bf]/30 rounded-md bg-white text-xs font-medium text-[#004a2b] focus:ring-2 focus:ring-[#004a2b]/10 focus:border-[#004a2b] outline-none"
                      >
                        {variantOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium text-[#004a2b] bg-[#004a2b]/[0.04] border border-[#004a2b]/10">
                        {getVariantLabel(product.layout_variant || 'auto')}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        type="number"
                        min="1"
                        value={edits.layout_sort_order ?? product.layout_sort_order ?? 999}
                        onChange={(e) => handleChange(product.id, 'layout_sort_order', parseInt(e.target.value))}
                        className="w-16 h-7 px-2 border border-[#bec9bf]/30 rounded-md bg-white text-xs font-mono font-bold text-[#004a2b] focus:ring-2 focus:ring-[#004a2b]/10 focus:border-[#004a2b] outline-none"
                      />
                    ) : (
                      <span className="text-xs font-mono font-bold text-[#3f4942]/60">{product.layout_sort_order || 999}</span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {isEditing ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={edits.layout_locked !== undefined ? edits.layout_locked : (product.layout_locked || false)}
                          onChange={(e) => handleChange(product.id, 'layout_locked', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-[18px] bg-[#bec9bf]/30 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all peer-checked:after:translate-x-[14px]" />
                      </label>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase ${
                        product.layout_locked ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-50 text-slate-400 border border-slate-100'
                      }`}>
                        <span className="material-symbols-outlined text-[10px]">{product.layout_locked ? 'lock' : 'lock_open'}</span>
                        {product.layout_locked ? 'Locked' : 'Open'}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={() => handleSave(product.id)} disabled={isSaving} className="w-7 h-7 rounded-md bg-green-500 text-white hover:bg-green-600 transition-all flex items-center justify-center disabled:opacity-50">
                            <span className="material-symbols-outlined text-sm">check</span>
                          </button>
                          <button onClick={() => setEditState((p) => { const n = { ...p }; delete n[product.id]; return n; })} className="w-7 h-7 rounded-md bg-[#f5f4eb] text-[#3f4942] hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center">
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditState((p) => ({
                            ...p,
                            [product.id]: {
                              layout_variant: product.layout_variant || 'auto',
                              layout_sort_order: product.layout_sort_order || 999,
                              layout_locked: !!product.layout_locked,
                            },
                          }))}
                          className="w-7 h-7 rounded-md bg-[#f5f4eb] text-[#004a2b] hover:bg-[#004a2b] hover:text-white transition-all flex items-center justify-center"
                          title="Configure layout"
                        >
                          <span className="material-symbols-outlined text-sm">settings</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-[#bec9bf]/15 bg-[#f5f4eb]/30 text-[10px] text-[#3f4942]/40 font-medium">
        {data.length} products · {data.filter(p => p.layout_locked).length} locked
      </div>
    </div>
  );
}
