const fs = require('fs');
const targetFile = 'c:\\Users\\deban\\Downloads\\CLIENT\\CUSTOMER SITE\\src\\pages\\AdminOrders.jsx';
let code = fs.readFileSync(targetFile, 'utf8');

function replaceFunctionBody(fnName, newFn) {
  const regexStr = `function ${fnName}\\([^)]*\\)\\s*\\{`;
  const regex = new RegExp(regexStr, 's');
  const match = code.match(regex);
  if (!match) {
    console.log(`Could not find function ${fnName}`);
    return;
  }
  const startIdx = match.index;
  let openBraces = 0;
  let started = false;
  let endIdx = -1;
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === '{') {
      openBraces++;
      started = true;
    }
    if (code[i] === '}') {
      openBraces--;
      if (started && openBraces === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx !== -1) {
    code = code.substring(0, startIdx) + newFn + code.substring(endIdx + 1);
  }
}

// ==========================================
// 1. Rewrite ItemDecisionPanel
// ==========================================
const newItemDecisionPanel = `function ItemDecisionPanel({ items, sellerDecisions, adminApprovals, onRefresh }) {
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideDecision, setOverrideDecision] = useState('approved');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState('');
  const [overriding, setOverriding] = useState(false);

  // adminDecideTarget carries the line + whether it's a sync item + fetched inventory
  const [adminDecideTarget, setAdminDecideTarget] = useState(null);
  // { order_item_id, product_key, isSyncItem, inventoryLoading, inventory, inventoryError }
  const [adminDecision, setAdminDecision] = useState('approved');
  const [adminReason, setAdminReason] = useState('');
  const [adminDecideError, setAdminDecideError] = useState('');
  const [adminDeciding, setAdminDeciding] = useState(false);

  // Fetch inventory for a specific product key from hatvoni_inventory
  const fetchInventoryForKey = async (productKey) => {
    const { data, error } = await supabase
      .from('hatvoni_inventory')
      .select('tag_key, display_name, total_qty_available, unit, last_synced_at')
      .eq('tag_key', productKey)
      .maybeSingle();
    if (error) throw error;
    return data; // null if not found
  };

  // Called when admin clicks Approve or Reject on an admin item
  const openAdminDecide = async (line, initialDecision) => {
    const isSyncItem = line.adminApproval?.sync_with_insider === true;

    // For sync items clicking Approve: fetch inventory first, then open modal
    if (isSyncItem && initialDecision === 'approved') {
      setAdminDecideTarget({
        order_item_id: line.order_item_id,
        product_key: line.product_key,
        name: line.name,
        qty_ordered: line.qty,
        isSyncItem: true,
        inventoryLoading: true,
        inventory: null,
        inventoryError: null,
      });
      setAdminDecision('approved');
      setAdminReason('');
      setAdminDecideError('');

      // Fetch inventory in background
      try {
        const inv = await fetchInventoryForKey(line.product_key);
        setAdminDecideTarget((prev) => prev ? {
          ...prev,
          inventoryLoading: false,
          inventory: inv,
          inventoryError: null,
        } : null);
      } catch (err) {
        setAdminDecideTarget((prev) => prev ? {
          ...prev,
          inventoryLoading: false,
          inventory: null,
          inventoryError: err.message || 'Failed to fetch inventory',
        } : null);
      }
    } else {
      // Non-sync item or Reject: open modal directly
      setAdminDecideTarget({
        order_item_id: line.order_item_id,
        product_key: line.product_key,
        name: line.name,
        qty_ordered: line.qty,
        isSyncItem,
        inventoryLoading: false,
        inventory: null,
        inventoryError: null,
      });
      setAdminDecision(initialDecision);
      setAdminReason('');
      setAdminDecideError('');
    }
  };

  const handleAdminDecide = async (forceApprove = false) => {
    if (!adminDecideTarget) return;
    setAdminDeciding(true);
    setAdminDecideError('');
    try {
      // Build inventory snapshot to store alongside the decision
      const inventorySnap = adminDecideTarget.inventory
        ? {
            tag_key: adminDecideTarget.inventory.tag_key,
            qty_available: adminDecideTarget.inventory.total_qty_available,
            unit: adminDecideTarget.inventory.unit,
            last_synced_at: adminDecideTarget.inventory.last_synced_at,
            force_approved: forceApprove,
          }
        : null;

      const { error } = await supabase.rpc('admin_approve_item', {
        p_order_item_id: adminDecideTarget.order_item_id,
        p_product_key: adminDecideTarget.product_key,
        p_decision: adminDecision,
        p_reason: adminReason || (forceApprove ? 'Approved — production will fulfill' : null),
        p_inventory_snap: inventorySnap,
      });
      if (error) throw error;
      setAdminDecideTarget(null);
      setAdminReason('');
      await onRefresh();
    } catch (err) {
      setAdminDecideError(err.message || 'Failed to save decision');
    } finally {
      setAdminDeciding(false);
    }
  };

  const handleOverride = async () => {
    if (!overrideTarget) return;
    setOverriding(true);
    setOverrideError('');
    try {
      const { error } = await supabase.rpc('admin_override_seller_decision', {
        p_order_item_id: overrideTarget.order_item_id,
        p_product_key: overrideTarget.product_key,
        p_seller_id: overrideTarget.seller_id,
        p_new_decision: overrideDecision,
        p_reason: overrideReason,
      });
      if (error) throw error;
      setOverrideTarget(null);
      setOverrideReason('');
      await onRefresh();
    } catch (err) {
      setOverrideError(err.message || 'Override failed');
    } finally {
      setOverriding(false);
    }
  };

  // Build display lines from items
  const displayLines = useMemo(() => {
    return (items || []).flatMap((item) => {
      if (Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0) {
        return item.lot_snapshot.map((s) => ({
          order_item_id: item.id,
          product_key: s.product_key,
          name: s.product_name || s.product_key,
          qty: s.quantity * item.quantity,
          unit_price: s.unit_price,
          line_total: s.unit_price * s.quantity * item.quantity,
          lot_name: item.lot_name,
          seller_id: s.seller_id || null,
          image_url: item.products?.image_url,
          // Find seller decision for this line
          sellerDecision: sellerDecisions.find(
            (d) => d.order_item_id === item.id && d.product_key === s.product_key
          ) || null,
          // Find admin approval for this line
          adminApproval: adminApprovals.find(
            (a) => a.order_item_id === item.id && a.product_key === s.product_key
          ) || null,
        }));
      }
      return [{
        order_item_id: item.id,
        product_key: item.products?.key || null,
        name: item.products?.name || item.lot_name || 'Product',
        qty: item.quantity,
        unit_price: item.price,
        line_total: item.price * item.quantity,
        lot_name: item.lot_name,
        seller_id: item.products?.seller_id || null,
        image_url: item.products?.image_url,
        sellerDecision: sellerDecisions.find((d) => d.order_item_id === item.id) || null,
        adminApproval: adminApprovals.find((a) => a.order_item_id === item.id) || null,
      }];
    });
  }, [items, sellerDecisions, adminApprovals]);

  return (
    <section className="bg-white rounded-2xl p-6 lg:p-8 border border-neutral-200 shadow-[0_2px_12px_rgb(0,0,0,0.02)] relative">
      <div className="absolute left-8 top-[84px] bottom-6 w-px bg-gray-100 hidden sm:block"></div>
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-black shadow-md shrink-0">1</div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Item Verification</h2>
          <p className="text-xs text-gray-500 font-medium">Approve or reject line items before finalizing order.</p>
        </div>
      </div>

      <div className="space-y-4 sm:pl-11 relative z-10">
        {displayLines.map((line) => {
          const sd = line.sellerDecision;
          const aa = line.adminApproval;

          const isAdminItem = aa !== null; // has an admin approval record
          const isSellerItem = sd !== null; // has a seller decision record
          const isOverridden = sd?.override_by != null;

          let effectiveStatus = 'pending';
          let decisionSource = '';
          if (isAdminItem) {
            effectiveStatus = aa.status; // pending_review | approved | rejected
            decisionSource = 'admin';
          } else if (isSellerItem) {
            effectiveStatus = sd.decision; // pending | approved | rejected
            decisionSource = isOverridden ? 'admin_override' : 'seller';
          }

          const statusLabel = {
            pending: 'Pending',
            pending_review: 'Reviewing',
            approved: 'Approved',
            rejected: 'Rejected',
          }[effectiveStatus] || effectiveStatus;

          const statusColor = ITEM_DECISION_COLORS[effectiveStatus] || ITEM_DECISION_COLORS.pending;

          return (
            <div key={\`\${line.order_item_id}-\${line.product_key}\`}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all duration-200">
              
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {line.image_url ? (
                  <img src={line.image_url} alt={line.name}
                    className="w-12 h-12 rounded-lg object-cover ring-1 ring-gray-900/5 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 ring-1 ring-gray-900/5">
                    <span className="material-symbols-outlined text-gray-400 text-lg">category</span>
                  </div>
                )}
                
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{line.name}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {line.product_key && (
                      <span className="text-[10px] font-mono font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {line.product_key}
                      </span>
                    )}
                    {isAdminItem ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                        {aa?.sync_with_insider ? 'Sync Insider' : 'In-House'}
                      </span>
                    ) : isSellerItem ? (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100">
                        3rd Party
                      </span>
                    ) : null}
                    <span className="text-xs font-medium text-gray-500">
                      {line.qty} × {fmt(line.unit_price)}
                    </span>
                  </div>
                  
                  {aa?.inventory_snapshot && (
                    <div className="mt-1.5 text-[10px] font-medium text-blue-700">
                      Stock: <span className="font-mono">{aa.inventory_snapshot.qty_available ?? '—'}</span> {aa.inventory_snapshot.unit || 'units'}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0 border-t sm:border-t-0 border-gray-100 pt-3 sm:pt-0">
                <div className="text-left sm:text-right">
                  <Badge label={statusLabel} colorClass={statusColor} />
                  {decisionSource && (
                    <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wider mt-1.5">
                      {decisionSource === 'admin_override' ? 'Admin Override' :
                       decisionSource === 'admin' ? 'Decided by Admin' :
                       'Decided by Seller'}
                    </p>
                  )}
                  {(sd?.decision_reason || aa?.decision_reason) && (
                    <p className="text-[10px] text-red-500 font-medium mt-1 truncate max-w-[140px]">
                      {sd?.decision_reason || aa?.decision_reason}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isAdminItem && aa.status === 'pending_review' && (
                    <>
                      <button onClick={() => openAdminDecide(line, 'approved')}
                        className="px-3.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold shadow-sm hover:bg-gray-800 transition-colors">
                        Approve
                      </button>
                      <button onClick={() => openAdminDecide(line, 'rejected')}
                        className="px-3.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors">
                        Reject
                      </button>
                    </>
                  )}
                  {isAdminItem && aa.status !== 'pending_review' && (
                    <button onClick={() => openAdminDecide(line, aa.status === 'approved' ? 'rejected' : 'approved')}
                      className="px-3.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-colors">
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
                      className="px-3.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                      Override
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Admin Decide Modal */}
      {adminDecideTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="font-bold text-xl text-gray-900 mb-1 tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
              {adminDecideTarget.isSyncItem && adminDecision === 'approved' ? 'Insider Inventory Check' : 'Confirm Item Decision'}
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-semibold text-gray-900">{adminDecideTarget.name}</span>
              {adminDecideTarget.qty_ordered && (
                <span className="ml-2 font-mono">· Qty: {adminDecideTarget.qty_ordered}</span>
              )}
            </p>

            {adminDecideTarget.isSyncItem && adminDecision === 'approved' && (
              <div className="mb-5">
                {adminDecideTarget.inventoryLoading ? (
                  <div className="flex items-center justify-center gap-2 p-5 rounded-xl bg-gray-50 border border-gray-100">
                    <span className="material-symbols-outlined animate-spin text-gray-500">progress_activity</span>
                    <p className="text-sm text-gray-600 font-medium">Checking sync status...</p>
                  </div>
                ) : adminDecideTarget.inventory ? (
                  (() => {
                    const inv = adminDecideTarget.inventory;
                    const qtyAvail = Number(inv.total_qty_available ?? 0);
                    const qtyNeeded = Number(adminDecideTarget.qty_ordered ?? 0);
                    const inStock = qtyAvail >= qtyNeeded;
                    return (
                      <div className={\`p-4 rounded-xl border \${inStock ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}\`}>
                         <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-bold text-gray-900">{inv.display_name || inv.tag_key}</p>
                          <span className={\`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full \${inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}\`}>
                            {inStock ? 'In Stock' : 'Low Stock'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center px-2">
                           <div className="text-center">
                             <div className="text-xl font-bold text-gray-900">{qtyAvail}</div>
                             <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Available</div>
                           </div>
                           <div className="text-center">
                             <div className="text-xl font-bold text-[#004a2b]">{qtyNeeded}</div>
                             <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Ordered</div>
                           </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                    <p className="text-sm text-gray-700">No inventory record found.</p>
                  </div>
                )}
              </div>
            )}

            {(!adminDecideTarget.isSyncItem || adminDecision === 'rejected') && (
              <div className="mb-5">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Decision</label>
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  {['approved', 'rejected'].map((d) => (
                    <button key={d} onClick={() => setAdminDecision(d)}
                      className={\`flex-1 py-1.5 rounded-md text-xs font-semibold capitalize transition-all \${adminDecision === d 
                        ? (d==='approved' ? 'bg-white text-emerald-700 shadow-sm' : 'bg-white text-red-600 shadow-sm') 
                        : 'text-gray-500 hover:text-gray-700'}\`}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                {adminDecision === 'rejected' ? 'Rejection Reason *' : 'Internal Note (Optional)'}
              </label>
              <input type="text" value={adminReason} onChange={(e) => setAdminReason(e.target.value)}
                placeholder={adminDecision === 'rejected' ? 'Required...' : 'e.g., Confirmed with warehouse...'}
                className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#004a2b] focus:ring-2 focus:ring-[#004a2b]/20 transition-all outline-none" />
            </div>

            {adminDecideError && (
              <div className="p-3 mb-4 rounded-lg bg-red-50 text-red-600 text-xs font-semibold border border-red-100">{adminDecideError}</div>
            )}

            <div className="flex flex-col gap-2">
              {adminDecideTarget.isSyncItem && adminDecision === 'approved' && !adminDecideTarget.inventoryLoading && (
                <>
                  <button onClick={() => handleAdminDecide(false)} disabled={adminDeciding}
                    className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold shadow-sm hover:bg-gray-800 disabled:opacity-60 transition-all">
                    {adminDeciding ? 'Saving...' : 'Approve Normal Fulfillment'}
                  </button>
                  <button onClick={() => handleAdminDecide(true)} disabled={adminDeciding}
                    className="w-full py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-all">
                    {adminDeciding ? 'Saving...' : 'Force Approve (Backorder)'}
                  </button>
                </>
              )}

              {(!adminDecideTarget.isSyncItem || adminDecision === 'rejected') && (
                <div className="flex gap-2">
                  <button onClick={() => { setAdminDecideTarget(null); setAdminDecideError(''); }}
                    className="flex-1 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={() => handleAdminDecide(false)} disabled={adminDeciding}
                    className={\`flex-1 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 \${adminDecision === 'approved' ? 'bg-[#004a2b] hover:bg-[#004a2b]/90' : 'bg-red-600 hover:bg-red-700'}\`}>
                    {adminDeciding ? 'Saving...' : 'Confirm'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {overrideTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <h3 className="font-bold text-xl text-gray-900 mb-1 tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Override Seller</h3>
            <p className="text-sm text-gray-500 mb-4">
              Current status: <strong className="text-gray-900 capitalize">{overrideTarget.current_decision}</strong>
            </p>
            
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">New Decision</label>
              <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                {['approved', 'rejected'].map((d) => (
                  <button key={d} onClick={() => setOverrideDecision(d)}
                    className={\`flex-1 py-1.5 rounded-md text-xs font-semibold capitalize transition-all \${overrideDecision === d 
                      ? (d==='approved' ? 'bg-white text-emerald-700 shadow-sm' : 'bg-white text-red-600 shadow-sm') 
                      : 'text-gray-500 hover:text-gray-700'}\`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Override Reason *</label>
              <input type="text" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Required..."
                className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-[#004a2b] focus:ring-2 focus:ring-[#004a2b]/20 transition-all outline-none" />
            </div>

            {overrideError && <div className="p-3 mb-4 rounded-lg bg-red-50 text-red-600 text-xs font-semibold border border-red-100">{overrideError}</div>}

            <div className="flex gap-2">
              <button onClick={() => { setOverrideTarget(null); setOverrideError(''); }}
                className="flex-1 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleOverride} disabled={overriding || !overrideReason.trim()}
                className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold shadow-sm hover:bg-gray-800 disabled:opacity-60 transition-colors">
                {overriding ? 'Saving...' : 'Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}`;

// ==========================================
// 2. Rewrite OrderFinalizationPanel 
// ==========================================
const newOrderFinalizationPanel = `function OrderFinalizationPanel({ orderId, order, readiness, onRefresh, onNotice, onError }) {
  const [action, setAction] = useState('');
  const [reason, setReason] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const isPending = order?.status === 'pending';
  const isRazorpay = ['razorpay', 'razorpay_upi', 'razorpay_cards'].includes(order?.payment_method);
  const isPaid = order?.payment_status === 'paid';

  const allDecided = readiness?.all_decided ?? false;
  const hasRejections = readiness?.has_rejections ?? false;
  const hasApprovals = readiness?.has_approvals ?? false;

  const handleFinalize = async () => {
    if (!action) return;
    setFinalizing(true);
    onError('');
    try {
      const { error } = await supabase.rpc('admin_finalize_order', {
        p_order_id: orderId,
        p_action: action,
        p_reason: reason || null,
      });
      if (error) throw error;

      if (isRazorpay && isPaid && (action === 'reject_full' || action === 'proceed_partial')) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (!token) throw new Error('No auth token');

          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const refundRes = await fetch(\`\${supabaseUrl}/functions/v1/process-order-refund\`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': \`Bearer \${token}\`,
              'apikey': supabaseAnonKey,
            },
            body: JSON.stringify({
              order_id: orderId,
              mode: action === 'reject_full' ? 'full' : 'partial',
              reason: reason || (action === 'reject_full' ? 'Order rejected by admin' : 'Partial fulfillment — rejected items refunded'),
            }),
          });
          const refundData = await refundRes.json();
          if (!refundRes.ok && !refundData?.skipped) {
            throw new Error(refundData?.error || \`Refund HTTP \${refundRes.status}\`);
          }
        } catch (refundErr) {
          onError(\`Order status updated but refund failed: \${refundErr.message}. Use the "Issue Partial Refund" button to retry.\`);
        }
      }

      setShowConfirm(false);
      setAction('');
      setReason('');
      const msg = action === 'accept'
        ? 'Order accepted → PROCESSING. Ready for shipping.'
        : action === 'reject_full'
          ? \`Order rejected.\${isRazorpay && isPaid ? ' Full refund initiated.' : ' (COD)'}\`
          : \`Proceeding partially.\${isRazorpay && isPaid ? ' Partial refund initiated.' : ' (COD)'}\`;
      onNotice(msg);
      await onRefresh();
    } catch (err) {
      onError(err.message || 'Failed to finalize order');
    } finally {
      setFinalizing(false);
    }
  };

  if (!isPending) return null;

  const totalApproved = (readiness?.seller_approved ?? 0) + (readiness?.admin_approved ?? 0);
  const totalRejected = (readiness?.seller_rejected ?? 0) + (readiness?.admin_rejected ?? 0);
  const totalPending  = (readiness?.seller_pending  ?? 0) + (readiness?.admin_pending  ?? 0);

  return (
    <section className="bg-white rounded-2xl p-6 lg:p-8 border border-neutral-200 shadow-[0_2px_12px_rgb(0,0,0,0.02)] relative mt-6">
      <div className="absolute left-8 -top-6 h-6 w-px bg-gray-200 hidden sm:block"></div>
      <div className="absolute left-8 top-[84px] bottom-6 w-px bg-gray-200 hidden sm:block"></div>

      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-black shadow-md shrink-0">2</div>
        <div>
          <h2 className="text-lg font-bold text-gray-900 tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Finalize Order</h2>
          <p className="text-xs text-gray-500 font-medium">Proceed to shipping or issue refunds.</p>
        </div>
      </div>

      <div className="space-y-5 sm:pl-11 relative z-10">
        {/* Status Summary */}
        <div className={\`flex items-center flex-wrap gap-4 p-4 rounded-xl border \${allDecided ? 'bg-emerald-50/50 border-emerald-100' : 'bg-amber-50/50 border-amber-100'}\`}>
          <div className="flex-1 min-w-0">
             <div className="flex items-center gap-2 mb-1">
               <span className={\`material-symbols-outlined text-lg \${allDecided ? 'text-emerald-500' : 'text-amber-500'}\`}>
                 {allDecided ? 'check_circle' : 'pending_actions'}
               </span>
               <p className={\`text-sm font-semibold \${allDecided ? 'text-emerald-800' : 'text-amber-800'}\`}>
                 {allDecided ? 'All items verified' : \`\${totalPending} item(s) pending review\`}
               </p>
             </div>
             <p className="text-xs text-gray-500 ml-7">
               {allDecided ? 'You can now proceed to the next stage.' : 'Please resolve all items before finalizing.'}
             </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {totalApproved > 0 && <span className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded border border-emerald-200 bg-emerald-50 text-emerald-700">{totalApproved} Approved</span>}
            {totalRejected > 0 && <span className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded border border-red-200 bg-red-50 text-red-700">{totalRejected} Rejected</span>}
            {totalPending > 0  && <span className="px-2.5 py-1 text-[10px] uppercase font-bold tracking-wider rounded border border-amber-200 bg-amber-50 text-amber-700">{totalPending} Pending</span>}
          </div>
        </div>

        {/* Action Selection */}
        {allDecided && !showConfirm && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {hasApprovals && !hasRejections && (
              <button onClick={() => { setAction('accept'); setShowConfirm(true); }}
                className="p-5 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-emerald-300 hover:shadow-md transition-all text-center group">
                <div className="w-10 h-10 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">inventory_2</span>
                </div>
                <h4 className="text-sm font-bold text-gray-900">Proceed &amp; Ship</h4>
                <p className="text-[11px] text-gray-500 mt-1">Order will move to processing</p>
              </button>
            )}

            {hasApprovals && hasRejections && (
              <button onClick={() => { setAction('proceed_partial'); setShowConfirm(true); }}
                className="p-5 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-amber-300 hover:shadow-md transition-all text-center group">
                <div className="w-10 h-10 mx-auto rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined">call_split</span>
                </div>
                <h4 className="text-sm font-bold text-gray-900">Partial Fulfillment</h4>
                <p className="text-[11px] text-gray-500 mt-1">Ship approved, {isPaid ? 'refund' : 'cancel'} rejected</p>
              </button>
            )}

            <button onClick={() => { setAction('reject_full'); setShowConfirm(true); }}
              className="p-5 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-red-300 hover:shadow-md transition-all text-center group md:ml-auto md:col-start-3">
              <div className="w-10 h-10 mx-auto rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined">block</span>
              </div>
              <h4 className="text-sm font-bold text-gray-900">Reject Entire Order</h4>
              <p className="text-[11px] text-gray-500 mt-1">{isPaid ? 'Initiate full refund' : 'Cancel without charge'}</p>
            </button>
          </div>
        )}

        {/* Confirmation State */}
        {showConfirm && (
          <div className="p-6 rounded-xl border border-gray-200 bg-gray-50/80">
            <h4 className="text-base font-bold text-gray-900 mb-1">
              {action === 'accept' ? 'Accept Order?' : action === 'proceed_partial' ? 'Fulfill Partially?' : 'Reject Order?'}
            </h4>
            <p className="text-xs text-gray-600 mb-5 max-w-lg">
              {action === 'accept' && 'This order will move to the Processing stage. You can then assign couriers or generate shipping labels.'}
              {action === 'proceed_partial' && \`This order will move to Processing with only the approved items. \${isPaid && isRazorpay ? 'A partial refund will be automatically calculated and initiated.' : ''}\`}
              {action === 'reject_full' && \`This will cancel the order immediately. \${isPaid && isRazorpay ? 'A full refund will be automatically processed for the customer.' : ''}\`}
            </p>

            {action !== 'accept' && (
              <div className="mb-5 max-w-xl">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Reason for Cancellation</label>
                <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="Customer will see this reason..."
                  className="w-full px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-sm shadow-sm focus:ring-2 focus:ring-[#004a2b]/20 focus:border-[#004a2b] transition-all" />
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)}
                className="px-5 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors shadow-sm">
                Go Back
              </button>
              <button onClick={handleFinalize} disabled={finalizing || (action !== 'accept' && !reason.trim())}
                className={\`px-6 py-2.5 rounded-lg text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 flex items-center gap-2 \${action === 'reject_full' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'}\`}>
                {finalizing && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                {finalizing ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}`;

// Run replacements
replaceFunctionBody('ItemDecisionPanel', newItemDecisionPanel);
replaceFunctionBody('OrderFinalizationPanel', newOrderFinalizationPanel);

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Successfully modernized ItemDecisionPanel and OrderFinalizationPanel');
