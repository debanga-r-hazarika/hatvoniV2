import React from 'react';

export default function AdminFilters({ tab, filters, setFilters, sellerOptions }) {
  if (tab === 'dashboard' || tab === 'recipe-page') return null;

  const handleChange = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const clearFilters = () => {
    setFilters({
      category: 'all', status: 'all', stock: 'all', seller: 'all',
      orderStatus: 'all', paymentStatus: 'all', paymentMethod: 'all',
      dateRange: 'all', layoutType: 'all', syncStatus: 'all', role: 'all',
    });
  };

  const selectClass = "h-8 px-3 bg-white border border-[#bec9bf]/30 rounded-lg text-xs font-medium text-[#004a2b] focus:ring-2 focus:ring-[#004a2b]/10 focus:border-[#004a2b] outline-none transition-all cursor-pointer hover:border-[#004a2b]/30";
  const labelClass = "text-[9px] font-semibold uppercase tracking-wider text-[#3f4942]/50 mb-1 block";

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 rounded-xl bg-[#f5f4eb]/50 border border-[#bec9bf]/15">
      <div className="min-w-[100px]">
        <span className={labelClass}>Filters</span>
        <button
          onClick={clearFilters}
          className="h-8 px-3 rounded-lg text-[10px] font-semibold text-[#004a2b] hover:bg-[#004a2b]/5 transition-all border border-[#004a2b]/10"
        >
          Reset All
        </button>
      </div>

      {(tab === 'products' || tab === 'layout') && (
        <>
          <div>
            <span className={labelClass}>Category</span>
            <select value={filters.category} onChange={(e) => handleChange('category', e.target.value)} className={selectClass}>
              <option value="all">All</option>
              <option value="Pickles">Pickles</option>
              <option value="Spices">Spices</option>
              <option value="Tea">Tea</option>
              <option value="Handicrafts">Handicrafts</option>
              <option value="Superfoods">Superfoods</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Stock</span>
            <select value={filters.stock} onChange={(e) => handleChange('stock', e.target.value)} className={selectClass}>
              <option value="all">Any</option>
              <option value="instock">In Stock (&gt;10)</option>
              <option value="lowstock">Low (&lt;10)</option>
              <option value="outofstock">Out (0)</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Seller</span>
            <select value={filters.seller} onChange={(e) => handleChange('seller', e.target.value)} className={selectClass}>
              <option value="all">All</option>
              {sellerOptions.map(s => (
                <option key={s.id} value={s.id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.email}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelClass}>Visibility</span>
            <select value={filters.status} onChange={(e) => handleChange('status', e.target.value)} className={selectClass}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Hidden</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Type</span>
            <select value={filters.layoutType} onChange={(e) => handleChange('layoutType', e.target.value)} className={selectClass}>
              <option value="all">Any</option>
              <option value="individual">Individual</option>
              <option value="bundle">Bundle</option>
            </select>
          </div>
        </>
      )}

      {tab === 'orders' && (
        <>
          <div>
            <span className={labelClass}>Status</span>
            <select value={filters.orderStatus} onChange={(e) => handleChange('orderStatus', e.target.value)} className={selectClass}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Payment</span>
            <select value={filters.paymentStatus} onChange={(e) => handleChange('paymentStatus', e.target.value)} className={selectClass}>
              <option value="all">Any</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="captured">Captured</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Method</span>
            <select value={filters.paymentMethod} onChange={(e) => handleChange('paymentMethod', e.target.value)} className={selectClass}>
              <option value="all">Any</option>
              <option value="cod">C.O.D</option>
              <option value="razorpay">Razorpay</option>
              <option value="phonepe">PhonePe</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Period</span>
            <select value={filters.dateRange} onChange={(e) => handleChange('dateRange', e.target.value)} className={selectClass}>
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">Past 7 Days</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </>
      )}

      {tab === 'lots' && (
        <div>
          <span className={labelClass}>Status</span>
          <select value={filters.status} onChange={(e) => handleChange('status', e.target.value)} className={selectClass}>
            <option value="all">Any</option>
            <option value="active">Active</option>
            <option value="inactive">Archived</option>
          </select>
        </div>
      )}

      {tab === 'customers' && (
        <>
          <div>
            <span className={labelClass}>Status</span>
            <select value={filters.status} onChange={(e) => handleChange('status', e.target.value)} className={selectClass}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="banned">Banned</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Role</span>
            <select value={filters.role} onChange={(e) => handleChange('role', e.target.value)} className={selectClass}>
              <option value="all">All</option>
              <option value="admin">Admin</option>
              <option value="seller">Seller</option>
              <option value="customer">Customer</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
