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

/**
 * Self-contained Velocity steps for one order_shipments lot (multi-shipment mode).
 */
export default function VelocityLotWorkflow({
  orderId,
  lot,
  pickupLocations,
  onRefresh,
  onNotice,
  onError,
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
  const [pickupLocationId, setPickupLocationId] = useState('');
  const resumeKeyRef = useRef('');

  const pendingSid = lot?.velocity_pending_shipment_id ? String(lot.velocity_pending_shipment_id).trim() : '';
  const effectivePending = pendingSid;

  useEffect(() => {
    const rows = pickupLocations || [];
    const first = rows.find((r) => r.velocity_warehouse_id)?.id || '';
    setPickupLocationId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : first));
  }, [pickupLocations]);

  useEffect(() => {
    if (!effectivePending || !lotId) return;
    const key = `${lotId}:${effectivePending}`;
    if (resumeKeyRef.current === key) return;
    resumeKeyRef.current = key;
    setVelShipmentId(effectivePending);
    setVelStep((step) => (step === 'done' ? 'done' : 'pending_assign'));
  }, [effectivePending, lotId]);

  const velocityDimsValid = () => {
    const l = parseFloat(velLength);
    const b = parseFloat(velBreadth);
    const h = parseFloat(velHeight);
    const w = parseFloat(velWeight);
    return [l, b, h, w].every((n) => Number.isFinite(n) && n > 0);
  };

  const velocityPickupReady = () => {
    const loc = pickupLocations.find((r) => r.id === pickupLocationId);
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
    if (effectivePending) {
      setVelError('An immutable Velocity order already exists for this lot. Continue with courier assignment.');
      return;
    }
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
      setVelStep(data.serviceable ? 'ready' : 'error');
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

  if (!lotId) return null;

  return (
    <div className="space-y-4">
      {velStep !== 'done' && (
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
                  <option value="">No pickup locations — add under seller settings</option>
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

      {velStep === 'idle' && !effectivePending && (
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

      {velStep === 'checking' && (
        <div className="rounded-2xl border border-outline-variant/30 bg-white p-4 flex items-center gap-3">
          <span className="material-symbols-outlined animate-spin text-gray-900 text-xl">progress_activity</span>
          <p className="text-sm text-gray-900-variant">Checking serviceability…</p>
        </div>
      )}

      {velStep === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">{velError}</p>
          <Button type="button" onClick={() => { setVelStep('idle'); setVelError(''); setVelServiceability(null); }} variant="text" color="error" size="small" sx={{ mt: 1 }}>
            Start over
          </Button>
        </div>
      )}

      {(velStep === 'ready' || velStep === 'creating_order') && velServiceability && !effectivePending && (
        <>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-bold text-emerald-800">Route is serviceable</p>
            <p className="text-xs text-emerald-700 mt-1">
              PIN {velServiceability.pickup_pincode || '—'} → {velServiceability.customer_pincode} · Zone {velServiceability.zone || '—'}
            </p>
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

      {velStep !== 'done' && (velStep === 'pending_assign' || velStep === 'assigning' || !!effectivePending) && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest p-4 space-y-4">
          <p className="text-sm font-bold text-gray-900">
            Select courier · Velocity shipment: <span className="font-mono">{velShipmentId || effectivePending}</span>
          </p>
          {velError && velStep === 'pending_assign' && <p className="text-xs text-red-700">{velError}</p>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setVelCarrierId('')}
              className={`rounded-xl border p-3 text-left ${!velCarrierId ? 'border-primary bg-primary/5' : 'border-outline-variant/30 bg-white'}`}
            >
              <p className="text-sm font-bold">Auto-assign</p>
            </button>
            {sortedVelocityCarriers.map((c) => {
              const rq = c.rate_quote;
              const ch = rq?.charges;
              const total = ch?.total_forward_charges;
              const selected = velCarrierId === c.carrier_id;
              return (
                <button
                  key={c.carrier_id}
                  type="button"
                  onClick={() => setVelCarrierId(c.carrier_id)}
                  className={`rounded-xl border p-3 text-left ${selected ? 'border-primary bg-primary/5' : 'border-outline-variant/30 bg-white'}`}
                >
                  <p className="text-sm font-bold">{c.carrier_name || 'Courier'}</p>
                  {total != null && total !== '' ? (
                    <p className="text-[11px] font-bold tabular-nums mt-1">{fmtInr(total)} total</p>
                  ) : null}
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
    </div>
  );
}
