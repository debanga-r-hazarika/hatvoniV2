import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { buildSellerItemsForOrder, calculateSellerSubtotal } from '../lib/sellerOrderPricing';

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

const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const getDecisionKey = (item) => `${item.source_order_item_id}:${item.product_key}`;

export default function SellerOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isSeller, isAdmin, profile: currentSellerProfile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [sellerItems, setSellerItems] = useState([]);
  const [profile, setProfile] = useState(null);
  const [decisionReasons, setDecisionReasons] = useState({});
  const [decisionErrors, setDecisionErrors] = useState({});
  const [rejectingItemKey, setRejectingItemKey] = useState('');

  const fetchDetail = useCallback(async () => {
    if (!user?.id || !id) return;

    setLoading(true);
    setError('');

    try {
      const { data: sellerProducts, error: sellerProductsError } = await supabase
        .from('products')
        .select('key')
        .eq('seller_id', user.id);

      if (sellerProductsError) throw sellerProductsError;

      const sellerProductKeys = new Set((sellerProducts || []).map((row) => row.key).filter(Boolean));
      if (sellerProductKeys.size === 0) {
        setOrder(null);
        setSellerItems([]);
        return;
      }

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, user_id, status, total_amount, payment_method, payment_status, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();

      if (orderError) throw orderError;
      if (!orderData) throw new Error('Order not found');

      const { data: orderItemsData, error: orderItemsError } = await supabase
        .from('order_items')
        .select('id, order_id, lot_name, quantity, price, product_id, lot_snapshot, products(id, key, name)')
        .eq('order_id', id)
        .order('created_at', { ascending: true });

      if (orderItemsError) throw orderItemsError;

      const sellerLines = buildSellerItemsForOrder(orderItemsData || [], sellerProductKeys);
      if (sellerLines.length === 0) {
        throw new Error('This order has no items assigned to your seller account.');
      }

      const sellerLineKeys = sellerLines.map((item) => item.source_order_item_id).filter(Boolean);
      let decisionMap = {};

      if (sellerLineKeys.length > 0) {
        const { data: decisionsData, error: decisionsError } = await supabase
          .from('seller_order_item_decisions')
          .select('order_item_id, product_key, decision, decision_reason, decided_at')
          .eq('seller_id', user.id)
          .in('order_item_id', sellerLineKeys);

        if (decisionsError) throw decisionsError;

        decisionMap = (decisionsData || []).reduce((acc, decision) => {
          acc[`${decision.order_item_id}:${decision.product_key}`] = decision;
          return acc;
        }, {});
      }

      const sellerItemsWithDecisions = sellerLines.map((item) => {
        const decision = decisionMap[getDecisionKey(item)] || null;
        return {
          ...item,
          order_id: orderData.id,
          seller_decision: decision?.decision || 'pending',
          seller_decision_reason: decision?.decision_reason || '',
          seller_decided_at: decision?.decided_at || null,
        };
      });

      let customerProfile = null;
      if (orderData.user_id) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email, phone')
          .eq('id', orderData.user_id)
          .maybeSingle();

        if (!profileError) {
          customerProfile = profileData;
        }
      }

      setOrder(orderData);
      setSellerItems(sellerItemsWithDecisions);
      setProfile(customerProfile);
    } catch (err) {
      console.error('Error loading seller order detail:', err);
      setError(err.message || 'Unable to load seller order detail');
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    if (!isSeller && !isAdmin) {
      navigate('/');
      return;
    }

    fetchDetail();
  }, [authLoading, fetchDetail, isAdmin, isSeller, navigate, user]);

  const sellerFullName = `${currentSellerProfile?.first_name || ''} ${currentSellerProfile?.last_name || ''}`.trim().toLowerCase();
  const sellerEmail = String(currentSellerProfile?.email || '').toLowerCase();
  const isInsiderManagedSeller = sellerFullName.includes('hatvoni') || sellerEmail.endsWith('@hatvoni.com');

  const itemDecisionSummary = useMemo(() => {
    return sellerItems.reduce((acc, item) => {
      acc[item.seller_decision || 'pending'] = (acc[item.seller_decision || 'pending'] || 0) + 1;
      return acc;
    }, { pending: 0, approved: 0, rejected: 0 });
  }, [sellerItems]);

  const updateItemDecisions = useCallback(async (updates) => {
    if (!updates.length || isUpdating || isInsiderManagedSeller) return;

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

      await fetchDetail();
    } catch (err) {
      console.error('Error updating seller item decisions:', err);
      alert('Failed to update item decision: ' + (err.message || 'Unknown error'));
    } finally {
      setIsUpdating(false);
    }
  }, [fetchDetail, isInsiderManagedSeller, isUpdating, user?.id]);

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
    const reason = (decisionReasons[getDecisionKey(item)] || '').trim();
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

  const handleApproveAll = useCallback(() => {
    const pendingItems = sellerItems.filter((item) => (item.seller_decision || 'pending') === 'pending');
    if (pendingItems.length === 0) return;

    updateItemDecisions(pendingItems.map((item) => ({ item, decision: 'approved' })));
  }, [sellerItems, updateItemDecisions]);

  const sellerSubtotal = useMemo(() => calculateSellerSubtotal(sellerItems), [sellerItems]);
  const customerName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Customer';
  const pendingCount = itemDecisionSummary.pending || 0;
  const approvedCount = itemDecisionSummary.approved || 0;
  const rejectedCount = itemDecisionSummary.rejected || 0;

  if (loading) {
    return (
      <main className="pt-24 pb-20 min-h-[60vh] grid place-items-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-secondary">progress_activity</span>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="pt-28 pb-20 max-w-4xl mx-auto px-6 text-center">
        <span className="material-symbols-outlined text-6xl text-error">error</span>
        <h1 className="font-brand text-4xl text-primary mt-4">Order not available</h1>
        <p className="text-on-surface-variant mt-3">{error || 'You do not have permission to view this order.'}</p>
        <Link to="/seller">
          <button className="mt-8 bg-primary text-on-primary px-8 py-3 rounded-xl font-bold">Back to Seller Panel</button>
        </Link>
      </main>
    );
  }

  return (
    <main className="pb-16 md:pb-24 px-5 md:px-12 max-w-screen-xl mx-auto pt-28 md:pt-32">
      <header className="mb-8 md:mb-10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold tracking-[0.2em] text-secondary uppercase mb-2 block">Seller Order Detail</p>
            <h1 className="font-brand text-3xl md:text-5xl text-primary tracking-tight leading-none mb-3">#{order.id.slice(0, 8)}</h1>
            <p className="text-on-surface-variant text-sm md:text-base">Placed on {new Date(order.created_at).toLocaleString('en-IN')}</p>
            <p className="text-on-surface-variant text-sm mt-2">Customer: {customerName} {profile?.email ? `• ${profile.email}` : ''}</p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold capitalize ${orderStatusColors[order.status] || orderStatusColors.pending}`}>
              {order.status}
            </span>
            <div className="text-left md:text-right">
              <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">Customer paid (order total)</p>
              <p className="text-lg font-headline font-bold text-on-surface">{formatCurrency(order.total_amount)}</p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">Your payable share</p>
              <p className="text-2xl font-brand text-primary">{formatCurrency(sellerSubtotal)}</p>
            </div>
            {isInsiderManagedSeller ? (
              <div className="mt-2 px-3 py-2 rounded-lg bg-secondary-container/20 border border-secondary/30">
                <p className="text-xs text-on-surface-variant font-medium">Controlled from Insider App</p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">Hatvoni Heritage approvals and rejections are managed only in Insider</p>
              </div>
            ) : (
              <div className="mt-2 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/20">
                <p className="text-xs text-on-surface-variant font-medium">Item decisions are tracked separately</p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">
                  {pendingCount} pending, {approvedCount} approved, {rejectedCount} rejected
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/20">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div>
            <h2 className="font-headline text-xl text-primary">Your Items In This Order</h2>
            <p className="text-sm text-on-surface-variant mt-1">
              {isInsiderManagedSeller
                ? 'This seller account is Insider-managed. Approval and rejection are not available in this panel.'
                : 'Approve or reject each visible item separately. Rejections require a reason.'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-on-surface-variant">{sellerItems.length} line item{sellerItems.length === 1 ? '' : 's'}</span>
            {!isInsiderManagedSeller && (
              <button
                onClick={handleApproveAll}
                disabled={isUpdating || pendingCount === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">done_all</span>
                Approve All
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-outline-variant/30">
                <th className="px-3 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Product</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Key</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Qty</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Allocated Unit Price</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Line Total</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Decision</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Reason</th>
                <th className="px-3 py-3 text-left text-xs font-bold text-on-surface-variant uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {sellerItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3 text-sm text-primary font-medium">{item.product_name || 'Product'}</td>
                  <td className="px-3 py-3 text-xs font-mono text-on-surface-variant">{item.product_key || 'N/A'}</td>
                  <td className="px-3 py-3 text-sm text-on-surface">{item.quantity}</td>
                  <td className="px-3 py-3 text-sm text-on-surface">{formatCurrency(item.unit_price)}</td>
                  <td className="px-3 py-3 text-sm font-semibold text-primary">{formatCurrency(item.line_total)}</td>
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
                              <option value="">Select cancel reason</option>
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
                      <span className="text-sm text-on-surface-variant">{isInsiderManagedSeller ? 'Managed in Insider' : 'Locked'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-outline-variant/30">
                <td className="px-3 py-3" colSpan={4}>
                  <p className="text-right text-sm font-semibold text-on-surface-variant">Seller subtotal</p>
                </td>
                <td className="px-3 py-3 text-sm font-bold text-primary">{formatCurrency(sellerSubtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-xs text-on-surface-variant mt-4">
          Allocations above are proportional to what the customer actually paid for each lot item. This avoids inflated totals in multi-seller orders.
        </p>
      </section>

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          onClick={fetchDetail}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container transition-colors font-semibold text-sm"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          Refresh Decisions
        </button>
        <Link to="/seller" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container transition-colors font-semibold text-sm">
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Seller Panel
        </Link>
      </div>
    </main>
  );
}
