import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const COUPON_TYPES = ['FIXED', 'PERCENTAGE', 'FREE_SHIPPING', 'BOGO'];
const STATUS_OPTIONS = ['active', 'inactive', 'scheduled', 'expired'];

export default function AdminCoupons() {
  const navigate = useNavigate();
  const { user, profile, isAdmin, hasModule } = useAuth();

  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [showStats, setShowStats] = useState(false);

  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    description: '',
    type: 'FIXED',
    status: 'active',
    discount_amount: '',
    discount_percentage: '',
    max_discount_amount: '',
    bogo_buy_qty: 1,
    bogo_get_qty: 1,
    minimum_cart_value: '',
    valid_from: '',
    valid_till: '',
    max_uses: '',
    max_uses_per_user: 1,
    is_stackable: false,
  });

  // Check admin or employee with coupons module
  useEffect(() => {
    if (profile && !isAdmin && !hasModule('coupons')) {
      navigate('/');
    }
  }, [profile, isAdmin, hasModule, navigate]);

  // Load coupons
  useEffect(() => {
    if (!user) return;
    loadCoupons();
  }, [user]);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setCoupons(data || []);
    } catch (err) {
      console.error('Error loading coupons:', err);
      setError('Failed to load coupons');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleReset = () => {
    setFormData({
      code: '',
      display_name: '',
      description: '',
      type: 'FIXED',
      status: 'active',
      discount_amount: '',
      discount_percentage: '',
      max_discount_amount: '',
      bogo_buy_qty: 1,
      bogo_get_qty: 1,
      minimum_cart_value: '',
      valid_from: '',
      valid_till: '',
      max_uses: '',
      max_uses_per_user: 1,
      is_stackable: false,
    });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (formData.type === 'FREE_SHIPPING' && formData.status === 'active') {
        const { data: existingFreeShipping, error: freeShippingErr } = await supabase
          .from('coupons')
          .select('id, code')
          .eq('type', 'FREE_SHIPPING')
          .eq('status', 'active');

        if (freeShippingErr) throw freeShippingErr;

        const conflicting = (existingFreeShipping || []).some((coupon) => coupon.id !== editingId);
        if (conflicting) {
          setError('Only one active free shipping coupon is allowed. Deactivate the existing one first.');
          return;
        }
      }

      const payload = {
        code: formData.code.toUpperCase(),
        display_name: formData.display_name,
        description: formData.description,
        type: formData.type,
        status: formData.status,
        discount_amount: formData.discount_amount ? parseFloat(formData.discount_amount) : null,
        discount_percentage: formData.discount_percentage ? parseFloat(formData.discount_percentage) : null,
        max_discount_amount: formData.max_discount_amount ? parseFloat(formData.max_discount_amount) : null,
        bogo_buy_qty: parseInt(formData.bogo_buy_qty),
        bogo_get_qty: parseInt(formData.bogo_get_qty),
        minimum_cart_value: formData.minimum_cart_value ? parseFloat(formData.minimum_cart_value) : null,
        valid_from: formData.valid_from || null,
        valid_till: formData.valid_till || null,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
        max_uses_per_user: parseInt(formData.max_uses_per_user),
        is_stackable: formData.is_stackable,
      };

      if (editingId) {
        const { error: err } = await supabase
          .from('coupons')
          .update(payload)
          .eq('id', editingId);

        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('coupons').insert([payload]);

        if (err) throw err;
      }

      setShowForm(false);
      handleReset();
      await loadCoupons();
    } catch (err) {
      console.error('Error saving coupon:', err);
      setError(err.message || 'Failed to save coupon');
    }
  };

  const handleEdit = (coupon) => {
    setFormData({
      code: coupon.code,
      display_name: coupon.display_name || '',
      description: coupon.description || '',
      type: coupon.type,
      status: coupon.status,
      discount_amount: coupon.discount_amount || '',
      discount_percentage: coupon.discount_percentage || '',
      max_discount_amount: coupon.max_discount_amount || '',
      bogo_buy_qty: coupon.bogo_buy_qty || 1,
      bogo_get_qty: coupon.bogo_get_qty || 1,
      minimum_cart_value: coupon.minimum_cart_value || '',
      valid_from: coupon.valid_from ? coupon.valid_from.split('T')[0] : '',
      valid_till: coupon.valid_till ? coupon.valid_till.split('T')[0] : '',
      max_uses: coupon.max_uses || '',
      max_uses_per_user: coupon.max_uses_per_user || 1,
      is_stackable: coupon.is_stackable || false,
    });
    setEditingId(coupon.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return;

    try {
      const { error: err } = await supabase.from('coupons').delete().eq('id', id);

      if (err) throw err;
      await loadCoupons();
    } catch (err) {
      console.error('Error deleting coupon:', err);
      setError('Failed to delete coupon');
    }
  };

  const handleViewStats = async (coupon) => {
    try {
      const { data: usageData } = await supabase
        .from('coupon_usage')
        .select('id, user_id, used_at, discount_applied')
        .eq('coupon_id', coupon.id);

      setSelectedCoupon({
        ...coupon,
        usage: usageData || [],
        total_uses: usageData?.length || 0,
        total_discount: usageData?.reduce((sum, u) => sum + (u.discount_applied || 0), 0) || 0,
      });
      setShowStats(true);
    } catch (err) {
      console.error('Error loading stats:', err);
      setError('Failed to load statistics');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <span className="material-symbols-outlined animate-spin text-4xl">progress_activity</span>
      </div>
    );
  }

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <p className="text-red-600 font-bold">Access Denied</p>
          <p className="text-gray-600">You do not have admin access</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-32 md:pt-40 pb-20">
      <header className="bg-surface-container-low sticky top-0 z-40 py-4 px-6 shadow-sm">
        <h1 className="font-brand text-2xl md:text-3xl text-primary">Coupon Management</h1>
        <p className="text-sm text-outline mt-1">Create and manage coupons and offers</p>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}

        {/* Create Button */}
        <div className="mb-6">
          <button
            onClick={() => {
              if (showForm) {
                handleReset();
              }
              setShowForm(!showForm);
            }}
            className="px-6 py-2 bg-primary text-on-primary font-semibold rounded-lg hover:bg-primary/90 transition"
          >
            {showForm ? '✕ Cancel' : '+ Create New Coupon'}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-surface-container-low rounded-xl p-6 md:p-8 mb-8">
            <h2 className="font-headline text-xl font-bold mb-6 text-primary">
              {editingId ? 'Edit Coupon' : 'Create New Coupon'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Code */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Coupon Code *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => handleFormChange('code', e.target.value.toUpperCase())}
                    placeholder="SUMMER20"
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                    disabled={!!editingId}
                  />
                </div>

                {/* Display Name */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Display Name</label>
                  <input
                    type="text"
                    value={formData.display_name}
                    onChange={(e) => handleFormChange('display_name', e.target.value)}
                    placeholder="Summer Sale 20% Off"
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Coupon Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleFormChange('type', e.target.value)}
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {COUPON_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleFormChange('status', e.target.value)}
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Discount Amount (for FIXED and BOGO) */}
                {['FIXED', 'BOGO'].includes(formData.type) && (
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-on-surface">Discount Amount (Rs) *</label>
                    <input
                      type="number"
                      value={formData.discount_amount}
                      onChange={(e) => handleFormChange('discount_amount', e.target.value)}
                      placeholder="100"
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}

                {/* Discount Percentage (for PERCENTAGE) */}
                {formData.type === 'PERCENTAGE' && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-on-surface">Discount Percentage (%) *</label>
                      <input
                        type="number"
                        value={formData.discount_percentage}
                        onChange={(e) => handleFormChange('discount_percentage', e.target.value)}
                        placeholder="20"
                        step="0.01"
                        min="0"
                        max="100"
                        className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-on-surface">Max Discount Amount (Rs)</label>
                      <input
                        type="number"
                        value={formData.max_discount_amount}
                        onChange={(e) => handleFormChange('max_discount_amount', e.target.value)}
                        placeholder="500"
                        step="0.01"
                        min="0"
                        className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </>
                )}

                {/* Minimum Cart Value */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Minimum Cart Value (Rs)</label>
                  <input
                    type="number"
                    value={formData.minimum_cart_value}
                    onChange={(e) => handleFormChange('minimum_cart_value', e.target.value)}
                    placeholder="500"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Valid From */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Valid From</label>
                  <input
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => handleFormChange('valid_from', e.target.value)}
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Valid Till */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Valid Till</label>
                  <input
                    type="date"
                    value={formData.valid_till}
                    onChange={(e) => handleFormChange('valid_till', e.target.value)}
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Max Uses */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Max Uses (Global)</label>
                  <input
                    type="number"
                    value={formData.max_uses}
                    onChange={(e) => handleFormChange('max_uses', e.target.value)}
                    placeholder="Leave empty for unlimited"
                    min="1"
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Max Uses Per User */}
                <div>
                  <label className="block text-sm font-semibold mb-2 text-on-surface">Max Uses Per User</label>
                  <input
                    type="number"
                    value={formData.max_uses_per_user}
                    onChange={(e) => handleFormChange('max_uses_per_user', e.target.value)}
                    min="1"
                    className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* BOGO Fields */}
                {formData.type === 'BOGO' && (
                  <>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-on-surface">Buy Quantity</label>
                      <input
                        type="number"
                        value={formData.bogo_buy_qty}
                        onChange={(e) => handleFormChange('bogo_buy_qty', e.target.value)}
                        min="1"
                        className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-2 text-on-surface">Get Quantity</label>
                      <input
                        type="number"
                        value={formData.bogo_get_qty}
                        onChange={(e) => handleFormChange('bogo_get_qty', e.target.value)}
                        min="1"
                        className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold mb-2 text-on-surface">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Describe this coupon offer..."
                  rows="3"
                  className="w-full px-3 py-2 border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Stackable */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="stackable"
                  checked={formData.is_stackable}
                  onChange={(e) => handleFormChange('is_stackable', e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="stackable" className="text-sm font-medium text-on-surface">
                  Allow combining with other coupons
                </label>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary text-on-primary font-semibold rounded-lg hover:bg-primary/90 transition"
                >
                  {editingId ? 'Update Coupon' : 'Create Coupon'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-6 py-2 bg-outline text-on-surface font-semibold rounded-lg hover:bg-outline/90 transition"
                >
                  Reset
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Coupons List */}
        <div className="space-y-4">
          <h2 className="font-headline text-xl font-bold text-primary">All Coupons ({coupons.length})</h2>

          {coupons.length === 0 ? (
            <div className="p-8 text-center bg-surface-container-low rounded-lg">
              <p className="text-outline">No coupons created yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-outline-variant/30">
                    <th className="text-left py-3 px-4 font-semibold text-on-surface">Code</th>
                    <th className="text-left py-3 px-4 font-semibold text-on-surface">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-on-surface">Value</th>
                    <th className="text-left py-3 px-4 font-semibold text-on-surface">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-on-surface">Uses</th>
                    <th className="text-center py-3 px-4 font-semibold text-on-surface">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((coupon) => (
                    <tr key={coupon.id} className="border-b border-outline-variant/20 hover:bg-surface-container-low">
                      <td className="py-3 px-4 font-semibold text-on-surface">{coupon.code}</td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-1 bg-primary-fixed-dim/20 text-primary text-xs font-semibold rounded">
                          {coupon.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-on-surface">
                        {coupon.type === 'FIXED' && `Rs. ${coupon.discount_amount}`}
                        {coupon.type === 'PERCENTAGE' && `${coupon.discount_percentage}%`}
                        {coupon.type === 'FREE_SHIPPING' && 'Free Shipping'}
                        {coupon.type === 'BOGO' && `Buy ${coupon.bogo_buy_qty} Get ${coupon.bogo_get_qty}`}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-1 text-xs font-semibold rounded ${
                            coupon.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : coupon.status === 'inactive'
                                ? 'bg-gray-100 text-gray-800'
                                : coupon.status === 'scheduled'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {coupon.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-on-surface">
                        {coupon.current_uses}/{coupon.max_uses || '∞'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleViewStats(coupon)}
                          className="text-blue-600 hover:underline text-xs mr-2"
                        >
                          Stats
                        </button>
                        <button
                          onClick={() => handleEdit(coupon)}
                          className="text-primary hover:underline text-xs mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(coupon.id)}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Stats Modal */}
      {showStats && selectedCoupon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="sticky top-0 bg-surface-container-low p-6 border-b flex justify-between items-center">
              <h3 className="font-headline text-lg font-bold text-primary">
                Coupon: {selectedCoupon.code}
              </h3>
              <button
                onClick={() => setShowStats(false)}
                className="text-outline text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-600 font-semibold uppercase">Total Uses</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{selectedCoupon.total_uses}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-xs text-green-600 font-semibold uppercase">Total Discount</p>
                  <p className="text-2xl font-bold text-green-900 mt-1">Rs. {selectedCoupon.total_discount.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg">
                  <p className="text-xs text-purple-600 font-semibold uppercase">Avg Discount</p>
                  <p className="text-2xl font-bold text-purple-900 mt-1">
                    Rs. {(selectedCoupon.total_discount / Math.max(selectedCoupon.total_uses, 1)).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Usage Table */}
              {selectedCoupon.usage.length > 0 ? (
                <div>
                  <h4 className="font-semibold mb-3 text-on-surface">Recent Usage</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-outline-variant/30">
                          <th className="text-left py-2 px-3 font-semibold">Date</th>
                          <th className="text-left py-2 px-3 font-semibold">Discount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCoupon.usage.map((u) => (
                          <tr key={u.id} className="border-b border-outline-variant/20">
                            <td className="py-2 px-3">
                              {new Date(u.used_at).toLocaleDateString()} - {new Date(u.used_at).toLocaleTimeString()}
                            </td>
                            <td className="py-2 px-3 font-semibold">Rs. {u.discount_applied.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-outline text-sm">No usage records yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
