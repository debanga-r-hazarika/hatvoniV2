import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { buildSellerItemsForOrder, calculateSellerSubtotal } from '../lib/sellerOrderPricing';

const initialForm = {
  id: null,
  name: '',
  price: '',
  stock_quantity: 0,
  status: 'active',
  image_url: '',
};

const orderStatusColors = {
  pending: 'bg-slate-100 text-slate-800',
  processing: 'bg-amber-100 text-amber-800',
  shipped: 'bg-blue-100 text-blue-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const decisionColors = {
  pending: 'bg-slate-100 text-slate-700',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

const rejectionReasons = [
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'damaged_item', label: 'Damaged item' },
  { value: 'cannot_fulfill_in_time', label: 'Cannot fulfill in time' },
  { value: 'product_mismatch', label: 'Product mismatch' },
  { value: 'other', label: 'Other' },
];

const getDecisionKey = (item) => `${item.source_order_item_id}:${item.product_key}`;

export default function Seller() {
  const { user, profile, isSeller, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('orders');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [decisionReasons, setDecisionReasons] = useState({});
  const [decisionErrors, setDecisionErrors] = useState({});
  const [rejectingItemKey, setRejectingItemKey] = useState('');

  useEffect(() => {
    if (!loading && !isSeller && !isAdmin) {
      navigate('/');
    }
  }, [isSeller, isAdmin, loading, navigate]);

  const fetchSellerProducts = useCallback(async () => {
    if (!user?.id) return;

    setDataLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      alert('Error loading seller products: ' + error.message);
    } finally {
      setDataLoading(false);
    }
  }, [user?.id]);

  const fetchSellerOrders = useCallback(async () => {
    if (!user?.id) return;

    setOrdersLoading(true);
    try {
      // Step 1: Get seller's products
      const { data: sellerProducts, error: sellerProductsError } = await supabase
        .from('products')
        .select('id, key, name')
        .eq('seller_id', user.id);

      if (sellerProductsError) throw sellerProductsError;

      const sellerProductKeys = new Set((sellerProducts || []).map((product) => product.key).filter(Boolean));

      // Step 2: Get order items accessible to seller (via RLS)
      const { data: orderItems, error: orderItemsError } = await supabase
        .from('order_items')
        .select('id, order_id, lot_name, quantity, price, product_id, lot_snapshot, products(id, key, name)')
        .order('created_at', { ascending: false });

      if (orderItemsError) {
        console.error('Order items fetch error:', orderItemsError);
        throw orderItemsError;
      }

      if (!orderItems || orderItems.length === 0) {
        setOrders([]);
        return;
      }

      // Step 3: Get unique order IDs
      const orderIds = [...new Set((orderItems || []).map((item) => item.order_id).filter(Boolean))];

      // Step 4: Get order details
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, user_id, status, total_amount, created_at, updated_at')
        .in('id', orderIds)
        .order('created_at', { ascending: false });

      if (ordersError) {
        console.error('Orders fetch error:', ordersError);
        throw ordersError;
      }

      // Step 5: Get customer profiles
      const customerIds = [...new Set((orders || []).map((o) => o.user_id).filter(Boolean))];
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

      // Step 6: Group order items by order ID
      const orderItemsByOrderId = (orderItems || []).reduce((acc, item) => {
        if (!acc[item.order_id]) acc[item.order_id] = [];
        acc[item.order_id].push(item);
        return acc;
      }, {});

      const orderItemIds = [...new Set((orderItems || []).map((item) => item.id).filter(Boolean))];
      let decisionMap = {};

      if (orderItemIds.length > 0) {
        const { data: decisions, error: decisionsError } = await supabase
          .from('seller_order_item_decisions')
          .select('order_item_id, product_key, decision, decision_reason, decided_at')
          .eq('seller_id', user.id)
          .in('order_item_id', orderItemIds);

        if (decisionsError) throw decisionsError;

        decisionMap = (decisions || []).reduce((acc, decision) => {
          acc[`${decision.order_item_id}:${decision.product_key}`] = decision;
          return acc;
        }, {});
      }

      // Step 7: Build seller orders by filtering items using lot_snapshot
      const sellerOrders = (orders || [])
        .map((order) => {
          const items = orderItemsByOrderId[order.id] || [];

          const sellerItems = buildSellerItemsForOrder(items, sellerProductKeys).map((item) => {
            const decision = decisionMap[getDecisionKey(item)] || null;
            return {
              ...item,
              order_id: order.id,
              seller_decision: decision?.decision || 'pending',
              seller_decision_reason: decision?.decision_reason || '',
              seller_decided_at: decision?.decided_at || null,
            };
          });

          const sellerDecisionSummary = sellerItems.reduce((acc, item) => {
            acc[item.seller_decision || 'pending'] = (acc[item.seller_decision || 'pending'] || 0) + 1;
            return acc;
          }, { pending: 0, approved: 0, rejected: 0 });

          return {
            ...order,
            profiles: profilesById[order.user_id] || null,
            seller_items: sellerItems,
            seller_subtotal: calculateSellerSubtotal(sellerItems),
            seller_decision_summary: sellerDecisionSummary,
          };
        })
        .filter((order) => order.seller_items.length > 0);

      setOrders(sellerOrders);
    } catch (error) {
      console.error('Full error:', error);
      alert('Error loading seller orders: ' + error.message);
    } finally {
      setOrdersLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isSeller || isAdmin) {
      fetchSellerProducts();
      fetchSellerOrders();
    }
  }, [isSeller, isAdmin, fetchSellerOrders, fetchSellerProducts]);

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((product) => product.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch =
        (product.name || '').toLowerCase().includes(searchLower) ||
        (product.category || '').toLowerCase().includes(searchLower) ||
        (product.key || '').toLowerCase().includes(searchLower);

      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = product.is_active;
      if (statusFilter === 'inactive') matchesStatus = !product.is_active;

      return matchesSearch && matchesStatus;
    });
  }, [products, searchQuery, statusFilter]);

  const filteredOrders = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase();

    return orders.filter((order) => {
      const customerName = `${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim();
      const matchesSearch =
        (order.id || '').toLowerCase().includes(searchLower) ||
        customerName.toLowerCase().includes(searchLower) ||
        (order.profiles?.email || '').toLowerCase().includes(searchLower) ||
        (order.seller_items || []).some((item) =>
          (item.product_name || '').toLowerCase().includes(searchLower) ||
          (item.product_key || '').toLowerCase().includes(searchLower)
        );

      let matchesStatus = true;
      if (orderStatusFilter !== 'all') matchesStatus = order.status === orderStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, orderStatusFilter, searchQuery]);

  const sellerFullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim().toLowerCase();
  const sellerEmail = String(profile?.email || '').toLowerCase();
  const isInsiderManagedSeller = sellerFullName.includes('hatvoni') || sellerEmail.endsWith('@hatvoni.com');

  const updateItemDecisions = useCallback(async (updates) => {
    if (!updates.length || isUpdating || isInsiderManagedSeller || !user?.id) return;

    // Only process items that are still pending — never overwrite an existing decision
    const pendingUpdates = updates.filter(({ item }) => (item.seller_decision || 'pending') === 'pending');
    if (!pendingUpdates.length) return;

    setIsUpdating(true);
    try {
      const payload = pendingUpdates.map(({ item, decision, reason }) => ({
        order_item_id: item.source_order_item_id,
        product_key: item.product_key,
        seller_id: user.id,
        decision,
        decision_reason: decision === 'rejected' ? reason : null,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from('seller_order_item_decisions')
        .upsert(payload, { onConflict: 'order_item_id,product_key,seller_id' });

      if (upsertError) throw upsertError;

      setDecisionReasons((prev) => {
        const next = { ...prev };
        pendingUpdates.forEach(({ item }) => {
          delete next[getDecisionKey(item)];
        });
        return next;
      });

      setDecisionErrors((prev) => {
        const next = { ...prev };
        pendingUpdates.forEach(({ item }) => {
          delete next[getDecisionKey(item)];
        });
        return next;
      });

      setRejectingItemKey((prev) => {
        const updatedKeys = new Set(pendingUpdates.map(({ item }) => getDecisionKey(item)));
        return updatedKeys.has(prev) ? '' : prev;
      });

      // Notify Insider for every decision (approve or reject) so website_order_item_approvals stays in sync
      const notifyErrors = [];
      await Promise.all(pendingUpdates.map(async ({ item, decision: itemDecision, reason }) => {
        const { error: notifyError } = await supabase.functions.invoke('notify-seller-approved', {
          body: {
            order_id: item.order_id,
            product_name: item.product_name,
            decision: itemDecision,
            ...(itemDecision === 'rejected' && reason ? { rejection_reason: reason } : {}),
          },
        });

        if (notifyError) {
          notifyErrors.push(notifyError.message || 'notify-seller-approved failed');
        }
      }));

      if (notifyErrors.length > 0) {
        console.warn('Insider sync warning:', notifyErrors[0]);
      }

      await fetchSellerOrders();
    } catch (error) {
      console.error('Error updating seller item decisions:', error);
      alert('Failed to update item decision: ' + (error.message || 'Unknown error'));
    } finally {
      setIsUpdating(false);
    }
  }, [fetchSellerOrders, isInsiderManagedSeller, isUpdating, user?.id]);

  const handleApproveItem = useCallback((item) => {
    const itemKey = getDecisionKey(item);
    if (rejectingItemKey === itemKey) {
      setRejectingItemKey('');
    }
    updateItemDecisions([{ item, decision: 'approved' }]);
  }, [rejectingItemKey, updateItemDecisions]);

  const beginRejectItem = useCallback((item) => {
    const itemKey = getDecisionKey(item);
    setRejectingItemKey(itemKey);
    setDecisionErrors((prev) => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
  }, []);

  const handleRejectItem = useCallback((item) => {
    const itemKey = getDecisionKey(item);
    const reason = (decisionReasons[itemKey] || '').trim();
    if (!reason) {
      setDecisionErrors((prev) => ({
        ...prev,
        [itemKey]: 'Please select a rejection reason before rejecting this item.',
      }));
      return;
    }

    setDecisionErrors((prev) => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });

    updateItemDecisions([{ item, decision: 'rejected', reason }]);
  }, [decisionReasons, updateItemDecisions]);

  const openEdit = (product) => {
    setEditing({
      id: product.id,
      name: product.name || '',
      price: product.price || '',
      stock_quantity: product.stock_quantity || 0,
      status: product.status || (product.is_active ? 'active' : 'inactive'),
      image_url: product.image_url || '',
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editing?.id) return;

    setSaving(true);
    try {
      const payload = {
        price: Number(editing.price || 0),
        stock_quantity: Number(editing.stock_quantity || 0),
        status: editing.status === 'active' ? 'active' : 'inactive',
        is_active: editing.status === 'active',
        image_url: editing.image_url || null,
      };

      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', editing.id)
        .eq('seller_id', user.id);

      if (error) throw error;
      setEditing(null);
      await fetchSellerProducts();
    } catch (error) {
      alert('Error saving product: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

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

  if (!isSeller && !isAdmin) return null;

  return (
    <div className="min-h-screen bg-surface pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-8">
          <h1 className="font-brand text-4xl md:text-5xl text-primary tracking-tight">Seller Panel</h1>
          <p className="text-on-surface-variant mt-2 font-body">
            Manage products and orders assigned to your seller account.
          </p>
          <p className="text-sm text-on-surface-variant mt-1 font-body">
            Signed in as: {(profile?.first_name || profile?.last_name) ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() : (profile?.email || user?.email)}
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard label="Assigned Products" value={stats.total} icon="inventory_2" color="bg-primary" />
          <StatCard label="Active" value={stats.active} icon="check_circle" color="bg-green-600" />
          <StatCard label="Inactive" value={stats.inactive} icon="pause_circle" color="bg-red-600" />
        </div>

        <div className="bg-surface-container-low rounded-2xl overflow-hidden">
          <div className="border-b border-outline-variant/30">
            <nav className="flex overflow-x-auto">
              <button
                onClick={() => { setActiveTab('orders'); setSearchQuery(''); setOrderStatusFilter('all'); }}
                className={`flex items-center gap-2 px-6 py-4 font-body font-semibold text-sm whitespace-nowrap border-b-2 transition-all ${
                  activeTab === 'orders'
                    ? 'border-secondary text-secondary'
                    : 'border-transparent text-on-surface-variant hover:text-primary hover:border-outline-variant'
                }`}
              >
                <span className="material-symbols-outlined text-lg">receipt_long</span>
                Orders
              </button>
              <button
                onClick={() => { setActiveTab('products'); setSearchQuery(''); setStatusFilter('all'); }}
                className={`flex items-center gap-2 px-6 py-4 font-body font-semibold text-sm whitespace-nowrap border-b-2 transition-all ${
                  activeTab === 'products'
                    ? 'border-secondary text-secondary'
                    : 'border-transparent text-on-surface-variant hover:text-primary hover:border-outline-variant'
                }`}
              >
                <span className="material-symbols-outlined text-lg">inventory_2</span>
                Products
              </button>
            </nav>
          </div>

          <div className="p-6 border-b border-outline-variant/30 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-80">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
              <input
                type="text"
                placeholder={activeTab === 'orders' ? 'Search orders or items...' : 'Search your products...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent w-full font-body text-sm"
              />
            </div>

            {activeTab === 'products' ? (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body text-sm"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            ) : (
              <select
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
                className="px-4 py-2.5 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body text-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
          </div>

          <div className="p-6">
            {activeTab === 'products' && dataLoading ? (
              <div className="flex items-center justify-center py-16">
                <span className="material-symbols-outlined animate-spin text-secondary text-3xl">progress_activity</span>
              </div>
            ) : activeTab === 'products' && filteredProducts.length === 0 ? (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">inventory</span>
                <p className="mt-4 text-on-surface-variant font-body">No products assigned yet.</p>
                <p className="text-xs text-on-surface-variant mt-1">Ask admin to assign products to your seller account.</p>
              </div>
            ) : activeTab === 'orders' && ordersLoading ? (
              <div className="flex items-center justify-center py-16">
                <span className="material-symbols-outlined animate-spin text-secondary text-3xl">progress_activity</span>
              </div>
            ) : activeTab === 'orders' && filteredOrders.length === 0 ? (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-6xl text-on-surface-variant/30">receipt_long</span>
                <p className="mt-4 text-on-surface-variant font-body">No orders found for your products.</p>
                <p className="text-xs text-on-surface-variant mt-1">Only orders containing your assigned products are shown here.</p>
              </div>
            ) : (
              activeTab === 'products' ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b border-outline-variant/30">
                        <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Key</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Price</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Stock</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {filteredProducts.map((product) => (
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
                                <p className="text-xs text-on-surface-variant">{product.category || 'Uncategorized'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-xs font-mono text-on-surface-variant">{product.key || product.external_product_id || 'N/A'}</td>
                          <td className="px-4 py-4 text-sm font-semibold text-primary">₹{Number(product.price || 0).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-4 text-sm text-on-surface">{product.stock_quantity || 0}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                              product.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${product.is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                              {product.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEdit(product)}
                                className="p-2 rounded-lg hover:bg-primary-container/50 text-primary transition-colors"
                                title="Edit"
                              >
                                <span className="material-symbols-outlined text-lg">edit</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((order) => {
                    const customerName = `${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim() || 'N/A';

                    return (
                      <div key={order.id} className="rounded-2xl border border-outline-variant/30 bg-surface p-5">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <h3 className="font-body font-semibold text-primary">Order #{order.id.slice(0, 8)}</h3>
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${orderStatusColors[order.status] || orderStatusColors.pending}`}>
                                {order.status}
                              </span>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-container/40 text-primary">
                                {order.seller_items.length} item{order.seller_items.length === 1 ? '' : 's'}
                              </span>
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-surface-container text-on-surface-variant">
                                {order.seller_decision_summary?.pending || 0} pending
                              </span>
                            </div>
                            <p className="text-sm text-on-surface-variant mt-2">Customer: {customerName} • {order.profiles?.email || 'N/A'}</p>
                            <p className="text-xs text-on-surface-variant mt-1">Placed on {new Date(order.created_at).toLocaleDateString()}</p>
                            <p className="text-xs text-on-surface-variant mt-1">
                              {order.seller_decision_summary?.approved || 0} approved, {order.seller_decision_summary?.rejected || 0} rejected
                            </p>
                          </div>
                          <div className="text-left lg:text-right">
                            <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">Seller subtotal</p>
                            <p className="text-2xl font-brand text-primary">₹{Number(order.seller_subtotal || 0).toLocaleString('en-IN')}</p>
                            <button
                              onClick={() => navigate(`/seller/orders/${order.id}`)}
                              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-container/50 text-primary text-xs font-semibold hover:bg-primary-container transition-colors"
                            >
                              <span className="material-symbols-outlined text-sm">open_in_new</span>
                              View details
                            </button>
                          </div>
                        </div>

                        <div className="mt-5 overflow-x-auto">
                          <table className="min-w-full">
                            <thead>
                              <tr className="border-b border-outline-variant/20">
                                <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Product</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Key</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Qty</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Price</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Line Total</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Decision</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Reason</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/20">
                              {order.seller_items.map((item) => (
                                <tr key={item.id}>
                                  <td className="px-3 py-3 text-sm text-primary font-medium">{item.product_name || 'Product'}</td>
                                  <td className="px-3 py-3 text-xs font-mono text-on-surface-variant">{item.product_key || 'N/A'}</td>
                                  <td className="px-3 py-3 text-sm text-on-surface-variant">{item.quantity}</td>
                                  <td className="px-3 py-3 text-sm text-on-surface-variant">₹{Number(item.unit_price || 0).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-3 text-sm font-semibold text-primary">₹{Number(item.line_total || 0).toLocaleString('en-IN')}</td>
                                  <td className="px-3 py-3">
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${decisionColors[item.seller_decision] || decisionColors.pending}`}>
                                      {item.seller_decision || 'pending'}
                                    </span>
                                    {item.seller_decided_at && (
                                      <p className="text-[10px] text-on-surface-variant mt-1">{new Date(item.seller_decided_at).toLocaleString('en-IN')}</p>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-sm text-on-surface-variant">
                                    {item.seller_decision === 'rejected'
                                      ? item.seller_decision_reason
                                      : (rejectingItemKey === getDecisionKey(item)
                                        ? (decisionReasons[getDecisionKey(item)] || '—')
                                        : '—')}
                                  </td>
                                  <td className="px-3 py-3">
                                    {!isInsiderManagedSeller && item.seller_decision === 'pending' ? (
                                      <div className="flex flex-col gap-2 min-w-[220px]">
                                        {rejectingItemKey === getDecisionKey(item) && (
                                          <>
                                            <select
                                              value={decisionReasons[getDecisionKey(item)] || ''}
                                              onChange={(e) => {
                                                const itemKey = getDecisionKey(item);
                                                const value = e.target.value;
                                                setDecisionReasons((prev) => ({ ...prev, [itemKey]: value }));
                                                if (value) {
                                                  setDecisionErrors((prev) => {
                                                    const next = { ...prev };
                                                    delete next[itemKey];
                                                    return next;
                                                  });
                                                }
                                              }}
                                              className="px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface focus:ring-2 focus:ring-secondary focus:border-transparent"
                                              disabled={isUpdating}
                                            >
                                              <option value="">Select rejection reason</option>
                                              {rejectionReasons.map((reason) => (
                                                <option key={reason.value} value={reason.label}>{reason.label}</option>
                                              ))}
                                            </select>
                                            {decisionErrors[getDecisionKey(item)] && (
                                              <p className="text-xs text-red-700 font-medium">{decisionErrors[getDecisionKey(item)]}</p>
                                            )}
                                          </>
                                        )}
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => handleApproveItem(item)}
                                            disabled={isUpdating}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                                          >
                                            <span className="material-symbols-outlined text-sm">check</span>
                                            Approve
                                          </button>
                                          <button
                                            onClick={() => {
                                              if (rejectingItemKey === getDecisionKey(item)) {
                                                handleRejectItem(item);
                                                return;
                                              }
                                              beginRejectItem(item);
                                            }}
                                            disabled={isUpdating}
                                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                                          >
                                            <span className="material-symbols-outlined text-sm">close</span>
                                            {rejectingItemKey === getDecisionKey(item) ? 'Confirm Reject' : 'Reject'}
                                          </button>
                                          {rejectingItemKey === getDecisionKey(item) && (
                                            <button
                                              onClick={() => {
                                                const itemKey = getDecisionKey(item);
                                                setRejectingItemKey('');
                                                setDecisionErrors((prev) => {
                                                  const next = { ...prev };
                                                  delete next[itemKey];
                                                  return next;
                                                });
                                              }}
                                              disabled={isUpdating}
                                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-outline-variant text-on-surface text-xs font-semibold hover:bg-surface-container transition-colors disabled:opacity-50"
                                            >
                                              Cancel
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-sm text-on-surface-variant">
                                        {isInsiderManagedSeller ? 'Managed in Insider' : 'Locked'}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-surface rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between">
              <h3 className="font-headline text-xl font-bold text-primary">Update Product</h3>
              <button onClick={() => setEditing(null)} className="p-2 rounded-full hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">close</span>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Product</label>
                <input
                  type="text"
                  value={editing.name}
                  readOnly
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface-container text-on-surface-variant font-body"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editing.price}
                    onChange={(e) => setEditing((prev) => ({ ...prev, price: e.target.value }))}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={editing.stock_quantity}
                    onChange={(e) => setEditing((prev) => ({ ...prev, stock_quantity: e.target.value }))}
                    className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Status</label>
                <select
                  value={editing.status}
                  onChange={(e) => setEditing((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Image URL</label>
                <input
                  type="url"
                  value={editing.image_url || ''}
                  onChange={(e) => setEditing((prev) => ({ ...prev, image_url: e.target.value }))}
                  className="w-full px-4 py-3 border border-outline-variant rounded-xl bg-surface focus:ring-2 focus:ring-secondary focus:border-transparent font-body"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-6 py-3 border border-outline-variant text-on-surface-variant rounded-xl font-body font-semibold hover:bg-surface-container transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-3 bg-secondary text-white rounded-xl font-body font-semibold hover:bg-secondary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="bg-surface-container-low rounded-2xl p-6 flex items-center gap-4">
      <div className={`${color} w-12 h-12 rounded-xl flex items-center justify-center`}>
        <span className="material-symbols-outlined text-white">{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-brand text-primary">{value}</p>
        <p className="text-sm text-on-surface-variant font-body">{label}</p>
      </div>
    </div>
  );
}
