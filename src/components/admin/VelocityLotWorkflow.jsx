import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import { supabase } from '../../lib/supabase';

const fmtInr = (v) => {
  if (v === undefined || v === null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return `₹${v}`;
  return n % 1 === 0 ? `₹${n}` : `₹${n.toFixed(2)}`;
};

const velocityInnerPayload = (raw) => {
  const o = raw && typeof raw === 'object' ? raw : {};
  const inner = (o.payload && typeof o.payload === 'object' ? o.payload : o) || {};
  const labelKeys = [
    'label_url', 'shipping_label_url', 'label_pdf_url', 'courier_label_url',
    'awb_label_url', 'label_print_url', 'pdf_url', 'shipping_label',
  ];
  let label_url = inner.label_url;
  if (!label_url || typeof label_url !== 'string') {
    for (const k of labelKeys) {
      const v = inner[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
        label_url = v.trim();
        break;
      }
    }
  }
  return { ...inner, label_url: label_url || inner.label_url };
};

function normVid(s) {
  return String(s || '').trim().toLowerCase();
}

/** Default pickup row for this shipment lot — must match warehouses.velocity_warehouse_id, not merely the first synced pickup in the list. */
function defaultPickupLocationId(rows, warehouse) {
  const list = Array.isArray(rows) ? rows.filter((r) => r?.velocity_warehouse_id) : [];
  if (!list.length) return '';

  const wv = normVid(warehouse?.velocity_warehouse_id);
  const wName = String(warehouse?.warehouse_name || warehouse?.name || '').trim();

  if (wv) {
    const hit = list.find((r) => normVid(r.velocity_warehouse_id) === wv);
    if (hit?.id) return hit.id;
  }
  if (wName) {
    const byVidAsName = list.find((r) => normVid(r.velocity_warehouse_id) === normVid(wName));
    if (byVidAsName?.id) return byVidAsName.id;
    const byLocName = list.find(
      (r) => String(r.warehouse_name || '').trim().toLowerCase() === wName.toLowerCase(),
    );
    if (byLocName?.id) return byLocName.id;
  }
  return list[0]?.id || '';
}

function pickupMatchesLotWarehouse(loc, warehouse) {
  if (!loc?.velocity_warehouse_id || !warehouse) return false;
  const wv = normVid(warehouse.velocity_warehouse_id);
  const wName = String(warehouse.warehouse_name || warehouse.name || '').trim();
  const lv = normVid(loc.velocity_warehouse_id);
  if (wv && lv === wv) return true;
  if (wName && lv === normVid(wName)) return true;
  if (wName && String(loc.warehouse_name || '').trim().toLowerCase() === wName.toLowerCase()) return true;
  return false;
}

function toUserError(err, fallback = 'Something went wrong.') {
  const msg = String(err?.message || err || '').trim();
  if (!msg) return fallback;
  const lower = msg.toLowerCase();
  if (lower.includes('invalid or expired token') || lower.includes('no auth token') || lower.includes('unauthorized')) {
    return 'Your session expired. Please sign in again and retry.';
  }
  if (lower.includes('unsupported jwt algorithm') || lower.includes('unsupported_token_algorithm')) {
    return 'Auth gateway rejected the token. Redeploy velocity-orchestrator with JWT verification disabled for this project or use a fresh session.';
  }
  return msg;
}

function pickEtaText(carrier) {
  const c = carrier && typeof carrier === 'object' ? carrier : {};
  const rq = c.rate_quote && typeof c.rate_quote === 'object' ? c.rate_quote : {};
  const exp = c.expected_delivery && typeof c.expected_delivery === 'object' ? c.expected_delivery : {};
  const rqExp = rq.expected_delivery && typeof rq.expected_delivery === 'object' ? rq.expected_delivery : {};
  const candidates = [
    exp.delivery, exp.estimated_delivery, exp.date, exp.delivery_date, exp.edd,
    rqExp.delivery, rqExp.estimated_delivery, rqExp.date, rqExp.delivery_date, rqExp.edd,
    c.estimated_delivery, c.delivery_date, c.edd,
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function formatStatusLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Self-contained Velocity steps for one order_shipments lot (multi-shipment mode).
 */
export default function VelocityLotWorkflow({
  orderId,
  lot,
  pickupLocations,
  onRefresh,
  onNotice,
}) {
  const lotId = lot?.id;
  const [velStep, setVelStep] = useState('idle');
  const [velServiceability, setVelServiceability] = useState(null);
  const [velCarrierId, setVelCarrierId] = useState('');
  const [velLength, setVelLength] = useState('15');
  const [velBreadth, setVelBreadth] = useState('15');
  const [velHeight, setVelHeight] = useState('10');
  const [velWeight, setVelWeight] = useState('0.5');
  const [velShipmentId, setVelShipmentId] = useState('');
  const [velResult, setVelResult] = useState(null);
  const [velError, setVelError] = useState('');
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRows, setTimelineRows] = useState([]);
  const [showLotMeta, setShowLotMeta] = useState(false);
  const [lotMetaLoading, setLotMetaLoading] = useState(false);
  const [lotMetaProducts, setLotMetaProducts] = useState([]);
  const [pickupLocationId, setPickupLocationId] = useState('');
  const resumeKeyRef = useRef('');

  const pendingSid = lot?.velocity_pending_shipment_id ? String(lot.velocity_pending_shipment_id).trim() : '';
  const effectivePending = pendingSid;

  useEffect(() => {
    const rows = pickupLocations || [];
    const preferred = defaultPickupLocationId(rows, lot?.warehouse);
    setPickupLocationId((prev) => {
      const prevLoc = prev ? rows.find((r) => r.id === prev) : null;
      if (prevLoc && pickupMatchesLotWarehouse(prevLoc, lot?.warehouse)) return prev;
      return preferred;
    });
  }, [pickupLocations, lot?.warehouse]);

  useEffect(() => {
    if (!effectivePending || !lotId) return;
    const key = `${lotId}:${effectivePending}`;
    if (resumeKeyRef.current === key) return;
    resumeKeyRef.current = key;
    setVelShipmentId(effectivePending);
    setVelStep((step) => (step === 'done' ? 'done' : 'pending_assign'));
    const vf = lot?.velocity_fulfillment && typeof lot.velocity_fulfillment === 'object'
      ? lot.velocity_fulfillment
      : null;
    if (vf) {
      if (vf.pickup_location_id) setPickupLocationId(String(vf.pickup_location_id));
      if (vf.length != null) setVelLength(String(vf.length));
      if (vf.breadth != null) setVelBreadth(String(vf.breadth));
      if (vf.height != null) setVelHeight(String(vf.height));
      if (vf.weight != null) setVelWeight(String(vf.weight));
      if (vf.serviceability && typeof vf.serviceability === 'object') {
        setVelServiceability(vf.serviceability);
      }
    }
  }, [effectivePending, lotId, lot?.velocity_fulfillment]);

  useEffect(() => {
    let active = true;
    const loadTimeline = async () => {
      if (!lotId) return;
      setTimelineLoading(true);
      try {
        const { data, error } = await supabase
          .from('order_shipment_tracking_events')
          .select('id, source, activity, location, carrier_remark, event_time, created_at, raw_payload')
          .eq('order_shipment_id', lotId)
          .order('event_time', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        if (active) setTimelineRows(Array.isArray(data) ? data : []);
      } catch {
        if (active) setTimelineRows([]);
      } finally {
        if (active) setTimelineLoading(false);
      }
    };
    loadTimeline();
    return () => { active = false; };
  }, [lotId, lot?.tracking_number, lot?.carrier_shipment_status]);

  const velocityDimsValid = () => {
    const l = parseFloat(velLength);
    const b = parseFloat(velBreadth);
    const h = parseFloat(velHeight);
    const w = parseFloat(velWeight);
    return [l, b, h, w].every((n) => Number.isFinite(n) && n > 0);
  };

  const velocityPickupReady = () => {
    const rows = pickupLocations || [];
    const loc = rows.find((r) => r.id === pickupLocationId);
    return !!(loc && loc.velocity_warehouse_id);
  };

  const sortedVelocityCarriers = useMemo(() => {
    const list = [...(velServiceability?.carriers || [])];
    list.sort((a, b) => {
      const aq = a.rate_quote?.charges ? 1 : 0;
      const bq = b.rate_quote?.charges ? 1 : 0;
      if (aq !== bq) return bq - aq;
      const ta = Number(a.rate_quote?.charges?.total_forward_charges ?? Number.POSITIVE_INFINITY);
      const tb = Number(b.rate_quote?.charges?.total_forward_charges ?? Number.POSITIVE_INFINITY);
      if (ta !== tb) return ta - tb;
      return String(a.carrier_name || '').localeCompare(String(b.carrier_name || ''));
    });
    return list;
  }, [velServiceability?.carriers]);

  const serviceabilitySummary = useMemo(() => {
    const svc = velServiceability && typeof velServiceability === 'object' ? velServiceability : null;
    if (!svc) return null;
    const details = svc.rates_shipment_details && typeof svc.rates_shipment_details === 'object'
      ? svc.rates_shipment_details
      : null;
    const chargeValues = (svc.carriers || [])
      .map((c) => Number(c?.rate_quote?.charges?.total_forward_charges))
      .filter((v) => Number.isFinite(v));
    const minCharge = chargeValues.length ? Math.min(...chargeValues) : null;
    const maxCharge = chargeValues.length ? Math.max(...chargeValues) : null;
    return {
      zone: String(svc.zone || details?.zone || '—'),
      paymentMode: String(svc.payment_mode || details?.payment_method || '—').toUpperCase(),
      customerPincode: String(svc.customer_pincode || details?.destination_pincode || '—'),
      pickupLocation: String(svc.pickup_location || '—'),
      pickupPincode: String(svc.pickup_pincode || details?.origin_pincode || '—'),
      pickupSource: String(svc.pickup_source || '—').replace(/_/g, ' '),
      deadWeight: details?.dead_weight ?? null,
      volumetricWeight: details?.volumetric_weight ?? null,
      applicableWeight: details?.applicable_weight ?? null,
      minCharge,
      maxCharge,
      ratesNote: typeof svc.rates_note === 'string' ? svc.rates_note : '',
    };
  }, [velServiceability]);

  const callVelocityFn = async (body) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('No auth token — please sign in again');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const res = await fetch(`${supabaseUrl}/functions/v1/velocity-orchestrator`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({
        action: body.action,
        payload: { order_id: orderId, order_shipment_id: lotId, ...body.payload },
      }),
    });
    let data;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(res.ok ? 'Invalid response from shipping service' : `HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data?.data ?? {};
  };

  const checkServiceability = async () => {
    if (!velocityPickupReady()) {
      setVelError('Select a pickup location synced with Velocity (warehouse id present).');
      return;
    }
    if (!velocityDimsValid()) {
      setVelError('Enter valid package dimensions (all values must be greater than zero).');
      return;
    }
    setVelStep('checking');
    setVelError('');
    setVelServiceability(null);
    setVelResult(null);
    try {
      const data = await callVelocityFn({
        action: 'check_serviceability',
        payload: {
          pickup_location_id: pickupLocationId,
          length: parseFloat(velLength),
          breadth: parseFloat(velBreadth),
          height: parseFloat(velHeight),
          weight: parseFloat(velWeight),
        },
      });
      setVelServiceability(data);
      setVelStep(data.serviceable ? (effectivePending ? 'pending_assign' : 'ready') : 'error');
      if (!data.serviceable) setVelError('This delivery pincode is not serviceable for the selected pickup PIN.');
    } catch (e) {
      setVelStep('error');
      setVelError(toUserError(e, 'Could not check serviceability.'));
    }
  };

  const createVelocityForwardOrder = async () => {
    setVelStep('creating_order');
    setVelError('');
    try {
      const data = await callVelocityFn({
        action: 'create_forward_order',
        payload: {
          pickup_location_id: pickupLocationId,
          length: parseFloat(velLength),
          breadth: parseFloat(velBreadth),
          height: parseFloat(velHeight),
          weight: parseFloat(velWeight),
          serviceability_snapshot: velServiceability,
        },
      });
      const inner = velocityInnerPayload(data);
      const sid = String(inner.shipment_id || '').trim();
      if (!sid) throw new Error('Velocity did not return shipment_id.');
      setVelShipmentId(sid);
      setVelStep('pending_assign');
      await onRefresh();
      onNotice(`Velocity shipment order created for ${lot.label || 'lot'} — Shipment ID: ${sid}`);
    } catch (e) {
      setVelStep('ready');
      setVelError(toUserError(e, 'Shipment order could not be created.'));
    }
  };

  const assignVelocityCourier = async () => {
    const sid = velShipmentId || effectivePending;
    if (!sid) {
      setVelError('Missing Velocity shipment id.');
      return;
    }
    setVelStep('assigning');
    setVelError('');
    try {
      const data = await callVelocityFn({
        action: 'assign_courier',
        payload: {
          shipment_id: sid,
          carrier_id: velCarrierId || '',
        },
      });
      setVelResult(data);
      setVelStep('done');
      const p = velocityInnerPayload(data);
      onNotice(`Shipment created — AWB: ${p.awb_code || '—'}${p.courier_name ? ` — ${p.courier_name}` : ''}`);
      await onRefresh();
      try {
        const awb = String(p.awb_code || '').trim();
        if (awb) {
          await callVelocityFn({ action: 'track_order', payload: { awbs: [awb] } });
          await onRefresh();
        }
      } catch {
        /* non-fatal */
      }
    } catch (e) {
      setVelStep('pending_assign');
      setVelError(toUserError(e, 'Courier assignment failed.'));
    }
  };

  const velocityDonePayload = velStep === 'done' && velResult ? velocityInnerPayload(velResult) : null;
  const velocityDoneCharges = velocityDonePayload?.charges?.frwd_charges;
  const effectiveAwb = String(
    lot?.tracking_number ||
    lot?.velocity_awb ||
    velocityDonePayload?.awb_code ||
    '',
  ).trim();
  const effectiveLabelUrl = String(
    lot?.velocity_label_url ||
    velocityDonePayload?.label_url ||
    '',
  ).trim();
  const effectiveTrackingUrl = String(lot?.velocity_tracking_url || '').trim();
  const effectiveCarrierName = String(
    lot?.velocity_carrier_name ||
    velocityDonePayload?.courier_name ||
    '',
  ).trim();
  const effectiveShipmentStatus = String(lot?.carrier_shipment_status || '').trim();
  const pickupStartedStatuses = new Set([
    'picked_up', 'picked', 'picked up', 'manifested',
    'in_transit', 'out_for_delivery', 'delivered', 'ndr_raised', 'need_attention',
    'reattempt_delivery', 'rto_initiated', 'rto_in_transit', 'rto_delivered', 'lost', 'cancelled',
  ]);
  const canCancelCourier = !!effectiveAwb && !pickupStartedStatuses.has(effectiveShipmentStatus.toLowerCase());
  const parcelDims = {
    length: lot?.velocity_fulfillment?.length ?? velLength,
    breadth: lot?.velocity_fulfillment?.breadth ?? velBreadth,
    height: lot?.velocity_fulfillment?.height ?? velHeight,
    weight: lot?.velocity_fulfillment?.weight ?? velWeight,
  };
  const showPreAwbSetup = !effectiveAwb;

  const openLotMeta = async () => {
    setShowLotMeta((v) => !v);
    if (lotMetaProducts.length > 0 || !lotId) return;
    setLotMetaLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('id, quantity, lot_name, products(name, key)')
        .eq('order_shipment_id', lotId);
      if (error) throw error;
      const rows = (data || []).map((r) => ({
        id: r.id,
        qty: Number(r.quantity || 0),
        name: r.products?.name || r.lot_name || 'Product',
        key: r.products?.key || '',
      }));
      setLotMetaProducts(rows);
    } catch {
      setLotMetaProducts([]);
    } finally {
      setLotMetaLoading(false);
    }
  };

  const refreshLotTracking = async () => {
    if (!effectiveAwb) {
      setVelError('Tracking/AWB is missing for this shipment lot.');
      return;
    }
    setTrackingBusy(true);
    setVelError('');
    try {
      await callVelocityFn({
        action: 'track_order',
        payload: { order_shipment_id: lotId, awbs: [effectiveAwb] },
      });
      await onRefresh();
      const { data, error } = await supabase
        .from('order_shipment_tracking_events')
        .select('id, source, activity, location, carrier_remark, event_time, created_at, raw_payload')
        .eq('order_shipment_id', lotId)
        .order('event_time', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error) setTimelineRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setVelError(toUserError(e, 'Could not refresh shipment tracking.'));
    } finally {
      setTrackingBusy(false);
    }
  };

  const cancelLotCourier = async () => {
    if (!canCancelCourier) {
      setVelError('Cancellation is allowed only before pickup starts for this lot.');
      return;
    }
    setCancelBusy(true);
    setVelError('');
    try {
      await callVelocityFn({ action: 'cancel_order', payload: { order_shipment_id: lotId } });
      onNotice(`Courier cancelled for ${lot?.label || 'shipment lot'}.`);
      await onRefresh();
      const { data, error } = await supabase
        .from('order_shipment_tracking_events')
        .select('id, source, activity, location, carrier_remark, event_time, created_at, raw_payload')
        .eq('order_shipment_id', lotId)
        .order('event_time', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error) setTimelineRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setVelError(toUserError(e, 'Courier cancellation failed.'));
    } finally {
      setCancelBusy(false);
    }
  };

  if (!lotId) return null;

  return (
    <div className="space-y-4">
      {showPreAwbSetup && velStep !== 'done' && (
        <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">1</span>
            Package dimensions &amp; pickup warehouse
          </p>
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Length (cm)', value: velLength, setter: setVelLength },
                { label: 'Breadth (cm)', value: velBreadth, setter: setVelBreadth },
                { label: 'Height (cm)', value: velHeight, setter: setVelHeight },
                { label: 'Weight (kg)', value: velWeight, setter: setVelWeight },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <label className="block text-[10px] font-bold text-gray-900-variant uppercase tracking-wider mb-1.5">{label}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    readOnly={!!effectivePending}
                    className={`w-full px-3 py-2.5 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary ${effectivePending ? 'opacity-75 cursor-not-allowed' : ''}`}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-900-variant uppercase tracking-wider mb-1.5">
                Pickup location &amp; Velocity warehouse_id
              </label>
              <select
                value={pickupLocationId}
                onChange={(e) => setPickupLocationId(e.target.value)}
                disabled={!!effectivePending}
                className={`w-full px-4 py-3 border border-outline-variant/50 rounded-xl bg-surface text-sm focus:ring-2 focus:ring-secondary ${effectivePending ? 'opacity-75 cursor-not-allowed' : ''}`}
              >
                {(pickupLocations || []).length === 0 && (
                  <option value="">No warehouses mapped for this shipment lot</option>
                )}
                {(pickupLocations || []).map((loc) => (
                  <option key={loc.id} value={loc.id} disabled={!loc.velocity_warehouse_id}>
                    {loc.warehouse_name} · PIN {loc.pincode}
                    {loc.velocity_warehouse_id ? ` · ${loc.velocity_warehouse_id}` : ' (not synced)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {showPreAwbSetup && velStep === 'idle' && !effectivePending && (
        <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 shadow-sm">
          <p className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center shrink-0">2</span>
            Check serviceability
          </p>
          <Button
            type="button"
            onClick={checkServiceability}
            disabled={!velocityPickupReady() || !velocityDimsValid()}
            variant="contained"
            color="primary"
          >
            Check serviceability
          </Button>
        </div>
      )}

      {showPreAwbSetup && velStep === 'checking' && (
        <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 flex items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-gray-900 text-xl">progress_activity</span>
          <p className="text-sm text-gray-900-variant">Checking serviceability…</p>
        </div>
      )}

      {showPreAwbSetup && velStep === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">{velError}</p>
          <Button type="button" onClick={() => { setVelStep('idle'); setVelError(''); setVelServiceability(null); }} variant="text" color="error" size="small" sx={{ mt: 1 }}>
            Start over
          </Button>
        </div>
      )}

      {showPreAwbSetup && (velStep === 'ready' || velStep === 'creating_order') && velServiceability && !effectivePending && (
        <>
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-emerald-900">Route is serviceable</p>
                <p className="text-xs text-emerald-800 mt-1">
                  {serviceabilitySummary?.pickupPincode || '—'} → {serviceabilitySummary?.customerPincode || '—'} · Zone {serviceabilitySummary?.zone || '—'}
                </p>
              </div>
              {serviceabilitySummary?.minCharge != null && serviceabilitySummary?.maxCharge != null && (
                <div className="shrink-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-right">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold">Shipping fee range</p>
                  <p className="text-sm font-bold text-emerald-900">
                    {fmtInr(serviceabilitySummary.minCharge)} - {fmtInr(serviceabilitySummary.maxCharge)}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Pickup</p>
                <p className="text-xs font-semibold text-gray-900 truncate">{serviceabilitySummary?.pickupLocation || '—'}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Pickup source</p>
                <p className="text-xs font-semibold text-gray-900 capitalize">{serviceabilitySummary?.pickupSource || '—'}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Payment mode</p>
                <p className="text-xs font-semibold text-gray-900">{serviceabilitySummary?.paymentMode || '—'}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Dead wt (g)</p>
                <p className="text-xs font-semibold text-gray-900">{serviceabilitySummary?.deadWeight ?? '—'}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Volumetric (g)</p>
                <p className="text-xs font-semibold text-gray-900">{serviceabilitySummary?.volumetricWeight ?? '—'}</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Applicable wt (g)</p>
                <p className="text-xs font-semibold text-gray-900">{serviceabilitySummary?.applicableWeight ?? '—'}</p>
              </div>
            </div>
            {serviceabilitySummary?.ratesNote && (
              <p className="text-[11px] text-emerald-800 mt-3">{serviceabilitySummary.ratesNote}</p>
            )}
          </div>
          <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-gray-900 mb-2">
              Create shipment order <span className="text-xs font-normal text-gray-900-variant">(forward-order)</span>
            </p>
            <Button type="button" onClick={createVelocityForwardOrder} disabled={velStep === 'creating_order'} variant="contained" color="primary">
              {velStep === 'creating_order' ? 'Creating…' : 'Create order on Velocity'}
            </Button>
          </div>
        </>
      )}

      {showPreAwbSetup && velStep !== 'done' && (velStep === 'pending_assign' || velStep === 'assigning' || !!effectivePending) && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-4">
          <p className="text-sm font-bold text-gray-900">
            Select courier · Velocity shipment: <span className="font-mono">{velShipmentId || effectivePending}</span>
          </p>
          {sortedVelocityCarriers.length === 0 && (
            <div className="rounded-xl border border-outline-variant/30 bg-white p-3 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-900-variant">
                Courier list unavailable. Fetch latest available couriers for this lot.
              </p>
              <Button
                type="button"
                variant="outlined"
                color="inherit"
                size="small"
                onClick={checkServiceability}
                disabled={!velocityPickupReady() || !velocityDimsValid() || velStep === 'checking'}
              >
                {velStep === 'checking' ? 'Fetching…' : 'Fetch couriers'}
              </Button>
            </div>
          )}
          {velError && velStep === 'pending_assign' && <p className="text-xs text-red-700">{velError}</p>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVelCarrierId('')}
              className={`rounded-xl border p-3 text-left ${!velCarrierId ? 'border-primary bg-primary/5' : 'border-outline-variant/30 bg-white hover:border-outline-variant/60'}`}
            >
              <p className="text-sm font-bold">Auto-assign</p>
              <p className="text-[11px] text-gray-900-variant mt-1">
                Let Velocity choose the best courier based on serviceability and pricing rules.
              </p>
            </button>
            {sortedVelocityCarriers.map((c) => {
              const rq = c.rate_quote;
              const ch = rq?.charges;
              const isServiceableCourier = !!rq;
              const shipping = ch?.forward_freight_charges ?? ch?.shipping_charges ?? ch?.freight_charges;
              const cod = ch?.cod_charges ?? 0;
              const total = ch?.total_forward_charges ?? ch?.total_charges;
              const eta = pickEtaText(c);
              const selected = isServiceableCourier && velCarrierId === c.carrier_id;
              return (
                <button
                  key={c.carrier_id}
                  type="button"
                  onClick={() => {
                    if (!isServiceableCourier) return;
                    setVelCarrierId(c.carrier_id);
                  }}
                  disabled={!isServiceableCourier}
                  className={`rounded-xl border p-3 text-left transition-colors ${selected ? 'border-primary bg-primary/5' : 'border-outline-variant/30 bg-white'} ${isServiceableCourier ? 'hover:border-outline-variant/60' : 'opacity-70 cursor-not-allowed'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-gray-900">{c.carrier_name || 'Courier'}</p>
                    {!isServiceableCourier ? (
                      <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-red-50 text-red-700 border border-red-200">
                        Not serviceable
                      </span>
                    ) : eta ? (
                      <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-surface-container text-gray-700">
                        ETA {eta}
                      </span>
                    ) : null}
                  </div>
                  {!isServiceableCourier ? (
                    <p className="mt-2 text-[11px] text-red-700">
                      This courier is not serviceable for current lane, weight, or dimensions.
                    </p>
                  ) : (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div className="rounded-lg bg-surface-container-low px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Shipping</p>
                        <p className="font-semibold text-gray-900 tabular-nums">{fmtInr(shipping)}</p>
                      </div>
                      <div className="rounded-lg bg-surface-container-low px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">COD</p>
                        <p className="font-semibold text-gray-900 tabular-nums">{fmtInr(cod)}</p>
                      </div>
                      <div className="rounded-lg bg-surface-container-low px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Total</p>
                        <p className="font-semibold text-gray-900 tabular-nums">{fmtInr(total)}</p>
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <Button type="button" onClick={assignVelocityCourier} disabled={velStep === 'assigning'} variant="contained" color="primary" fullWidth>
            {velStep === 'assigning' ? 'Generating AWB…' : 'Generate AWB'}
          </Button>
        </div>
      )}

      {velocityDonePayload && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-bold text-emerald-800 mb-2">Shipping created</p>
          <p className="text-xs text-emerald-800">
            AWB: <span className="font-mono font-bold">{velocityDonePayload.awb_code || '—'}</span>
            {velocityDonePayload.courier_name && ` · ${velocityDonePayload.courier_name}`}
          </p>
          {velocityDoneCharges && (
            <p className="text-xs mt-1">Shipping ₹{velocityDoneCharges.shipping_charges}</p>
          )}
          {velocityDonePayload.label_url && (
            <a href={velocityDonePayload.label_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-xs font-bold text-emerald-900 underline">
              Download label
            </a>
          )}
        </div>
      )}

      {effectiveAwb && (
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Shipment Control Center</p>
              <p className="text-lg font-bold text-slate-900">Shipment lot tracking and actions</p>
            </div>
            <button
              type="button"
              onClick={openLotMeta}
              title="Parcel dimensions and lot products"
              className="w-8 h-8 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[16px]">info</span>
            </button>
          </div>
          {showLotMeta && (
            <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 space-y-2">
              <p className="text-xs font-bold text-gray-900">Parcel dimensions</p>
              <p className="text-[11px] text-gray-900-variant">
                L {parcelDims.length || '—'} cm · B {parcelDims.breadth || '—'} cm · H {parcelDims.height || '—'} cm · W {parcelDims.weight || '—'} kg
              </p>
              <p className="text-xs font-bold text-gray-900 mt-2">Products in this shipping lot</p>
              {lotMetaLoading ? (
                <p className="text-[11px] text-gray-900-variant">Loading products…</p>
              ) : lotMetaProducts.length === 0 ? (
                <p className="text-[11px] text-gray-900-variant">No assigned products found.</p>
              ) : (
                <div className="space-y-1">
                  {lotMetaProducts.map((p) => (
                    <p key={p.id} className="text-[11px] text-gray-900">
                      {p.name} {p.key ? `(${p.key})` : ''} · Qty {p.qty}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Shipment Status</p>
              <p className="text-sm font-bold text-slate-900 mt-1">{formatStatusLabel(effectiveShipmentStatus)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Courier Details</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{effectiveCarrierName || '—'}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tracking ID (AWB)</p>
              <p className="text-sm font-mono text-slate-900 mt-1 break-all">{effectiveAwb}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tracking Events Count</p>
              <p className="text-sm font-bold text-slate-900 mt-1">{timelineRows.length}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={refreshLotTracking} disabled={trackingBusy} variant="contained" color="primary" size="small">
              {trackingBusy ? 'Refreshing…' : 'Refresh shipment status'}
            </Button>
            <Button type="button" onClick={cancelLotCourier} disabled={cancelBusy || !canCancelCourier} variant="outlined" color="error" size="small">
              {cancelBusy ? 'Cancelling…' : 'Cancel courier'}
            </Button>
            {effectiveLabelUrl && (
              <Button
                type="button"
                variant="outlined"
                color="inherit"
                size="small"
                onClick={() => window.open(effectiveLabelUrl, '_blank', 'noopener,noreferrer')}
              >
                Print label
              </Button>
            )}
            {effectiveTrackingUrl && (
              <a href={effectiveTrackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800">
                Tracking page link
              </a>
            )}
          </div>
          {!canCancelCourier && (
            <p className="text-[11px] text-slate-500">
              Cancel courier is disabled because pickup has already started for this shipment.
            </p>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <p className="text-xs font-bold text-slate-900 mb-2">Tracking timeline/history for this specific lot</p>
            {timelineLoading ? (
              <p className="text-xs text-slate-500">Loading timeline…</p>
            ) : timelineRows.length === 0 ? (
              <p className="text-xs text-slate-500">No tracking history yet for this shipment lot.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {timelineRows.map((ev) => {
                  const ts = ev?.event_time || ev?.created_at;
                  return (
                    <div key={ev.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <p className="text-xs font-semibold text-slate-900">{formatStatusLabel(ev.activity || 'Status updated')}</p>
                      <p className="text-[11px] text-slate-600">
                        {ev.location || 'Unknown location'}
                        {ev.carrier_remark ? ` · ${ev.carrier_remark}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {ts ? new Date(ts).toLocaleString('en-IN') : '—'} · {formatStatusLabel(ev.source || 'system')}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
