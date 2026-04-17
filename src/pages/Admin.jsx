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
import AdminModal from '../components/admin/AdminModal';
import ConfirmDialog from '../components/admin/ConfirmDialog';
import AdminFilters from '../components/admin/AdminFilters';

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

  // Advanced Filters State
  const [filters, setFilters] = useState({
    category: 'all',
    status: 'all',
    stock: 'all',
    seller: 'all',
    orderStatus: 'all',
    paymentStatus: 'all',
    paymentMethod: 'all',
    dateRange: 'all',
    layoutType: 'all',
    syncStatus: 'all',
    role: 'all'
  });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin && !isEmployee) {
      navigate('/');
    }
  }, [isAdmin, isEmployee, loading, navigate]);

  // Scroll effect on tab change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  const fetchData = useCallback(async () => {
    if (activeTab === 'dashboard') return;
    setDataLoading(true);
    try {
      let query;
      switch (activeTab) {
        case 'customers':
          query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
          break;
        case 'sellers':
          query = supabase.from('profiles').select('*').eq('is_seller', true).order('created_at', { ascending: false });
          break;
        case 'products':
          query = supabase.from('products').select('*').order('created_at', { ascending: false });
          break;
        case 'lots':
          query = supabase.from('lots').select('*, lot_items(*, products(name, key, price, image_url))').order('created_at', { ascending: false });
          break;
        case 'layout':
          query = supabase.from('products').select('*').order('layout_sort_order', { ascending: true }).order('created_at', { ascending: false });
          break;
        case 'orders':
          query = supabase.from('orders').select('*, order_items(*, products(*), lots(*))').order('created_at', { ascending: false });
          break;
        case 'recipes':
          query = supabase.from('recipes').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
          break;
        case 'recipe-page':
          query = supabase.from('recipe_page_config').select('*').eq('id', 1).maybeSingle();
          break;
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
            .from('profiles')
            .select('id, first_name, last_name, email')
            .in('id', customerIds);

          if (profilesError) throw profilesError;

          profilesById = (customerProfiles || []).reduce((acc, profileRow) => {
            acc[profileRow.id] = profileRow;
            return acc;
          }, {});
        }

        setData((result || []).map((order) => ({
          ...order,
          profiles: profilesById[order.user_id] || null,
        })));
        return;
      }

      if (activeTab === 'sellers') {
        const sellerIds = (result || []).map((seller) => seller.id);
        if (sellerIds.length === 0) {
          setSellerProductCounts({});
        } else {
          const { data: ownedProducts, error: ownedProductsError } = await supabase
            .from('products')
            .select('seller_id')
            .in('seller_id', sellerIds);

          if (ownedProductsError) throw ownedProductsError;

          const counts = (ownedProducts || []).reduce((acc, row) => {
            if (!row.seller_id) return acc;
            acc[row.seller_id] = (acc[row.seller_id] || 0) + 1;
            return acc;
          }, {});
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
      const [customersRes, sellersRes, productsRes, lotsRes, ordersRes, recipesRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_seller', true),
        supabase.from('products').select('id', { count: 'exact', head: true }),
        supabase.from('lots').select('id', { count: 'exact', head: true }),
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('recipes').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        customers: customersRes.count || 0,
        sellers: sellersRes.count || 0,
        products: productsRes.count || 0,
        lots: lotsRes.count || 0,
        orders: ordersRes.count || 0,
        recipes: recipesRes.count || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  const fetchCatalogProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, key, external_product_id, price, image_url, is_active, status')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCatalogProducts(data || []);
    } catch (error) {
      console.error('Error fetching catalog products:', error);
    }
  }, []);

  const fetchSellerOptions = useCallback(async () => {
    try {
      const { data: result, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, is_seller, is_admin, is_own_seller')
        .or('is_seller.eq.true,is_admin.eq.true')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSellerOptions(result || []);
    } catch (error) {
      console.error('Error fetching seller options:', error);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      fetchData();
      fetchStats();
      if (activeTab === 'lots') fetchCatalogProducts();
      if (['products', 'sellers', 'customers', 'orders', 'layout'].includes(activeTab)) fetchSellerOptions();
    }
  }, [activeTab, isAdmin, fetchCatalogProducts, fetchData, fetchSellerOptions, fetchStats]);

  useEffect(() => {
    if (!isAdmin || activeTab !== 'orders') return undefined;

    const channel = supabase
      .channel('admin-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchData())
      .subscribe();

    const intervalId = setInterval(() => fetchData(), 15000);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [activeTab, isAdmin, fetchData]);

  const handleToggleBan = async (user) => {
    setConfirmDialog({
      type: 'ban',
      title: user.is_banned ? 'Restore Account' : 'Restrict Account',
      message: `Are you sure you want to ${user.is_banned ? 'restore access for' : 'suspend'} ${user.first_name || user.email}? This will affect their ability to login and place orders.`,
      confirmLabel: user.is_banned ? 'Restore Access' : 'Suspend Account',
      confirmClass: user.is_banned ? 'bg-primary' : 'bg-red-600',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('profiles').update({ is_banned: !user.is_banned }).eq('id', user.id);
          if (error) throw error;
          fetchData();
        } catch (error) {
          alert('Error: ' + error.message);
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleToggleOwnSeller = async (seller) => {
    try {
      const { error } = await supabase.from('profiles').update({ is_own_seller: !seller.is_own_seller }).eq('id', seller.id);
      if (error) throw error;
      fetchData();
    } catch (error) {
       alert('Error: ' + error.message);
    }
  };

  const handleToggleProductStatus = async (product) => {
    try {
      const { error } = await supabase.from('products').update({ is_active: !product.is_active, status: !product.is_active ? 'active' : 'inactive' }).eq('id', product.id);
      if (error) throw error;
      fetchData();
    } catch (error) {
       alert('Error: ' + error.message);
    }
  };

  const handleDelete = (item, type) => {
    setConfirmDialog({
      type: 'delete',
      title: `Purge ${type}`,
      message: `You are about to permanently delete "${item.name || item.title || item.email || 'this record'}". This action is irreversible and may affect related database constraints.`,
      confirmLabel: 'Confirm Purge',
      confirmClass: 'bg-red-600',
      onConfirm: async () => {
        try {
          const tableMap = { customer: 'profiles', product: 'products', lot: 'lots', recipe: 'recipes' };
          const { error } = await supabase.from(tableMap[type] || 'orders').delete().eq('id', item.id);
          if (error) throw error;
          fetchData();
          fetchStats();
        } catch (error) {
          alert('Purge Failed: ' + error.message);
        }
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
    } catch (error) {
      alert('Save Error: ' + error.message);
    }
  };

  const filteredData = data.filter((item) => {
    const searchLower = searchQuery.toLowerCase();
    let matchesSearch = true;
    let matchesFilters = true;

    // 1. Search Logic
    if (activeTab === 'customers' || activeTab === 'sellers') {
      matchesSearch = (item.first_name?.toLowerCase() || '').includes(searchLower) || (item.last_name?.toLowerCase() || '').includes(searchLower) || (item.email?.toLowerCase() || '').includes(searchLower);
    } else if (activeTab === 'products' || activeTab === 'layout') {
      matchesSearch = (item.name?.toLowerCase() || '').includes(searchLower) || (item.category?.toLowerCase() || '').includes(searchLower);
    } else if (activeTab === 'lots') {
      matchesSearch = (item.lot_name?.toLowerCase() || '').includes(searchLower) || (item.description?.toLowerCase() || '').includes(searchLower);
    } else if (activeTab === 'orders') {
      matchesSearch = (item.id?.toLowerCase() || '').includes(searchLower) || (item.profiles?.email?.toLowerCase() || '').includes(searchLower) || (item.razorpay_payment_id?.toLowerCase() || '').includes(searchLower);
    } else if (activeTab === 'recipes') {
      matchesSearch = (item.title?.toLowerCase() || '').includes(searchLower);
    }

    // 2. Advanced Filters Logic
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
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <span className="font-brand font-bold text-primary tracking-widest uppercase text-xs">Loading Secure Environment</span>
      </div>
    </div>
  );

  // ── Employee staff dashboard ─────────────────────────────────────────────
  if (!isAdmin && isEmployee) {
    const MODULE_ROUTES = {
      orders:    { path: '/admin/orders',    icon: 'package_2',        label: 'Orders' },
      logistics: { path: '/admin/logistics', icon: 'local_shipping',   label: 'Logistics' },
      support:   { path: '/admin/support',   icon: 'support_agent',    label: 'Support' },
      inventory: { path: '/admin/inventory', icon: 'inventory_2',      label: 'Inventory' },
      coupons:   { path: '/admin/coupons',   icon: 'sell',             label: 'Coupons' },
      customers: { path: '/admin',           icon: 'group',            label: 'Customers' },
      sellers:   { path: '/admin/sellers',   icon: 'storefront',       label: 'Sellers' },
      products:  { path: '/admin',           icon: 'category',         label: 'Products' },
      lots:      { path: '/admin',           icon: 'all_inclusive',    label: 'Lots' },
      recipes:   { path: '/admin',           icon: 'restaurant_menu',  label: 'Recipes' },
    };

    return (
      <div className="min-h-screen bg-surface pt-32 md:pt-40 pb-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <header className="mb-10 animate-in fade-in slide-in-from-left-8 duration-700">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-secondary mb-2 block">Staff Portal</span>
            <h1 className="font-brand text-5xl md:text-6xl text-primary tracking-tight leading-none">Staff Dashboard</h1>
            <p className="text-on-surface-variant mt-4 font-body font-medium">Your assigned modules are listed below.</p>
          </header>

          {employeeModules.length === 0 ? (
            <div className="bg-surface-container-low rounded-3xl border border-outline-variant/20 p-12 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 block mb-4">lock</span>
              <p className="font-brand text-xl text-primary mb-2">No modules assigned</p>
              <p className="text-on-surface-variant font-body text-sm">Contact your administrator to get access to admin sections.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {employeeModules.map((mod) => {
                const info = MODULE_ROUTES[mod];
                if (!info) return null;
                return (
                  <Link
                    key={mod}
                    to={info.path}
                    className="flex flex-col items-center gap-3 p-6 bg-surface-container-low rounded-3xl border border-outline-variant/20 hover:border-primary/30 hover:bg-primary/5 transition-all duration-300 group shadow-sm hover:shadow-md"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <span className="material-symbols-outlined text-2xl text-primary">{info.icon}</span>
                    </div>
                    <span className="font-brand font-bold text-primary text-sm text-center">{info.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pt-32 md:pt-40 pb-20">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <header className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="animate-in fade-in slide-in-from-left-8 duration-700">
             <span className="text-[10px] font-black uppercase tracking-[0.4em] text-secondary mb-2 block">System Administration</span>
             <h1 className="font-brand text-5xl md:text-6xl text-primary tracking-tight leading-none">Hatvoni Command</h1>
             <p className="text-on-surface-variant mt-4 font-body font-medium max-w-xl">Centralized node for managing brand assets, partner relations, and customer fulfillment logs.</p>
          </div>
          {activeTab !== 'dashboard' && (
             <button onClick={() => setActiveTab('dashboard')} className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-primary text-white font-brand font-bold hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 active:scale-95 animate-in fade-in zoom-in duration-500">
                <span className="material-symbols-outlined">dashboard</span>
                Control Center
             </button>
          )}
        </header>

        {activeTab === 'dashboard' ? (
          <AdminStats stats={stats} setActiveTab={setActiveTab} />
        ) : (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Context Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-center gap-6 bg-surface-container-low p-6 rounded-[2.5rem] border border-outline-variant/10 shadow-sm relative z-20">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                     <span className="material-symbols-outlined text-2xl">
                        {activeTab === 'customers' ? 'group' : activeTab === 'sellers' ? 'storefront' : activeTab === 'products' ? 'inventory_2' : 'settings'}
                     </span>
                  </div>
                  <div>
                    <h2 className="font-brand text-2xl text-primary capitalize leading-none mb-1">{activeTab.replace('-', ' ')}</h2>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant opacity-60">Management View</p>
                  </div>
               </div>

               <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                <button
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-brand font-bold text-sm transition-all shadow-sm ${showAdvancedFilters ? 'bg-primary text-white' : 'bg-white border border-outline-variant/30 text-on-surface hover:bg-surface-container-low'}`}
                >
                  <span className="material-symbols-outlined text-[20px]">{showAdvancedFilters ? 'filter_list_off' : 'filter_list'}</span>
                  Advanced Filters
                </button>

                {activeTab !== 'recipe-page' && (
                  <div className="relative flex-1 lg:flex-none">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40 text-[20px]">search</span>
                    <input
                      type="text"
                      placeholder={`Search ${activeTab}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-12 pr-6 py-3 border border-outline-variant/30 rounded-2xl bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary focus:outline-none w-full lg:w-64 font-body text-sm font-bold shadow-sm transition-all"
                    />
                  </div>
                )}
                {['products', 'lots', 'recipes', 'recipe-page'].includes(activeTab) && (
                  <button
                    onClick={() => { setEditingItem(activeTab === 'recipe-page' ? data[0] : null); setShowModal(true); }}
                    className="flex items-center gap-2 px-6 py-3 bg-secondary text-white rounded-2xl font-brand font-bold text-sm hover:bg-secondary/90 transition-all active:scale-95 shadow-lg shadow-secondary/10"
                  >
                    <span className="material-symbols-outlined text-lg">add_circle</span>
                    {activeTab === 'recipe-page' ? 'Configure Sections' : `Add ${activeTab.slice(0, -1)}`}
                  </button>
                )}
              </div>
            </div>

            {/* Advanced Filters Panel */}
            {showAdvancedFilters && (
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
              <div className="flex flex-col items-center justify-center py-32 gap-4">
                <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
                <span className="text-[10px] font-black uppercase tracking-[0.5em] text-primary/40">Synchronizing...</span>
              </div>
            ) : (
              <div className="min-h-[400px]">
                {activeTab === 'customers' && <CustomersTable data={filteredData} onToggleBan={handleToggleBan} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'customer')} />}
                {activeTab === 'sellers' && <SellersTable data={filteredData} sellerProductCounts={sellerProductCounts} onToggleBan={handleToggleBan} onToggleOwnSeller={handleToggleOwnSeller} />}
                {activeTab === 'products' && <ProductsTable data={filteredData} sellerOptions={sellerOptions} onToggleStatus={handleToggleProductStatus} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'product')} />}
                {activeTab === 'lots' && <LotsTable data={filteredData} catalogProducts={catalogProducts} onToggleStatus={handleToggleProductStatus} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'lot')} />}
                {activeTab === 'recipes' && <RecipesTable data={filteredData} onToggleStatus={handleToggleProductStatus} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'recipe')} />}
                {activeTab === 'recipe-page' && <RecipePageTable data={filteredData} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} />}
                {activeTab === 'layout' && <ProductLayoutTable data={filteredData} onUpdate={fetchData} />}
                {activeTab === 'orders' && <OrdersTable data={filteredData} sellerOptions={sellerOptions} />}
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
        <ConfirmDialog
          {...confirmDialog}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}
