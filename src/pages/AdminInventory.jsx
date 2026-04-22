import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const fmtDate = (v) =>
  v ? new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const fmtQty = (qty, unit) =>
  `${Number(qty || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${unit || ''}`.trim();

function StockBadge({ qty }) {
  const n = Number(qty || 0);
  if (n <= 0) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800">Out of stock</span>;
  if (n < 10) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Low stock</span>;
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">In stock</span>;
}

export default function AdminInventory() {
  const { isAdmin, hasModule, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [inventory, setInventory] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedTag, setExpandedTag] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAdmin && !hasModule('inventory')) navigate('/access-denied');
  }, [isAdmin, authLoading, hasModule, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: inv, error: invErr }, { data: lotData, error: lotErr }] = await Promise.all([
        supabase
          .from('hatvoni_inventory')
          .select('*')
          .order('display_name', { ascending: true }),
        supabase
          .from('hatvoni_inventory_lots')
          .select('*')
          .order('production_date', { ascending: true }),
      ]);
      if (invErr) throw invErr;
      if (lotErr) throw lotErr;
      setInventory(inv || []);
      setLots(lotData || []);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin || hasModule('inventory')) load(); }, [isAdmin, hasModule, load]);

  // realtime — refresh when inventory changes
  useEffect(() => {
    if (!isAdmin && !hasModule('inventory')) return;
    const ch = supabase.channel('admin-inventory-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hatvoni_inventory' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hatvoni_inventory_lots' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [isAdmin, hasModule, load]);

  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('Not authenticated. Please log in again.');

      const { data, error } = await supabase.functions.invoke('trigger-inventory-sync', {
        body: {},
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      setSyncResult(data);
      await load();
    } catch (err) {
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const lotsByTag = useMemo(() => {
    return lots.reduce((acc, lot) => {
      if (!acc[lot.tag_key]) acc[lot.tag_key] = [];
      acc[lot.tag_key].push(lot);
      return acc;
    }, {});
  }, [lots]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter((item) =>
      item.tag_key.toLowerCase().includes(q) ||
      item.display_name.toLowerCase().includes(q)
    );
  }, [inventory, search]);

  const stats = useMemo(() => ({
    total_tags: inventory.length,
    in_stock: inventory.filter((i) => Number(i.total_qty_available) > 0).length,
    out_of_stock: inventory.filter((i) => Number(i.total_qty_available) <= 0).length,
    total_lots: lots.length,
    last_sync: inventory.reduce((latest, i) => {
      if (!latest) return i.last_synced_at;
      return i.last_synced_at > latest ? i.last_synced_at : latest;
    }, null),
  }), [inventory, lots]);

  if (authLoading) return null;
  if (!isAdmin && !hasModule('inventory')) return <Navigate to="/access-denied" replace />;

  return (
    <div className="min-h-screen bg-surface pt-32 md:pt-40 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link to="/admin" className="text-on-surface-variant hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-xl">arrow_back</span>
              </Link>
              <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tight">Inventory</h1>
            </div>
            <p className="text-on-surface-variant font-body ml-9">Hatvoni Heritage products — synced from production</p>
            {stats.last_sync && (
              <p className="text-xs text-on-surface-variant ml-9 mt-1">Last synced: {fmtDate(stats.last_sync)}</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={load} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant text-sm font-semibold text-primary hover:bg-primary/5 transition-colors">
              <span className="material-symbols-outlined text-base">refresh</span>
              Refresh
            </button>
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-60"
            >
              {syncing
                ? <><span className="material-symbols-outlined text-base animate-spin">progress_activity</span>Syncing...</>
                : <><span className="material-symbols-outlined text-base">sync</span>Sync from Insider</>}
            </button>
          </div>
        </header>

        {/* sync feedback */}
        {syncResult && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
            ✓ Sync complete — {syncResult.synced_tags} tags, {syncResult.synced_lots} lots updated.
          </div>
        )}
        {syncError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
            ⚠ {syncError}
          </div>
        )}

        {/* stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Products', value: stats.total_tags, icon: 'category', color: 'bg-primary' },
            { label: 'In Stock', value: stats.in_stock, icon: 'check_circle', color: 'bg-emerald-600' },
            { label: 'Out of Stock', value: stats.out_of_stock, icon: 'cancel', color: 'bg-red-500' },
            { label: 'Active Lots', value: stats.total_lots, icon: 'inventory_2', color: 'bg-secondary' },
          ].map((s) => (
            <div key={s.label} className="bg-surface-container-low rounded-2xl p-4 flex items-center gap-3">
              <div className={`${s.color} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                <span className="material-symbols-outlined text-white text-sm">{s.icon}</span>
              </div>
              <div>
                <p className="text-xl font-brand text-primary leading-none">{s.value}</p>
                <p className="text-xs text-on-surface-variant font-body mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* search */}
        <div className="relative mb-4">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
          <input
            type="text"
            placeholder="Search by product name or key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2.5 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent w-full font-body text-sm"
          />
        </div>

        {/* inventory table */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <span className="material-symbols-outlined animate-spin text-secondary text-4xl">progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 bg-surface-container-low rounded-2xl">
            <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">inventory_2</span>
            <p className="mt-4 text-on-surface-variant font-body">
              {inventory.length === 0 ? 'No inventory data yet. Click "Sync from Insider" to pull the latest stock.' : 'No products match your search.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const tagLots = lotsByTag[item.tag_key] || [];
              const isExpanded = expandedTag === item.tag_key;

              return (
                <div key={item.tag_key} className="bg-surface-container-low rounded-2xl overflow-hidden border border-outline-variant/20">
                  {/* tag row */}
                  <button
                    type="button"
                    onClick={() => setExpandedTag(isExpanded ? null : item.tag_key)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-surface-container transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-on-surface text-sm">{item.display_name}</p>
                        <StockBadge qty={item.total_qty_available} />
                      </div>
                      <p className="text-[10px] font-mono text-on-surface-variant mt-0.5">{item.tag_key}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-brand text-primary">{fmtQty(item.total_qty_available, item.unit)}</p>
                      <p className="text-[10px] text-on-surface-variant">{item.lot_count} lot{item.lot_count !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-[10px] text-on-surface-variant">Synced</p>
                      <p className="text-[10px] text-on-surface-variant">{fmtDate(item.last_synced_at)}</p>
                    </div>
                    <span className={`material-symbols-outlined text-on-surface-variant transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </button>

                  {/* lot detail */}
                  {isExpanded && (
                    <div className="border-t border-outline-variant/20 p-4">
                      {tagLots.length === 0 ? (
                        <p className="text-xs text-on-surface-variant text-center py-4">No lot data available for this product.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="border-b border-outline-variant/20">
                                {['Batch Ref', 'Product Type', 'Size', 'Available', 'Unit', 'Production Date'].map((h) => (
                                  <th key={h} className="px-3 py-2 text-left font-bold text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/10">
                              {tagLots.map((lot) => (
                                <tr key={lot.insider_lot_id} className={`${Number(lot.qty_available) <= 0 ? 'opacity-50' : ''}`}>
                                  <td className="px-3 py-2.5 font-mono text-primary font-semibold">{lot.batch_reference}</td>
                                  <td className="px-3 py-2.5 text-on-surface">{lot.product_type}</td>
                                  <td className="px-3 py-2.5 text-on-surface-variant">
                                    {lot.output_size ? `${lot.output_size} ${lot.output_size_unit || ''}`.trim() : '—'}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className={`font-semibold ${Number(lot.qty_available) <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                      {Number(lot.qty_available).toLocaleString('en-IN', { maximumFractionDigits: 3 })}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-on-surface-variant">{lot.unit}</td>
                                  <td className="px-3 py-2.5 text-on-surface-variant">
                                    {lot.production_date
                                      ? new Date(lot.production_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
