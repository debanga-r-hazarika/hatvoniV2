const fs = require('fs');
const targetFile = 'c:\\Users\\deban\\Downloads\\CLIENT\\CUSTOMER SITE\\src\\pages\\AdminOrders.jsx';
let code = fs.readFileSync(targetFile, 'utf8');

// 1. Sidebar Consolidation
// Find the exact "Right sidebar" block and replace it.
const sidebarOriginal = 
`          {/* Right sidebar */}
          <div className="space-y-6">

            <div className="bg-surface-container-lowest rounded-[2rem] p-6 border border-outline-variant/30 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4">Customer</h3>
              <p className="text-xl font-brand text-primary leading-tight">{customerName}</p>
              <div className="mt-3 space-y-2">
                <p className="text-sm text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-secondary">mail</span>
                  {order?.profile?.email || '—'}
                </p>
                <p className="text-sm text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-secondary">call</span>
                  {order?.profile?.phone || '—'}
                </p>
              </div>
            </div>

            {order?.shipping_address && (
              <div className="bg-surface-container-lowest rounded-[2rem] p-6 border border-outline-variant/30 shadow-sm">
                <h3 className="text-[11px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4">Delivery Address</h3>
                <div className="text-sm text-on-surface-variant leading-relaxed space-y-0.5">
                  <p className="font-bold text-primary">{order.shipping_address.first_name} {order.shipping_address.last_name}</p>
                  <p>{order.shipping_address.address_line1}</p>
                  {order.shipping_address.address_line2 && <p>{order.shipping_address.address_line2}</p>}
                  <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</p>
                  {order.shipping_address.phone && <p className="mt-2 font-mono text-xs bg-surface-container px-2 py-1 rounded inline-block">{order.shipping_address.phone}</p>}
                </div>
              </div>
            )}

            <div className="bg-surface-container-lowest rounded-[2rem] p-6 border border-outline-variant/30 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4">Payment</h3>
              <div className="bg-surface-container-low px-4 py-2 rounded-2xl border border-outline-variant/20">
                <Row label="Method" value={(order?.payment_method || '').toUpperCase()} />
                <Row label="Status" value={(order?.payment_status || '').replace(/_/g, ' ')} />
                {order?.razorpay_order_id && <Row label="RP Order" value={order.razorpay_order_id} mono />}
                {order?.razorpay_payment_id && <Row label="RP Payment" value={order.razorpay_payment_id} mono />}
                {order?.refund_amount > 0 && <Row label="Refunded" value={fmt(order.refund_amount)} />}
                {order?.refund_status && order.refund_status !== 'not_required' && <Row label="Refund Status" value={order.refund_status} />}
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-[2rem] p-6 border border-outline-variant/30 shadow-sm">
              <h3 className="text-[11px] font-bold tracking-[0.2em] text-on-surface-variant uppercase mb-4">Timeline</h3>
              <div className="relative pl-5 space-y-5 before:absolute before:inset-y-0 before:left-[9px] before:w-[2px] before:bg-outline-variant/30">
                <div className="relative">
                  <span className="w-5 h-5 rounded-full bg-primary absolute -left-5 top-0 -translate-x-1/2 block" />
                  <p className="text-[10px] font-bold uppercase text-primary">Placed</p>
                  <p className="text-xs text-on-surface-variant">{fmtDate(order?.created_at)}</p>
                </div>
                {order?.shipped_at && (
                  <div className="relative">
                    <span className="w-5 h-5 rounded-full bg-blue-500 absolute -left-5 top-0 -translate-x-1/2 block" />
                    <p className="text-[10px] font-bold uppercase text-blue-700">Shipped</p>
                    <p className="text-xs text-on-surface-variant">{fmtDate(order.shipped_at)}</p>
                  </div>
                )}
                {order?.processed_at && (
                  <div className="relative">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 absolute -left-5 top-0 -translate-x-1/2 block" />
                    <p className="text-[10px] font-bold uppercase text-emerald-700">Delivered</p>
                    <p className="text-xs text-on-surface-variant">{fmtDate(order.processed_at)}</p>
                  </div>
                )}
                {order?.cancellation_reason && (
                  <div className="relative">
                    <span className="w-5 h-5 rounded-full bg-red-500 absolute -left-5 top-0 -translate-x-1/2 block" />
                    <p className="text-[10px] font-bold uppercase text-red-700">Cancelled</p>
                    <p className="text-xs text-red-600 italic mt-0.5">{order.cancellation_reason}</p>
                  </div>
                )}
              </div>
            </div>

          </div>`;

const sidebarNew = 
`          {/* Right sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 p-4 pb-3">Order Context</h2>
              
              {/* Customer */}
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-[10px] font-bold tracking-[0.1em] text-gray-500 uppercase mb-2">Customer</h3>
                <p className="text-base font-semibold text-gray-900 leading-tight mb-2">{customerName}</p>
                <div className="space-y-1">
                  <p className="text-xs text-gray-600 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px] text-gray-400">mail</span>
                    {order?.profile?.email || '—'}
                  </p>
                  <p className="text-xs text-gray-600 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px] text-gray-400">call</span>
                    {order?.profile?.phone || '—'}
                  </p>
                </div>
              </div>

              {/* Delivery Address */}
              {order?.shipping_address && (
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-[10px] font-bold tracking-[0.1em] text-gray-500 uppercase mb-2">Delivery Address</h3>
                  <div className="text-xs text-gray-700 leading-tight space-y-0.5">
                    <p className="font-semibold text-gray-900 mb-1">{order.shipping_address.first_name} {order.shipping_address.last_name}</p>
                    <p>{order.shipping_address.address_line1}</p>
                    {order.shipping_address.address_line2 && <p>{order.shipping_address.address_line2}</p>}
                    <p>{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</p>
                    {order.shipping_address.phone && <p className="mt-1.5 font-mono text-[10px] bg-gray-50 px-1.5 py-0.5 rounded inline-block border border-gray-100">{order.shipping_address.phone}</p>}
                  </div>
                </div>
              )}

              {/* Payment */}
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-[10px] font-bold tracking-[0.1em] text-gray-500 uppercase mb-2">Payment</h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Method</span>
                    <span className="font-semibold text-gray-900 uppercase">{(order?.payment_method || '')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="font-semibold text-gray-900 capitalize">{(order?.payment_status || '').replace(/_/g, ' ')}</span>
                  </div>
                  {order?.razorpay_order_id && (
                    <div className="flex justify-between items-center break-all ml-4">
                      <span className="text-gray-500 whitespace-nowrap mr-2">RP Ord</span>
                      <span className="font-mono text-[10px] truncate">{order.razorpay_order_id}</span>
                    </div>
                  )}
                  {order?.razorpay_payment_id && (
                    <div className="flex justify-between items-center break-all ml-4">
                      <span className="text-gray-500 whitespace-nowrap mr-2">RP Pay</span>
                      <span className="font-mono text-[10px] truncate">{order.razorpay_payment_id}</span>
                    </div>
                  )}
                  {order?.refund_amount > 0 && (
                    <div className="flex justify-between mt-1 pt-1 border-t border-gray-100">
                      <span className="text-gray-500">Refunded</span>
                      <span className="font-bold text-purple-700">{fmt(order.refund_amount)}</span>
                    </div>
                  )}
                  {order?.refund_status && order.refund_status !== 'not_required' && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Refund</span>
                      <span className="text-purple-700 italic">{order.refund_status}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="p-4">
                <h3 className="text-[10px] font-bold tracking-[0.1em] text-gray-500 uppercase mb-4">Timeline</h3>
                <div className="relative pl-5 space-y-4 before:absolute before:inset-y-0 before:left-[7px] before:w-0.5 before:bg-gray-100">
                  <div className="relative">
                    <span className="w-3.5 h-3.5 rounded-full bg-gray-900 absolute -left-[20px] top-1 block ring-2 ring-white" />
                    <p className="text-[10px] font-bold uppercase text-gray-900">Placed</p>
                    <p className="text-[11px] text-gray-500">{fmtDate(order?.created_at)}</p>
                  </div>
                  {order?.shipped_at && (
                    <div className="relative">
                      <span className="w-3.5 h-3.5 rounded-full bg-blue-500 absolute -left-[20px] top-1 block ring-2 ring-white" />
                      <p className="text-[10px] font-bold uppercase text-blue-700">Shipped</p>
                      <p className="text-[11px] text-gray-500">{fmtDate(order.shipped_at)}</p>
                    </div>
                  )}
                  {order?.processed_at && (
                    <div className="relative">
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 absolute -left-[20px] top-1 block ring-2 ring-white" />
                      <p className="text-[10px] font-bold uppercase text-emerald-700">Delivered</p>
                      <p className="text-[11px] text-gray-500">{fmtDate(order.processed_at)}</p>
                    </div>
                  )}
                  {order?.cancellation_reason && (
                    <div className="relative">
                      <span className="w-3.5 h-3.5 rounded-full bg-red-500 absolute -left-[20px] top-1 block ring-2 ring-white" />
                      <p className="text-[10px] font-bold uppercase text-red-700">Cancelled</p>
                      <p className="text-[11px] text-red-600 italic mt-0.5 leading-snug">{order.cancellation_reason}</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>`;

code = code.replace(sidebarOriginal, sidebarNew);

// 2. Reduce font size of Order ID
code = code.replace(
  /<h1 className="font-brand text-4xl text-primary tracking-tight">#\{orderId\.slice\(0, 8\)\}<\/h1>/g,
  '<h1 className="font-brand text-2xl lg:text-3xl text-gray-900 tracking-tight">#{orderId.slice(0, 8)}</h1>'
);

// 3. Billing Summary compression and right-alignment
const summaryOriginal = 
`              {/* Billing summary */}
              <div className="mt-6 bg-surface-container-low rounded-2xl p-5 border border-outline-variant/20">
                {order?.billing_breakdown && (
                  <div className="space-y-1 border-b border-outline-variant/20 pb-4 mb-4">
                    {order.billing_breakdown.subtotal != null && <Row label="Subtotal" value={fmt(order.billing_breakdown.subtotal)} />}
                    {order.billing_breakdown.shipping_fee > 0 && <Row label="Shipping" value={fmt(order.billing_breakdown.shipping_fee)} />}
                    {order.billing_breakdown.cod_fee > 0 && <Row label="COD Fee" value={fmt(order.billing_breakdown.cod_fee)} />}
                    {(order.billing_breakdown.coupon_discount > 0 || order.billing_breakdown.discount > 0) && (
                      <Row label="Discount" value={'-' + fmt(order.billing_breakdown.coupon_discount || order.billing_breakdown.discount)} />
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold uppercase tracking-wider text-on-surface">Total</span>
                  <span className="text-2xl font-brand text-primary">{fmt(order?.total_amount)}</span>
                </div>`;

const summaryNew =
`              {/* Billing summary */}
              <div className="mt-4 flex justify-end">
                <div className="w-full sm:w-64 bg-gray-50 rounded-xl p-4 border border-gray-200">
                  {order?.billing_breakdown && (
                    <div className="space-y-1.5 border-b border-gray-200 pb-3 mb-3">
                      {order.billing_breakdown.subtotal != null && <Row label="Subtotal" value={fmt(order.billing_breakdown.subtotal)} />}
                      {order.billing_breakdown.shipping_fee > 0 && <Row label="Shipping" value={fmt(order.billing_breakdown.shipping_fee)} />}
                      {order.billing_breakdown.cod_fee > 0 && <Row label="COD Fee" value={fmt(order.billing_breakdown.cod_fee)} />}
                      {(order.billing_breakdown.coupon_discount > 0 || order.billing_breakdown.discount > 0) && (
                        <Row label="Discount" value={\`-\${fmt(order.billing_breakdown.coupon_discount || order.billing_breakdown.discount)}\`} className="text-emerald-700" />
                      )}
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total</span>
                    <span className="text-xl font-bold text-gray-900">{fmt(order?.total_amount)}</span>
                  </div>`;

code = code.replace(summaryOriginal, summaryNew);

// Adjust OrderDetail borders & padding globally slightly
code = code.replace(
  /className="bg-surface-container-lowest rounded-\[2rem\] p-6 lg:p-8 border border-outline-variant\/30 shadow-sm"/g,
  'className="bg-white rounded-xl p-4 lg:p-6 border border-neutral-200 shadow-sm"'
);
code = code.replace(
  /className="bg-surface-container-lowest rounded-\[2rem\] p-6 border border-outline-variant\/30 shadow-sm"/g,
  'className="bg-white rounded-xl p-4 border border-neutral-200 shadow-sm"'
);


// 4. Horizontal Item Layout inside ItemDecisionPanel
// Re-write the display block
// Find the exact mapping part: 'return ( <div key={`...`} className="rounded-xl border border-[#bec9bf]/20 p-4 bg-[#fbfaf1]">'
const itemMapOld = 
`          return (
            <div key={\`\${line.order_item_id}-\${line.product_key}\`}
              className="rounded-xl border border-[#bec9bf]/20 p-4 bg-[#fbfaf1]">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {/* Product info */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {line.image_url ? (
                    <img src={line.image_url} alt={line.name}
                      className="w-10 h-10 rounded-lg object-cover border border-[#bec9bf]/20 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#f5f4eb] flex items-center justify-center shrink-0 border border-[#bec9bf]/20">
                      <span className="material-symbols-outlined text-[#bec9bf] text-sm">local_mall</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-[#004a2b] text-sm truncate">{line.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {line.product_key && (
                        <span className="text-[10px] font-mono text-[#3f4942]/60 bg-[#f5f4eb] px-1.5 py-0.5 rounded">
                          {line.product_key}
                        </span>
                      )}
                      {line.lot_name && (
                        <span className="text-[10px] text-[#815500] font-bold uppercase tracking-wider">{line.lot_name}</span>
                      )}
                      {/* Show item type: 3rd-party seller vs own-seller */}
                      {isAdminItem ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          {aa?.sync_with_insider ? '🔄 Insider sync' : '🏠 Own seller'}
                        </span>
                      ) : isSellerItem ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          🏪 3rd-party seller
                        </span>
                      ) : null}
                      <span className="text-[10px] text-[#3f4942]/60">
                        {line.qty} × {fmt(line.unit_price)} = {fmt(line.line_total)}
                      </span>
                    </div>
                    {/* Show inventory snapshot if available (sync_with_insider items) */}
                    {aa?.inventory_snapshot && (
                      <div className="mt-1.5 text-[10px] bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-800">
                        Insider stock: {aa.inventory_snapshot.qty_available ?? '—'} {aa.inventory_snapshot.unit || 'units'} available
                      </div>
                    )}
                  </div>
                </div>

                {/* Decision status */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <Badge label={statusLabel} colorClass={statusColor} />
                    {decisionSource && (
                      <p className="text-[10px] text-[#3f4942]/60 mt-1">
                        {decisionSource === 'admin_override' ? '⚡ Admin override' :
                         decisionSource === 'admin' ? '🔑 Admin decision' :
                         '🏪 Seller decision'}
                      </p>
                    )}
                    {(sd?.decision_reason || aa?.decision_reason) && (
                      <p className="text-[10px] text-red-600 mt-0.5 italic max-w-[160px] truncate">
                        {sd?.decision_reason || aa?.decision_reason}
                      </p>
                    )}
                    {isOverridden && (
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        Was: {sd.original_decision}
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-1.5">
                    {/* Admin items: direct approve/reject */}
                    {isAdminItem && aa.status === 'pending_review' && (
                      <>
                        <button
                          onClick={() => openAdminDecide(line, 'approved')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => openAdminDecide(line, 'rejected')}
                          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {/* Admin items: already decided — allow re-decision */}
                    {isAdminItem && aa.status !== 'pending_review' && (
                      <button
                        onClick={() => openAdminDecide(line, aa.status === 'approved' ? 'rejected' : 'approved')}
                        className="px-3 py-1.5 rounded-lg border border-[#bec9bf] text-[#3f4942]/60 text-xs font-bold hover:bg-[#f5f4eb] transition-colors"
                      >
                        Change
                      </button>
                    )}

                    {/* Seller items: admin override button */}
                    {isSellerItem && !isAdminItem && (
                      <button
                        onClick={() => {
                          setOverrideTarget({
                            order_item_id: line.order_item_id,
                            product_key: line.product_key,
                            seller_id: sd.seller_id,
                            current_decision: sd.decision,
                          });
                          setOverrideDecision(sd.decision === 'approved' ? 'rejected' : 'approved');
                          setOverrideReason('');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-colors"
                      >
                        Override
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );`;

const itemMapNew = 
`          return (
            <div key={\`\${line.order_item_id}-\${line.product_key}\`}
              className="group flex flex-col xl:flex-row xl:items-center justify-between py-2.5 px-3 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all gap-4 xl:gap-6">
              
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {line.image_url ? (
                  <img src={line.image_url} alt={line.name}
                    className="w-10 h-10 rounded-md object-cover ring-1 ring-gray-900/5 shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-gray-50 flex items-center justify-center shrink-0 ring-1 ring-gray-900/5">
                    <span className="material-symbols-outlined text-gray-400 text-[18px]">category</span>
                  </div>
                )}
                
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 text-[13px] truncate">{line.name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    {line.product_key && (
                      <span className="text-[9px] font-mono font-medium text-gray-500 bg-gray-100 px-1 py-0.5 rounded">
                        {line.product_key}
                      </span>
                    )}
                    {isAdminItem ? (
                      <span className="text-[8px] font-bold uppercase py-0.5 text-blue-700 inline-flex items-center gap-0.5">
                        {aa?.sync_with_insider ? <span className="material-symbols-outlined text-[10px]">sync</span> : <span className="material-symbols-outlined text-[10px]">home</span>}
                        {aa?.sync_with_insider ? 'Sync' : 'Own'}
                      </span>
                    ) : isSellerItem ? (
                      <span className="text-[8px] font-bold uppercase py-0.5 text-purple-700">3rd Party</span>
                    ) : null}
                     {aa?.inventory_snapshot && (
                      <span className="text-[9px] font-medium text-blue-700 ml-1">
                        Stock: <span className="font-mono">{aa.inventory_snapshot.qty_available ?? '—'}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 xl:w-28 shrink-0 justify-end">
                <div className="text-right">
                  <p className="text-[13px] font-bold text-gray-900">{fmt(line.line_total)}</p>
                  <p className="text-[10px] text-gray-500">{line.qty} × {fmt(line.unit_price)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t xl:border-t-0 border-gray-100 pt-3 xl:pt-0">
                <div className="text-right w-24">
                  <Badge label={statusLabel} colorClass={statusColor} />
                  {decisionSource && <p className="text-[9px] text-gray-400 uppercase tracking-wider mt-1">{decisionSource}</p>}
                </div>

                <div className="flex items-center gap-1.5 w-[140px] justify-end">
                  {isAdminItem && aa.status === 'pending_review' && (
                    <>
                      <button onClick={() => openAdminDecide(line, 'approved')}
                        className="px-2.5 py-1.5 rounded bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-800 transition-colors flex-1 text-center">
                        Approve
                      </button>
                      <button onClick={() => openAdminDecide(line, 'rejected')}
                        className="px-2.5 py-1.5 rounded border border-red-200 bg-red-50 text-red-700 text-[11px] font-semibold hover:bg-red-100 transition-colors flex-1 text-center">
                        Reject
                      </button>
                    </>
                  )}
                  {isAdminItem && aa.status !== 'pending_review' && (
                    <button onClick={() => openAdminDecide(line, aa.status === 'approved' ? 'rejected' : 'approved')}
                      className="px-3 py-1.5 rounded border border-gray-200 text-gray-600 text-[11px] font-semibold hover:bg-gray-50 transition-colors flex-1 text-center">
                      Change
                    </button>
                  )}
                  {isSellerItem && !isAdminItem && (
                    <button onClick={() => {
                        setOverrideTarget({
                          order_item_id: line.order_item_id,
                          product_key: line.product_key,
                          seller_id: sd.seller_id,
                          current_decision: sd.decision,
                        });
                        setOverrideDecision(sd.decision === 'approved' ? 'rejected' : 'approved');
                        setOverrideReason('');
                      }}
                      className="px-3 py-1.5 rounded border border-amber-200 bg-amber-50 text-amber-700 text-[11px] font-semibold hover:bg-amber-100 transition-colors flex-1 text-center">
                      Override
                    </button>
                  )}
                </div>
              </div>
            </div>
          );`;

code = code.replace(itemMapOld, itemMapNew);

// 5. Update OrderFinalization padding and border radius
code = code.replace(
  /<section className="bg-white rounded-xl p-4 lg:p-5 border border-\[#bec9bf\]\/30 shadow-\[0_10px_40px_rgba\(0,123,71,0\.03\)\] relative overflow-hidden">/g,
  '<section className="bg-white rounded-xl p-4 lg:p-6 border border-neutral-200 shadow-sm relative">'
);
code = code.replace(
  /<div className="absolute top-0 right-0 w-32 h-32 bg-\[#004a2b\]\/5 rounded-bl-\[100px\] -z-10" \/>/g,
  '' // Clear swoosh again, just in case
);

// Remove default Row wrapper component styling mapping over AdminOrders.jsx if there is any custom Row
// Actually, we'll redefine the Row component style to be extremely dense since it was requested:
const rowOriginal = `function Row({ label, value, mono, className }) {
  return (
    <div className={\`flex justify-between items-start py-1 \${className || ''}\`}>
      <span className="text-xs font-semibold text-on-surface-variant flex-1 pr-2">{label}</span>
      <span className={\`text-sm font-bold text-on-surface text-right \${mono ? 'font-mono' : ''}\`}>{value}</span>
    </div>
  );
}`;
const rowNew = `function Row({ label, value, mono, className }) {
  return (
    <div className={\`flex justify-between items-center py-0.5 \${className || ''}\`}>
      <span className="text-xs text-gray-500 pr-2">{label}</span>
      <span className={\`text-xs font-bold text-gray-900 \${mono ? 'font-mono break-all' : ''}\`}>{value}</span>
    </div>
  );
}`;
code = code.replace(rowOriginal, rowNew);


// Tweak ShippingPanel container to be rounded-xl
code = code.replace(
  /<section className="bg-[^"]* rounded-[^"]* p-6 lg:p-8[^"]* border[^"]*">([\s\S]*?)<h2 className="text-\[10px\] uppercase tracking-wider font-bold/g,
  '<section className="bg-white rounded-xl p-4 lg:p-6 border border-neutral-200 shadow-sm relative">$1<h2 className="text-[10px] uppercase tracking-wider font-bold'
);
// Also fallback if old class:
code = code.replace(
  /<section className="bg-surface-container-lowest rounded-\[2rem\] p-6 lg:p-8 border border-outline-variant\/30 shadow-sm">/g,
  '<section className="bg-white rounded-xl p-4 lg:p-6 border border-neutral-200 shadow-sm">'
);


fs.writeFileSync(targetFile, code, 'utf8');
console.log('UI updated via script.');
