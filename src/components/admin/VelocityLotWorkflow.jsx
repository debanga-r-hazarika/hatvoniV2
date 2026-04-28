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
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  if (compact === 'readyforreceive' || compact === 'readyforpickup') {
    return 'Ready for Receive/Pickup';
  }
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveEventLocation(ev) {
  if (typeof ev?.location === 'string' && ev.location.trim()) return ev.location.trim();
  const payload = ev?.raw_payload && typeof ev.raw_payload === 'object' ? ev.raw_payload : null;
  if (!payload) return '';
  const candidates = [
    payload.location,
    payload.current_location,
    payload.location_name,
    payload.city,
    payload.current_city,
    payload.pickup_city,
    payload.hub,
    payload.hub_name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

function statusStageKey(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('deliver')) return 'delivered';
  if (s.includes('transit') || s.includes('out for delivery')) return 'transit';
  if (s.includes('pickup') || s.includes('receive') || s.includes('manifest')) return 'ready_pickup';
  if (s.includes('cancel')) return 'cancelled';
  return 'confirmed';
}

function parseWebhookStatusChange(rawPayload, fallbackTs, ev = null) {
  const root = rawPayload && typeof rawPayload === 'object' ? rawPayload : null;
  const data = root && root.data && typeof root.data === 'object' ? root.data : (root || {});
  const statusRaw =
    String(data.status || data.shipment_status || ev?.activity || '').trim();
  if (!statusRaw) return null;
  const eventTs = String((root && root.event_timestamp) || fallbackTs || '').trim();
  const eventMs = eventTs ? Date.parse(eventTs) : Number.NaN;
  return {
    eventId: String((root && root.event_id) || ev?.id || `${eventTs}:${statusRaw}:${ev?.source || ''}`).trim(),
    source: String(ev?.source || '').toLowerCase(),
    eventTimestamp: eventTs,
    eventMs,
    latestStatus: statusRaw,
    ndrReason: String(data.ndr_reason || data.reason || '').trim(),
    originalEdd: String(data.original_edd || data.promised_delivery_date || '').trim(),
    updatedEdd: String(data.estimated_delivery_date || data.updated_estimated_delivery_date || '').trim(),
    carrierName: String(data.carrier_name || '').trim(),
    trackingNumber: String(data.tracking_number || data.awb || '').trim(),
    rawPayload: rawPayload && typeof rawPayload === 'object' ? rawPayload : null,
  };
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
  const [showWebhookInfoModal, setShowWebhookInfoModal] = useState(false);
  const [webhookSearch, setWebhookSearch] = useState('');
  const [webhookStatusFilter, setWebhookStatusFilter] = useState('all');
  const [webhookFromDate, setWebhookFromDate] = useState('');
  const [webhookToDate, setWebhookToDate] = useState('');
  const [webhookSortDir, setWebhookSortDir] = useState('desc');
  const [selectedWebhookRowId, setSelectedWebhookRowId] = useState('');
  const [webhookPage, setWebhookPage] = useState(1);
  const [webhookLive, setWebhookLive] = useState(false);
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
          .in('source', ['webhook', 'cancel_api'])
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
    if (body?.action === 'track_order' && !lotId) {
      throw new Error('Shipment refresh requires a shipment lot id.');
    }
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
  const webhookStatusRows = useMemo(() => (
    timelineRows
      .map((ev) => parseWebhookStatusChange(ev?.raw_payload, ev?.event_time || ev?.created_at, ev))
      .filter(Boolean)
  ), [timelineRows]);
  const availableWebhookStatuses = useMemo(() => {
    const uniq = new Set(webhookStatusRows.map((r) => formatStatusLabel(r.latestStatus || '')).filter(Boolean));
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [webhookStatusRows]);
  const filteredWebhookRows = useMemo(() => {
    const q = webhookSearch.trim().toLowerCase();
    const fromMs = webhookFromDate ? Date.parse(`${webhookFromDate}T00:00:00`) : Number.NaN;
    const toMs = webhookToDate ? Date.parse(`${webhookToDate}T23:59:59`) : Number.NaN;
    const rows = webhookStatusRows.filter((row) => {
      if (webhookStatusFilter !== 'all' && formatStatusLabel(row.latestStatus || '') !== webhookStatusFilter) return false;
      if (Number.isFinite(fromMs) && (!Number.isFinite(row.eventMs) || row.eventMs < fromMs)) return false;
      if (Number.isFinite(toMs) && (!Number.isFinite(row.eventMs) || row.eventMs > toMs)) return false;
      if (!q) return true;
      const hay = [
        row.latestStatus,
        row.ndrReason,
        row.carrierName,
        row.trackingNumber,
        row.originalEdd,
        row.updatedEdd,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
    rows.sort((a, b) => {
      const av = Number.isFinite(a.eventMs) ? a.eventMs : 0;
      const bv = Number.isFinite(b.eventMs) ? b.eventMs : 0;
      return webhookSortDir === 'asc' ? av - bv : bv - av;
    });
    return rows;
  }, [webhookStatusFilter, webhookFromDate, webhookSearch, webhookSortDir, webhookStatusRows, webhookToDate]);
  const selectedWebhookRow = useMemo(
    () => filteredWebhookRows.find((r) => r.eventId === selectedWebhookRowId) || null,
    [filteredWebhookRows, selectedWebhookRowId],
  );
  const webhookRowsPerPage = 12;
  const webhookTotalPages = Math.max(1, Math.ceil(filteredWebhookRows.length / webhookRowsPerPage));
  const pagedWebhookRows = useMemo(() => {
    const start = (webhookPage - 1) * webhookRowsPerPage;
    return filteredWebhookRows.slice(start, start + webhookRowsPerPage);
  }, [filteredWebhookRows, webhookPage]);
  const selectedWebhookRowIdx = useMemo(
    () => filteredWebhookRows.findIndex((r) => r.eventId === selectedWebhookRowId),
    [filteredWebhookRows, selectedWebhookRowId],
  );
  const previousWebhookRow = useMemo(
    () => (selectedWebhookRowIdx >= 0 ? filteredWebhookRows[selectedWebhookRowIdx + 1] || null : null),
    [filteredWebhookRows, selectedWebhookRowIdx],
  );
  const rowSlaRisk = (row) => {
    const original = row?.originalEdd ? Date.parse(row.originalEdd) : Number.NaN;
    const updated = row?.updatedEdd ? Date.parse(row.updatedEdd) : Number.NaN;
    if (!Number.isFinite(original) || !Number.isFinite(updated)) return { label: '—', tone: 'slate' };
    const diffDays = Math.round((updated - original) / 86400000);
    if (diffDays <= 0) return { label: 'On track', tone: 'emerald' };
    if (diffDays <= 1) return { label: `+${diffDays}d minor slip`, tone: 'amber' };
    return { label: `+${diffDays}d delay`, tone: 'red' };
  };
  const exportWebhookCsv = () => {
    if (!filteredWebhookRows.length) return;
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['event_timestamp', 'latest_status', 'ndr_reason', 'original_edd', 'updated_edd', 'carrier_name', 'tracking_number', 'source', 'sla_risk'];
    const lines = filteredWebhookRows.map((r) => {
      const risk = rowSlaRisk(r).label;
      return [
        r.eventTimestamp,
        formatStatusLabel(r.latestStatus || ''),
        r.ndrReason || '',
        r.originalEdd || '',
        r.updatedEdd || '',
        r.carrierName || '',
        r.trackingNumber || '',
        r.source || '',
        risk,
      ].map(esc).join(',');
    });
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shipment-lot-webhook-updates-${lotId || 'lot'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  useEffect(() => {
    if (webhookFromDate && webhookToDate && webhookFromDate > webhookToDate) {
      setWebhookToDate(webhookFromDate);
    }
  }, [webhookFromDate, webhookToDate]);
  useEffect(() => {
    setWebhookPage(1);
  }, [webhookSearch, webhookStatusFilter, webhookFromDate, webhookToDate, webhookSortDir]);
  useEffect(() => {
    if (!showWebhookInfoModal) {
      setWebhookLive(false);
    }
  }, [showWebhookInfoModal]);
  const webhookSourceSummary = useMemo(() => {
    const summary = { webhook: 0, cancelApi: 0 };
    for (const ev of timelineRows) {
      const src = String(ev?.source || '').toLowerCase();
      if (src === 'webhook') summary.webhook += 1;
      if (src === 'cancel_api') summary.cancelApi += 1;
    }
    return summary;
  }, [timelineRows]);
  const timelineDisplayRows = useMemo(() => {
    const rows = [...timelineRows];
    const collapsed = [];
    for (const ev of rows) {
      const status = formatStatusLabel(ev?.activity || 'Status updated');
      const src = String(ev?.source || '').toLowerCase();
      const location = resolveEventLocation(ev);
      const prev = collapsed[collapsed.length - 1];
      if (prev && prev.status === status && prev.source === src && prev.location === location) {
        continue;
      }
      const ts = String(ev?.event_time || ev?.created_at || '').trim();
      const dayKey = ts ? new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Unknown date';
      collapsed.push({
        id: ev?.id,
        ts,
        dayKey,
        source: src,
        status,
        location,
        remark: String(ev?.carrier_remark || '').trim(),
      });
    }
    return collapsed;
  }, [timelineRows]);
  const timelineStageProgress = useMemo(() => {
    const stages = ['confirmed', 'ready_pickup', 'transit', 'delivered'];
    let highest = 0;
    for (const row of timelineDisplayRows) {
      const k = statusStageKey(row.status);
      const i = stages.indexOf(k);
      if (i > highest) highest = i;
    }
    return stages.map((k, i) => ({
      key: k,
      label: k === 'ready_pickup' ? 'Ready for Pickup' : k === 'transit' ? 'Transit' : k === 'delivered' ? 'Delivered' : 'Confirmed',
      done: i <= highest,
    }));
  }, [timelineDisplayRows]);

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
  useEffect(() => {
    if (!showWebhookInfoModal || !webhookLive) return undefined;
    const timer = setInterval(() => {
      void refreshLotTracking();
    }, 15000);
    return () => clearInterval(timer);
  }, [showWebhookInfoModal, webhookLive]);
  useEffect(() => {
    if (!showWebhookInfoModal) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setShowWebhookInfoModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showWebhookInfoModal]);
  useEffect(() => {
    if (webhookPage > webhookTotalPages) setWebhookPage(webhookTotalPages);
  }, [webhookPage, webhookTotalPages]);

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
        .in('source', ['webhook', 'cancel_api'])
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
        .in('source', ['webhook', 'cancel_api'])
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
              <button
                type="button"
                onClick={() => setShowWebhookInfoModal(true)}
                className="w-full text-left"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">More Info</p>
                <p className="text-sm font-bold text-slate-900 mt-1">See more updates &amp; info</p>
                <p className="text-[10px] text-slate-500 mt-1">{webhookStatusRows.length} status change event{webhookStatusRows.length !== 1 ? 's' : ''}</p>
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <p className="text-xs font-bold text-slate-900 mb-1">Tracking timeline/history for this specific lot</p>
            <p className="text-[11px] text-slate-500 mb-3">Showing webhook and cancellation updates only.</p>
            {timelineLoading ? (
              <p className="text-xs text-slate-500">Loading timeline…</p>
            ) : timelineRows.length === 0 ? (
              <p className="text-xs text-slate-500">No tracking history yet for this shipment lot.</p>
            ) : (
              <div className="max-h-80 overflow-auto pr-1">
                {timelineRows.map((ev) => {
                  const ts = ev?.event_time || ev?.created_at;
                  const src = String(ev?.source || '').toLowerCase();
                  const isWebhook = src === 'webhook';
                  const locationText = resolveEventLocation(ev);
                  return (
                    <div key={ev.id} className="relative pl-9 pb-4 last:pb-0">
                      <div className="absolute left-3 top-6 bottom-0 w-px bg-slate-200 last:hidden" />
                      <div className={`absolute left-0.5 top-1 h-5 w-5 rounded-full border flex items-center justify-center ${isWebhook ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        <span className="material-symbols-outlined text-[12px]">{isWebhook ? 'radio_button_checked' : 'block'}</span>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(2,6,23,0.04)]">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">{formatStatusLabel(ev.activity || 'Status updated')}</p>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isWebhook ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                          {isWebhook ? 'Webhook' : 'Cancelled'}
                        </span>
                      </div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {locationText && (
                          <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-2">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Location</p>
                            <p className="text-[11px] text-slate-700 mt-1">{locationText}</p>
                          </div>
                        )}
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Event timestamp</p>
                          <p className="text-[11px] text-slate-700 mt-1">{ts ? new Date(ts).toLocaleString('en-IN') : '—'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Courier remarks</p>
                          <p className="text-[11px] text-slate-700 mt-1">{ev.carrier_remark || 'No remarks'}</p>
                        </div>
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {showWebhookInfoModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="More info webhook updates">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={() => setShowWebhookInfoModal(false)} />
          <div className="relative w-full max-w-6xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">More Info</p>
                <h3 className="text-lg font-bold text-slate-900">Shipment Webhook Updates</h3>
              </div>
              <button type="button" onClick={() => setShowWebhookInfoModal(false)} className="w-8 h-8 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
            <div className="p-5">
              {webhookStatusRows.length === 0 ? (
                <p className="text-sm text-slate-500">No webhook status_change payload rows found yet for this shipment lot.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500 font-semibold">Total rows</p>
                      <p className="text-sm font-bold text-slate-900 mt-1">{webhookStatusRows.length}</p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-blue-600 font-semibold">Webhook events</p>
                      <p className="text-sm font-bold text-blue-900 mt-1">{webhookSourceSummary.webhook}</p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.08em] text-red-600 font-semibold">Cancel API events</p>
                      <p className="text-sm font-bold text-red-900 mt-1">{webhookSourceSummary.cancelApi}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setWebhookLive((v) => !v)}
                        className={`px-2.5 py-1.5 text-[11px] rounded-lg border font-semibold ${webhookLive ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600'}`}
                      >
                        {webhookLive ? 'Live refresh: ON' : 'Live refresh: OFF'}
                      </button>
                      <button
                        type="button"
                        onClick={exportWebhookCsv}
                        className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50"
                      >
                        Export CSV
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">Page {webhookPage} of {webhookTotalPages}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
                    <input
                      type="text"
                      value={webhookSearch}
                      onChange={(e) => setWebhookSearch(e.target.value)}
                      placeholder="Search status/carrier/tracking"
                      className="md:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                    <select
                      value={webhookStatusFilter}
                      onChange={(e) => setWebhookStatusFilter(e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    >
                      <option value="all">All statuses</option>
                      {availableWebhookStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input
                      type="date"
                      value={webhookFromDate}
                      onChange={(e) => setWebhookFromDate(e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={webhookToDate}
                        onChange={(e) => setWebhookToDate(e.target.value)}
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-secondary/30"
                      />
                      <button
                        type="button"
                        onClick={() => setWebhookSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                        className="px-2.5 py-2 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
                        title="Toggle date sort"
                      >
                        {webhookSortDir === 'desc' ? 'Newest' : 'Oldest'}
                      </button>
                    </div>
                  </div>
                <div className="overflow-auto rounded-2xl border border-slate-200">
                  <table className="w-full min-w-[980px] text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr className="text-[10px] uppercase tracking-[0.1em] text-slate-500">
                        <th className="px-3 py-2 font-semibold">Event Timestamp</th>
                        <th className="px-3 py-2 font-semibold">Latest Shipment Status</th>
                        <th className="px-3 py-2 font-semibold">NDR Reason</th>
                        <th className="px-3 py-2 font-semibold">Original / Promised Delivery Date</th>
                        <th className="px-3 py-2 font-semibold">Updated EDD</th>
                        <th className="px-3 py-2 font-semibold">Carrier Name</th>
                        <th className="px-3 py-2 font-semibold">Tracking Number</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedWebhookRows.map((row, idx) => (
                        <tr
                          key={`webhook-row-${idx}`}
                          onClick={() => setSelectedWebhookRowId(row.eventId || `idx-${idx}`)}
                          className="border-b border-slate-100 last:border-0 text-xs text-slate-700 cursor-pointer hover:bg-slate-50"
                        >
                          <td className="px-3 py-2.5">{row.eventTimestamp || '—'}</td>
                          <td className="px-3 py-2.5 font-semibold text-slate-900">{formatStatusLabel(row.latestStatus || '—')}</td>
                          <td className="px-3 py-2.5">{row.ndrReason || '—'}</td>
                          <td className="px-3 py-2.5">{row.originalEdd || '—'}</td>
                          <td className="px-3 py-2.5">
                            <div>{row.updatedEdd || '—'}</div>
                            {(() => {
                              const risk = rowSlaRisk(row);
                              return risk.label !== '—' ? (
                                <span className={`inline-flex mt-1 px-1.5 py-0.5 rounded text-[10px] border ${
                                  risk.tone === 'emerald' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : risk.tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700'
                                      : 'bg-red-50 border-red-200 text-red-700'
                                }`}>{risk.label}</span>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-3 py-2.5">{row.carrierName || '—'}</td>
                          <td className="px-3 py-2.5 font-mono">{row.trackingNumber || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={webhookPage <= 1}
                    onClick={() => setWebhookPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={webhookPage >= webhookTotalPages}
                    onClick={() => setWebhookPage((p) => Math.min(webhookTotalPages, p + 1))}
                    className="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
                {selectedWebhookRow && (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] uppercase tracking-[0.08em] text-slate-500 font-semibold mb-1">Selected row payload</p>
                    {previousWebhookRow && (
                      <p className="text-[11px] text-slate-600 mb-2">
                        Diff from previous: status <span className="font-semibold">{formatStatusLabel(previousWebhookRow.latestStatus || '—')}</span> {'->'} <span className="font-semibold">{formatStatusLabel(selectedWebhookRow.latestStatus || '—')}</span>
                      </p>
                    )}
                    <pre className="text-[11px] text-slate-700 overflow-auto max-h-48 whitespace-pre-wrap">
{JSON.stringify(selectedWebhookRow.rawPayload || {}, null, 2)}
                    </pre>
                  </div>
                )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
