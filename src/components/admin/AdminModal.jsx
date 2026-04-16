import React, { useState, useEffect, useMemo } from 'react';
import { recipeService } from '../../services/recipeService';

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

const splitByComma = (value) => (value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const splitByLine = (value) => (value || '')
  .split('\n')
  .map((item) => item.trim())
  .filter(Boolean);

const recipeModalInitialState = (item) => ({
  ...item,
  tags_input: (item?.tags || []).join(', '),
  pantry_input: (item?.pantry_essentials || []).join(', '),
  method_steps_input: (item?.method_steps || []).join('\n'),
});

const recipePageModalInitialState = (item) => ({
  id: 1,
  ...item,
  default_pantry_input: (item?.default_pantry_essentials || []).join(', '),
});

export default function AdminModal({ type, item, catalogProducts, sellerOptions, onClose, onSave }) {
  const [formData, setFormData] = useState(() => {
    if (type === 'recipes') return recipeModalInitialState(item);
    if (type === 'recipe-page') return recipePageModalInitialState(item);
    if (type === 'products') {
      return {
        show_as_individual_product: true,
        sync_with_insider: false,
        ...(item || {}),
      };
    }
    return item || {};
  });
  const [lotItems, setLotItems] = useState(() => {
    if (type !== 'lots') return [];
    return (item?.lot_items || []).map((lotItem) => ({
      product_key: lotItem.product_key || lotItem.products?.key || '',
      quantity: lotItem.quantity || 1,
    }));
  });
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const calculatedLotPrice = useMemo(() => calculateLotPriceFromItems(lotItems, catalogProducts), [catalogProducts, lotItems]);

  useEffect(() => {
    if (type === 'recipes') {
      setFormData(recipeModalInitialState(item));
      setLotItems([]);
      return;
    }
    if (type === 'recipe-page') {
      setFormData(recipePageModalInitialState(item));
      setLotItems([]);
      return;
    }
    if (type === 'products') {
      setFormData({
        show_as_individual_product: true,
        sync_with_insider: false,
        ...(item || {}),
      });
    } else {
      setFormData(item || {});
    }
    if (type === 'lots') {
      setLotItems((item?.lot_items || []).map((lotItem) => ({
        product_key: lotItem.product_key || lotItem.products?.key || '',
        quantity: lotItem.quantity || 1,
      })));
    } else {
      setLotItems([]);
    }
  }, [item, type]);

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const publicUrl = await recipeService.uploadRecipeImage(file);
      setFormData((prev) => ({ ...prev, image_url: publicUrl }));
    } catch (error) {
      alert('Failed to upload image: ' + error.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...formData };

      if (type === 'recipes') {
        payload.tags = splitByComma(payload.tags_input);
        payload.pantry_essentials = splitByComma(payload.pantry_input);
        payload.method_steps = splitByLine(payload.method_steps_input);
        payload.sort_order = Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 999;
        payload.is_active = payload.is_active !== false;
        payload.is_featured = !!payload.is_featured;
        delete payload.tags_input;
        delete payload.pantry_input;
        delete payload.method_steps_input;
      }

      if (type === 'recipe-page') {
        payload.default_pantry_essentials = splitByComma(payload.default_pantry_input);
        payload.id = 1;
        delete payload.default_pantry_input;
      }

      if (type === 'lots') {
        payload.status = payload.status || 'active';
        payload.lot_items = lotItems.filter((lotItem) => lotItem.product_key);
      }

      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  const addLotRow = () => {
    setLotItems((prev) => [...prev, { product_key: '', quantity: 1 }]);
  };

  const updateLotRow = (index, key, value) => {
    setLotItems((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    )));
  };

  const removeLotRow = (index) => {
    setLotItems((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const labelClass = "block text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/70 mb-2";
  const inputClass = "w-full px-5 py-3.5 border border-outline-variant/30 rounded-2xl bg-surface-container-lowest focus:border-primary focus:bg-primary/5 focus:ring-4 focus:ring-primary/5 focus:outline-none transition-all font-body text-primary font-bold placeholder:font-normal placeholder:opacity-40";
  const selectClass = "w-full px-5 py-3.5 border border-outline-variant/30 rounded-2xl bg-surface-container-lowest focus:border-primary focus:bg-primary/5 focus:outline-none transition-all font-body text-primary font-bold appearance-none cursor-pointer";

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-50 p-4 sm:p-6 animate-in fade-in duration-300" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-[3rem] border border-outline-variant/30 max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-[0_32px_120px_rgba(0,0,0,0.5)] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-8 duration-500" onClick={(e) => e.stopPropagation()}>
        
        {/* Header */}
        <div className="sticky top-0 bg-surface-container-lowest/95 backdrop-blur-sm z-10 px-10 py-8 border-b border-outline-variant/10 flex items-center justify-between">
          <div>
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary mb-1 block">Administrative Tool</span>
             <h3 className="font-brand text-3xl font-bold text-primary tracking-tight">
               {item ? 'Modify' : 'Initialize'} {
                 type === 'customers' ? 'Customer'
                 : type === 'products' ? 'Product'
                 : type === 'lots' ? 'Bundle'
                 : type === 'recipes' ? 'Recipe'
                 : type === 'recipe-page' ? 'Section Config'
                 : 'Order'
               }
             </h3>
          </div>
          <button onClick={onClose} className="w-12 h-12 rounded-full hover:bg-surface-container-low text-on-surface-variant hover:text-red-500 focus:text-red-500 transition-all active:scale-95 flex items-center justify-center border border-outline-variant/20 shadow-sm">
            <span className="material-symbols-outlined text-2xl font-bold">close</span>
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="px-10 py-8 flex-1 space-y-8">
          
          {/* CUSTOMERS FORM */}
          {type === 'customers' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className={labelClass}>Legal First Name</label>
                  <input type="text" placeholder="e.g. Priom" value={formData.first_name || ''} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className={inputClass} />
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Surnames</label>
                  <input type="text" placeholder="e.g. Hazarika" value={formData.last_name || ''} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Verified Phone Number</label>
                <input type="tel" placeholder="+91 000-000-0000" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputClass} />
              </div>
              
              <div className="p-6 rounded-[2rem] bg-surface-container-low/50 border border-outline-variant/20 space-y-4">
                 <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60 mb-2">Access Privileges</p>
                 <div className="grid grid-cols-2 gap-4">
                    <label className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${formData.is_admin ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-surface border-outline-variant/30 text-on-surface-variant'}`}>
                       <input type="checkbox" checked={formData.is_admin || false} onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })} className="w-5 h-5 rounded-lg border-outline-variant text-amber-600 focus:ring-amber-500" />
                       <span className="font-bold text-sm tracking-tight flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg">admin_panel_settings</span>
                          Administrator
                       </span>
                    </label>
                    <label className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${formData.is_seller ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-surface border-outline-variant/30 text-on-surface-variant'}`}>
                       <input type="checkbox" checked={formData.is_seller || false} onChange={(e) => setFormData({ ...formData, is_seller: e.target.checked })} className="w-5 h-5 rounded-lg border-outline-variant text-emerald-600 focus:ring-emerald-500" />
                       <span className="font-bold text-sm tracking-tight flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg">storefront</span>
                          Merchant
                       </span>
                    </label>
                 </div>
              </div>
            </div>
          )}

          {/* PRODUCTS FORM */}
          {type === 'products' && (
            <div className="space-y-6">
              <div className="grid grid-cols-[1fr_200px] gap-5">
                <div className="space-y-2">
                   <label className={labelClass}>Human Readable Name *</label>
                   <input type="text" required placeholder="e.g. Bamboo Salt Jar" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputClass} />
                </div>
                <div className="space-y-2">
                   <label className={labelClass}>Internal Stock Key *</label>
                   <input type="text" required placeholder="BAMBOO_01" value={formData.key || ''} onChange={(e) => setFormData({ ...formData, key: e.target.value })} className={`${inputClass} font-mono`} />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className={labelClass}>Product Lifecycle Summary</label>
                <textarea rows={3} placeholder="Describe materials, origin and taste profile..." value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className={`${inputClass} resize-none leading-relaxed p-5`} />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className={labelClass}>Base Retail Price (₹)</label>
                  <input type="number" step="0.01" required placeholder="0.00" value={formData.price || ''} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className={inputClass} />
                </div>
                <div className="space-y-2">
                  <label className={labelClass}>Category</label>
                   <select value={formData.category || ''} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className={selectClass}>
                      <option value="">Select Department</option>
                      <option value="Pickles">Pickles</option>
                      <option value="Spices">Spices</option>
                      <option value="Tea">Tea</option>
                      <option value="Handicrafts">Handicrafts</option>
                      <option value="Superfoods">Superfoods</option>
                   </select>
                </div>
              </div>

              <div className="p-6 rounded-[2rem] bg-surface-container-low/50 border border-outline-variant/20 space-y-6">
                 <div className="space-y-2">
                    <label className={labelClass}>Fulfillment Partnership</label>
                    <select value={formData.seller_id || ''} onChange={(e) => {
                      const newSellerId = e.target.value || null;
                      const newSeller = (sellerOptions || []).find((s) => s.id === newSellerId);
                      setFormData({ ...formData, seller_id: newSellerId, sync_with_insider: newSeller?.is_own_seller ? formData.sync_with_insider : false });
                    }} className={selectClass}>
                      <option value="">Unmanaged Catalog</option>
                      {(sellerOptions || []).map((seller) => (
                        <option key={seller.id} value={seller.id}>{`${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.email} {seller.is_own_seller ? '(Hatvoni)' : '(Partner)'}</option>
                      ))}
                    </select>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-2xl border transition-all ${formData.sync_with_insider ? 'bg-secondary/5 border-secondary/30' : 'bg-surface border-outline-variant/20'}`}>
                       <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={formData.sync_with_insider || false} disabled={!(sellerOptions || []).find(s => s.id === formData.seller_id)?.is_own_seller} onChange={(e) => setFormData({ ...formData, sync_with_insider: e.target.checked })} className="w-5 h-5 rounded-lg border-outline-variant text-secondary focus:ring-secondary" />
                          <div className="flex flex-col">
                             <span className="font-bold text-sm tracking-tight">Sync Inventory</span>
                             <span className="text-[9px] font-black uppercase opacity-60">Insider API</span>
                          </div>
                       </label>
                    </div>
                    <div className={`p-4 rounded-2xl border transition-all ${formData.show_as_individual_product !== false ? 'bg-primary/5 border-primary/30' : 'bg-surface border-outline-variant/20'}`}>
                       <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={formData.show_as_individual_product !== false} onChange={(e) => setFormData({ ...formData, show_as_individual_product: e.target.checked })} className="w-5 h-5 rounded-lg border-outline-variant text-primary focus:ring-primary" />
                          <div className="flex flex-col">
                             <span className="font-bold text-sm tracking-tight">Public Listing</span>
                             <span className="text-[9px] font-black uppercase opacity-60">Main Shop</span>
                          </div>
                       </label>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {/* LOTS FORM */}
          {type === 'lots' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className={labelClass}>Collection Reference Name</label>
                <input type="text" required placeholder="Ethno-Modern Starter Pack" value={formData.lot_name || ''} onChange={(e) => setFormData({ ...formData, lot_name: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-2">
                <label className={labelClass}>Marketing Blurb</label>
                <textarea rows={2} placeholder="A curated collection of basics..." value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className={inputClass} />
              </div>

              <div className="grid grid-cols-2 gap-5">
                 <div className="p-5 rounded-[2rem] bg-primary/5 border border-primary/20 flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-primary uppercase tracking-[0.2em] mb-1">Total Bundle Value</span>
                    <span className="text-3xl font-brand font-bold text-primary tracking-tighter">₹{calculatedLotPrice.toLocaleString('en-IN')}</span>
                 </div>
                 <div className="space-y-2">
                    <label className={labelClass}>Availability Status</label>
                    <select value={formData.status || 'active'} onChange={(e) => setFormData({ ...formData, status: e.target.value })} className={selectClass}>
                       <option value="active">Operational</option>
                       <option value="inactive">Sold Out / Archive</option>
                    </select>
                 </div>
              </div>

              <div className="rounded-[2.5rem] bg-surface-container-low/50 border border-outline-variant/20 overflow-hidden">
                 <div className="px-8 py-6 border-b border-outline-variant/10 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Unit Configuration</p>
                        <p className="text-xs text-on-surface-variant/60 font-medium">Add products to this signature lot bundle</p>
                    </div>
                    <button type="button" onClick={addLotRow} className="w-10 h-10 rounded-full bg-primary text-white hover:scale-105 transition-all shadow-lg flex items-center justify-center border-4 border-white">
                       <span className="material-symbols-outlined font-bold">add</span>
                    </button>
                 </div>
                 <div className="p-6 space-y-3 max-h-[400px] overflow-y-auto">
                    {lotItems.length === 0 ? (
                      <div className="text-center py-10 opacity-30">
                         <span className="material-symbols-outlined text-4xl mb-2">inventory</span>
                         <p className="text-xs font-bold uppercase tracking-widest">No Items Added</p>
                      </div>
                    ) : lotItems.map((row, index) => (
                      <div key={index} className="flex gap-3 group animate-in slide-in-from-right-4 duration-300">
                        <select
                          value={row.product_key}
                          onChange={(e) => updateLotRow(index, 'product_key', e.target.value)}
                          className={`${selectClass} flex-1 py-3 text-xs`}
                        >
                          <option value="">Search Master Catalog...</option>
                          {catalogProducts.map((product) => (
                            <option key={product.id} value={product.key || product.external_product_id || product.id}>
                              {product.name} (₹{Number(product.price || 0).toLocaleString('en-IN')})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min="1"
                          value={row.quantity}
                          onChange={(e) => updateLotRow(index, 'quantity', Number(e.target.value) || 1)}
                          className={`${inputClass} w-24 py-3 text-xs text-center`}
                        />
                        <button type="button" onClick={() => removeLotRow(index)} className="w-10 h-10 shrink-0 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center border border-red-100 shadow-sm">
                          <span className="material-symbols-outlined text-lg font-bold">delete</span>
                        </button>
                      </div>
                    ))}
                 </div>
              </div>
            </div>
          )}
          
          {/* ... More forms for recipes, orders similarly ... */}

          {/* SHARED ASSET FIELDS */}
          {(type === 'products' || type === 'lots' || type === 'recipes') && (
            <div className="space-y-4">
              <label className={labelClass}>Primary Visual Asset (URL)</label>
              <div className="flex gap-3">
                 <input type="url" placeholder="https://cdn.hatvoni.com/assets/..." value={formData.image_url || ''} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} className={inputClass} />
                 {type === 'recipes' && (
                   <label className="shrink-0 w-14 h-14 rounded-2xl bg-secondary text-white hover:bg-secondary/80 transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-lg border-4 border-white">
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                      <span className="material-symbols-outlined">{uploadingImage ? 'sync' : 'upload'}</span>
                   </label>
                 )}
              </div>
              {formData.image_url && (
                <div className="w-full h-40 rounded-[2rem] border-2 border-dashed border-outline-variant/30 overflow-hidden group/preview relative">
                   <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover/preview:scale-105" />
                   <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity">
                      <span className="text-white text-[10px] font-black uppercase tracking-widest bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">VIsual Asset Preview</span>
                   </div>
                </div>
              )}
            </div>
          )}

        </form>

        {/* Action Bar */}
        <div className="sticky bottom-0 bg-surface-container-lowest border-t border-outline-variant/10 px-10 py-8 flex items-center justify-between gap-6 z-10">
           <button type="button" onClick={onClose} className="px-8 py-4 rounded-2xl font-brand font-bold text-on-surface-variant hover:bg-surface-container-low transition-all active:scale-95">
             Discard Changes
           </button>
           <button 
             onClick={handleSubmit}
             disabled={saving}
             className="px-10 py-4 bg-tertiary text-white rounded-2xl font-brand font-bold text-lg hover:bg-tertiary/90 shadow-[0_12px_40px_rgba(0,121,107,0.3)] hover:shadow-[0_12px_45px_rgba(0,121,107,0.4)] transition-all active:scale-95 flex items-center gap-3 disabled:opacity-50"
           >
             {saving ? (
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
             ) : (
                <span className="material-symbols-outlined">save</span>
             )}
             {item ? 'Authorize Updates' : 'Commit to Database'}
           </button>
        </div>
      </div>
    </div>
  );
}
