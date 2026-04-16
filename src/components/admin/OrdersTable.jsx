import React, { useState } from 'react';

export default function OrdersTable({ data, sellerOptions }) {
  const [expandedOrders, setExpandedOrders] = useState({});
  const [paymentQuickFilter, setPaymentQuickFilter] = useState('all');

  const statusColors = {
    pending: 'bg-slate-100 text-slate-800 border-slate-200',
    processing: 'bg-amber-100 text-amber-800 border-amber-200',
    shipped: 'bg-blue-100 text-blue-800 border-blue-200',
    delivered: 'bg-green-100 text-green-800 border-green-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200',
  };
  
  const paymentStatusColors = {
    paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    captured: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    authorized: 'bg-sky-100 text-sky-800 border-sky-200',
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    initiated: 'bg-amber-100 text-amber-800 border-amber-200',
    failed: 'bg-red-100 text-red-800 border-red-200',
    refunded: 'bg-slate-200 text-slate-800 border-slate-300',
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
    visibleOrders.forEach((order) => { next[order.id] = true; });
    setExpandedOrders((prev) => ({ ...prev, ...next }));
  };

  const collapseAll = () => {
    const next = {};
    visibleOrders.forEach((order) => { next[order.id] = false; });
    setExpandedOrders((prev) => ({ ...prev, ...next }));
  };

  const copyValue = async (value) => {
    if (!value || value === 'N/A') return;
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      // Clipboard fallback
    }
  };

  const DetailRow = ({ label, value, mono = false }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-outline-variant/5 last:border-b-0">
      <span className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-black">{label}</span>
      <span className={`text-[13px] text-on-surface text-right font-medium ${mono ? 'font-mono text-[11px] break-all' : ''}`}>{value || '—'}</span>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Quick Ops Bar */}
      <div className="rounded-[2rem] border border-outline-variant/30 bg-surface-container-low p-4 flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-on-surface-variant/60 font-black ml-2">Payment Filter</span>
          <div className="flex bg-surface rounded-full p-1 border border-outline-variant/20 shadow-inner">
             {[{ id: 'all', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Pending' }, { id: 'failed', label: 'Failed' }].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setPaymentQuickFilter(filter.id)}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${paymentQuickFilter === filter.id ? 'bg-primary text-white shadow-md' : 'text-on-surface-variant hover:bg-surface-container'}`}
                >
                  {filter.label}
                </button>
             ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/30 text-primary text-[11px] font-black uppercase tracking-widest hover:bg-white transition-all active:scale-95 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">unfold_more</span>
            Expand All
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-outline-variant/30 text-primary text-[11px] font-black uppercase tracking-widest hover:bg-white transition-all active:scale-95 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">unfold_less</span>
            Collapse All
          </button>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {visibleOrders.length === 0 ? (
          <div className="text-center py-20 bg-surface-container-lowest rounded-3xl border border-outline-variant/20 italic text-on-surface-variant">
             No orders matching current filter criteria.
          </div>
        ) : visibleOrders.map((order) => {
          const customerName = order.profiles?.first_name || order.profiles?.last_name
            ? `${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim()
            : 'Unregistered User';

          return (
            <div key={order.id} className={`rounded-[2rem] border transition-all duration-500 overflow-hidden ${expandedOrders[order.id] ? 'bg-white border-primary/30 shadow-xl' : 'bg-surface-container-lowest border-outline-variant/20 hover:border-primary/20 shadow-sm'}`}>
              <div className="p-6">
                <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap mb-3">
                      <div className="px-3 py-1 bg-primary/5 rounded-full border border-primary/10 flex items-center gap-2">
                         <span className="text-[10px] font-black tracking-widest text-primary uppercase">Order ID</span>
                         <span className="font-mono text-sm text-primary font-black">#{order.id.slice(0, 8)}</span>
                      </div>
                      <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusColors[order.status] || statusColors.pending}`}>
                        <span className={`w-2 h-2 rounded-full ${order.status === 'delivered' ? 'bg-green-500' : 'bg-current opacity-40 animate-pulse'}`} />
                        {order.status}
                      </span>
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-50 text-slate-600 border border-slate-200">
                        <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                        {(order.order_items || []).length} SKU Items
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-4">
                       <div className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-primary font-brand font-bold border border-outline-variant/10 shadow-inner">
                          {customerName[0]}
                       </div>
                       <div>
                          <p className="text-sm font-bold text-primary leading-none mb-1">Customer: {customerName}</p>
                          <p className="text-xs text-on-surface-variant opacity-70 leading-none">{order.profiles?.email || 'N/A'}</p>
                       </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-start xl:items-end gap-2">
                    <div className="bg-primary/5 px-6 py-4 rounded-[1.75rem] border border-primary/10 text-right min-w-[200px]">
                       <p className="text-[10px] uppercase tracking-[0.2em] text-primary/60 font-black mb-1">Gross Transaction</p>
                       <p className="text-4xl font-brand font-bold text-primary tracking-tighter leading-none">{formatCurrency(order.total_amount)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleOrder(order.id)}
                      className={`mt-2 inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm border ${expandedOrders[order.id] ? 'bg-primary text-white border-primary' : 'bg-surface border-outline-variant/30 text-on-surface hover:bg-surface-container'}`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{expandedOrders[order.id] ? 'expand_less' : 'expand_more'}</span>
                      {expandedOrders[order.id] ? 'Hide Full Ledger' : 'Review Full Data'}
                    </button>
                  </div>
                </div>

                {/* Badges Row */}
                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-outline-variant/5 pt-6">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${paymentStatusColors[String(order.payment_status || 'pending').toLowerCase()] || paymentStatusColors.pending}`}>
                     <span className="material-symbols-outlined text-[16px]">verified_user</span>
                     Payment: {String(order.payment_status || 'pending').toUpperCase()}
                  </div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-violet-50 text-violet-700 border border-violet-100 shadow-sm">
                    <span className="material-symbols-outlined text-[16px]">toll</span>
                    {order.payment_method || 'C.O.D'}
                  </div>
                  {order.payment_gateway && (
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm">
                      <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                      {order.payment_gateway}
                    </div>
                  )}
                  <div className="flex-1"></div>
                  <span className="text-[11px] text-on-surface-variant font-bold flex items-center gap-2">
                     <span className="material-symbols-outlined text-[16px] opacity-40">schedule</span>
                     {formatDateTime(order.created_at)}
                  </span>
                </div>
              </div>

              {expandedOrders[order.id] && (
                <div className="px-6 pb-8 animate-in slide-in-from-top-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {/* Shipping info */}
                    <div className="rounded-[2rem] border border-outline-variant/10 p-6 bg-surface-container-low shadow-inner">
                      <div className="flex items-center gap-2 mb-4 border-b border-outline-variant/5 pb-3">
                         <span className="material-symbols-outlined text-primary">local_shipping</span>
                         <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-on-surface-variant">Logistics Footprint</h4>
                      </div>
                      <div className="space-y-4">
                         <div>
                            <p className="text-sm text-primary font-bold">
                              {order.shipping_address?.first_name || ''} {order.shipping_address?.last_name || ''}
                            </p>
                            <p className="text-xs text-on-surface-variant leading-relaxed mt-1">{order.shipping_address?.address_line1 || 'N/A'}</p>
                            {order.shipping_address?.address_line2 && <p className="text-xs text-on-surface-variant leading-relaxed">{order.shipping_address.address_line2}</p>}
                            <p className="text-xs text-on-surface-variant font-bold mt-1">
                              {order.shipping_address?.city || 'N/A'}, {order.shipping_address?.state || 'N/A'} {order.shipping_address?.postal_code || ''}
                            </p>
                         </div>
                         <div className="bg-white/50 p-3 rounded-xl border border-white">
                            <DetailRow label="Cell" value={order.shipping_address?.phone || 'N/A'} />
                         </div>
                      </div>
                    </div>

                    {/* Meta/Internal */}
                    <div className="rounded-[2rem] border border-outline-variant/10 p-6 bg-surface-container-low shadow-inner">
                      <div className="flex items-center gap-2 mb-4 border-b border-outline-variant/5 pb-3">
                         <span className="material-symbols-outlined text-primary">analytics</span>
                         <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-on-surface-variant">Administrative Metadata</h4>
                      </div>
                      <div className="space-y-1">
                        <DetailRow label="LSP Provider" value={order.shipment_provider || 'Direct Fulfillment'} />
                        <DetailRow label="Waybill / AWB" value={order.tracking_number || 'N/A'} mono />
                        <DetailRow label="SLA Start" value={formatDateTime(order.processed_at)} />
                        <DetailRow label="Hand-off Date" value={formatDateTime(order.shipped_at)} />
                        <div className="pt-2">
                           <p className="text-[9px] uppercase font-black text-on-surface-variant/40 mb-1">Manifest Notes</p>
                           <p className="text-xs text-on-surface italic bg-white/50 p-3 rounded-xl min-h-[60px] leading-relaxed border border-white">{order.order_notes || 'No customer directives provided for this shipment.'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Financial/Tech */}
                    <div className="rounded-[2rem] border border-outline-variant/10 p-6 bg-surface-container-low shadow-inner">
                      <div className="flex items-center gap-2 mb-4 border-b border-outline-variant/5 pb-3">
                         <span className="material-symbols-outlined text-primary">shield_with_heart</span>
                         <h4 className="text-[11px] uppercase tracking-[0.2em] font-black text-on-surface-variant">Security & Gateway</h4>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3 py-2 border-b border-outline-variant/5">
                           <span className="text-[10px] uppercase tracking-wider text-on-surface-variant/60 font-black">System UUID</span>
                           <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono font-bold text-primary">{order.id.slice(0, 16)}...</span>
                              <button onClick={() => copyValue(order.id)} className="w-6 h-6 rounded-lg bg-surface flex items-center justify-center hover:bg-primary hover:text-white transition-all">
                                 <span className="material-symbols-outlined text-[14px]">content_copy</span>
                              </button>
                           </div>
                        </div>
                        <DetailRow label="Platform Ref" value={order.external_order_id} mono />
                        <DetailRow label="Auth Status" value={order.order_status || 'verified'} />
                        <DetailRow label="Gateway ID" value={order.razorpay_order_id} mono />
                        <DetailRow label="Transaction ID" value={order.razorpay_payment_id} mono />
                        <div className="mt-4 p-4 rounded-2xl bg-secondary/10 border border-secondary/20 flex items-center justify-between">
                           <div>
                              <p className="text-[9px] font-black text-secondary uppercase leading-none mb-1">Settlement</p>
                              <p className="text-lg font-brand font-bold text-primary">{formatCurrency(order.total_amount)}</p>
                           </div>
                           <span className="material-symbols-outlined text-secondary text-2xl">check_box</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Item List View */}
                  <div className="mt-6 rounded-[2rem] border border-outline-variant/10 bg-white p-6 shadow-sm overflow-hidden">
                     <p className="text-[10px] uppercase tracking-[0.2em] font-black text-on-surface-variant mb-4 border-b border-outline-variant/5 pb-3">Fulfillment SKU Breakdown</p>
                     <div className="space-y-3">
                        {(order.order_items || []).map((item, idx) => (
                           <div key={idx} className="flex items-center gap-4 p-3 rounded-2xl border border-outline-variant/5 bg-surface-container-lowest hover:bg-surface-container-low transition-colors group">
                              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center overflow-hidden border border-outline-variant/10 shadow-inner group-hover:scale-105 transition-transform">
                                 {item.products?.image_url ? (
                                   <img src={item.products.image_url} alt="" className="w-full h-full object-cover" />
                                 ) : (
                                   <span className="material-symbols-outlined text-primary/30">image</span>
                                 )}
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className="text-sm font-bold text-primary truncate leading-tight">{item.products?.name || 'Unknown SKU Item'}</p>
                                 <p className="text-[10px] font-mono text-on-surface-variant/60 font-bold">KEY: {item.product_key || item.products?.key || 'N/A'}</p>
                              </div>
                              <div className="text-right flex items-center gap-6">
                                 <div>
                                    <p className="text-[9px] font-black uppercase text-on-surface-variant/40 leading-none mb-1">Rate</p>
                                    <p className="text-sm font-bold text-primary">{formatCurrency(item.unit_price || item.products?.price)}</p>
                                 </div>
                                 <div className="bg-primary/5 px-3 py-1 rounded-lg border border-primary/10">
                                    <p className="text-[9px] font-black uppercase text-primary leading-none mb-1">QTY</p>
                                    <p className="text-sm font-black text-primary">x{item.quantity}</p>
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
