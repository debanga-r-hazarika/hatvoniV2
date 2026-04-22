import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export default function AdminSellers() {
  const { isAdmin, hasModule, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [sellers, setSellers] = useState([]);
  const [sellerProducts, setSellerProducts] = useState({});
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loadingState, setLoadingState] = useState(false);
  const [notice, setNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const showNotice = useCallback((message) => { setNotice(message); setErrorMessage(''); }, []);
  const showError = useCallback((message) => { setErrorMessage(message); }, []);

  useEffect(() => {
    if (!loading && !isAdmin && !hasModule('sellers')) navigate('/access-denied');
  }, [isAdmin, hasModule, loading, navigate]);

  const fetchSellerData = useCallback(async () => {
    setLoadingState(true);
    try {
      const { data: sellerRows, error: sellerError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, is_banned, is_admin, is_seller, is_own_seller, created_at')
        .eq('is_seller', true)
        .order('created_at', { ascending: false });
      if (sellerError) throw sellerError;

      const sellerIds = (sellerRows || []).map((s) => s.id);
      if (sellerIds.length === 0) {
        setSellers([]);
        setSellerProducts({});
        return;
      }

      const { data: productRows, error: productError } = await supabase
        .from('products')
        .select('seller_id')
        .in('seller_id', sellerIds);
      if (productError) throw productError;

      const productCounts = (productRows || []).reduce((acc, row) => {
        if (!row.seller_id) return acc;
        acc[row.seller_id] = (acc[row.seller_id] || 0) + 1;
        return acc;
      }, {});

      setSellers(sellerRows || []);
      setSellerProducts(productCounts);
    } catch (error) {
      showError('Failed to load sellers: ' + (error?.message || 'Unknown error'));
    } finally {
      setLoadingState(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!isAdmin && !hasModule('sellers')) return;
    fetchSellerData();
  }, [fetchSellerData, hasModule, isAdmin]);

  useEffect(() => {
    const sellerId = searchParams.get('seller');
    if (sellerId) setSelectedSellerId(sellerId);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedSellerId && sellers.length > 0) setSelectedSellerId(sellers[0].id);
  }, [selectedSellerId, sellers]);

  const selectedSeller = useMemo(
    () => sellers.find((s) => s.id === selectedSellerId) || null,
    [sellers, selectedSellerId],
  );

  const stats = useMemo(() => ({
    total: sellers.length,
    active: sellers.filter((s) => !s.is_banned).length,
    ownSellerCount: sellers.filter((s) => s.is_own_seller).length,
    totalProducts: Object.values(sellerProducts).reduce((sum, n) => sum + n, 0),
  }), [sellers, sellerProducts]);

  const filteredSellers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sellers.filter((seller) => {
      const fullName = `${seller.first_name || ''} ${seller.last_name || ''}`.trim().toLowerCase();
      const matchesSearch = !q || fullName.includes(q) || (seller.email || '').toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && !seller.is_banned) ||
        (statusFilter === 'banned' && seller.is_banned) ||
        (statusFilter === 'own' && seller.is_own_seller) ||
        (statusFilter === 'marketplace' && !seller.is_own_seller);
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, sellers, statusFilter]);

  const handleToggleBan = async (seller) => {
    try {
      setErrorMessage('');
      const { error } = await supabase.from('profiles').update({ is_banned: !seller.is_banned }).eq('id', seller.id);
      if (error) throw error;
      fetchSellerData();
      showNotice(`Seller ${seller.is_banned ? 'reactivated' : 'suspended'} successfully.`);
    } catch (error) {
      showError('Error updating seller status: ' + (error?.message || 'Unknown error'));
    }
  };

  const handleToggleOwnSeller = async (seller) => {
    try {
      setErrorMessage('');
      const { error } = await supabase.from('profiles').update({ is_own_seller: !seller.is_own_seller }).eq('id', seller.id);
      if (error) throw error;
      fetchSellerData();
      showNotice('Seller type updated.');
    } catch (error) {
      showError('Error updating seller type: ' + (error?.message || 'Unknown error'));
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-surface pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors mb-3"
            >
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Back to admin dashboard
            </button>
            <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tight">Seller &amp; Warehouse</h1>
            <p className="text-on-surface-variant mt-2 font-body max-w-2xl">
              Manage sellers and their types. Warehouse assignments are managed per-product in the Warehouses section.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/warehouses"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/30 bg-surface text-on-surface-variant font-semibold text-sm hover:bg-surface-container transition"
            >
              <span className="material-symbols-outlined text-base">warehouse</span>
              Manage Warehouses
            </Link>
            <button
              type="button"
              onClick={fetchSellerData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              Refresh
            </button>
          </div>
        </header>

        {/* Notices */}
        {notice && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-600">check_circle</span>
            <p className="font-medium flex-1">{notice}</p>
            <button onClick={() => setNotice('')} className="text-emerald-700 hover:text-emerald-900 font-bold">✕</button>
          </div>
        )}
        {errorMessage && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-3">
            <span className="material-symbols-outlined text-red-600">error</span>
            <p className="font-medium flex-1">{errorMessage}</p>
            <button onClick={() => setErrorMessage('')} className="text-red-700 hover:text-red-900 font-bold">✕</button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Sellers', value: stats.total, icon: 'storefront', color: 'bg-emerald-600' },
            { label: 'Active Sellers', value: stats.active, icon: 'verified', color: 'bg-primary' },
            { label: 'Own Sellers', value: stats.ownSellerCount, icon: 'badge', color: 'bg-secondary' },
            { label: 'Total Products', value: stats.totalProducts, icon: 'inventory_2', color: 'bg-sky-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface-container-low rounded-2xl p-5 flex items-center gap-4">
              <div className={`${stat.color} w-11 h-11 rounded-xl flex items-center justify-center shrink-0`}>
                <span className="material-symbols-outlined text-white">{stat.icon}</span>
              </div>
              <div>
                <p className="text-2xl font-brand text-primary">{stat.value}</p>
                <p className="text-sm text-on-surface-variant">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Seller list */}
        <div className="bg-surface-container-low rounded-[2rem] border border-outline-variant/20 overflow-hidden">
          <div className="p-6 border-b border-outline-variant/20 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div>
              <h2 className="font-brand text-2xl text-primary">Sellers</h2>
              <p className="text-sm text-on-surface-variant mt-1">Manage seller types and account status.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-full sm:w-72">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
                <input
                  type="text"
                  placeholder="Search sellers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-outline-variant/30 rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 border border-outline-variant/30 rounded-xl bg-surface focus:ring-2 focus:ring-secondary text-sm"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="banned">Banned</option>
                <option value="own">Own</option>
                <option value="marketplace">Marketplace</option>
              </select>
            </div>
          </div>

          {loadingState ? (
            <div className="flex items-center justify-center py-20">
              <span className="material-symbols-outlined text-4xl text-secondary animate-spin">progress_activity</span>
            </div>
          ) : filteredSellers.length === 0 ? (
            <div className="text-center py-20">
              <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">storefront</span>
              <p className="mt-4 text-on-surface-variant">No sellers found</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/15">
              {filteredSellers.map((seller) => {
                const fullName = `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || 'No name';
                const productCount = sellerProducts[seller.id] || 0;

                return (
                  <div
                    key={seller.id}
                    className={`p-5 transition-all hover:bg-primary/[0.02] ${selectedSellerId === seller.id ? 'bg-primary/[0.04]' : ''}`}
                    onClick={() => setSelectedSellerId(seller.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedSellerId(seller.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-bold text-lg ${
                          seller.is_banned ? 'bg-red-50 text-red-600' : seller.is_own_seller ? 'bg-primary/10 text-primary' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {(seller.first_name?.[0] || seller.email?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-brand text-lg font-bold text-primary leading-tight">{fullName}</p>
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                              seller.is_own_seller ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {seller.is_own_seller ? 'Own Seller' : 'Marketplace'}
                            </span>
                            {seller.is_banned && (
                              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-red-100 text-red-700">Suspended</span>
                            )}
                          </div>
                          <p className="text-sm text-on-surface-variant mt-1">{seller.email || 'No email'}</p>
                          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-on-surface-variant">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                              {productCount} product{productCount !== 1 ? 's' : ''}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                              {new Date(seller.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleOwnSeller(seller); }}
                          className="w-9 h-9 rounded-xl border border-outline-variant/20 bg-surface-container-low flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors"
                          title="Toggle seller type (Own / Marketplace)"
                        >
                          <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleBan(seller); }}
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
                            seller.is_banned
                              ? 'border-green-100 bg-green-50 text-green-600 hover:bg-green-500 hover:text-white'
                              : 'border-red-100 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white'
                          }`}
                          title={seller.is_banned ? 'Reactivate seller' : 'Suspend seller'}
                        >
                          <span className="material-symbols-outlined text-[18px]">{seller.is_banned ? 'lock_open' : 'block'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
