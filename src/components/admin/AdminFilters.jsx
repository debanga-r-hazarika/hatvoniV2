import React from 'react';

export default function AdminFilters({ tab, filters, setFilters, sellerOptions, catalogProducts }) {
  if (tab === 'dashboard' || tab === 'recipe-page') return null;

  const handleChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      category: 'all',
      status: 'all',
      stock: 'all',
      seller: 'all',
      orderStatus: 'all',
      paymentStatus: 'all',
      paymentMethod: 'all',
      dateRange: 'all',
      layoutType: 'all',
      syncStatus: 'all'
    });
  };

  const selectClass = "px-4 py-2 bg-white border border-outline-variant/30 rounded-xl text-xs font-bold text-primary focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all cursor-pointer hover:bg-surface-container-low min-w-[140px]";
  const labelClass = "text-[9px] font-black uppercase tracking-widest text-on-surface-variant/50 mb-1.5 block ml-1";

  return (
    <div className="flex flex-wrap items-end gap-4 p-6 rounded-[2rem] bg-surface-container-low/30 border border-outline-variant/10 animate-in fade-in slide-in-from-top-2 duration-500">
      
      {/* Search & Generic */}
      <div className="flex-1 min-w-[200px]">
         <span className={labelClass}>Refine View</span>
         <div className="flex items-center gap-2">
            <button 
              onClick={clearFilters}
              className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-all border border-primary/10"
            >
              Reset All
            </button>
         </div>
      </div>

      {/* PRODUCT FILTERS */}
      {(tab === 'products' || tab === 'layout') && (
        <>
          <div>
            <span className={labelClass}>Category</span>
            <select value={filters.category} onChange={(e) => handleChange('category', e.target.value)} className={selectClass}>
              <option value="all">All Departments</option>
              <option value="Pickles">Pickles</option>
              <option value="Spices">Spices</option>
              <option value="Tea">Tea</option>
              <option value="Handicrafts">Handicrafts</option>
              <option value="Superfoods">Superfoods</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Inventory Level</span>
            <select value={filters.stock} onChange={(e) => handleChange('stock', e.target.value)} className={selectClass}>
              <option value="all">Any Status</option>
              <option value="instock">Healthy Stock (&gt;10)</option>
              <option value="lowstock">Low Stock (&lt;10)</option>
              <option value="outofstock">Out of Stock (0)</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Merchant Partner</span>
            <select value={filters.seller} onChange={(e) => handleChange('seller', e.target.value)} className={selectClass}>
              <option value="all">All Sellers</option>
              {sellerOptions.map(s => (
                <option key={s.id} value={s.id}>{`${s.first_name || ''} ${s.last_name || ''}`.trim() || s.email}</option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelClass}>Visibility</span>
            <select value={filters.status} onChange={(e) => handleChange('status', e.target.value)} className={selectClass}>
              <option value="all">Show All</option>
              <option value="active">Public (Visible)</option>
              <option value="inactive">Internal (Hidden)</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Listing Model</span>
            <select value={filters.layoutType} onChange={(e) => handleChange('layoutType', e.target.value)} className={selectClass}>
              <option value="all">Any Model</option>
              <option value="individual">Direct Retail</option>
              <option value="bundle">Bundle Component</option>
            </select>
          </div>
        </>
      )}

      {/* ORDER FILTERS */}
      {tab === 'orders' && (
        <>
          <div>
            <span className={labelClass}>Fulfillment State</span>
            <select value={filters.orderStatus} onChange={(e) => handleChange('orderStatus', e.target.value)} className={selectClass}>
              <option value="all">All Phases</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Financial Status</span>
            <select value={filters.paymentStatus} onChange={(e) => handleChange('paymentStatus', e.target.value)} className={selectClass}>
              <option value="all">Any Payment</option>
              <option value="paid">Settled (Paid)</option>
              <option value="pending">Awaiting (Pending)</option>
              <option value="failed">Declined (Failed)</option>
              <option value="captured">Captured</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Method</span>
            <select value={filters.paymentMethod} onChange={(e) => handleChange('paymentMethod', e.target.value)} className={selectClass}>
              <option value="all">Any Gateway</option>
              <option value="cod">Cash on Delivery</option>
              <option value="razorpay">Razorpay Online</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Chronology</span>
            <select value={filters.dateRange} onChange={(e) => handleChange('dateRange', e.target.value)} className={selectClass}>
              <option value="all">All Time</option>
              <option value="today">Created Today</option>
              <option value="week">Past 7 Days</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </>
      )}

      {/* LOT FILTERS */}
      {tab === 'lots' && (
        <>
          <div>
            <span className={labelClass}>Collection Status</span>
            <select value={filters.status} onChange={(e) => handleChange('status', e.target.value)} className={selectClass}>
              <option value="all">Any Collection</option>
              <option value="active">Active Packs</option>
              <option value="inactive">Archived Packs</option>
            </select>
          </div>
        </>
      )}

      {/* CUSTOMER FILTERS */}
      {tab === 'customers' && (
        <>
          <div>
            <span className={labelClass}>Security Status</span>
            <select value={filters.status} onChange={(e) => handleChange('status', e.target.value)} className={selectClass}>
              <option value="all">Everyone</option>
              <option value="active">Authorized</option>
              <option value="banned">Restricted</option>
            </select>
          </div>
          <div>
            <span className={labelClass}>Privilege Level</span>
            <select value={filters.role} onChange={(e) => handleChange('role', e.target.value)} className={selectClass}>
              <option value="all">All Roles</option>
              <option value="admin">Administrators</option>
              <option value="seller">Merchants</option>
              <option value="customer">Retail Clients</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}
