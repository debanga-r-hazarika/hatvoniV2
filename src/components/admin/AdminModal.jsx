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

/* ─── Style constants ──────────────────────────────────────────────────────── */
const C = {
  primary: '#004a2b',
  accent: '#815500',
  muted: '#3f4942',
  border: '#c8c8b9',
  bg: '#fbfaf1',
  bgCard: '#f5f4eb',
  white: '#ffffff',
};

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

  /* ─── Reusable form element components ──────────────────────────────────── */
  const Label = ({ children }) => (
    <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: `${C.muted}99` }}>{children}</label>
  );

  const Input = ({ className = '', ...props }) => (
    <input
      {...props}
      className={`w-full h-9 px-3 text-xs font-medium rounded-lg border transition-all outline-none ${className}`}
      style={{
        borderColor: `${C.border}50`,
        backgroundColor: C.white,
        color: C.primary,
      }}
      onFocus={(e) => { e.target.style.borderColor = C.primary; e.target.style.boxShadow = `0 0 0 3px ${C.primary}15`; props.onFocus?.(e); }}
      onBlur={(e) => { e.target.style.borderColor = `${C.border}50`; e.target.style.boxShadow = 'none'; props.onBlur?.(e); }}
    />
  );

  const Select = ({ className = '', children, ...props }) => (
    <select
      {...props}
      className={`w-full h-9 px-3 text-xs font-medium rounded-lg border transition-all outline-none appearance-none cursor-pointer ${className}`}
      style={{
        borderColor: `${C.border}50`,
        backgroundColor: C.white,
        color: C.primary,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%233f4942' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: '28px',
      }}
    >
      {children}
    </select>
  );

  const TextArea = ({ className = '', ...props }) => (
    <textarea
      {...props}
      className={`w-full px-3 py-2.5 text-xs font-medium rounded-lg border transition-all outline-none resize-none leading-relaxed ${className}`}
      style={{
        borderColor: `${C.border}50`,
        backgroundColor: C.white,
        color: C.primary,
      }}
      onFocus={(e) => { e.target.style.borderColor = C.primary; e.target.style.boxShadow = `0 0 0 3px ${C.primary}15`; }}
      onBlur={(e) => { e.target.style.borderColor = `${C.border}50`; e.target.style.boxShadow = 'none'; }}
    />
  );

  const ToggleCard = ({ checked, onChange, icon, label, sublabel, activeColor = '#004a2b', disabled = false }) => (
    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm'}`}
      style={{
        borderColor: checked ? `${activeColor}40` : `${C.border}30`,
        backgroundColor: checked ? `${activeColor}08` : C.white,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
        style={{
          borderColor: checked ? activeColor : `${C.border}60`,
          backgroundColor: checked ? activeColor : 'transparent',
        }}
      >
        {checked && <span className="material-symbols-outlined text-white" style={{ fontSize: '14px' }}>check</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined" style={{ fontSize: '16px', color: checked ? activeColor : `${C.muted}80` }}>{icon}</span>
          <span className="text-xs font-semibold" style={{ color: checked ? activeColor : C.muted }}>{label}</span>
        </div>
        {sublabel && <p className="text-[9px] mt-0.5" style={{ color: `${C.muted}80` }}>{sublabel}</p>}
      </div>
    </label>
  );

  const SectionCard = ({ children, className = '' }) => (
    <div className={`p-4 rounded-xl border ${className}`} style={{ borderColor: `${C.border}20`, backgroundColor: `${C.bgCard}60` }}>
      {children}
    </div>
  );

  const SectionLabel = ({ children }) => (
    <p className="text-[9px] font-semibold uppercase tracking-wider mb-3" style={{ color: `${C.muted}60` }}>{children}</p>
  );

  const typeLabel = type === 'customers' ? 'Customer'
    : type === 'products' ? 'Product'
    : type === 'lots' ? 'Bundle'
    : type === 'recipes' ? 'Recipe'
    : type === 'recipe-page' ? 'Page Config'
    : 'Order';

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="rounded-2xl max-w-xl w-full max-h-[88vh] overflow-hidden shadow-2xl flex flex-col" style={{ backgroundColor: C.white, border: `1px solid ${C.border}25` }} onClick={(e) => e.stopPropagation()}>

        {/* ─── Header ──────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-10 px-5 py-3.5 flex items-center justify-between" style={{ backgroundColor: C.white, borderBottom: `1px solid ${C.border}20` }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${C.primary}10` }}>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: C.primary }}>
                {type === 'customers' ? 'person' : type === 'products' ? 'inventory_2' : type === 'lots' ? 'deployed_code' : type === 'recipes' ? 'local_dining' : type === 'recipe-page' ? 'menu_book' : 'list_alt'}
              </span>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: C.accent }}>{item ? 'Edit' : 'New'}</p>
              <h3 className="text-base font-bold tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif', color: C.primary }}>{typeLabel}</h3>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-50 hover:text-red-500" style={{ color: `${C.muted}80`, border: `1px solid ${C.border}25` }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
          </button>
        </div>

        {/* ─── Content ─────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="px-5 py-4 flex-1 overflow-y-auto space-y-4">

          {/* ── CUSTOMERS ─────────────────────────────────────────────────── */}
          {type === 'customers' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Name</Label>
                  <Input type="text" placeholder="e.g. Priom" value={formData.first_name || ''} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input type="text" placeholder="e.g. Hazarika" value={formData.last_name || ''} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input type="tel" placeholder="+91 000-000-0000" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <SectionCard>
                <SectionLabel>Access Roles</SectionLabel>
                <div className="grid grid-cols-2 gap-2.5">
                  <ToggleCard
                    checked={formData.is_admin || false}
                    onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                    icon="admin_panel_settings"
                    label="Administrator"
                    sublabel="Full system access"
                    activeColor="#b45309"
                  />
                  <ToggleCard
                    checked={formData.is_seller || false}
                    onChange={(e) => setFormData({ ...formData, is_seller: e.target.checked })}
                    icon="storefront"
                    label="Merchant"
                    sublabel="Can manage products"
                    activeColor="#047857"
                  />
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── PRODUCTS ──────────────────────────────────────────────────── */}
          {type === 'products' && (
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_160px] gap-3">
                <div>
                  <Label>Product Name *</Label>
                  <Input type="text" required placeholder="e.g. Bamboo Salt Jar" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div>
                  <Label>Stock Key *</Label>
                  <Input type="text" required placeholder="BAMBOO_01" value={formData.key || ''} onChange={(e) => setFormData({ ...formData, key: e.target.value })} className="font-mono" />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <TextArea rows={2} placeholder="Describe materials, origin and taste profile..." value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Price (₹)</Label>
                  <Input type="number" step="0.01" required placeholder="0.00" value={formData.price || ''} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={formData.category || ''} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                    <option value="">Select</option>
                    <option value="Pickles">Pickles</option>
                    <option value="Spices">Spices</option>
                    <option value="Tea">Tea</option>
                    <option value="Handicrafts">Handicrafts</option>
                    <option value="Superfoods">Superfoods</option>
                  </Select>
                </div>
              </div>

              <SectionCard>
                <SectionLabel>Fulfillment & Visibility</SectionLabel>
                <div className="mb-3">
                  <Label>Seller</Label>
                  <Select value={formData.seller_id || ''} onChange={(e) => {
                    const newSellerId = e.target.value || null;
                    const newSeller = (sellerOptions || []).find((s) => s.id === newSellerId);
                    setFormData({ ...formData, seller_id: newSellerId, sync_with_insider: newSeller?.is_own_seller ? formData.sync_with_insider : false });
                  }}>
                    <option value="">Unmanaged</option>
                    {(sellerOptions || []).map((seller) => (
                      <option key={seller.id} value={seller.id}>{`${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.email} {seller.is_own_seller ? '(Hatvoni)' : '(Partner)'}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <ToggleCard
                    checked={formData.sync_with_insider || false}
                    onChange={(e) => setFormData({ ...formData, sync_with_insider: e.target.checked })}
                    disabled={!(sellerOptions || []).find(s => s.id === formData.seller_id)?.is_own_seller}
                    icon="sync"
                    label="Sync Inventory"
                    sublabel="Insider API"
                    activeColor="#815500"
                  />
                  <ToggleCard
                    checked={formData.show_as_individual_product !== false}
                    onChange={(e) => setFormData({ ...formData, show_as_individual_product: e.target.checked })}
                    icon="visibility"
                    label="Public Listing"
                    sublabel="Show in shop"
                  />
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── LOTS/BUNDLES ──────────────────────────────────────────────── */}
          {type === 'lots' && (
            <div className="space-y-4">
              <div>
                <Label>Bundle Name</Label>
                <Input type="text" required placeholder="Ethno-Modern Starter Pack" value={formData.lot_name || ''} onChange={(e) => setFormData({ ...formData, lot_name: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <TextArea rows={2} placeholder="A curated collection of basics..." value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl flex flex-col items-center justify-center" style={{ backgroundColor: `${C.primary}08`, border: `1px solid ${C.primary}20` }}>
                  <span className="text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ color: `${C.primary}99` }}>Bundle Value</span>
                  <span className="text-xl font-bold tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif', color: C.primary }}>₹{calculatedLotPrice.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={formData.status || 'active'} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
              </div>

              <SectionCard>
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>Bundle Items</SectionLabel>
                  <button type="button" onClick={addLotRow} className="h-7 px-3 rounded-lg text-white text-[10px] font-semibold flex items-center gap-1 transition-colors hover:opacity-90" style={{ backgroundColor: C.primary }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>add</span>
                    Add Item
                  </button>
                </div>
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {lotItems.length === 0 ? (
                    <div className="text-center py-6" style={{ color: `${C.muted}30` }}>
                      <span className="material-symbols-outlined block mb-1" style={{ fontSize: '28px' }}>inventory</span>
                      <p className="text-[10px] font-semibold uppercase tracking-wider">No items added</p>
                    </div>
                  ) : lotItems.map((row, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Select
                        value={row.product_key}
                        onChange={(e) => updateLotRow(index, 'product_key', e.target.value)}
                        className="flex-1"
                      >
                        <option value="">Select product...</option>
                        {catalogProducts.map((product) => (
                          <option key={product.id} value={product.key || product.external_product_id || product.id}>
                            {product.name} (₹{Number(product.price || 0).toLocaleString('en-IN')})
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={(e) => updateLotRow(index, 'quantity', Number(e.target.value) || 1)}
                        className="!w-16 text-center"
                      />
                      <button type="button" onClick={() => removeLotRow(index)} className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-all hover:bg-red-500 hover:text-white" style={{ backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fee2e2' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── RECIPES FORM (placeholder — structure preserved) ──────────── */}
          {/* ... More forms for recipes, orders similarly ... */}

          {/* ── SHARED: Image Upload ──────────────────────────────────────── */}
          {(type === 'products' || type === 'lots' || type === 'recipes') && (
            <div className="space-y-3">
              <Label>Image URL</Label>
              <div className="flex gap-2">
                <Input type="url" placeholder="https://cdn.hatvoni.com/..." value={formData.image_url || ''} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })} />
                {type === 'recipes' && (
                  <label className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-all hover:opacity-80" style={{ backgroundColor: C.accent, color: C.white }}>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{uploadingImage ? 'sync' : 'upload'}</span>
                  </label>
                )}
              </div>
              {formData.image_url && (
                <div className="w-full h-32 rounded-xl overflow-hidden relative group" style={{ border: `1px dashed ${C.border}40` }}>
                  <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-[9px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>Preview</span>
                  </div>
                </div>
              )}
            </div>
          )}

        </form>

        {/* ─── Footer Action Bar ────────────────────────────────────────── */}
        <div className="sticky bottom-0 z-10 px-5 py-3 flex items-center justify-end gap-2.5" style={{ backgroundColor: C.white, borderTop: `1px solid ${C.border}20` }}>
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg text-xs font-semibold transition-all hover:opacity-80" style={{ color: C.muted, backgroundColor: `${C.bgCard}` }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="h-9 px-5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 transition-all hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: C.primary }}
          >
            {saving ? (
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
            ) : (
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>check</span>
            )}
            {item ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
