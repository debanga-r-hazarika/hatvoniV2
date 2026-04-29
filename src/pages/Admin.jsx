import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

// Modular Components
import AdminStats from '../components/admin/AdminStats';
import CustomersTable from '../components/admin/CustomersTable';
import SellersTable from '../components/admin/SellersTable';
import ProductsTable from '../components/admin/ProductsTable';
import LotsTable from '../components/admin/LotsTable';
import RecipesTable from '../components/admin/RecipesTable';
import RecipePageTable from '../components/admin/RecipePageTable';
import ProductLayoutTable from '../components/admin/ProductLayoutTable';
import OrdersTable from '../components/admin/OrdersTable';
import WabaManager from '../components/admin/WabaManager';
import AdminModal from '../components/admin/AdminModal';
import ConfirmDialog from '../components/admin/ConfirmDialog';
import AdminFilters from '../components/admin/AdminFilters';
import ProductWarehouseModal from '../components/admin/ProductWarehouseModal';

const TAB_META = {
  customers:    { icon: 'group',           label: 'Customers' },
  sellers:      { icon: 'storefront',      label: 'Sellers' },
  products:     { icon: 'inventory_2',     label: 'Products' },
  lots:         { icon: 'all_inclusive',    label: 'Lots' },
  orders:       { icon: 'package_2',       label: 'Orders' },
  recipes:      { icon: 'restaurant_menu', label: 'Recipes' },
  'recipe-page':{ icon: 'web',             label: 'Page Config' },
  layout:       { icon: 'grid_on',         label: 'Shop Layout' },
  'waba-details': { icon: 'chat',          label: 'WABA Details' },
};

export default function Admin() {
  const { isAdmin, isEmployee, employeeModules, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [stats, setStats] = useState({ customers: 0, sellers: 0, products: 0, lots: 0, orders: 0, recipes: 0 });
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [sellerOptions, setSellerOptions] = useState([]);
  const [sellerProductCounts, setSellerProductCounts] = useState({});
  const [warehouseCountByProduct, setWarehouseCountByProduct] = useState({});
  const [warehouseModalProduct, setWarehouseModalProduct] = useState(null);

  // Advanced Filters State
  const [filters, setFilters] = useState({
    category: 'all', status: 'all', stock: 'all', seller: 'all',
    orderStatus: 'all', paymentStatus: 'all', paymentMethod: 'all',
    dateRange: 'all', layoutType: 'all', syncStatus: 'all', role: 'all'
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin && !isEmployee) navigate('/access-denied');
  }, [isAdmin, isEmployee, loading, navigate]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  const fetchData = useCallback(async () => {
    if (activeTab === 'dashboard' || activeTab === 'waba-details') return;
    setDataLoading(true);
    try {
      let query;
      switch (activeTab) {
        case 'customers':
          query = supabase.from('profiles').select('*').order('created_at', { ascending: false }); break;
        case 'sellers':
          query = supabase.from('profiles').select('*').eq('is_seller', true).order('created_at', { ascending: false }); break;
        case 'products':
          query = supabase.from('products').select('*').order('created_at', { ascending: false }); break;
        case 'lots':
          query = supabase.from('lots').select('*, lot_items(*, products(name, key, price, image_url))').order('created_at', { ascending: false }); break;
        case 'layout':
          query = supabase.from('products').select('*').order('layout_sort_order', { ascending: true }).order('created_at', { ascending: false }); break;
        case 'orders':
          query = supabase.from('orders').select('*, order_items(*, products(*), lots(*))').order('created_at', { ascending: false }); break;
        case 'recipes':
          query = supabase.from('recipes').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false }); break;
        case 'recipe-page':
          query = supabase.from('recipe_page_config').select('*').eq('id', 1).maybeSingle(); break;
        default:
          query = supabase.from('profiles').select('*');
      }
      const { data: result, error } = await query;
      if (error) throw error;

      if (activeTab === 'orders') {
        const customerIds = [...new Set((result || []).map((order) => order.user_id).filter(Boolean))];
        let profilesById = {};
        if (customerIds.length > 0) {
          const { data: customerProfiles, error: profilesError } = await supabase
            .from('profiles').select('id, first_name, last_name, email').in('id', customerIds);
          if (profilesError) throw profilesError;
          profilesById = (customerProfiles || []).reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
        }
        setData((result || []).map((order) => ({ ...order, profiles: profilesById[order.user_id] || null })));
        return;
      }

      if (activeTab === 'sellers') {
        const sellerIds = (result || []).map((s) => s.id);
        if (sellerIds.length === 0) {
          setSellerProductCounts({});
        } else {
          const { data: owned, error: ownedError } = await supabase.from('products').select('seller_id').in('seller_id', sellerIds);
          if (ownedError) throw ownedError;
          const counts = (owned || []).reduce((acc, r) => { if (r.seller_id) acc[r.seller_id] = (acc[r.seller_id] || 0) + 1; return acc; }, {});
          setSellerProductCounts(counts);
        }
      }

      if (activeTab === 'recipe-page') {
        setData(result ? [result] : [{ id: 1 }]);
      } else {
        setData(result || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setDataLoading(false);
    }
  }, [activeTab]);

  const fetchStats = useCallback(async () => {
    try {
      const [c, s, p, l, o, r] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_seller', true),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('lots').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('recipes').select('id', { count: 'exact', head: true }),
      ]);
      setStats({ customers: c.count || 0, sellers: s.count || 0, products: p.count || 0, lots: l.count || 0, orders: o.count || 0, recipes: r.count || 0 });
    } catch (error) { console.error('Error fetching stats:', error); }
  }, []);

  const fetchCatalogProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('products').select('id, name, key, external_product_id, price, image_url, is_active, status').order('created_at', { ascending: false });
      if (error) throw error;
      setCatalogProducts(data || []);
    } catch (error) { console.error('Error fetching catalog products:', error); }
  }, []);

  const fetchSellerOptions = useCallback(async () => {
    try {
      const { data: result, error } = await supabase.from('profiles').select('id, first_name, last_name, email, is_seller, is_admin, is_own_seller').or('is_seller.eq.true,is_admin.eq.true').order('created_at', { ascending: false });
      if (error) throw error;
      setSellerOptions(result || []);
    } catch (error) { console.error('Error fetching seller options:', error); }
  }, []);

  const fetchWarehouseCountsByProduct = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('product_warehouses')
        .select('product_id');
      if (error) throw error;
      const counts = (data || []).reduce((acc, row) => {
        acc[row.product_id] = (acc[row.product_id] || 0) + 1;
        return acc;
      }, {});
      setWarehouseCountByProduct(counts);
    } catch (error) { console.error('Error fetching warehouse counts:', error); }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
      fetchStats();
      if (activeTab === 'lots') fetchCatalogProducts();
      if (['products', 'sellers', 'customers', 'orders', 'layout'].includes(activeTab)) fetchSellerOptions();
      if (activeTab === 'products') fetchWarehouseCountsByProduct();
    }
  }, [activeTab, isAdmin, fetchCatalogProducts, fetchData, fetchSellerOptions, fetchStats, fetchWarehouseCountsByProduct]);

  useEffect(() => {
    if (!isAdmin || activeTab !== 'orders') return undefined;
    const channel = supabase
      .channel('admin-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchData())
      .subscribe();
    const intervalId = setInterval(() => fetchData(), 15000);
    return () => { clearInterval(intervalId); supabase.removeChannel(channel); };
  }, [activeTab, isAdmin, fetchData]);

  const handleToggleBan = async (user) => {
    setConfirmDialog({
      type: 'ban',
      title: user.is_banned ? 'Restore Account' : 'Suspend Account',
      message: `${user.is_banned ? 'Restore access for' : 'Suspend'} ${user.first_name || user.email}? This will affect their ability to log in and place orders.`,
      confirmLabel: user.is_banned ? 'Restore' : 'Suspend',
      confirmClass: user.is_banned ? 'bg-[#004a2b]' : 'bg-red-600',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('profiles').update({ is_banned: !user.is_banned }).eq('id', user.id);
          if (error) throw error;
          fetchData();
        } catch (error) { alert('Error: ' + error.message); }
        setConfirmDialog(null);
      },
    });
  };

  const handleToggleOwnSeller = async (seller) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_own_seller: !seller.is_own_seller }).eq('id', seller.id);
      if (error) throw error;
      fetchData();
    } catch (error) { alert('Error: ' + error.message); }
  };

  const handleToggleProductStatus = async (product) => {
    try {
      const { error } = await supabase.from('products').update({ is_active: !product.is_active, status: !product.is_active ? 'active' : 'inactive' }).eq('id', product.id);
      if (error) throw error;
      fetchData();
    } catch (error) { alert('Error: ' + error.message); }
  };

  const handleDelete = (item, type) => {
    setConfirmDialog({
      type: 'delete',
      title: `Delete ${type}`,
      message: `Permanently delete "${item.name || item.title || item.email || 'this record'}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmClass: 'bg-red-600',
      onConfirm: async () => {
        try {
          const tableMap = { customer: 'profiles', product: 'products', lot: 'lots', recipe: 'recipes' };
          const { error } = await supabase.from(tableMap[type] || 'orders').delete().eq('id', item.id);
          if (error) throw error;
          fetchData();
          fetchStats();
        } catch (error) { alert('Delete Failed: ' + error.message); }
        setConfirmDialog(null);
      },
    });
  };

  const handleSave = async (payload) => {
    try {
      const normalizedTab = activeTab === 'sellers' ? 'customers' : activeTab;
      const tableMap = { customers: 'profiles', 'recipe-page': 'recipe_page_config' };
      const table = tableMap[normalizedTab] || normalizedTab;

      if (normalizedTab === 'customers') {
        payload.role = payload.is_admin ? 'admin' : payload.is_seller ? 'seller' : 'customer';
      }

      if (normalizedTab === 'recipe-page') {
        const { error } = await supabase.from(table).upsert({ ...payload, id: 1 }, { onConflict: 'id' });
        if (error) throw error;
      } else if (normalizedTab === 'lots') {
        const { lot_items, ...lotData } = payload;
        let lotId = lotData.id;
        const { data: savedLot, error: lotError } = lotId
          ? await supabase.from('lots').update(lotData).eq('id', lotId).select('id').single()
          : await supabase.from('lots').insert([lotData]).select('id').single();
        if (lotError) throw lotError;
        lotId = savedLot.id;
        await supabase.from('lot_items').delete().eq('lot_id', lotId);
        if (lot_items?.length > 0) {
          await supabase.from('lot_items').insert(lot_items.map(li => ({ ...li, lot_id: lotId })));
        }
      } else if (payload.id) {
        const { error } = await supabase.from(table).update(payload).eq('id', payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert([payload]);
        if (error) throw error;
      }

      setShowModal(false);
      setEditingItem(null);
      fetchData();
      fetchStats();
    } catch (error) { alert('Save Error: ' + error.message); }
  };

  const filteredData = data.filter((item) => {
    const q = searchQuery.toLowerCase();
    let matchesSearch = true;
    let matchesFilters = true;

    if (activeTab === 'customers' || activeTab === 'sellers') {
      matchesSearch = (item.first_name?.toLowerCase() || '').includes(q) || (item.last_name?.toLowerCase() || '').includes(q) || (item.email?.toLowerCase() || '').includes(q);
    } else if (activeTab === 'products' || activeTab === 'layout') {
      matchesSearch = (item.name?.toLowerCase() || '').includes(q) || (item.category?.toLowerCase() || '').includes(q);
    } else if (activeTab === 'lots') {
      matchesSearch = (item.lot_name?.toLowerCase() || '').includes(q) || (item.description?.toLowerCase() || '').includes(q);
    } else if (activeTab === 'orders') {
      matchesSearch = (item.id?.toLowerCase() || '').includes(q) || (item.profiles?.email?.toLowerCase() || '').includes(q) || (item.razorpay_payment_id?.toLowerCase() || '').includes(q);
    } else if (activeTab === 'recipes') {
      matchesSearch = (item.title?.toLowerCase() || '').includes(q);
    }

    if (activeTab === 'customers' || activeTab === 'sellers') {
      if (filters.status === 'banned') matchesFilters = matchesFilters && item.is_banned;
      if (filters.status === 'active') matchesFilters = matchesFilters && !item.is_banned;
      if (filters.role === 'admin') matchesFilters = matchesFilters && item.is_admin;
      if (filters.role === 'seller') matchesFilters = matchesFilters && item.is_seller;
      if (filters.role === 'customer') matchesFilters = matchesFilters && !item.is_admin && !item.is_seller;
    } else if (activeTab === 'products' || activeTab === 'layout') {
      if (filters.category !== 'all') matchesFilters = matchesFilters && item.category === filters.category;
      if (filters.status === 'active') matchesFilters = matchesFilters && item.is_active;
      if (filters.status === 'inactive') matchesFilters = matchesFilters && !item.is_active;
      if (filters.seller !== 'all') matchesFilters = matchesFilters && item.seller_id === filters.seller;
      if (filters.stock === 'instock') matchesFilters = matchesFilters && item.stock_quantity > 10;
      if (filters.stock === 'lowstock') matchesFilters = matchesFilters && item.stock_quantity <= 10 && item.stock_quantity > 0;
      if (filters.stock === 'outofstock') matchesFilters = matchesFilters && item.stock_quantity === 0;
      if (filters.layoutType === 'individual') matchesFilters = matchesFilters && item.show_as_individual_product !== false;
      if (filters.layoutType === 'bundle') matchesFilters = matchesFilters && item.show_as_individual_product === false;
    } else if (activeTab === 'lots') {
      if (filters.status === 'active') matchesFilters = matchesFilters && item.status === 'active';
      if (filters.status === 'inactive') matchesFilters = matchesFilters && item.status !== 'active';
    } else if (activeTab === 'orders') {
      if (filters.orderStatus !== 'all') matchesFilters = matchesFilters && item.status === filters.orderStatus;
      if (filters.paymentStatus !== 'all') matchesFilters = matchesFilters && String(item.payment_status || '').toLowerCase() === filters.paymentStatus;
      if (filters.paymentMethod !== 'all') {
        if (filters.paymentMethod === 'cod') matchesFilters = matchesFilters && (item.payment_method || '').toLowerCase().includes('cod');
        if (filters.paymentMethod === 'razorpay') matchesFilters = matchesFilters && !!item.razorpay_order_id;
      }
      if (filters.dateRange !== 'all') {
        const orderDate = new Date(item.created_at);
        const now = new Date();
        if (filters.dateRange === 'today') matchesFilters = matchesFilters && orderDate.toDateString() === now.toDateString();
        if (filters.dateRange === 'week') matchesFilters = matchesFilters && (now.getTime() - orderDate.getTime()) < 7 * 24 * 60 * 60 * 1000;
        if (filters.dateRange === 'month') matchesFilters = matchesFilters && orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
      }
    } else if (activeTab === 'recipes') {
      if (filters.status === 'active') matchesFilters = matchesFilters && item.is_active;
      if (filters.status === 'inactive') matchesFilters = matchesFilters && !item.is_active;
    }

    return matchesSearch && matchesFilters;
  });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#fbfaf1]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#004a2b]/20 border-t-[#004a2b] rounded-full animate-spin" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#004a2b]/40">Loading…</span>
      </div>
    </div>
  );

  // ── Employee staff dashboard ─────────────────────────────────
  if (!isAdmin && isEmployee) {
    const MODULE_ROUTES = {
      orders:    { path: '/admin/orders',    icon: 'package_2',        label: 'Orders' },
      logistics: { path: '/admin/logistics', icon: 'local_shipping',   label: 'Logistics' },
      support:   { path: '/admin/support',   icon: 'support_agent',    label: 'Support' },
      inventory: { path: '/admin/inventory', icon: 'inventory_2',      label: 'Inventory' },
      coupons:   { path: '/admin/coupons',   icon: 'sell',             label: 'Coupons' },
      customers: { path: '/admin',           icon: 'group',            label: 'Customers' },
      sellers:   { path: '/admin/sellers',   icon: 'storefront',       label: 'Seller & Warehouse' },
      products:  { path: '/admin',           icon: 'category',         label: 'Products' },
      lots:      { path: '/admin',           icon: 'all_inclusive',    label: 'Lots' },
      recipes:   { path: '/admin',           icon: 'restaurant_menu',  label: 'Recipes' },
      notifications: { path: '/admin/notifications', icon: 'notifications', label: 'Notifications' },
    };

    return (
      <div className="min-h-screen bg-[#fbfaf1] pt-24 md:pt-28 pb-16">
        <div className="max-w-3xl mx-auto px-5">
          <header className="mb-8">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#815500] mb-1">Staff Portal</p>
            <h1 className="text-3xl font-bold text-[#004a2b] tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Staff Dashboard</h1>
            <p className="text-sm text-[#3f4942] mt-1.5">Your assigned modules are listed below.</p>
          </header>

          {employeeModules.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#bec9bf]/20 p-10 text-center">
              <span className="material-symbols-outlined text-4xl text-[#3f4942]/20 block mb-3">lock</span>
              <p className="font-semibold text-[#004a2b] mb-1">No modules assigned</p>
              <p className="text-sm text-[#3f4942]">Contact your administrator to get access.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <Link
                to="/admin/notifications"
                className="flex flex-col items-center gap-2.5 p-5 bg-white rounded-2xl border border-[#bec9bf]/20 hover:border-[#004a2b]/20 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#004a2b]/[0.07] flex items-center justify-center group-hover:bg-[#004a2b]/[0.12] transition-colors">
                  <span className="material-symbols-outlined text-xl text-[#004a2b]">notifications</span>
                </div>
                <span className="text-xs font-semibold text-[#004a2b] text-center">Notifications</span>
              </Link>
              {employeeModules.map((mod) => {
                const info = MODULE_ROUTES[mod];
                if (!info) return null;
                return (
                  <Link
                    key={mod}
                    to={info.path}
                    className="flex flex-col items-center gap-2.5 p-5 bg-white rounded-2xl border border-[#bec9bf]/20 hover:border-[#004a2b]/20 hover:shadow-md transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#004a2b]/[0.07] flex items-center justify-center group-hover:bg-[#004a2b]/[0.12] transition-colors">
                      <span className="material-symbols-outlined text-xl text-[#004a2b]">{info.icon}</span>
                    </div>
                    <span className="text-xs font-semibold text-[#004a2b] text-center">{info.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const tabMeta = TAB_META[activeTab] || { icon: 'settings', label: activeTab };

  return (
    <div className="min-h-screen bg-[#fbfaf1] pt-24 md:pt-28 pb-16">
      <div className="max-w-7xl mx-auto px-5 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#815500] mb-1">Administration</p>
            <h1 className="text-3xl font-bold text-[#004a2b] tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Hatvoni Admin</h1>
          </div>
          {activeTab !== 'dashboard' && (
            <button
              onClick={() => setActiveTab('dashboard')}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#004a2b] text-white text-xs font-semibold hover:bg-[#004a2b]/90 transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-base">dashboard</span>
              Dashboard
            </button>
          )}
        </header>

        {activeTab === 'dashboard' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                to="/admin/notifications"
                className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#004a2b] text-white text-xs font-semibold hover:bg-[#004a2b]/90 transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-base">notifications</span>
                Notification Preferences
              </Link>
            </div>
            <AdminStats stats={stats} setActiveTab={setActiveTab} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Context Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white px-5 py-3.5 rounded-xl border border-[#bec9bf]/20 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#004a2b]/[0.07] flex items-center justify-center text-[#004a2b]">
                  <span className="material-symbols-outlined text-lg">{tabMeta.icon}</span>
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#004a2b] capitalize leading-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{tabMeta.label}</h2>
                  <p className="text-[10px] text-[#3f4942]/50 font-medium">{filteredData.length} records</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all border ${showAdvancedFilters ? 'bg-[#004a2b] text-white border-[#004a2b]' : 'bg-white border-[#bec9bf]/30 text-[#3f4942] hover:border-[#004a2b]/20'}`}
                >
                  <span className="material-symbols-outlined text-sm">{showAdvancedFilters ? 'filter_list_off' : 'filter_list'}</span>
                  Filters
                </button>

                {!['recipe-page', 'waba-details'].includes(activeTab) && (
                  <div className="relative flex-1 lg:flex-none">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#3f4942]/30 text-base">search</span>
                    <input
                      type="text"
                      placeholder={`Search…`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 h-8 border border-[#bec9bf]/30 rounded-lg bg-white focus:ring-2 focus:ring-[#004a2b]/10 focus:border-[#004a2b] focus:outline-none w-full lg:w-52 text-xs font-medium transition-all"
                    />
                  </div>
                )}

                {['products', 'lots', 'recipes', 'recipe-page'].includes(activeTab) && (
                  <button
                    onClick={() => { setEditingItem(activeTab === 'recipe-page' ? data[0] : null); setShowModal(true); }}
                    className="inline-flex items-center gap-1.5 h-8 px-3 bg-[#815500] text-white rounded-lg text-xs font-semibold hover:bg-[#815500]/90 transition-all active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-sm">add</span>
                    {activeTab === 'recipe-page' ? 'Configure' : `Add`}
                  </button>
                )}
              </div>
            </div>

            {/* Advanced Filters Panel */}
            {showAdvancedFilters && activeTab !== 'waba-details' && (
              <AdminFilters
                tab={activeTab}
                filters={filters}
                setFilters={setFilters}
                sellerOptions={sellerOptions}
                catalogProducts={catalogProducts}
              />
            )}

            {/* Main Content Area */}
            {dataLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3">
                <span className="material-symbols-outlined animate-spin text-[#004a2b] text-2xl">progress_activity</span>
                <span className="text-[10px] font-medium uppercase tracking-widest text-[#004a2b]/30">Loading…</span>
              </div>
            ) : (
              <div className="min-h-[300px]">
                {activeTab === 'customers' && <CustomersTable data={filteredData} onToggleBan={handleToggleBan} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'customer')} />}
                {activeTab === 'sellers' && <SellersTable data={filteredData} sellerProductCounts={sellerProductCounts} onToggleBan={handleToggleBan} onToggleOwnSeller={handleToggleOwnSeller} />}
                {activeTab === 'products' && <ProductsTable data={filteredData} sellerOptions={sellerOptions} warehouseCountByProduct={warehouseCountByProduct} onToggleStatus={handleToggleProductStatus} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'product')} onManageWarehouses={(product) => setWarehouseModalProduct(product)} />}
                {activeTab === 'lots' && <LotsTable data={filteredData} catalogProducts={catalogProducts} onToggleStatus={handleToggleProductStatus} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'lot')} />}
                {activeTab === 'recipes' && <RecipesTable data={filteredData} onToggleStatus={handleToggleProductStatus} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'recipe')} />}
                {activeTab === 'recipe-page' && <RecipePageTable data={filteredData} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} />}
                {activeTab === 'layout' && <ProductLayoutTable data={filteredData} onUpdate={fetchData} />}
                {activeTab === 'orders' && <OrdersTable data={filteredData} sellerOptions={sellerOptions} />}
                {activeTab === 'waba-details' && <WabaManager />}
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <AdminModal
          type={activeTab === 'sellers' ? 'customers' : activeTab}
          item={editingItem}
          catalogProducts={catalogProducts}
          sellerOptions={sellerOptions}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          onSave={handleSave}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog {...confirmDialog} onCancel={() => setConfirmDialog(null)} />
      )}

      {warehouseModalProduct && (
        <ProductWarehouseModal
          product={warehouseModalProduct}
          onClose={() => {
            setWarehouseModalProduct(null);
            if (activeTab === 'products') fetchWarehouseCountsByProduct();
          }}
        />
      )}
    </div>
  );
}
