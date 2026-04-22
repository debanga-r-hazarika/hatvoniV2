import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import WarehouseModal from '../components/admin/WarehouseModal';

// ─── helpers ────────────────────────────────────────────────────────────────

function Notice({ message, type = 'success', onClose }) {
  if (!message) return null;
  const isError = type === 'error';
  return (
    <div
      className={`mb-5 px-4 py-3 rounded-xl border text-sm flex items-center gap-3 ${
        isError
          ? 'bg-red-50 border-red-200 text-red-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      }`}
    >
      <span
        className={`material-symbols-outlined ${isError ? 'text-red-600' : 'text-emerald-600'}`}
      >
        {isError ? 'error' : 'check_circle'}
      </span>
      <p className="font-medium flex-1">{message}</p>
      <button
        onClick={onClose}
        className={`font-bold ${isError ? 'text-red-700 hover:text-red-900' : 'text-emerald-700 hover:text-emerald-900'}`}
      >
        ✕
      </button>
    </div>
  );
}

function Spinner({ size = 'lg' }) {
  const sz = size === 'lg' ? 'text-4xl' : 'text-xl';
  return (
    <div className="flex items-center justify-center py-20">
      <span className={`material-symbols-outlined ${sz} text-primary animate-spin`}>
        progress_activity
      </span>
    </div>
  );
}

// ─── Tab button ──────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
        active
          ? 'bg-primary text-white shadow-sm'
          : 'text-on-surface-variant hover:bg-primary/5'
      }`}
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
      {label}
    </button>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5 flex items-center gap-4">
      <div className={`${color} w-11 h-11 rounded-xl flex items-center justify-center shrink-0`}>
        <span className="material-symbols-outlined text-white">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-brand text-primary">{value}</p>
        <p className="text-sm text-on-surface-variant">{label}</p>
      </div>
    </div>
  );
}

// ─── Warehouses tab ──────────────────────────────────────────────────────────

function WarehousesTab({ warehouses, loading, onAdd, onEdit, onDelete }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warehouses;
    return warehouses.filter(
      (w) =>
        (w.warehouse_name || '').toLowerCase().includes(q) ||
        (w.city || '').toLowerCase().includes(q) ||
        (w.state || '').toLowerCase().includes(q) ||
        (w.pincode || '').includes(q) ||
        (w.velocity_warehouse_id || '').toLowerCase().includes(q),
    );
  }, [warehouses, search]);

  const stats = useMemo(
    () => ({
      total: warehouses.length,
      withVelocity: warehouses.filter((w) => w.velocity_warehouse_id).length,
      withoutVelocity: warehouses.filter((w) => !w.velocity_warehouse_id).length,
    }),
    [warehouses],
  );

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon="warehouse" label="Total Warehouses" value={stats.total} color="bg-primary" />
        <StatCard icon="link" label="With Velocity ID" value={stats.withVelocity} color="bg-emerald-600" />
        <StatCard icon="link_off" label="Without Velocity ID" value={stats.withoutVelocity} color="bg-amber-500" />
      </div>

      {/* List card */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
        <div className="p-5 border-b border-outline-variant/20 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <h2 className="font-brand text-2xl text-primary">All Warehouses</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              {filtered.length} of {warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-72">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">
                search
              </span>
              <input
                type="text"
                placeholder="Search name, city, state, pincode, velocity ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-outline-variant/30 rounded-xl bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
              />
            </div>
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition shrink-0"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Add
            </button>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">warehouse</span>
            <p className="mt-4 text-on-surface-variant">
              {warehouses.length === 0 ? 'No warehouses yet. Add one to get started.' : 'No warehouses match your search.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/15">
            {filtered.map((w) => (
              <div key={w.id} className="p-5 hover:bg-primary/[0.02] transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-primary">warehouse</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-brand text-lg font-bold text-primary leading-tight">
                          {w.warehouse_name}
                        </p>
                        {w.velocity_warehouse_id ? (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                            Velocity: {w.velocity_warehouse_id}
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                            No Velocity ID
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-on-surface-variant mt-1">
                        {w.street_address}, {w.city}, {w.state} — {w.pincode}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-on-surface-variant">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">person</span>
                          {w.contact_person}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">call</span>
                          {w.contact_number}
                        </span>
                        {w.email && (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px]">mail</span>
                            {w.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onEdit(w)}
                      className="w-9 h-9 rounded-xl border border-outline-variant/20 bg-surface flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors"
                      title="Edit warehouse"
                    >
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(w)}
                      className="w-9 h-9 rounded-xl border border-red-100 bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                      title="Delete warehouse"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Assign to Products tab (Bulk only) ─────────────────────────────────────

function AssignTab({ warehouses, warehousesLoading }) {
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const showNotice = (msg) => { setNotice(msg); setErrorMsg(''); };
  const showError = (msg) => { setErrorMsg(msg); setNotice(''); };

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, key, category')
        .order('name', { ascending: true });
      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      showError('Failed to load products: ' + (err?.message || 'Unknown error'));
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.key || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q),
    );
  }, [products, productSearch]);

  return (
    <div className="space-y-5">
      <div className="bg-surface-container-low rounded-2xl border border-outline-variant/20 p-4">
        <p className="text-sm text-on-surface-variant">
          <span className="font-semibold text-primary">Bulk assign:</span> pick a warehouse, select multiple products, then click "Assign to Selected". Already-assigned products are skipped automatically.
          For individual product warehouse management, use the <span className="font-semibold">Products</span> section.
        </p>
      </div>

      <Notice message={notice} type="success" onClose={() => setNotice('')} />
      <Notice message={errorMsg} type="error" onClose={() => setErrorMsg('')} />

      <BulkAssign
        warehouses={warehouses}
        warehousesLoading={warehousesLoading}
        products={filteredProducts}
        productsLoading={productsLoading}
        productSearch={productSearch}
        onProductSearch={setProductSearch}
        showNotice={showNotice}
        showError={showError}
      />
    </div>
  );
}

// ─── Individual assign sub-mode ──────────────────────────────────────────────

function IndividualAssign({
  warehouses,
  warehousesLoading,
  products,
  productsLoading,
  productSearch,
  onProductSearch,
  showNotice,
  showError,
}) {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [assignments, setAssignments] = useState([]); // product_warehouses rows
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  const fetchAssignments = useCallback(async (productId) => {
    if (!productId) { setAssignments([]); return; }
    setAssignmentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_warehouses')
        .select('warehouse_id, is_default, assigned_at')
        .eq('product_id', productId);
      if (error) throw error;
      setAssignments(data || []);
    } catch (err) {
      showError('Failed to load assignments: ' + (err?.message || 'Unknown error'));
    } finally {
      setAssignmentsLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchAssignments(selectedProductId);
  }, [selectedProductId, fetchAssignments]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.warehouse_id)), [assignments]);

  const handleAssign = async (warehouseId) => {
    if (!selectedProductId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_warehouses')
        .upsert(
          { product_id: selectedProductId, warehouse_id: warehouseId, is_default: assignments.length === 0 },
          { onConflict: 'product_id,warehouse_id' },
        );
      if (error) throw error;
      await fetchAssignments(selectedProductId);
      showNotice('Warehouse assigned successfully.');
    } catch (err) {
      showError('Failed to assign warehouse: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (warehouseId) => {
    if (!selectedProductId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_warehouses')
        .delete()
        .eq('product_id', selectedProductId)
        .eq('warehouse_id', warehouseId);
      if (error) throw error;
      await fetchAssignments(selectedProductId);
      showNotice('Warehouse removed from product.');
    } catch (err) {
      showError('Failed to remove warehouse: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (warehouseId) => {
    if (!selectedProductId) return;
    setSaving(true);
    try {
      // The DB trigger handles clearing other defaults, but we do it explicitly too
      const { error } = await supabase
        .from('product_warehouses')
        .update({ is_default: true })
        .eq('product_id', selectedProductId)
        .eq('warehouse_id', warehouseId);
      if (error) throw error;
      await fetchAssignments(selectedProductId);
      showNotice('Default warehouse updated.');
    } catch (err) {
      showError('Failed to set default: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
      {/* Product picker */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-outline-variant/20">
          <h3 className="font-brand text-lg text-primary mb-3">Select Product</h3>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Search products…"
              value={productSearch}
              onChange={(e) => onProductSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-outline-variant/30 rounded-xl bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
            />
          </div>
        </div>
        <div className="overflow-y-auto max-h-[480px]">
          {productsLoading ? (
            <Spinner size="sm" />
          ) : products.length === 0 ? (
            <p className="text-center text-sm text-on-surface-variant py-10">No products found.</p>
          ) : (
            <div className="divide-y divide-outline-variant/15">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProductId(p.id)}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-primary/[0.03] ${
                    selectedProductId === p.id ? 'bg-primary/[0.06]' : ''
                  }`}
                >
                  <p className="text-sm font-semibold text-primary leading-tight">{p.name}</p>
                  {p.key && <p className="text-xs text-on-surface-variant mt-0.5 font-mono">{p.key}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Assignment panel */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
        {!selectedProduct ? (
          <div className="flex flex-col items-center justify-center py-24 text-center px-6">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">inventory_2</span>
            <p className="mt-4 text-on-surface-variant">Select a product on the left to manage its warehouse assignments.</p>
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-outline-variant/20">
              <h3 className="font-brand text-xl text-primary">{selectedProduct.name}</h3>
              {selectedProduct.key && (
                <p className="text-xs text-on-surface-variant mt-0.5 font-mono">{selectedProduct.key}</p>
              )}
              <p className="text-sm text-on-surface-variant mt-1">
                {assignments.length} warehouse{assignments.length !== 1 ? 's' : ''} assigned
              </p>
            </div>

            {assignmentsLoading ? (
              <Spinner />
            ) : (
              <div className="divide-y divide-outline-variant/15">
                {warehousesLoading ? (
                  <Spinner />
                ) : warehouses.length === 0 ? (
                  <p className="text-center text-sm text-on-surface-variant py-10">
                    No warehouses exist yet. Create one in the Warehouses tab first.
                  </p>
                ) : (
                  warehouses.map((w) => {
                    const isAssigned = assignedIds.has(w.id);
                    const assignment = assignments.find((a) => a.warehouse_id === w.id);
                    const isDefault = assignment?.is_default || false;
                    return (
                      <div key={w.id} className="p-4 flex items-center justify-between gap-4 hover:bg-primary/[0.02] transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isAssigned ? 'bg-primary/10' : 'bg-outline-variant/10'}`}>
                            <span className={`material-symbols-outlined text-[18px] ${isAssigned ? 'text-primary' : 'text-on-surface-variant/40'}`}>
                              warehouse
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-primary">{w.warehouse_name}</p>
                              {isDefault && (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                  Default
                                </span>
                              )}
                              {w.velocity_warehouse_id && (
                                <span className="text-[10px] font-semibold text-on-surface-variant/60">
                                  {w.velocity_warehouse_id}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-on-surface-variant truncate">
                              {w.city}, {w.state} — {w.pincode}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isAssigned && !isDefault && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleSetDefault(w.id)}
                              className="h-8 px-3 rounded-lg border border-outline-variant/20 text-xs font-semibold text-on-surface-variant hover:bg-primary hover:text-white hover:border-primary transition-all disabled:opacity-50"
                              title="Set as default"
                            >
                              Set default
                            </button>
                          )}
                          {isAssigned ? (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleRemove(w.id)}
                              className="h-8 px-3 rounded-lg border border-red-100 bg-red-50 text-xs font-semibold text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all disabled:opacity-50"
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => handleAssign(w.id)}
                              className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                            >
                              Assign
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Bulk assign sub-mode ────────────────────────────────────────────────────

function BulkAssign({
  warehouses,
  warehousesLoading,
  products,
  productsLoading,
  productSearch,
  onProductSearch,
  showNotice,
  showError,
}) {
  const [selectedProductIds, setSelectedProductIds] = useState(new Set());
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const allSelected = products.length > 0 && products.every((p) => selectedProductIds.has(p.id));
  const someSelected = products.some((p) => selectedProductIds.has(p.id));

  const toggleProduct = (id) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(products.map((p) => p.id)));
    }
  };

  const handleBulkAssign = async () => {
    if (!selectedWarehouseId) { showError('Please select a warehouse first.'); return; }
    if (selectedProductIds.size === 0) { showError('Please select at least one product.'); return; }

    setAssigning(true);
    try {
      // Build rows — upsert with onConflict ignore so already-assigned ones are skipped
      const rows = Array.from(selectedProductIds).map((productId) => ({
        product_id: productId,
        warehouse_id: selectedWarehouseId,
        is_default: false,
      }));

      const { error } = await supabase
        .from('product_warehouses')
        .upsert(rows, { onConflict: 'product_id,warehouse_id', ignoreDuplicates: true });

      if (error) throw error;

      showNotice(
        `Warehouse assigned to ${selectedProductIds.size} product${selectedProductIds.size !== 1 ? 's' : ''}. Already-assigned products were skipped.`,
      );
      setSelectedProductIds(new Set());
      setSelectedWarehouseId('');
    } catch (err) {
      showError('Bulk assign failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Warehouse picker */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5">
        <h3 className="font-brand text-lg text-primary mb-3">1. Pick a Warehouse</h3>
        {warehousesLoading ? (
          <Spinner size="sm" />
        ) : warehouses.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No warehouses available. Create one in the Warehouses tab first.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {warehouses.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWarehouseId(w.id)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selectedWarehouseId === w.id
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-outline-variant/20 hover:border-primary/30 hover:bg-primary/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`material-symbols-outlined text-[18px] ${selectedWarehouseId === w.id ? 'text-primary' : 'text-on-surface-variant'}`}>
                    warehouse
                  </span>
                  <p className="text-sm font-semibold text-primary leading-tight">{w.warehouse_name}</p>
                </div>
                <p className="text-xs text-on-surface-variant">{w.city}, {w.state}</p>
                {w.velocity_warehouse_id && (
                  <p className="text-[10px] text-on-surface-variant/60 mt-0.5">ID: {w.velocity_warehouse_id}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product multi-select */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 overflow-hidden">
        <div className="p-5 border-b border-outline-variant/20">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h3 className="font-brand text-lg text-primary">2. Select Products</h3>
            <span className="text-sm text-on-surface-variant">
              {selectedProductIds.size} selected
            </span>
          </div>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Search products…"
              value={productSearch}
              onChange={(e) => onProductSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-outline-variant/30 rounded-xl bg-surface focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm transition-all"
            />
          </div>
        </div>

        {productsLoading ? (
          <Spinner />
        ) : products.length === 0 ? (
          <p className="text-center text-sm text-on-surface-variant py-10">No products found.</p>
        ) : (
          <>
            {/* Select-all row */}
            <div className="px-5 py-3 border-b border-outline-variant/15 flex items-center gap-3 bg-surface-container-low/50">
              <input
                type="checkbox"
                id="bulk-select-all"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleAll}
                className="w-4 h-4 rounded border-outline-variant/40 text-primary focus:ring-primary/20 cursor-pointer"
              />
              <label htmlFor="bulk-select-all" className="text-sm font-semibold text-on-surface-variant cursor-pointer select-none">
                Select all ({products.length})
              </label>
            </div>

            <div className="divide-y divide-outline-variant/15 max-h-[400px] overflow-y-auto">
              {products.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-primary/[0.02] ${
                    selectedProductIds.has(p.id) ? 'bg-primary/[0.04]' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedProductIds.has(p.id)}
                    onChange={() => toggleProduct(p.id)}
                    className="w-4 h-4 rounded border-outline-variant/40 text-primary focus:ring-primary/20 cursor-pointer shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary leading-tight">{p.name}</p>
                    {p.key && <p className="text-xs text-on-surface-variant font-mono">{p.key}</p>}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Action bar */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">
            {selectedProductIds.size > 0 && selectedWarehouseId
              ? `Ready to assign "${warehouses.find((w) => w.id === selectedWarehouseId)?.warehouse_name}" to ${selectedProductIds.size} product${selectedProductIds.size !== 1 ? 's' : ''}.`
              : 'Select a warehouse and at least one product to continue.'}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Products already assigned to this warehouse will be skipped automatically.
          </p>
        </div>
        <button
          type="button"
          disabled={assigning || selectedProductIds.size === 0 || !selectedWarehouseId}
          onClick={handleBulkAssign}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-40 shrink-0"
        >
          {assigning ? (
            <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
          ) : (
            <span className="material-symbols-outlined text-base">assignment_turned_in</span>
          )}
          {assigning ? 'Assigning…' : 'Assign to Selected'}
        </button>
      </div>
    </div>
  );
}

// ─── Delete confirm dialog ───────────────────────────────────────────────────

function DeleteConfirm({ warehouse, deleting, onConfirm, onCancel }) {
  if (!warehouse) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-outline-variant/20 bg-white shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-600">delete</span>
          </div>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-red-600">Confirm Delete</p>
            <h3 className="font-brand text-lg text-primary">Delete Warehouse</h3>
          </div>
        </div>
        <p className="text-sm text-on-surface-variant mb-1">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-primary">{warehouse.warehouse_name}</span>?
        </p>
        <p className="text-xs text-on-surface-variant/70 mb-6">
          This will also remove all product assignments for this warehouse. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 px-4 rounded-lg text-xs font-semibold text-on-surface-variant bg-surface-container-low hover:bg-outline-variant/20 transition-all"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="h-9 px-5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {deleting ? (
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">delete</span>
            )}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AdminWarehouses() {
  const { isAdmin, hasModule, loading } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('warehouses'); // 'warehouses' | 'assign'

  // Warehouse list state
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState(null); // null = add mode
  const [saving, setSaving] = useState(false);

  // Delete confirm state
  const [deletingWarehouse, setDeletingWarehouse] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Notices
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const showNotice = useCallback((msg) => { setNotice(msg); setErrorMsg(''); }, []);
  const showError = useCallback((msg) => { setErrorMsg(msg); setNotice(''); }, []);

  // Auth guard
  useEffect(() => {
    if (!loading && !isAdmin && !hasModule('sellers')) navigate('/access-denied');
  }, [isAdmin, hasModule, loading, navigate]);

  // Fetch warehouses
  const fetchWarehouses = useCallback(async () => {
    setWarehousesLoading(true);
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setWarehouses(data || []);
    } catch (err) {
      showError('Failed to load warehouses: ' + (err?.message || 'Unknown error'));
    } finally {
      setWarehousesLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!isAdmin && !hasModule('sellers')) return;
    fetchWarehouses();
  }, [fetchWarehouses, isAdmin, hasModule]);

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleOpenAdd = () => {
    setEditingWarehouse(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (warehouse) => {
    setEditingWarehouse(warehouse);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingWarehouse(null);
  };

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      if (editingWarehouse) {
        const { error } = await supabase
          .from('warehouses')
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq('id', editingWarehouse.id);
        if (error) throw error;
        showNotice('Warehouse updated successfully.');
      } else {
        const { error } = await supabase.from('warehouses').insert(formData);
        if (error) throw error;
        showNotice('Warehouse added successfully.');
      }
      setModalOpen(false);
      setEditingWarehouse(null);
      await fetchWarehouses();
    } catch (err) {
      showError('Failed to save warehouse: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (warehouse) => {
    setDeletingWarehouse(warehouse);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingWarehouse) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('warehouses')
        .delete()
        .eq('id', deletingWarehouse.id);
      if (error) throw error;
      showNotice(`"${deletingWarehouse.warehouse_name}" deleted.`);
      setDeletingWarehouse(null);
      await fetchWarehouses();
    } catch (err) {
      showError('Failed to delete warehouse: ' + (err?.message || 'Unknown error'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-surface pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-8">
          <button
            type="button"
            onClick={() => navigate('/admin/sellers')}
            className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors mb-3"
          >
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Back to Sellers
          </button>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/60 mb-1">
                Admin
              </p>
              <h1
                className="font-brand text-4xl md:text-5xl text-primary tracking-tight"
              >
                Warehouses
              </h1>
              <p className="text-on-surface-variant mt-2 max-w-2xl text-sm">
                Manage warehouse records and assign them to products for fulfilment routing.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchWarehouses}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition shrink-0"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              Refresh
            </button>
          </div>
        </header>

        {/* Notices */}
        <Notice message={notice} type="success" onClose={() => setNotice('')} />
        <Notice message={errorMsg} type="error" onClose={() => setErrorMsg('')} />

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6 p-1 bg-surface-container-low rounded-2xl border border-outline-variant/20 w-fit">
          <TabBtn
            active={activeTab === 'warehouses'}
            onClick={() => setActiveTab('warehouses')}
            icon="warehouse"
            label="Warehouses"
          />
          <TabBtn
            active={activeTab === 'assign'}
            onClick={() => setActiveTab('assign')}
            icon="link"
            label="Assign to Products"
          />
        </div>

        {/* Tab content */}
        {activeTab === 'warehouses' ? (
          <WarehousesTab
            warehouses={warehouses}
            loading={warehousesLoading}
            onAdd={handleOpenAdd}
            onEdit={handleOpenEdit}
            onDelete={handleDeleteClick}
          />
        ) : (
          <AssignTab
            warehouses={warehouses}
            warehousesLoading={warehousesLoading}
          />
        )}
      </div>

      {/* Warehouse add/edit modal */}
      {modalOpen && (
        <WarehouseModal
          warehouse={editingWarehouse}
          saving={saving}
          onClose={handleCloseModal}
          onSave={handleSave}
        />
      )}

      {/* Delete confirm dialog */}
      <DeleteConfirm
        warehouse={deletingWarehouse}
        deleting={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingWarehouse(null)}
      />
    </div>
  );
}
