import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function ProductWarehouseModal({ product, onClose }) {
  const [warehouses, setWarehouses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const showNotice = (msg) => { setNotice(msg); setError(''); };
  const showError = (msg) => { setError(msg); setNotice(''); };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [whRes, assignRes] = await Promise.all([
        supabase
          .from('warehouses')
          .select('id, warehouse_name, city, state, pincode, velocity_warehouse_id')
          .order('warehouse_name', { ascending: true }),
        supabase
          .from('product_warehouses')
          .select('warehouse_id, is_default, assigned_at')
          .eq('product_id', product.id),
      ]);
      if (whRes.error) throw whRes.error;
      if (assignRes.error) throw assignRes.error;
      setWarehouses(whRes.data || []);
      setAssignments(assignRes.data || []);
    } catch (err) {
      showError('Failed to load data: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [product.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.warehouse_id)), [assignments]);

  const handleAssign = async (warehouseId) => {
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from('product_warehouses')
        .upsert(
          { product_id: product.id, warehouse_id: warehouseId, is_default: assignments.length === 0 },
          { onConflict: 'product_id,warehouse_id' },
        );
      if (err) throw err;
      await fetchData();
      showNotice('Warehouse assigned.');
    } catch (err) {
      showError('Failed to assign: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (warehouseId) => {
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from('product_warehouses')
        .delete()
        .eq('product_id', product.id)
        .eq('warehouse_id', warehouseId);
      if (err) throw err;
      await fetchData();
      showNotice('Warehouse removed.');
    } catch (err) {
      showError('Failed to remove: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (warehouseId) => {
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from('product_warehouses')
        .update({ is_default: true })
        .eq('product_id', product.id)
        .eq('warehouse_id', warehouseId);
      if (err) throw err;
      await fetchData();
      showNotice('Default warehouse updated.');
    } catch (err) {
      showError('Failed to set default: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-[#c8c8b9]/20 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[#c8c8b9]/15 bg-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
              <span className="material-symbols-outlined text-sky-700" style={{ fontSize: '16px' }}>warehouse</span>
            </div>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-[#815500]">Warehouse Assignment</p>
              <h3 className="text-base font-bold text-[#004a2b] tracking-tight leading-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
                {product.name}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-[#c8c8b9]/20 text-[#3f4942]/60 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Notices */}
          {notice && (
            <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-sm">check_circle</span>
              <p className="flex-1">{notice}</p>
              <button onClick={() => setNotice('')} className="text-emerald-700 font-bold">✕</button>
            </div>
          )}
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-red-600 text-sm">error</span>
              <p className="flex-1">{error}</p>
              <button onClick={() => setError('')} className="text-red-700 font-bold">✕</button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-symbols-outlined text-3xl text-[#004a2b] animate-spin">progress_activity</span>
            </div>
          ) : warehouses.length === 0 ? (
            <div className="text-center py-10">
              <span className="material-symbols-outlined text-4xl text-[#3f4942]/20 block mb-2">warehouse</span>
              <p className="text-sm text-[#3f4942]/60">No warehouses exist yet.</p>
              <p className="text-xs text-[#3f4942]/40 mt-1">Create warehouses in the Warehouses section first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50 mb-2">
                {assignments.length} of {warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''} assigned
              </p>
              {warehouses.map((w) => {
                const isAssigned = assignedIds.has(w.id);
                const assignment = assignments.find((a) => a.warehouse_id === w.id);
                const isDefault = assignment?.is_default || false;

                return (
                  <div
                    key={w.id}
                    className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                      isAssigned ? 'border-[#004a2b]/20 bg-[#004a2b]/[0.03]' : 'border-[#c8c8b9]/30 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isAssigned ? 'bg-[#004a2b]/10' : 'bg-[#f5f4eb]'}`}>
                        <span className={`material-symbols-outlined text-sm ${isAssigned ? 'text-[#004a2b]' : 'text-[#3f4942]/30'}`}>warehouse</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-xs font-semibold text-[#004a2b] leading-tight">{w.warehouse_name}</p>
                          {isDefault && (
                            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-[#004a2b]/10 text-[#004a2b]">Default</span>
                          )}
                          {w.velocity_warehouse_id && (
                            <span className="text-[9px] font-semibold text-[#3f4942]/40 font-mono">{w.velocity_warehouse_id}</span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#3f4942]/50 truncate">{w.city}, {w.state} — {w.pincode}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAssigned && !isDefault && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleSetDefault(w.id)}
                          className="h-7 px-2.5 rounded-lg border border-[#c8c8b9]/30 text-[10px] font-semibold text-[#3f4942] hover:bg-[#004a2b] hover:text-white hover:border-[#004a2b] transition-all disabled:opacity-50"
                        >
                          Set default
                        </button>
                      )}
                      {isAssigned ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleRemove(w.id)}
                          className="h-7 px-2.5 rounded-lg border border-red-100 bg-red-50 text-[10px] font-semibold text-red-600 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleAssign(w.id)}
                          className="h-7 px-2.5 rounded-lg bg-[#004a2b] text-white text-[10px] font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-xs font-semibold text-[#3f4942] bg-[#f5f4eb] hover:bg-[#f5f4eb]/80 transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
