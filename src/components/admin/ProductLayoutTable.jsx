import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

const variantOptions = [
  { value: 'auto', label: 'Default Grid', description: 'Standard consistent grid cells', cols: '1 col', height: 'h-[350px]', desc: 'Base layout' },
  { value: 'featured', label: 'Hero Featured', description: 'Large card taking 2 grid slots', cols: '2 cols', height: 'h-[450px]', desc: 'High emphasis' },
  { value: 'compact', label: 'Product Focus', description: 'Smaller card for dense listings', cols: '1 col', height: 'h-[280px]', desc: 'Space saver' },
  { value: 'wide', label: 'Horizontal Panoramic', description: 'Wide aspect ratio card', cols: 'full width', height: 'h-[320px]', desc: 'Story telling' },
];

export default function ProductLayoutTable({ data, onUpdate }) {
  const [editState, setEditState] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [previewVariant, setPreviewVariant] = useState('auto');

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
      setEditState((prev) => { const newState = { ...prev }; delete newState[id]; return newState; });
      onUpdate();
    } catch (error) {
       alert('Failed to update product layout: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getVariantPreview = (v) => variantOptions.find((opt) => opt.value === v) || variantOptions[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="lg:col-span-2 bg-surface-container-lowest rounded-[2rem] border border-outline-variant/30 overflow-hidden shadow-sm shadow-primary/5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/30">
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Live Product</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Visual Variant</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Rank</th>
              <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Lock</th>
              <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {data.map((product) => {
              const isEditing = editState[product.id];
              return (
                <tr key={product.id} className="hover:bg-primary/[0.02] transition-all group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center border border-outline-variant/10 overflow-hidden">
                          {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : <span className="material-symbols-outlined text-xs">image</span>}
                       </div>
                       <div>
                         <p className="font-bold text-primary text-sm leading-tight">{product.name}</p>
                         <p className="text-[10px] text-on-surface-variant/60 font-black">{product.category || 'Standard'}</p>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {isEditing ? (
                      <select
                        value={isEditing.layout_variant || product.layout_variant || 'auto'}
                        onChange={(e) => {
                          handleChange(product.id, 'layout_variant', e.target.value);
                          setPreviewVariant(e.target.value);
                        }}
                        className="px-4 py-2 border border-outline-variant/30 rounded-xl bg-surface focus:ring-4 focus:ring-primary/5 focus:border-primary focus:outline-none font-bold text-primary text-xs w-full"
                      >
                        {variantOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <div
                        onClick={() => setPreviewVariant(product.layout_variant || 'auto')}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-container/10 text-primary font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-primary-container/30 transition-all border border-primary/10 shadow-sm"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {variantOptions.find((v) => v.value === (product.layout_variant || 'auto'))?.label || 'Auto'}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {isEditing ? (
                      <input
                        type="number"
                        min="1"
                        value={isEditing.layout_sort_order || product.layout_sort_order || 999}
                        onChange={(e) => handleChange(product.id, 'layout_sort_order', parseInt(e.target.value))}
                        className="w-20 px-4 py-2 border border-outline-variant/30 rounded-xl bg-surface focus:ring-4 focus:ring-primary/5 focus:border-primary font-black text-primary text-xs"
                      />
                    ) : (
                      <span className="text-sm font-black text-on-surface-variant font-mono">{product.layout_sort_order || 999}</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {isEditing ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isEditing.layout_locked !== undefined ? isEditing.layout_locked : (product.layout_locked || false)}
                          onChange={(e) => handleChange(product.id, 'layout_locked', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-surface-container peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                      </label>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        product.layout_locked ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                      } border`}>
                        <span className="material-symbols-outlined text-[12px]">{product.layout_locked ? 'lock' : 'lock_open'}</span>
                        {product.layout_locked ? 'Locked' : 'Unlocked'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                       {isEditing ? (
                         <>
                           <button onClick={() => handleSave(product.id)} disabled={isSaving} className="w-9 h-9 rounded-xl bg-green-500 text-white hover:bg-green-600 transition-all flex items-center justify-center shadow-lg shadow-green-200 disabled:opacity-50">
                             <span className="material-symbols-outlined text-lg">check</span>
                           </button>
                           <button onClick={() => setEditState((prev) => { const newState = { ...prev }; delete newState[product.id]; return newState; })} className="w-9 h-9 rounded-xl bg-surface-container text-on-surface-variant hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center border border-outline-variant/10">
                             <span className="material-symbols-outlined text-lg">close</span>
                           </button>
                         </>
                       ) : (
                         <button
                           onClick={() => setEditState((prev) => ({
                             ...prev,
                             [product.id]: {
                               layout_variant: product.layout_variant || 'auto',
                               layout_sort_order: product.layout_sort_order || 999,
                               layout_locked: !!product.layout_locked,
                             },
                           }))}
                           className="w-10 h-10 rounded-xl bg-surface-container-low text-primary hover:bg-primary hover:text-white transition-all active:scale-95 flex items-center justify-center shadow-sm border border-outline-variant/10"
                         >
                           <span className="material-symbols-outlined text-[18px]">settings_input_component</span>
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

      {/* Visual Guide Sidebar */}
      <div className="lg:col-span-1 space-y-6">
        <div className="sticky top-32 space-y-6">
          <div className="bg-primary p-8 rounded-[2.5rem] shadow-2xl shadow-primary/20 text-white overflow-hidden relative">
             <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
             <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-secondary/20 rounded-full blur-3xl"></div>
             <h3 className="font-brand font-bold text-2xl mb-2 relative z-10">Editorial Layout Engine</h3>
             <p className="text-white/70 text-sm leading-relaxed mb-6 font-medium relative z-10">Define the visual importance and positioning of each catalog item on the main storefront.</p>
             
             {previewVariant && (
                <div className="bg-black/20 backdrop-blur-md rounded-[2rem] p-6 border border-white/10 relative z-10">
                   <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Previewing: {getVariantPreview(previewVariant).label}</span>
                      <span className="material-symbols-outlined text-sm text-secondary">visibility</span>
                   </div>
                   <div className={`${getVariantPreview(previewVariant).height} bg-white/5 rounded-2xl flex items-center justify-center border-2 border-dashed border-white/20 mb-4 group transition-all`}>
                      <div className="text-center group-hover:scale-110 transition-transform">
                         <span className="material-symbols-outlined text-white/40 text-4xl">dashboard_customize</span>
                         <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mt-3">Virtual Slot: {getVariantPreview(previewVariant).cols}</p>
                      </div>
                   </div>
                   <p className="text-xs font-semibold text-white/80 text-center leading-relaxed italic">"{getVariantPreview(previewVariant).description}"</p>
                </div>
             )}
          </div>
          
          <div className="bg-surface-container-low rounded-[2rem] border border-outline-variant/20 p-6">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-4 border-b border-outline-variant/10 pb-3">Available Grid Blueprints</h4>
             <div className="space-y-3">
                {variantOptions.map((variant) => (
                   <button
                     key={variant.value}
                     onClick={() => setPreviewVariant(variant.value)}
                     className={`w-full text-left p-4 rounded-2xl transition-all ${previewVariant === variant.value ? 'bg-secondary text-white shadow-lg shadow-secondary/20' : 'bg-surface hover:bg-primary/5 text-on-surface-variant border border-outline-variant/10'}`}
                   >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-lg">{variant.value === 'featured' ? 'auto_awesome' : variant.value === 'compact' ? 'grid_view' : 'space_dashboard'}</span>
                        <p className="font-bold text-sm tracking-tight">{variant.label}</p>
                      </div>
                      <p className={`text-[10px] ${previewVariant === variant.value ? 'text-white/70' : 'text-on-surface-variant/50'}`}>{variant.description}</p>
                   </button>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
