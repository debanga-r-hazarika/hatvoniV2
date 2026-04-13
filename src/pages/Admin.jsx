import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { recipeService } from '../services/recipeService';

const TABS = [
  { id: 'customers', label: 'Customers', icon: 'group' },
  { id: 'sellers', label: 'Sellers', icon: 'storefront' },
  { id: 'products', label: 'Products', icon: 'inventory_2' },
  { id: 'lots', label: 'Lots', icon: 'all_inclusive' },
  { id: 'orders', label: 'Orders', icon: 'package_2' },
  { id: 'recipes', label: 'Recipes', icon: 'restaurant_menu' },
  { id: 'recipe-page', label: 'Recipe Page', icon: 'web' },
  { id: 'layout', label: 'Product Layout', icon: 'grid_on' },
];

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

export default function Admin() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('customers');
  const [data, setData] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [stats, setStats] = useState({ customers: 0, sellers: 0, products: 0, lots: 0, orders: 0, recipes: 0 });
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [sellerOptions, setSellerOptions] = useState([]);
  const [sellerProductCounts, setSellerProductCounts] = useState({});

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, loading, navigate]);

  const fetchData = useCallback(async () => {
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
        .select('id, first_name, last_name, email, is_seller, is_admin')
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
      if (activeTab === 'lots') {
        fetchCatalogProducts();
      }
      if (activeTab === 'products' || activeTab === 'sellers' || activeTab === 'customers' || activeTab === 'orders') {
        fetchSellerOptions();
      }
    }
  }, [activeTab, isAdmin, fetchCatalogProducts, fetchData, fetchSellerOptions, fetchStats]);

  useEffect(() => {
    if (!isAdmin || activeTab !== 'orders') return undefined;

    const channel = supabase
      .channel('admin-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        fetchData();
      })
      .subscribe();

    // Fallback polling to avoid missing updates if realtime disconnects.
    const intervalId = setInterval(() => {
      fetchData();
    }, 15000);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [activeTab, isAdmin, fetchData]);

  const handleToggleBan = async (user) => {
    setConfirmDialog({
      type: 'ban',
      title: user.is_banned ? 'Unban Customer' : 'Ban Customer',
      message: `Are you sure you want to ${user.is_banned ? 'unban' : 'ban'} ${user.first_name || user.email || 'this user'}?`,
      confirmLabel: user.is_banned ? 'Unban' : 'Ban',
      confirmClass: user.is_banned ? 'bg-primary' : 'bg-red-600',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .update({ is_banned: !user.is_banned })
            .eq('id', user.id);
          if (error) throw error;
          fetchData();
        } catch (error) {
          alert('Error: ' + error.message);
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleToggleProductStatus = async (product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          is_active: !product.is_active,
          status: !product.is_active ? 'active' : 'inactive',
        })
        .eq('id', product.id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleToggleLotStatus = async (lot) => {
    try {
      const nextStatus = lot.status === 'active' ? 'inactive' : 'active';
      const { error } = await supabase
        .from('lots')
        .update({ status: nextStatus })
        .eq('id', lot.id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleToggleRecipeStatus = async (recipe) => {
    try {
      const { error } = await supabase
        .from('recipes')
        .update({ is_active: !recipe.is_active })
        .eq('id', recipe.id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleDelete = (item, type) => {
    setConfirmDialog({
      type: 'delete',
      title: `Delete ${type}`,
      message: `Are you sure you want to delete "${item.name || item.title || item.first_name || item.email || 'this item'}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      confirmClass: 'bg-red-600',
      onConfirm: async () => {
        try {
          const table = type === 'customer'
            ? 'profiles'
            : type === 'product'
              ? 'products'
              : type === 'lot'
                ? 'lots'
              : type === 'recipe'
                ? 'recipes'
                : 'orders';
          const { error } = await supabase.from(table).delete().eq('id', item.id);
          if (error) throw error;
          fetchData();
          fetchStats();
        } catch (error) {
          alert('Error: ' + error.message);
        }
        setConfirmDialog(null);
      },
    });
  };

  const handleSave = async (formData) => {
    try {
      const normalizedTab = activeTab === 'sellers' ? 'customers' : activeTab;
      const table = normalizedTab === 'customers'
        ? 'profiles'
        : normalizedTab === 'recipe-page'
          ? 'recipe_page_config'
          : normalizedTab;

      const payload = { ...formData };

      if (normalizedTab === 'customers') {
        const isAdminValue = payload.is_admin === true;
        const isSellerValue = payload.is_seller === true;
        payload.role = isAdminValue ? 'admin' : isSellerValue ? 'seller' : 'customer';
      }

      if (normalizedTab === 'products') {
        payload.status = payload.status || (payload.is_active === false ? 'inactive' : 'active');
        payload.is_active = payload.status ? payload.status === 'active' : payload.is_active !== false;
        payload.seller_id = payload.seller_id || null;
        payload.show_as_individual_product = payload.show_as_individual_product !== false;
      }

      if (normalizedTab === 'recipe-page') {
        const payload = {
          ...formData,
          id: 1,
          default_pantry_essentials: formData.default_pantry_essentials || [],
        };
        const { error } = await supabase.from(table).upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      } else if (normalizedTab === 'lots') {
        const lotItemsPayload = (formData.lot_items || [])
          .filter((item) => item.product_key)
          .map((item) => ({
            product_key: item.product_key,
            quantity: Number(item.quantity || 1),
          }));

        const calculatedLotPrice = calculateLotPriceFromItems(lotItemsPayload, catalogProducts);

        const lotPayload = {
          lot_name: formData.lot_name,
          description: formData.description || null,
          price: calculatedLotPrice,
          status: formData.status || 'active',
          image_url: formData.image_url || null,
          source_product_id: formData.source_product_id || null,
          updated_at: new Date().toISOString(),
        };

        let lotId = editingItem?.id || formData.id;
        if (lotId) {
          const { error } = await supabase.from('lots').update(lotPayload).eq('id', lotId);
          if (error) throw error;
        } else {
          const { data: createdLot, error } = await supabase
            .from('lots')
            .insert([{ ...lotPayload, created_at: new Date().toISOString() }])
            .select('id')
            .single();
          if (error) throw error;
          lotId = createdLot.id;
        }

        if (!lotId) throw new Error('Unable to save lot');

        const { error: deleteError } = await supabase.from('lot_items').delete().eq('lot_id', lotId);
        if (deleteError) throw deleteError;

        const lotItemsWithLotId = lotItemsPayload.map((item) => ({
          lot_id: lotId,
          product_key: item.product_key,
          quantity: item.quantity,
        }));

        if (lotItemsWithLotId.length > 0) {
          const { error: itemsError } = await supabase.from('lot_items').insert(lotItemsWithLotId);
          if (itemsError) throw itemsError;
        }
      } else if (editingItem) {
        const { error } = await supabase.from(table).update(payload).eq('id', editingItem.id);
        if (error) throw error;
        if (normalizedTab === 'products') {
          await supabase
            .from('products')
            .update({
              status: formData.status || (formData.is_active === false ? 'inactive' : 'active'),
              is_active: formData.status ? formData.status === 'active' : formData.is_active !== false,
              seller_id: formData.seller_id || null,
              show_as_individual_product: formData.show_as_individual_product !== false,
            })
            .eq('id', editingItem.id);
        }
      } else {
        const { error } = await supabase.from(table).insert([payload]);
        if (error) throw error;
      }
      setShowModal(false);
      setEditingItem(null);
      fetchData();
      fetchStats();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const filteredData = data.filter((item) => {
    const searchLower = searchQuery.toLowerCase();
    let matchesSearch = true;
    let matchesStatus = true;

    if (activeTab === 'customers') {
      matchesSearch = (item.first_name?.toLowerCase() || '').includes(searchLower) ||
        (item.last_name?.toLowerCase() || '').includes(searchLower) ||
        (item.email?.toLowerCase() || '').includes(searchLower);
      if (statusFilter === 'banned') matchesStatus = item.is_banned;
      if (statusFilter === 'active') matchesStatus = !item.is_banned;
      if (statusFilter === 'admin') matchesStatus = item.is_admin;
      if (statusFilter === 'seller') matchesStatus = item.is_seller;
    } else if (activeTab === 'sellers') {
      matchesSearch = (item.first_name?.toLowerCase() || '').includes(searchLower) ||
        (item.last_name?.toLowerCase() || '').includes(searchLower) ||
        (item.email?.toLowerCase() || '').includes(searchLower);
      if (statusFilter === 'active') matchesStatus = !item.is_banned;
      if (statusFilter === 'banned') matchesStatus = item.is_banned;
    } else if (activeTab === 'products') {
      matchesSearch = (item.name?.toLowerCase() || '').includes(searchLower) ||
        (item.category?.toLowerCase() || '').includes(searchLower);
      if (statusFilter === 'active') matchesStatus = item.is_active;
      if (statusFilter === 'inactive') matchesStatus = !item.is_active;
    } else if (activeTab === 'lots') {
      matchesSearch = (item.lot_name?.toLowerCase() || '').includes(searchLower) ||
        (item.description?.toLowerCase() || '').includes(searchLower);
      if (statusFilter === 'active') matchesStatus = item.status === 'active';
      if (statusFilter === 'inactive') matchesStatus = item.status !== 'active';
    } else if (activeTab === 'orders') {
      matchesSearch = (item.id?.toLowerCase() || '').includes(searchLower) ||
        (item.profiles?.email?.toLowerCase() || '').includes(searchLower) ||
        (item.razorpay_payment_id?.toLowerCase() || '').includes(searchLower) ||
        (item.razorpay_order_id?.toLowerCase() || '').includes(searchLower) ||
        (item.external_order_id?.toLowerCase() || '').includes(searchLower);

      if (statusFilter.startsWith('payment:')) {
        const paymentStatus = statusFilter.split(':')[1];
        matchesStatus = String(item.payment_status || '').toLowerCase() === paymentStatus;
      } else if (statusFilter !== 'all') {
        matchesStatus = item.status === statusFilter;
      }
    } else if (activeTab === 'recipes') {
      matchesSearch = (item.title?.toLowerCase() || '').includes(searchLower) ||
        (item.tag?.toLowerCase() || '').includes(searchLower);
      if (statusFilter === 'featured') matchesStatus = item.is_featured;
      if (statusFilter === 'active') matchesStatus = item.is_active;
      if (statusFilter === 'inactive') matchesStatus = !item.is_active;
    } else if (activeTab === 'recipe-page') {
      matchesSearch = true;
      matchesStatus = true;
    }

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex items-center gap-3 text-primary">
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          <span className="font-body font-semibold">Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-surface pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tight">Admin Dashboard</h1>
            <p className="text-on-surface-variant mt-2 font-body">Manage customers, sellers, products, recipes, coupons, and page content</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/coupons')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-body font-semibold hover:opacity-90 transition"
          >
            <span className="material-symbols-outlined text-base">sell</span>
            Manage Coupons
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
          {[
            { label: 'Total Customers', value: stats.customers, icon: 'group', color: 'bg-primary' },
            { label: 'Total Sellers', value: stats.sellers, icon: 'storefront', color: 'bg-emerald-600' },
            { label: 'Total Products', value: stats.products, icon: 'inventory_2', color: 'bg-secondary' },
            { label: 'Total Lots', value: stats.lots, icon: 'all_inclusive', color: 'bg-sky-600' },
            { label: 'Total Orders', value: stats.orders, icon: 'package_2', color: 'bg-tertiary' },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface-container-low rounded-2xl p-6 flex items-center gap-4">
              <div className={`${stat.color} w-12 h-12 rounded-xl flex items-center justify-center`}>
                <span className="material-symbols-outlined text-white">{stat.icon}</span>
              </div>
              <div>
                <p className="text-2xl font-brand text-primary">{stat.value}</p>
                <p className="text-sm text-on-surface-variant font-body">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface-container-low rounded-2xl overflow-hidden">
          <div className="border-b border-outline-variant/30">
            <nav className="flex overflow-x-auto" aria-label="Tabs">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSearchQuery(''); setStatusFilter('all'); }}
                  className={`flex items-center gap-2 px-6 py-4 font-body font-semibold text-sm whitespace-nowrap border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'border-secondary text-secondary'
                      : 'border-transparent text-on-surface-variant hover:text-primary hover:border-outline-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                {activeTab !== 'recipe-page' && (
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
                    <input
                      type="text"
                      placeholder={`Search ${activeTab}...`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2.5 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent w-full sm:w-64 font-body text-sm"
                    />
                  </div>
                )}
                {activeTab !== 'recipe-page' && (
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2.5 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body text-sm"
                  >
                    <option value="all">All Status</option>
                    {activeTab === 'customers' && (
                      <>
                        <option value="active">Active</option>
                        <option value="banned">Banned</option>
                        <option value="admin">Admins</option>
                        <option value="seller">Sellers</option>
                      </>
                    )}
                    {activeTab === 'sellers' && (
                      <>
                        <option value="active">Active</option>
                        <option value="banned">Banned</option>
                      </>
                    )}
                    {activeTab === 'products' && (
                      <>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </>
                    )}
                    {activeTab === 'lots' && (
                      <>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </>
                    )}
                    {activeTab === 'recipes' && (
                      <>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                        <option value="featured">Featured</option>
                      </>
                    )}
                    {activeTab === 'orders' && (
                      <>
                        <option value="pending">Pending</option>
                        <option value="processing">Processing</option>
                        <option value="shipped">Shipped</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="payment:paid">Payment: Paid</option>
                        <option value="payment:pending">Payment: Pending</option>
                        <option value="payment:failed">Payment: Failed</option>
                      </>
                    )}
                  </select>
                )}
              </div>
              {(activeTab === 'products' || activeTab === 'lots' || activeTab === 'recipes' || activeTab === 'recipe-page') && (
                <button
                  onClick={() => {
                    if (activeTab === 'recipe-page') {
                      setEditingItem(data[0] || { id: 1 });
                    } else {
                      setEditingItem(null);
                    }
                    setShowModal(true);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-white rounded-xl font-body font-semibold text-sm hover:bg-secondary/90 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-lg">add</span>
                  {activeTab === 'products' && 'Add Product'}
                  {activeTab === 'lots' && 'Add Lot'}
                  {activeTab === 'recipes' && 'Add Recipe'}
                  {activeTab === 'recipe-page' && 'Edit Page Sections'}
                </button>
              )}
            </div>

            {dataLoading ? (
              <div className="flex items-center justify-center py-16">
                <span className="material-symbols-outlined animate-spin text-secondary text-3xl">progress_activity</span>
              </div>
            ) : filteredData.length === 0 ? (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">search_off</span>
                <p className="mt-4 text-on-surface-variant font-body">No {activeTab} found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                {activeTab === 'customers' && (
                  <CustomersTable data={filteredData} onToggleBan={handleToggleBan} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'customer')} />
                )}
                {activeTab === 'sellers' && (
                  <SellersTable data={filteredData} sellerProductCounts={sellerProductCounts} onToggleBan={handleToggleBan} />
                )}
                {activeTab === 'products' && (
                  <ProductsTable data={filteredData} sellerOptions={sellerOptions} onToggleStatus={handleToggleProductStatus} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'product')} />
                )}
                {activeTab === 'lots' && (
                  <LotsTable data={filteredData} catalogProducts={catalogProducts} onToggleStatus={handleToggleLotStatus} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} onDelete={(item) => handleDelete(item, 'lot')} />
                )}
                {activeTab === 'recipes' && (
                  <RecipesTable
                    data={filteredData}
                    onToggleStatus={handleToggleRecipeStatus}
                    onEdit={(item) => { setEditingItem(item); setShowModal(true); }}
                    onDelete={(item) => handleDelete(item, 'recipe')}
                  />
                )}
                {activeTab === 'recipe-page' && (
                  <RecipePageTable data={filteredData} onEdit={(item) => { setEditingItem(item); setShowModal(true); }} />
                )}
                {activeTab === 'layout' && (
                  <ProductLayoutTable data={filteredData} onUpdate={fetchData} />
                )}
                {activeTab === 'orders' && (
                  <OrdersTable data={filteredData} sellerOptions={sellerOptions} />
                )}
              </div>
            )}
          </div>
        </div>
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

function CustomersTable({ data, onToggleBan, onEdit, onDelete }) {
  return (
    <table className="min-w-full">
      <thead>
        <tr className="border-b border-outline-variant/30">
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Customer</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Email</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Phone</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Joined</th>
          <th className="px-4 py-3 text-right text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/20">
        {data.map((user) => (
          <tr key={user.id} className="hover:bg-surface-container transition-colors">
            <td className="px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
                  <span className="font-body font-bold text-primary text-sm">
                    {(user.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-body font-semibold text-primary">
                    {user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'No name'}
                  </p>
                  {user.is_admin && (
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">Admin</span>
                  )}
                  {user.is_seller && (
                    <span className="ml-1 text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">Seller</span>
                  )}
                </div>
              </div>
            </td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">{user.email || 'N/A'}</td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">{user.phone || 'N/A'}</td>
            <td className="px-4 py-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                user.is_banned ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${user.is_banned ? 'bg-red-500' : 'bg-green-500'}`} />
                {user.is_banned ? 'Banned' : 'Active'}
              </span>
            </td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">
              {new Date(user.created_at).toLocaleDateString()}
            </td>
            <td className="px-4 py-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => onToggleBan(user)}
                  className={`p-2 rounded-lg transition-colors ${
                    user.is_banned ? 'hover:bg-green-100 text-green-600' : 'hover:bg-red-100 text-red-600'
                  }`}
                  title={user.is_banned ? 'Unban' : 'Ban'}
                >
                  <span className="material-symbols-outlined text-lg">{user.is_banned ? 'lock_open' : 'block'}</span>
                </button>
                <button onClick={() => onEdit(user)} className="p-2 rounded-lg hover:bg-primary-container/50 text-primary transition-colors" title="Edit">
                  <span className="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onClick={() => onDelete(user)} className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors" title="Delete">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SellersTable({ data, sellerProductCounts, onToggleBan }) {
  return (
    <table className="min-w-full">
      <thead>
        <tr className="border-b border-outline-variant/30">
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Seller</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Email</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Assigned Products</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Joined</th>
          <th className="px-4 py-3 text-right text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/20">
        {data.map((seller) => (
          <tr key={seller.id} className="hover:bg-surface-container transition-colors">
            <td className="px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="font-body font-bold text-emerald-700 text-sm">
                    {(seller.first_name?.[0] || seller.email?.[0] || '?').toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-body font-semibold text-primary">
                    {seller.first_name || seller.last_name ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim() : 'No name'}
                  </p>
                  <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">Seller</span>
                </div>
              </div>
            </td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">{seller.email || 'N/A'}</td>
            <td className="px-4 py-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-container/40 text-primary">
                {sellerProductCounts[seller.id] || 0} products
              </span>
            </td>
            <td className="px-4 py-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                seller.is_banned ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${seller.is_banned ? 'bg-red-500' : 'bg-green-500'}`} />
                {seller.is_banned ? 'Banned' : 'Active'}
              </span>
            </td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">{new Date(seller.created_at).toLocaleDateString()}</td>
            <td className="px-4 py-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => onToggleBan(seller)}
                  className={`p-2 rounded-lg transition-colors ${
                    seller.is_banned ? 'hover:bg-green-100 text-green-600' : 'hover:bg-red-100 text-red-600'
                  }`}
                  title={seller.is_banned ? 'Unban seller' : 'Ban seller'}
                >
                  <span className="material-symbols-outlined text-lg">{seller.is_banned ? 'lock_open' : 'block'}</span>
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductsTable({ data, sellerOptions, onToggleStatus, onEdit, onDelete }) {
  const sellerById = (sellerOptions || []).reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  return (
    <table className="min-w-full">
      <thead>
        <tr className="border-b border-outline-variant/30">
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Product</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Key</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Seller</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Category</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Price</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Stock</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Individual</th>
          <th className="px-4 py-3 text-right text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/20">
        {data.map((product) => (
          <tr key={product.id} className="hover:bg-surface-container transition-colors">
            <td className="px-4 py-4">
              <div className="flex items-center gap-3">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">image</span>
                  </div>
                )}
                <div>
                  <p className="font-body font-semibold text-primary">{product.name}</p>
                  <p className="text-xs text-on-surface-variant line-clamp-1 max-w-xs">{product.description}</p>
                </div>
              </div>
            </td>
            <td className="px-4 py-4 text-xs font-mono text-on-surface-variant">{product.key || product.external_product_id || 'N/A'}</td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">
              {(() => {
                const seller = sellerById[product.seller_id];
                if (!seller) return 'Unassigned';
                return `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.email || 'Assigned';
              })()}
            </td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">{product.category || 'N/A'}</td>
            <td className="px-4 py-4 text-sm font-semibold text-primary">₹{product.price}</td>
            <td className="px-4 py-4">
              <span className={`text-sm font-semibold ${product.stock_quantity < 10 ? 'text-red-600' : 'text-on-surface'}`}>
                {product.stock_quantity}
              </span>
            </td>
            <td className="px-4 py-4">
              <button
                onClick={() => onToggleStatus(product)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  product.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${product.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                {product.is_active ? 'Active' : 'Inactive'}
              </button>
            </td>
            <td className="px-4 py-4">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                product.show_as_individual_product !== false ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${product.show_as_individual_product !== false ? 'bg-blue-500' : 'bg-slate-500'}`} />
                {product.show_as_individual_product !== false ? 'Shown Individually' : 'Lot Only'}
              </span>
            </td>
            <td className="px-4 py-4">
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => onEdit(product)} className="p-2 rounded-lg hover:bg-primary-container/50 text-primary transition-colors" title="Edit">
                  <span className="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onClick={() => onDelete(product)} className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors" title="Delete">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LotsTable({ data, catalogProducts, onToggleStatus, onEdit, onDelete }) {
  return (
    <table className="min-w-full">
      <thead>
        <tr className="border-b border-outline-variant/30">
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Lot</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Items</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Price</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
          <th className="px-4 py-3 text-right text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/20">
        {data.map((lot) => (
          <tr key={lot.id} className="hover:bg-surface-container transition-colors">
            <td className="px-4 py-4">
              <div>
                <p className="font-body font-semibold text-primary">{lot.lot_name}</p>
                <p className="text-xs text-on-surface-variant line-clamp-1 max-w-xs">{lot.description}</p>
              </div>
            </td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">{lot.lot_items?.length || 0}</td>
            <td className="px-4 py-4 text-sm font-semibold text-primary">₹{calculateLotPriceFromItems(lot.lot_items || [], catalogProducts).toLocaleString('en-IN')}</td>
            <td className="px-4 py-4">
              <button
                onClick={() => onToggleStatus(lot)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  lot.status === 'active' ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${lot.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                {lot.status === 'active' ? 'Active' : 'Inactive'}
              </button>
            </td>
            <td className="px-4 py-4">
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => onEdit(lot)} className="p-2 rounded-lg hover:bg-primary-container/50 text-primary transition-colors" title="Edit">
                  <span className="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onClick={() => onDelete(lot)} className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors" title="Delete">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecipesTable({ data, onToggleStatus, onEdit, onDelete }) {
  return (
    <table className="min-w-full">
      <thead>
        <tr className="border-b border-outline-variant/30">
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Recipe</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Tag</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Prep Time</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Order</th>
          <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
          <th className="px-4 py-3 text-right text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-outline-variant/20">
        {data.map((recipe) => (
          <tr key={recipe.id} className="hover:bg-surface-container transition-colors">
            <td className="px-4 py-4">
              <div className="flex items-center gap-3">
                {recipe.image_url ? (
                  <img src={recipe.image_url} alt={recipe.title} className="w-12 h-12 rounded-lg object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant">image</span>
                  </div>
                )}
                <div>
                  <p className="font-body font-semibold text-primary">{recipe.title}</p>
                  <p className="text-xs text-on-surface-variant line-clamp-1 max-w-xs">{recipe.short_description || 'No description yet'}</p>
                </div>
              </div>
            </td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">{recipe.tag || 'N/A'}</td>
            <td className="px-4 py-4 text-sm text-on-surface-variant">{recipe.prep_time || 'N/A'}</td>
            <td className="px-4 py-4 text-sm font-semibold text-primary">{recipe.sort_order ?? 999}</td>
            <td className="px-4 py-4">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => onToggleStatus(recipe)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    recipe.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${recipe.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                  {recipe.is_active ? 'Active' : 'Inactive'}
                </button>
                {recipe.is_featured && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />Featured
                  </span>
                )}
              </div>
            </td>
            <td className="px-4 py-4">
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => onEdit(recipe)} className="p-2 rounded-lg hover:bg-primary-container/50 text-primary transition-colors" title="Edit">
                  <span className="material-symbols-outlined text-lg">edit</span>
                </button>
                <button onClick={() => onDelete(recipe)} className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors" title="Delete">
                  <span className="material-symbols-outlined text-lg">delete</span>
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecipePageTable({ data, onEdit }) {
  const item = data[0] || {};

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-headline text-lg font-bold text-primary mb-1">Recipes Page Sections</h3>
          <p className="text-on-surface-variant text-sm">Control all section headings, descriptions, and newsletter content from one place.</p>
        </div>
        <button
          onClick={() => onEdit(item)}
          className="px-4 py-2 bg-secondary text-white rounded-lg text-sm font-semibold hover:bg-secondary/90"
        >
          Edit Content
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="rounded-xl bg-surface p-4 border border-outline-variant/20">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">Hero Title</p>
          <p className="font-body text-primary">{item.hero_title || 'Not set'}</p>
        </div>
        <div className="rounded-xl bg-surface p-4 border border-outline-variant/20">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">Seasonal Heading</p>
          <p className="font-body text-primary">{item.seasonal_heading || 'Not set'}</p>
        </div>
        <div className="rounded-xl bg-surface p-4 border border-outline-variant/20">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">Story Title</p>
          <p className="font-body text-primary">{item.story_title || 'Not set'}</p>
        </div>
        <div className="rounded-xl bg-surface p-4 border border-outline-variant/20">
          <p className="text-xs uppercase tracking-widest text-on-surface-variant font-bold mb-2">Newsletter Title</p>
          <p className="font-body text-primary">{item.newsletter_title || 'Not set'}</p>
        </div>
      </div>
    </div>
  );
}

function OrdersTable({ data, sellerOptions }) {
  const [expandedOrders, setExpandedOrders] = useState({});
  const [paymentQuickFilter, setPaymentQuickFilter] = useState('all');

  const statusColors = {
    pending: 'bg-slate-100 text-slate-800',
    processing: 'bg-amber-100 text-amber-800',
    shipped: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  const paymentStatusColors = {
    paid: 'bg-emerald-100 text-emerald-800',
    captured: 'bg-emerald-100 text-emerald-800',
    authorized: 'bg-sky-100 text-sky-800',
    pending: 'bg-amber-100 text-amber-800',
    initiated: 'bg-amber-100 text-amber-800',
    failed: 'bg-red-100 text-red-800',
    refunded: 'bg-slate-200 text-slate-800',
  };
  const formatDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN') : 'N/A');
  const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

  const toggleOrder = (orderId) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const visibleOrders = (data || []).filter((order) => {
    if (paymentQuickFilter === 'all') return true;
    return String(order.payment_status || '').toLowerCase() === paymentQuickFilter;
  });

  const expandAll = () => {
    const next = {};
    visibleOrders.forEach((order) => {
      next[order.id] = true;
    });
    setExpandedOrders((prev) => ({ ...prev, ...next }));
  };

  const collapseAll = () => {
    const next = {};
    visibleOrders.forEach((order) => {
      next[order.id] = false;
    });
    setExpandedOrders((prev) => ({ ...prev, ...next }));
  };

  const copyValue = async (value) => {
    if (!value || value === 'N/A') return;
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      // Clipboard API may be unavailable on insecure contexts.
    }
  };

  const DetailRow = ({ label, value, mono = false }) => (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-outline-variant/10 last:border-b-0">
      <span className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">{label}</span>
      <span className={`text-sm text-on-surface text-right ${mono ? 'font-mono text-xs break-all' : ''}`}>{value || 'N/A'}</span>
    </div>
  );

  const sellerById = (sellerOptions || []).reduce((acc, seller) => {
    acc[seller.id] = seller;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">Quick Payment Filter</span>
          {[{ id: 'all', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Pending' }, { id: 'failed', label: 'Failed' }].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setPaymentQuickFilter(filter.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${paymentQuickFilter === filter.id ? 'bg-primary text-white' : 'bg-surface border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface text-xs font-semibold hover:bg-surface transition-colors"
          >
            <span className="material-symbols-outlined text-sm">unfold_more</span>
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface text-xs font-semibold hover:bg-surface transition-colors"
          >
            <span className="material-symbols-outlined text-sm">unfold_less</span>
            Collapse All
          </button>
        </div>
      </div>

      {visibleOrders.map((order) => {
        const customerName = order.profiles?.first_name || order.profiles?.last_name
          ? `${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim()
          : 'N/A';

        return (
          <div key={order.id} className="rounded-2xl border border-outline-variant/30 bg-surface p-5">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm text-primary font-semibold">#{order.id.slice(0, 8)}</span>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${statusColors[order.status] || statusColors.pending}`}>
                    {order.status}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-container/40 text-primary">
                    {(order.order_items || []).length} item{(order.order_items || []).length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant mt-2">Customer: {customerName} • {order.profiles?.email || 'N/A'}</p>
                <p className="text-xs text-on-surface-variant mt-1">Placed on {formatDateTime(order.created_at)}</p>
              </div>

              <div className="text-left xl:text-right">
                <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">Order Total</p>
                <p className="text-2xl font-brand text-primary">{formatCurrency(order.total_amount)}</p>
                <button
                  type="button"
                  onClick={() => toggleOrder(order.id)}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface text-xs font-semibold hover:bg-surface-container transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">{expandedOrders[order.id] ? 'expand_less' : 'expand_more'}</span>
                  {expandedOrders[order.id] ? 'Collapse' : 'Expand'}
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${paymentStatusColors[String(order.payment_status || 'pending').toLowerCase()] || paymentStatusColors.pending}`}>
                Payment: {String(order.payment_status || 'pending').toUpperCase()}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-800">
                Method: {order.payment_method || 'cod'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                Gateway: {order.payment_gateway || 'N/A'}
              </span>
              {order.insider_order_status && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                  Insider: {order.insider_order_status}
                </span>
              )}
              {order.shipment_status && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800">
                  Shipment: {order.shipment_status}
                </span>
              )}
            </div>

            {expandedOrders[order.id] && (
              <>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="rounded-xl border border-outline-variant/20 p-4 bg-surface-container-low">
                <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant mb-2">Shipping Address</p>
                <p className="text-sm text-on-surface font-semibold">
                  {order.shipping_address?.first_name || ''} {order.shipping_address?.last_name || ''}
                </p>
                <p className="text-sm text-on-surface-variant">{order.shipping_address?.address_line1 || 'N/A'}</p>
                {order.shipping_address?.address_line2 && <p className="text-sm text-on-surface-variant">{order.shipping_address.address_line2}</p>}
                <p className="text-sm text-on-surface-variant">
                  {order.shipping_address?.city || 'N/A'}, {order.shipping_address?.state || 'N/A'} {order.shipping_address?.postal_code || ''}
                </p>
                <p className="text-sm text-on-surface-variant">Phone: {order.shipping_address?.phone || 'N/A'}</p>
              </div>

              <div className="rounded-xl border border-outline-variant/20 p-4 bg-surface-container-low">
                <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant mb-2">Fulfillment & Tracking</p>
                <DetailRow label="Provider" value={order.shipment_provider || 'N/A'} />
                <DetailRow label="Tracking" value={order.tracking_number || 'N/A'} mono />
                <DetailRow label="Processed At" value={formatDateTime(order.processed_at)} />
                <DetailRow label="Insider Notes" value={order.insider_notes || 'N/A'} />
                <DetailRow label="Shipped At" value={formatDateTime(order.shipped_at)} />
                <DetailRow label="Last Synced" value={formatDateTime(order.last_synced_at)} />
              </div>

              <div className="rounded-xl border border-outline-variant/20 p-4 bg-surface-container-low">
                <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant mb-2">Technical Details</p>
                <div className="flex items-start justify-between gap-2 py-1.5 border-b border-outline-variant/10">
                  <span className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">Order ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono break-all text-right">{order.id}</span>
                    <button type="button" onClick={() => copyValue(order.id)} className="p-1 rounded hover:bg-surface" title="Copy Order ID">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">content_copy</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2 py-1.5 border-b border-outline-variant/10">
                  <span className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">External Order ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono break-all text-right">{order.external_order_id || 'N/A'}</span>
                    <button type="button" onClick={() => copyValue(order.external_order_id)} className="p-1 rounded hover:bg-surface" title="Copy External Order ID">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">content_copy</span>
                    </button>
                  </div>
                </div>
                <DetailRow label="External Customer ID" value={order.external_customer_id || 'N/A'} mono />
                <div className="flex items-start justify-between gap-2 py-1.5 border-b border-outline-variant/10">
                  <span className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">Razorpay Order ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono break-all text-right">{order.razorpay_order_id || 'N/A'}</span>
                    <button type="button" onClick={() => copyValue(order.razorpay_order_id)} className="p-1 rounded hover:bg-surface" title="Copy Razorpay Order ID">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">content_copy</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-2 py-1.5 border-b border-outline-variant/10">
                  <span className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">Razorpay Payment ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono break-all text-right">{order.razorpay_payment_id || 'N/A'}</span>
                    <button type="button" onClick={() => copyValue(order.razorpay_payment_id)} className="p-1 rounded hover:bg-surface" title="Copy Razorpay Payment ID">
                      <span className="material-symbols-outlined text-sm text-on-surface-variant">content_copy</span>
                    </button>
                  </div>
                </div>
                <DetailRow label="Razorpay Signature" value={order.razorpay_signature || 'N/A'} mono />
                <DetailRow label="Last Received Version" value={String(order.last_received_version ?? 'N/A')} />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-outline-variant/20 p-4 bg-surface-container-low">
              <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant mb-2">Billing Breakdown</p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <p className="text-on-surface-variant">Subtotal: <span className="text-on-surface font-semibold">{formatCurrency(order.billing_breakdown?.subtotal || 0)}</span></p>
                <p className="text-on-surface-variant">Shipping: <span className="text-on-surface font-semibold">{formatCurrency(order.billing_breakdown?.shipping_fee || 0)}</span></p>
                <p className="text-on-surface-variant">COD Fee: <span className="text-on-surface font-semibold">{formatCurrency(order.billing_breakdown?.cod_fee || 0)}</span></p>
                <p className="text-on-surface-variant">Discount: <span className="text-on-surface font-semibold">{formatCurrency(order.billing_breakdown?.discount || order.billing_breakdown?.coupon_discount || 0)}</span></p>
                <p className="text-on-surface-variant">Total: <span className="text-on-surface font-semibold">{formatCurrency(order.billing_breakdown?.total || order.total_amount || 0)}</span></p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-outline-variant/20">
              <table className="min-w-full">
                <thead className="bg-surface-container-low">
                  <tr className="border-b border-outline-variant/20">
                    <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Product</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Seller</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Price</th>
                    <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {(order.order_items || []).map((item) => {
                    const seller = sellerById[item.products?.seller_id];
                    const sellerName = seller
                      ? `${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.email || 'Seller'
                      : 'Unassigned';

                    return (
                      <tr key={item.id}>
                        <td className="px-3 py-3 text-sm text-primary font-medium">{item.products?.name || item.lot_name || item.lots?.lot_name || 'Product/Lot'}</td>
                        <td className="px-3 py-3 text-sm text-on-surface-variant">{item.lot_id ? 'Lot' : 'Product'}</td>
                        <td className="px-3 py-3 text-sm text-on-surface-variant">{sellerName}</td>
                        <td className="px-3 py-3 text-sm text-on-surface-variant">{item.quantity}</td>
                        <td className="px-3 py-3 text-sm text-on-surface-variant">{formatCurrency(item.price || 0)}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-primary">{formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {(order.order_items || []).some((item) => Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0) && (
              <details className="mt-4 rounded-xl border border-outline-variant/20 p-3 bg-surface-container-low" open>
                <summary className="text-xs uppercase tracking-wider font-bold text-on-surface-variant cursor-pointer">Lot Snapshot Details</summary>
                <div className="space-y-2 mt-3">
                  {(order.order_items || []).map((item) => (
                    Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0 ? (
                      <div key={`${item.id}-snapshot`} className="rounded-lg border border-outline-variant/20 bg-surface p-2">
                        <p className="text-xs font-semibold text-primary mb-1">{item.lot_name || item.lots?.lot_name || 'Lot'} ({item.id.slice(0, 8)})</p>
                        {item.lot_snapshot.map((snap, idx) => (
                          <p key={`${item.id}-${idx}`} className="text-xs text-on-surface-variant">
                            {snap.product_name || snap.product_key || 'Item'} • Qty: {snap.quantity || 0} • Unit: {formatCurrency(snap.unit_price || 0)}
                          </p>
                        ))}
                      </div>
                    ) : null
                  ))}
                </div>
              </details>
            )}

            {order.payment_metadata && Object.keys(order.payment_metadata).length > 0 && (
              <details className="mt-4 rounded-xl border border-outline-variant/20 p-3 bg-surface-container-low">
                <summary className="text-xs uppercase tracking-wider font-bold text-on-surface-variant cursor-pointer">Payment Metadata (JSON)</summary>
                <pre className="mt-3 text-xs leading-5 bg-surface p-3 rounded-lg overflow-x-auto border border-outline-variant/20 text-on-surface-variant">
                  {JSON.stringify(order.payment_metadata, null, 2)}
                </pre>
              </details>
            )}

            <p className="mt-4 text-xs text-on-surface-variant font-semibold">Read-only mode: Customer Site Admin can monitor live status and full order details, but cannot edit, approve, or delete orders.</p>
            </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProductLayoutTable({ data, onUpdate }) {
  const [editState, setEditState] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [previewVariant, setPreviewVariant] = useState(null);

  const handleChange = (productId, field, value) => {
    setEditState((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value },
    }));
  };

  const handleDragStart = (e, productId) => {
    setDraggedId(productId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e, productId) => {
    if (productId !== draggedId) {
      setDragOverId(productId);
    }
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);

    if (draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    setIsSaving(true);
    try {
      const draggedIndex = data.findIndex(p => p.id === draggedId);
      const targetIndex = data.findIndex(p => p.id === targetId);

      if (draggedIndex === -1 || targetIndex === -1) return;

      // Reorder locally for immediate visual feedback
      const newOrder = [...data];
      const [draggedProduct] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetIndex, 0, draggedProduct);

      // Update sort orders in Supabase
      const updates = newOrder.map((product, idx) => ({
        id: product.id,
        sort_order: idx + 1,
      }));

      // Batch update all affected products
      for (const update of updates) {
        await supabase
          .from('products')
          .update({ layout_sort_order: update.sort_order })
          .eq('id', update.id);
      }

      onUpdate();
    } catch (error) {
      alert('Error reordering: ' + error.message);
    } finally {
      setIsSaving(false);
      setDraggedId(null);
    }
  };

  const handleSave = async (productId) => {
    setIsSaving(true);
    try {
      const updates = editState[productId];
      if (!updates) return;

      // Only send real database columns; keep UI-only flags out of payloads.
      const payload = {
        layout_variant: updates.layout_variant,
        layout_sort_order: updates.layout_sort_order,
        layout_locked: updates.layout_locked,
      };

      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', productId);

      if (error) throw error;

      setEditState((prev) => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });

      onUpdate();
    } catch (error) {
      alert('Error saving layout: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const variantOptions = [
    { value: 'auto', label: 'Auto (Cycle)', description: 'Rotates through premium layouts' },
    { value: 'hero', label: 'Hero (8/4)', description: 'Large side-by-side layout' },
    { value: 'tall', label: 'Tall (4/12)', description: 'Image top, content below' },
    { value: 'square', label: 'Square (4/12)', description: 'Compact square card' },
    { value: 'editorial', label: 'Editorial (Split)', description: 'Split with alternating orientation' },
    { value: 'trio', label: 'Trio Row (3)', description: 'Three cards in a row' },
    { value: 'runway', label: 'Runway (8/4)', description: 'Asymmetric 2-product layout' },
    { value: 'dual', label: 'Dual Row (2)', description: 'Two equal cards' },
    { value: 'stack', label: 'Stack (7/5)', description: 'Asymmetric 3-product layout' },
  ];

  const getVariantPreview = (variant) => {
    const variants = {
      hero: { cols: 'md:col-span-8', height: 'h-80', desc: '8/4 split, large featured' },
      tall: { cols: 'md:col-span-4', height: 'h-96', desc: 'Tall card, image top' },
      square: { cols: 'md:col-span-4', height: 'h-80', desc: 'Square compact card' },
      editorial: { cols: 'md:col-span-6', height: 'h-72', desc: 'Split alternating' },
      trio: { cols: 'md:col-span-4', height: 'h-64', desc: '3 cards per row' },
      runway: { cols: 'md:col-span-6', height: 'h-72', desc: 'Asymmetric 2 card' },
      dual: { cols: 'md:col-span-6', height: 'h-72', desc: '2 equal cards' },
      stack: { cols: 'md:col-span-8', height: 'h-80', desc: 'Asymmetric 3 card' },
      auto: { cols: 'md:col-span-4', height: 'h-64', desc: 'Cycles through layouts' },
    };
    return variants[variant] || variants.auto;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Table */}
      <div className="lg:col-span-2">
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-blue-600 text-lg mt-0.5">touch_app</span>
            <div>
              <p className="font-semibold text-blue-900">Drag to Reorder</p>
              <p className="text-sm text-blue-700">Click and drag products to change their position on the page. Use sort order as backup.</p>
            </div>
          </div>
        </div>

        <table className="min-w-full">
          <thead>
            <tr className="border-b border-outline-variant/30">
              <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider w-12">⋮</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Product</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Layout Variant</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Sort Order</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Locked</th>
              <th className="px-4 py-3 text-right text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {data.map((product) => {
              const isEditing = editState[product.id];
              const isDragging = draggedId === product.id;
              const isDragOver = dragOverId === product.id;

              return (
                <tr
                  key={product.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, product.id)}
                  onDragOver={handleDragOver}
                  onDragEnter={(e) => handleDragEnter(e, product.id)}
                  onDrop={(e) => handleDrop(e, product.id)}
                  onDragEnd={() => setDraggedId(null)}
                  onClick={() => setPreviewVariant(product.layout_variant || 'auto')}
                  className={`transition-all cursor-move ${
                    isDragging ? 'opacity-40 bg-secondary/5' : isDragOver ? 'bg-primary/5 border-l-4 border-primary' : 'hover:bg-surface-container'
                  }`}
                >
                  <td className="px-4 py-4 text-center">
                    <span className="material-symbols-outlined text-on-surface-variant/50 text-lg">drag_handle</span>
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-body font-semibold text-primary">{product.name}</p>
                      <p className="text-xs text-on-surface-variant">{product.category || 'N/A'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {isEditing ? (
                      <select
                        value={isEditing.layout_variant || product.layout_variant || 'auto'}
                        onChange={(e) => {
                          handleChange(product.id, 'layout_variant', e.target.value);
                          setPreviewVariant(e.target.value);
                        }}
                        className="px-3 py-2 border border-outline-variant rounded-lg bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body text-sm"
                      >
                        {variantOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div
                        onClick={() => setPreviewVariant(product.layout_variant || 'auto')}
                        className="inline-block px-3 py-1.5 rounded-lg bg-primary-container/30 text-primary font-body text-sm cursor-pointer hover:bg-primary-container/50 transition-colors"
                      >
                        {variantOptions.find((v) => v.value === (product.layout_variant || 'auto'))?.label || 'Auto'}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {isEditing ? (
                      <input
                        type="number"
                        min="1"
                        value={isEditing.layout_sort_order || product.layout_sort_order || 999}
                        onChange={(e) => handleChange(product.id, 'layout_sort_order', parseInt(e.target.value))}
                        className="w-20 px-3 py-2 border border-outline-variant rounded-lg bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body text-sm"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-on-surface">{product.layout_sort_order || 999}</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {isEditing ? (
                      <input
                        type="checkbox"
                        checked={isEditing.layout_locked !== undefined ? isEditing.layout_locked : (product.layout_locked || false)}
                        onChange={(e) => handleChange(product.id, 'layout_locked', e.target.checked)}
                        className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary"
                      />
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                        product.layout_locked ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${product.layout_locked ? 'bg-amber-600' : 'bg-gray-400'}`} />
                        {product.layout_locked ? 'Locked' : 'Free'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSave(product.id)}
                            disabled={isSaving}
                            className="p-2 rounded-lg hover:bg-green-100 text-green-600 transition-colors disabled:opacity-50"
                            title="Save"
                          >
                            <span className="material-symbols-outlined text-lg">check</span>
                          </button>
                          <button
                            onClick={() => setEditState((prev) => { const newState = { ...prev }; delete newState[product.id]; return newState; })}
                            className="p-2 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                            title="Cancel"
                          >
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
                          className="p-2 rounded-lg hover:bg-primary-container/50 text-primary transition-colors"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
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

      {/* Layout Preview Sidebar */}
      <div className="lg:col-span-1">
        <div className="sticky top-24 space-y-4">
          <div className="bg-surface-container-low rounded-2xl p-6">
            <h3 className="font-headline font-bold text-lg text-primary mb-4">Layout Preview</h3>
            
            {previewVariant ? (
              <>
                <p className="text-sm text-on-surface-variant mb-4">
                  {variantOptions.find(v => v.value === previewVariant)?.description}
                </p>
                
                {/* Visual Preview */}
                <div className="bg-surface rounded-xl p-4 mb-6 border-2 border-outline-variant/30">
                  <div className={`${getVariantPreview(previewVariant).height} bg-gradient-to-br from-primary-container/20 to-secondary-container/20 rounded-lg flex items-center justify-center border-2 border-dashed border-outline-variant transition-all`}>
                    <div className="text-center">
                      <span className="material-symbols-outlined text-primary/40 text-5xl">image</span>
                      <p className="text-sm text-on-surface-variant/60 mt-2">{getVariantPreview(previewVariant).desc}</p>
                    </div>
                  </div>
                </div>

                {/* Layout Info */}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Grid Width</p>
                    <p className="font-body text-sm text-primary">{getVariantPreview(previewVariant).cols}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Typical Height</p>
                    <p className="font-body text-sm text-primary">{getVariantPreview(previewVariant).height}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-on-surface-variant/30 text-5xl">preview</span>
                <p className="text-sm text-on-surface-variant mt-4">Click a variant or row to see preview</p>
              </div>
            )}
          </div>

          {/* Quick Reference */}
          <div className="bg-surface-container-low rounded-2xl p-4">
            <h4 className="font-headline font-semibold text-sm text-primary mb-3">Variant Guide</h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {variantOptions.map((variant) => (
                <button
                  key={variant.value}
                  onClick={() => setPreviewVariant(variant.value)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all text-sm ${
                    previewVariant === variant.value
                      ? 'bg-secondary text-white font-semibold'
                      : 'bg-surface hover:bg-primary-container/30 text-on-surface-variant'
                  }`}
                >
                  <p className="font-body font-semibold">{variant.label}</p>
                  <p className={`text-xs ${previewVariant === variant.value ? 'text-white/80' : 'text-on-surface-variant/70'}`}>
                    {variant.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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

function AdminModal({ type, item, catalogProducts, sellerOptions, onClose, onSave }) {
  const [formData, setFormData] = useState(() => {
    if (type === 'recipes') return recipeModalInitialState(item);
    if (type === 'recipe-page') return recipePageModalInitialState(item);
    if (type === 'products') {
      return {
        show_as_individual_product: true,
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
    setSaving(false);
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between">
          <h3 className="font-headline text-xl font-bold text-primary">
            {item ? 'Edit' : 'Add'} {
              type === 'customers'
                ? 'Customer'
                : type === 'products'
                  ? 'Product'
                  : type === 'lots'
                    ? 'Lot'
                  : type === 'recipes'
                    ? 'Recipe'
                    : type === 'recipe-page'
                      ? 'Recipe Page Sections'
                      : 'Order'
            }
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {type === 'customers' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">First Name</label>
                  <input type="text" value={formData.first_name || ''} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Last Name</label>
                  <input type="text" value={formData.last_name || ''} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Phone</label>
                <input type="tel" value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_admin" checked={formData.is_admin || false} onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                  className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary" />
                <label htmlFor="is_admin" className="text-sm font-body font-semibold text-primary">Admin privileges</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_seller" checked={formData.is_seller || false} onChange={(e) => setFormData({ ...formData, is_seller: e.target.checked })}
                  className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary" />
                <label htmlFor="is_seller" className="text-sm font-body font-semibold text-primary">Seller privileges</label>
              </div>
            </>
          )}

          {type === 'products' && (
            <>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Product Name *</label>
                <input type="text" required value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Product Key *</label>
                <input type="text" required value={formData.key || ''} onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body font-mono text-sm" />
                <p className="mt-1 text-[11px] text-on-surface-variant">Must match Insider processed goods tag.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Description</label>
                <textarea rows={3} value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Price (₹) *</label>
                  <input type="number" step="0.01" required value={formData.price || ''} onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Stock</label>
                  <input type="number" value={formData.stock_quantity || 0} onChange={(e) => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Category</label>
                <input type="text" value={formData.category || ''} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Assigned Seller</label>
                <select value={formData.seller_id || ''} onChange={(e) => setFormData({ ...formData, seller_id: e.target.value || null })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body">
                  <option value="">Unassigned</option>
                  {(sellerOptions || []).map((seller) => (
                    <option key={seller.id} value={seller.id}>
                      {`${seller.first_name || ''} ${seller.last_name || ''}`.trim() || seller.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Status</label>
                  <select value={formData.status || (formData.is_active === false ? 'inactive' : 'active')} onChange={(e) => setFormData({ ...formData, status: e.target.value, is_active: e.target.value === 'active' })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex items-center gap-3 pt-7">
                  <input type="checkbox" id="is_active" checked={(formData.status || (formData.is_active === false ? 'inactive' : 'active')) === 'active'} onChange={(e) => setFormData({ ...formData, status: e.target.checked ? 'active' : 'inactive', is_active: e.target.checked })}
                    className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary" />
                  <label htmlFor="is_active" className="text-sm font-body font-semibold text-primary">Visible to customers</label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="show_as_individual_product"
                  checked={formData.show_as_individual_product !== false}
                  onChange={(e) => setFormData({ ...formData, show_as_individual_product: e.target.checked })}
                  className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary"
                />
                <label htmlFor="show_as_individual_product" className="text-sm font-body font-semibold text-primary">
                  Show as Individual product
                </label>
              </div>
              <p className="-mt-3 text-[11px] text-on-surface-variant">
                Turn this off to hide from product listings. Customers can still buy it through lots.
              </p>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Image URL</label>
                <input type="url" value={formData.image_url || ''} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>
            </>
          )}

          {type === 'lots' && (
            <>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Lot Name *</label>
                <input type="text" required value={formData.lot_name || ''} onChange={(e) => setFormData({ ...formData, lot_name: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Description</label>
                <textarea rows={3} value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Calculated Lot Price</label>
                  <div className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface-container-low font-body font-semibold text-primary">
                    ₹{calculatedLotPrice.toLocaleString('en-IN')}
                  </div>
                  <p className="mt-1 text-[11px] text-on-surface-variant">Auto-calculated from selected products and quantities.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Status</label>
                  <select value={formData.status || 'active'} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Image URL</label>
                <input type="url" value={formData.image_url || ''} onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>

              <div className="space-y-3 rounded-2xl border border-outline-variant/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Lot Items</p>
                    <p className="text-[11px] text-on-surface-variant">Add bundled products by key and quantity.</p>
                  </div>
                  <button type="button" onClick={addLotRow} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:opacity-90">
                    Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {lotItems.map((row, index) => (
                    <div key={`${index}-${row.product_key || 'row'}`} className="grid grid-cols-[1fr_100px_auto] gap-2 items-center">
                      <select
                        value={row.product_key}
                        onChange={(e) => updateLotRow(index, 'product_key', e.target.value)}
                        className="w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm font-body"
                      >
                        <option value="">Select product key</option>
                        {catalogProducts.map((product) => (
                          <option key={product.id} value={product.key || product.external_product_id || product.id}>
                            {product.name} ({product.key || product.external_product_id || product.id}) - ₹{Number(product.price || 0).toLocaleString('en-IN')}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={(e) => updateLotRow(index, 'quantity', Number(e.target.value) || 1)}
                        className="w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm font-body"
                      />
                      <button type="button" onClick={() => removeLotRow(index)} className="rounded-lg px-3 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {type === 'orders' && (
            <>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Status</label>
                <select value={formData.status || 'pending'} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body">
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Total Amount (₹)</label>
                <input type="number" step="0.01" value={formData.total_amount || ''} onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>
            </>
          )}

          {type === 'recipes' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Recipe Title *</label>
                  <input type="text" required value={formData.title || ''} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Tag</label>
                  <input type="text" value={formData.tag || ''} onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Prep Time</label>
                  <input type="text" value={formData.prep_time || ''} onChange={(e) => setFormData({ ...formData, prep_time: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Short Description</label>
                <textarea rows={3} value={formData.short_description || ''} onChange={(e) => setFormData({ ...formData, short_description: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body resize-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">YouTube URL</label>
                <input type="url" value={formData.youtube_url || ''} onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">Recipe Photo</label>
                <input type="url" value={formData.image_url || ''} placeholder="Image URL"
                  onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                <div className="flex items-center gap-3">
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="text-sm" />
                  {uploadingImage && <span className="text-xs text-on-surface-variant">Uploading image...</span>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Chip Tags (comma separated)</label>
                <input type="text" value={formData.tags_input || ''} onChange={(e) => setFormData({ ...formData, tags_input: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Pantry Essentials (comma separated)</label>
                <input type="text" value={formData.pantry_input || ''} onChange={(e) => setFormData({ ...formData, pantry_input: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Method Steps (one per line)</label>
                <textarea rows={4} value={formData.method_steps_input || ''} onChange={(e) => setFormData({ ...formData, method_steps_input: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body resize-y" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Sort Order</label>
                  <input type="number" value={formData.sort_order ?? 999} onChange={(e) => setFormData({ ...formData, sort_order: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
                <div className="flex items-center gap-5 pt-7">
                  <label className="flex items-center gap-2 text-sm font-body font-semibold text-primary">
                    <input type="checkbox" checked={formData.is_featured || false} onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                      className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary" />
                    Featured
                  </label>
                  <label className="flex items-center gap-2 text-sm font-body font-semibold text-primary">
                    <input type="checkbox" checked={formData.is_active !== false} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-5 h-5 rounded border-outline-variant text-secondary focus:ring-secondary" />
                    Active
                  </label>
                </div>
              </div>
            </>
          )}

          {type === 'recipe-page' && (
            <>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Hero Title</label>
                <input type="text" value={formData.hero_title || ''} onChange={(e) => setFormData({ ...formData, hero_title: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Hero Subtitle</label>
                <textarea rows={3} value={formData.hero_subtitle || ''} onChange={(e) => setFormData({ ...formData, hero_subtitle: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Featured Badge</label>
                  <input type="text" value={formData.featured_badge || ''} onChange={(e) => setFormData({ ...formData, featured_badge: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Featured CTA Text</label>
                  <input type="text" value={formData.featured_cta_text || ''} onChange={(e) => setFormData({ ...formData, featured_cta_text: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Story Title</label>
                  <input type="text" value={formData.story_title || ''} onChange={(e) => setFormData({ ...formData, story_title: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Pantry Section Title</label>
                  <input type="text" value={formData.pantry_title || ''} onChange={(e) => setFormData({ ...formData, pantry_title: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Story Body</label>
                <textarea rows={3} value={formData.story_body || ''} onChange={(e) => setFormData({ ...formData, story_body: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body resize-none" />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Default Pantry Essentials (comma separated)</label>
                <input type="text" value={formData.default_pantry_input || ''} onChange={(e) => setFormData({ ...formData, default_pantry_input: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Featured Recipe ID (optional)</label>
                <input type="text" value={formData.featured_recipe_id || ''} onChange={(e) => setFormData({ ...formData, featured_recipe_id: e.target.value || null })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Seasonal Heading</label>
                <input type="text" value={formData.seasonal_heading || ''} onChange={(e) => setFormData({ ...formData, seasonal_heading: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Newsletter Title</label>
                  <input type="text" value={formData.newsletter_title || ''} onChange={(e) => setFormData({ ...formData, newsletter_title: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Newsletter Button Text</label>
                  <input type="text" value={formData.newsletter_button_text || ''} onChange={(e) => setFormData({ ...formData, newsletter_button_text: e.target.value })}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Newsletter Body</label>
                <textarea rows={3} value={formData.newsletter_body || ''} onChange={(e) => setFormData({ ...formData, newsletter_body: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body resize-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Newsletter Input Placeholder</label>
                <input type="text" value={formData.newsletter_input_placeholder || ''} onChange={(e) => setFormData({ ...formData, newsletter_input_placeholder: e.target.value })}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body" />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose}
              className="px-6 py-3 border border-outline-variant text-on-surface-variant rounded-xl font-body font-semibold hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-6 py-3 bg-secondary text-white rounded-xl font-body font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-50 flex items-center gap-2">
              {saving && <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>}
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onCancel}>
      <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-red-600">warning</span>
          </div>
          <h3 className="font-headline text-xl font-bold text-primary">{title}</h3>
        </div>
        <p className="text-on-surface-variant mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel}
            className="px-5 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl font-body font-semibold hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`px-5 py-2.5 text-white rounded-xl font-body font-semibold hover:opacity-90 transition-colors ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

