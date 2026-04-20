import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const initialFilters = {
  from_date: '',
  to_date: '',
  status: '',
  courier: '',
  payment_mode: '',
  page: 1,
  per_page: 20,
};

const STATUS_BADGES = {
  delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  in_transit: 'bg-sky-100 text-sky-800 border-sky-200',
  out_for_delivery: 'bg-blue-100 text-blue-800 border-blue-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  ndr: 'bg-amber-100 text-amber-800 border-amber-200',
  rto_delivered: 'bg-purple-100 text-purple-800 border-purple-200',
  rto_in_transit: 'bg-violet-100 text-violet-800 border-violet-200',
  ready_to_ship: 'bg-cyan-100 text-cyan-800 border-cyan-200',
};

function toArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  const obj = data;
  const candidates = [obj.data, obj.payload?.data, obj.shipments, obj.returns, obj.items];
  for (const item of candidates) if (Array.isArray(item)) return item;
  return [];
}

function flattenSummary(data) {
  const summary = data?.payload?.summary && typeof data.payload.summary === 'object'
    ? data.payload.summary
    : null;
  if (!summary) return [];
  return Object.entries(summary).map(([key, value]) => {
    if (value && typeof value === 'object') {
      return {
        key,
        count: Number(value.count || 0),
        prepaid: Number(value.sum_of_prepaid_orders || 0),
        cod: Number(value.sum_of_cod_orders || 0),
        isTotal: false,
      };
    }
    return {
      key,
      count: Number(value || 0),
      prepaid: 0,
      cod: 0,
      isTotal: key === 'total_shipments',
    };
  });
}

function getMeta(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.meta && typeof data.meta === 'object') return data.meta;
  if (data.payload?.meta && typeof data.payload.meta === 'object') return data.payload.meta;
  return null;
}

function statusBadgeClass(raw) {
  const key = String(raw || '').toLowerCase().replace(/\s+/g, '_');
  return STATUS_BADGES[key] || 'bg-slate-100 text-slate-700 border-slate-200';
}

function normalizeSummaryKey(key) {
  return String(key || '').replace(/_/g, ' ');
}

function exportCsv(filename, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escaped = (value) => {
    const str = String(value ?? '');
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const content = [headers.join(','), ...rows.map((row) => headers.map((h) => escaped(row[h])).join(','))].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminLogistics() {
  const { isAdmin, hasModule, loading } = useAuth();
  const navigate = useNavigate();

  const [reportsLoading, setReportsLoading] = useState(false);
  const [shipmentsLoading, setShipmentsLoading] = useState(false);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [reportsData, setReportsData] = useState(null);
  const [shipmentsData, setShipmentsData] = useState(null);
  const [returnsData, setReturnsData] = useState(null);
  const [filters, setFilters] = useState(initialFilters);

  useEffect(() => {
    if (!loading && !isAdmin && !hasModule('logistics')) navigate('/');
  }, [isAdmin, hasModule, loading, navigate]);

  const callOrchestrator = async (action, payload = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Session expired. Please sign in again.');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/velocity-orchestrator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ action, payload }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
    return body?.data ?? body;
  };

  const summaryRows = useMemo(() => flattenSummary(reportsData), [reportsData]);
  const shipmentsRows = useMemo(
    () => toArray(shipmentsData).map((entry) => ({
      id: entry.id || entry.attributes?.unique_id || '—',
      tracking_number: entry.attributes?.tracking_number || entry.tracking_number || '—',
      status: entry.attributes?.status || entry.status || '—',
      sub_status: entry.attributes?.sub_status || entry.sub_status || '—',
      courier_name:
        entry.attributes?.carrier?.name ||
        entry.attributes?.courier_name ||
        entry.courier_name ||
        '—',
      order_display_id:
        entry.attributes?.order?.display_id ||
        entry.attributes?.order?.external_id ||
        entry.order_id ||
        '—',
      cod_label: entry.attributes?.is_cod ? 'COD' : 'Prepaid',
      total_price: Number(entry.attributes?.total_price || entry.total_price || 0),
      created_at: entry.attributes?.created_at || entry.created_at || null,
      zone: entry.attributes?.zone || entry.zone || '—',
      warehouse_unique_id:
        entry.attributes?.pickup_warehouse?.attributes?.unique_id ||
        entry.attributes?.warehouse_id ||
        '—',
      customer_name: entry.attributes?.shipping_address?.name || '—',
      customer_city: entry.attributes?.shipping_address?.city || '—',
      customer_zip: entry.attributes?.shipping_address?.zip || '—',
    })),
    [shipmentsData]
  );
  const returnsRows = useMemo(() => toArray(returnsData), [returnsData]);
  const shipmentsMeta = useMemo(() => getMeta(shipmentsData), [shipmentsData]);
  const returnsMeta = useMemo(() => getMeta(returnsData), [returnsData]);

  const reportTotals = useMemo(() => {
    const totalShipments = summaryRows.find((row) => row.key === 'total_shipments')?.count || 0;
    const delivered = summaryRows.find((row) => row.key === 'delivered')?.count || 0;
    const inTransit = summaryRows.find((row) => row.key === 'in_transit')?.count || 0;
    const cancelled = summaryRows.find((row) => row.key === 'cancelled')?.count || 0;
    return { totalShipments, delivered, inTransit, cancelled };
  }, [summaryRows]);
  const summaryTrendRows = useMemo(
    () => summaryRows.filter((row) => !row.isTotal && row.key !== 'total_shipments').sort((a, b) => b.count - a.count),
    [summaryRows]
  );
  const maxTrendCount = useMemo(
    () => Math.max(1, ...summaryTrendRows.map((row) => Number(row.count || 0))),
    [summaryTrendRows]
  );

  const loadReports = async () => {
    setReportsLoading(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        from_date: filters.from_date || undefined,
        to_date: filters.to_date || undefined,
      };
      const data = await callOrchestrator('get_reports', payload);
      setReportsData(data);
      setNotice('Summary reports updated.');
    } catch (err) {
      setError(err.message || 'Failed to load reports.');
    } finally {
      setReportsLoading(false);
    }
  };

  const loadShipments = async () => {
    setShipmentsLoading(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        status: filters.status || undefined,
        courier: filters.courier || undefined,
        payment_mode: filters.payment_mode || undefined,
        page: Number(filters.page) || 1,
        per_page: Number(filters.per_page) || 20,
      };
      const data = await callOrchestrator('list_shipments', payload);
      setShipmentsData(data);
      setNotice('Shipment list updated.');
    } catch (err) {
      setError(err.message || 'Failed to load shipments.');
    } finally {
      setShipmentsLoading(false);
    }
  };

  const loadReturns = async () => {
    setReturnsLoading(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        status: filters.status || undefined,
        page: Number(filters.page) || 1,
        per_page: Number(filters.per_page) || 20,
      };
      const data = await callOrchestrator('list_returns', payload);
      setReturnsData(data);
      setNotice('Return orders list updated.');
    } catch (err) {
      setError(err.message || 'Failed to load returns.');
    } finally {
      setReturnsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin && !hasModule('logistics')) return;
    loadReports();
    loadShipments();
    loadReturns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasModule, isAdmin]);

  if (loading) return null;
  if (!isAdmin && !hasModule('logistics')) return null;

  return (
    <div className="min-h-screen bg-surface pt-28 pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-1">Velocity Logistics</p>
            <h1 className="font-brand text-2xl lg:text-3xl text-gray-900">Reports, Shipments, Returns</h1>
            <p className="text-xs text-gray-500 mt-1">Uses `velocity-orchestrator` actions: `get_reports`, `list_shipments`, `list_returns`.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50"
          >
            Back to Admin
          </button>
        </header>

        {notice && <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{notice}</div>}
        {error && <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

        <section className="rounded-xl border border-neutral-200 bg-white p-4 lg:p-6 shadow-sm">
          <h2 className="font-brand text-xl text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <input type="date" value={filters.from_date} onChange={(e) => setFilters((p) => ({ ...p, from_date: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-xs" />
            <input type="date" value={filters.to_date} onChange={(e) => setFilters((p) => ({ ...p, to_date: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-xs" />
            <input type="text" placeholder="Status" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-xs" />
            <input type="text" placeholder="Courier" value={filters.courier} onChange={(e) => setFilters((p) => ({ ...p, courier: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-xs" />
            <input type="text" placeholder="COD/Prepaid" value={filters.payment_mode} onChange={(e) => setFilters((p) => ({ ...p, payment_mode: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-xs" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="1" value={filters.page} onChange={(e) => setFilters((p) => ({ ...p, page: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-xs" />
              <input type="number" min="1" value={filters.per_page} onChange={(e) => setFilters((p) => ({ ...p, per_page: e.target.value }))} className="px-3 py-2 rounded-lg border border-gray-200 text-xs" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={loadReports} disabled={reportsLoading} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold disabled:opacity-60">{reportsLoading ? 'Loading...' : 'Refresh Reports'}</button>
            <button onClick={loadShipments} disabled={shipmentsLoading} className="px-4 py-2 rounded-lg bg-gray-700 text-white text-xs font-semibold disabled:opacity-60">{shipmentsLoading ? 'Loading...' : 'Refresh Shipments'}</button>
            <button onClick={loadReturns} disabled={returnsLoading} className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-800 text-xs font-semibold disabled:opacity-60">{returnsLoading ? 'Loading...' : 'Refresh Returns'}</button>
            <button
              onClick={() => exportCsv('velocity-shipments.csv', shipmentsRows)}
              disabled={shipmentsRows.length === 0}
              className="px-4 py-2 rounded-xl border border-outline-variant/30 bg-white text-sm font-semibold disabled:opacity-50"
            >
              Export Shipments CSV
            </button>
            <button
              onClick={() => exportCsv('velocity-returns.csv', returnsRows)}
              disabled={returnsRows.length === 0}
              className="px-4 py-2 rounded-xl border border-outline-variant/30 bg-white text-sm font-semibold disabled:opacity-50"
            >
              Export Returns CSV
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 lg:p-6 shadow-sm">
          <h2 className="font-brand text-xl text-gray-900 mb-4">Summary Reports</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Total Shipments</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{reportTotals.totalShipments}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Delivered</p>
              <p className="text-2xl font-brand text-emerald-800 mt-1">{reportTotals.delivered}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">In Transit</p>
              <p className="text-2xl font-brand text-sky-800 mt-1">{reportTotals.inTransit}</p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-red-700">Cancelled</p>
              <p className="text-2xl font-brand text-red-800 mt-1">{reportTotals.cancelled}</p>
            </div>
          </div>
          {summaryRows.length === 0 ? (
            <p className="text-xs text-gray-500">No summary metrics available in current response.</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-4">Bucket</th>
                      <th className="text-left py-2 pr-4">Count</th>
                      <th className="text-left py-2 pr-4">Prepaid Amount</th>
                      <th className="text-left py-2 pr-4">COD Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row) => (
                      <tr key={row.key} className="border-b border-gray-100">
                        <td className="py-2 pr-4 font-semibold capitalize">{normalizeSummaryKey(row.key)}</td>
                        <td className="py-2 pr-4">{row.count}</td>
                        <td className="py-2 pr-4">{row.prepaid}</td>
                        <td className="py-2 pr-4">{row.cod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <p className="text-sm font-bold text-primary mb-3">Shipment Flow Trend</p>
                <div className="space-y-2">
                  {summaryTrendRows.slice(0, 8).map((row) => (
                    <div key={row.key}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold capitalize">{normalizeSummaryKey(row.key)}</span>
                        <span className="font-bold">{row.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-outline-variant/20 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(4, Math.round((row.count / maxTrendCount) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 lg:p-6 shadow-sm">
          <h2 className="font-brand text-xl text-gray-900 mb-4">Shipment List (Forward)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Rows</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{shipmentsRows.length}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Current Page</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{shipmentsMeta?.current_page || 1}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Per Page</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{shipmentsMeta?.per_page || filters.per_page}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Total</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{shipmentsMeta?.total || shipmentsRows.length}</p>
            </div>
          </div>
          {shipmentsRows.length === 0 ? (
            <p className="text-xs text-gray-500">No shipments in response for current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4">Shipment</th>
                    <th className="text-left py-2 pr-4">Order</th>
                    <th className="text-left py-2 pr-4">Courier</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2 pr-4">Sub-status</th>
                    <th className="text-left py-2 pr-4">AWB</th>
                    <th className="text-left py-2 pr-4">Mode</th>
                    <th className="text-left py-2 pr-4">Total</th>
                    <th className="text-left py-2 pr-4">Destination</th>
                    <th className="text-left py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {shipmentsRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-mono text-xs">{String(row.id)}</td>
                      <td className="py-2 pr-4">{String(row.order_display_id)}</td>
                      <td className="py-2 pr-4">{String(row.courier_name)}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusBadgeClass(row.status)}`}>
                          {String(row.status)}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusBadgeClass(row.sub_status)}`}>
                          {String(row.sub_status)}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{String(row.tracking_number)}</td>
                      <td className="py-2 pr-4">{String(row.cod_label)}</td>
                      <td className="py-2 pr-4">{Number(row.total_price || 0)}</td>
                      <td className="py-2 pr-4">{`${row.customer_name}, ${row.customer_city} ${row.customer_zip}`}</td>
                      <td className="py-2 pr-4">{row.created_at ? new Date(row.created_at).toLocaleString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 lg:p-6 shadow-sm">
          <h2 className="font-brand text-xl text-gray-900 mb-4">Return Orders List</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Rows</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{returnsRows.length}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Current Page</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{returnsMeta?.current_page || 1}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Per Page</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{returnsMeta?.per_page || filters.per_page}</p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Total</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{returnsMeta?.total || returnsRows.length}</p>
            </div>
          </div>
          {returnsRows.length === 0 ? (
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs text-gray-500">No return orders found for the selected filters. This is valid when no reverse shipments exist yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4">Return ID</th>
                    <th className="text-left py-2 pr-4">Order</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2 pr-4">QC</th>
                    <th className="text-left py-2 pr-4">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {returnsRows.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-2 pr-4">{String(row.return_id || row.id || '—')}</td>
                      <td className="py-2 pr-4">{String(row.order_id || row.order || '—')}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusBadgeClass(row.status || row.return_status)}`}>
                          {String(row.status || row.return_status || '—')}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusBadgeClass(row.qc_status || row.quality_status)}`}>
                          {String(row.qc_status || row.quality_status || '—')}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold ${statusBadgeClass(row.refund_status || row.refund)}`}>
                          {String(row.refund_status || row.refund || '—')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
