import React, { useState } from 'react';

export default function OrdersTable({ data, sellerOptions }) {
  const [expandedOrders, setExpandedOrders] = useState({});
  const [paymentQuickFilter, setPaymentQuickFilter] = useState('all');

  const statusDot = { pending: '#94a3b8', processing: '#f59e0b', shipped: '#3b82f6', delivered: '#22c55e', cancelled: '#ef4444' };
  const statusBg  = { pending: '#f8fafc', processing: '#fffbeb', shipped: '#eff6ff', delivered: '#f0fdf4', cancelled: '#fef2f2' };
  const statusBorder = { pending: '#e2e8f0', processing: '#fde68a', shipped: '#bfdbfe', delivered: '#bbf7d0', cancelled: '#fecaca' };

  const payBg = { paid: '#f0fdf4', captured: '#f0fdf4', pending: '#fffbeb', initiated: '#fffbeb', failed: '#fef2f2', refunded: '#f8fafc', authorized: '#eff6ff' };
  const payColor = { paid: '#15803d', captured: '#15803d', pending: '#a16207', initiated: '#a16207', failed: '#dc2626', refunded: '#64748b', authorized: '#1d4ed8' };

  const formatDate = (v) => v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
  const formatTime = (v) => v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  const formatCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;

  const toggleOrder = (id) => setExpandedOrders((p) => ({ ...p, [id]: !p[id] }));
  const copyValue = async (value) => { if (value && value !== '—') try { await navigator.clipboard.writeText(String(value)); } catch {} };

  const visibleOrders = (data || []).filter((o) => paymentQuickFilter === 'all' || String(o.payment_status || '').toLowerCase() === paymentQuickFilter);

  const expandAll = () => { const n = {}; visibleOrders.forEach((o) => { n[o.id] = true; }); setExpandedOrders((p) => ({ ...p, ...n })); };
  const collapseAll = () => { const n = {}; visibleOrders.forEach((o) => { n[o.id] = false; }); setExpandedOrders((p) => ({ ...p, ...n })); };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white rounded-xl border border-[#bec9bf]/20 px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/40">Payment</span>
          <div className="flex bg-[#f5f4eb] rounded-lg p-0.5">
            {[{ id: 'all', label: 'All' }, { id: 'paid', label: 'Paid' }, { id: 'pending', label: 'Pending' }, { id: 'failed', label: 'Failed' }].map((f) => (
              <button
                key={f.id}
                onClick={() => setPaymentQuickFilter(f.id)}
                className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all ${paymentQuickFilter === f.id ? 'bg-[#004a2b] text-white shadow-sm' : 'text-[#3f4942] hover:text-[#004a2b]'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={expandAll} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-[#bec9bf]/25 text-[10px] font-medium text-[#3f4942] hover:bg-[#f5f4eb] transition-all">
            <span className="material-symbols-outlined text-sm">unfold_more</span>Expand
          </button>
          <button onClick={collapseAll} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-[#bec9bf]/25 text-[10px] font-medium text-[#3f4942] hover:bg-[#f5f4eb] transition-all">
            <span className="material-symbols-outlined text-sm">unfold_less</span>Collapse
          </button>
        </div>
      </div>

      {/* Orders List */}
      {visibleOrders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#bec9bf]/20 text-sm text-[#3f4942]/60">
          No orders matching current filters.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleOrders.map((order) => {
            const isOpen = expandedOrders[order.id];
            const customer = order.profiles?.first_name || order.profiles?.last_name
              ? `${order.profiles?.first_name || ''} ${order.profiles?.last_name || ''}`.trim()
              : 'Unknown';
            const payKey = String(order.payment_status || 'pending').toLowerCase();
            const statusKey = order.status || 'pending';

            return (
              <div
                key={order.id}
                className={`rounded-xl border transition-all duration-300 ${isOpen ? 'bg-white border-[#004a2b]/15 shadow-md' : 'bg-white border-[#bec9bf]/20 hover:border-[#004a2b]/10 shadow-sm'}`}
              >
                {/* Row Header */}
                <button
                  type="button"
                  onClick={() => toggleOrder(order.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-4"
                >
                  {/* Order ID */}
                  <div className="min-w-[80px]">
                    <p className="text-[9px] font-medium text-[#3f4942]/40 uppercase">Order</p>
                    <p className="text-xs font-bold text-[#004a2b] font-mono">#{order.id.slice(0, 8)}</p>
                  </div>

                  {/* Status Badge */}
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold capitalize border"
                    style={{ backgroundColor: statusBg[statusKey], borderColor: statusBorder[statusKey], color: statusKey === 'delivered' ? '#15803d' : statusKey === 'cancelled' ? '#dc2626' : '#334155' }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusDot[statusKey] }} />
                    {statusKey}
                  </span>

                  {/* Customer */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#f5f4eb] flex items-center justify-center text-[10px] font-bold text-[#004a2b] flex-shrink-0 border border-[#bec9bf]/20">
                      {customer[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#004a2b] truncate leading-tight">{customer}</p>
                      <p className="text-[10px] text-[#3f4942]/50 truncate leading-tight">{order.profiles?.email || '—'}</p>
                    </div>
                  </div>

                  {/* Items count */}
                  <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-medium text-[#3f4942]/60">
                    <span className="material-symbols-outlined text-xs">inventory_2</span>
                    {(order.order_items || []).length} items
                  </span>

                  {/* Payment */}
                  <span
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase border"
                    style={{ backgroundColor: payBg[payKey] || payBg.pending, color: payColor[payKey] || payColor.pending, borderColor: 'transparent' }}
                  >
                    {order.payment_status || 'pending'}
                  </span>

                  {/* Method */}
                  <span className="hidden lg:inline text-[10px] font-medium text-[#3f4942]/50">
                    {order.payment_method || 'COD'}
                  </span>

                  {/* Amount */}
                  <div className="text-right min-w-[72px]">
                    <p className="text-sm font-bold text-[#004a2b] tracking-tight">{formatCurrency(order.total_amount)}</p>
                  </div>

                  {/* Date */}
                  <div className="hidden md:block text-right min-w-[64px]">
                    <p className="text-[10px] font-medium text-[#3f4942]/60 leading-tight">{formatDate(order.created_at)}</p>
                    <p className="text-[9px] text-[#3f4942]/40 leading-tight">{formatTime(order.created_at)}</p>
                  </div>

                  {/* Chevron */}
                  <span className="material-symbols-outlined text-base text-[#3f4942]/30 transition-transform" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                    expand_more
                  </span>
                </button>

                {/* Expanded Details */}
                {isOpen && (
                  <div className="px-4 pb-4 pt-0 border-t border-[#bec9bf]/10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                      {/* Shipping */}
                      <div className="rounded-lg bg-[#f5f4eb]/50 p-3.5 border border-[#bec9bf]/10">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className="material-symbols-outlined text-sm text-[#004a2b]">local_shipping</span>
                          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Shipping</h4>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-[#004a2b]">
                            {order.shipping_address?.first_name || ''} {order.shipping_address?.last_name || ''}
                          </p>
                          <p className="text-[11px] text-[#3f4942]/70 leading-relaxed">
                            {order.shipping_address?.address_line1 || '—'}<br />
                            {order.shipping_address?.address_line2 && <>{order.shipping_address.address_line2}<br /></>}
                            {order.shipping_address?.city || ''}, {order.shipping_address?.state || ''} {order.shipping_address?.postal_code || ''}
                          </p>
                          {order.shipping_address?.phone && (
                            <p className="text-[11px] text-[#3f4942]/70 flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">call</span>{order.shipping_address.phone}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Logistics */}
                      <div className="rounded-lg bg-[#f5f4eb]/50 p-3.5 border border-[#bec9bf]/10">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className="material-symbols-outlined text-sm text-[#004a2b]">analytics</span>
                          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Logistics</h4>
                        </div>
                        <div className="space-y-1.5 text-[11px]">
                          <Row label="Provider" value={order.shipment_provider || 'Direct'} />
                          <Row label="Tracking" value={order.tracking_number || '—'} mono />
                          <Row label="Processed" value={formatDate(order.processed_at)} />
                          <Row label="Shipped" value={formatDate(order.shipped_at)} />
                        </div>
                        {order.order_notes && (
                          <div className="mt-2 p-2 rounded-md bg-white border border-[#bec9bf]/10 text-[10px] text-[#3f4942]/60 italic leading-relaxed">
                            {order.order_notes}
                          </div>
                        )}
                      </div>

                      {/* Payment & System */}
                      <div className="rounded-lg bg-[#f5f4eb]/50 p-3.5 border border-[#bec9bf]/10">
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <span className="material-symbols-outlined text-sm text-[#004a2b]">shield</span>
                          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/50">Payment</h4>
                        </div>
                        <div className="space-y-1.5 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#3f4942]/50 font-medium">Order ID</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[10px] text-[#004a2b] font-medium">{order.id.slice(0, 14)}…</span>
                              <button onClick={() => copyValue(order.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-[#004a2b]/5 transition-colors">
                                <span className="material-symbols-outlined text-xs text-[#3f4942]/40">content_copy</span>
                              </button>
                            </div>
                          </div>
                          <Row label="Gateway" value={order.payment_gateway || '—'} />
                          <Row label="Razorpay Order" value={order.razorpay_order_id || '—'} mono />
                          <Row label="Transaction" value={order.razorpay_payment_id || '—'} mono />
                        </div>
                        <div className="mt-3 p-2.5 rounded-lg bg-[#004a2b]/[0.04] border border-[#004a2b]/10 flex items-center justify-between">
                          <div>
                            <p className="text-[9px] font-medium text-[#3f4942]/50 uppercase">Total</p>
                            <p className="text-base font-bold text-[#004a2b]" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>{formatCurrency(order.total_amount)}</p>
                          </div>
                          <span className="material-symbols-outlined text-lg text-[#004a2b]/20">check_circle</span>
                        </div>
                      </div>
                    </div>

                    {/* SKU Items */}
                    <div className="mt-3 rounded-lg border border-[#bec9bf]/15 bg-white overflow-hidden">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#3f4942]/40 px-3.5 py-2 bg-[#f5f4eb]/50 border-b border-[#bec9bf]/10">
                        Order Items ({(order.order_items || []).length})
                      </p>
                      <div className="divide-y divide-[#bec9bf]/10">
                        {(order.order_items || []).map((item, idx) => (
                          <div key={idx} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-[#f5f4eb]/30 transition-colors">
                            <div className="w-9 h-9 rounded-lg bg-[#f5f4eb] flex items-center justify-center overflow-hidden border border-[#bec9bf]/10 flex-shrink-0">
                              {item.products?.image_url ? (
                                <img src={item.products.image_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="material-symbols-outlined text-xs text-[#3f4942]/20">image</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#004a2b] truncate">{item.products?.name || 'Unknown Item'}</p>
                              <p className="text-[9px] font-mono text-[#3f4942]/40">{item.product_key || item.products?.key || ''}</p>
                            </div>
                            <div className="text-right flex items-center gap-4">
                              <p className="text-xs font-medium text-[#3f4942]">{formatCurrency(item.unit_price || item.products?.price)}</p>
                              <span className="text-[10px] font-bold text-[#004a2b] bg-[#004a2b]/[0.05] px-2 py-0.5 rounded border border-[#004a2b]/10">
                                ×{item.quantity}
                              </span>
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
      )}
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[#3f4942]/50 font-medium">{label}</span>
      <span className={`text-[#004a2b] text-right ${mono ? 'font-mono text-[10px]' : 'font-medium'} truncate max-w-[160px]`}>{value || '—'}</span>
    </div>
  );
}
