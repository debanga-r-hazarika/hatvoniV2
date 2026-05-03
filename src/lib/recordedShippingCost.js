/** Helpers for per-lot Velocity AWB + manual shipping costs persisted in velocity_fulfillment / fulfillment_aggregate_meta. */

export function fmtRecordedInr(n) {
  if (n === undefined || n === null || n === '') return '—';
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x % 1 === 0 ? `₹${x}` : `₹${x.toFixed(2)}`;
}

export function frwdChargesFromLotMeta(vf) {
  if (!vf || typeof vf !== 'object') return null;
  const ac = vf.velocity_awb_charges;
  if (!ac || typeof ac !== 'object') return null;
  const fr = ac.frwd_charges;
  if (fr && typeof fr === 'object') return fr;
  const ch = ac.charges;
  if (ch && typeof ch === 'object' && ch.frwd_charges && typeof ch.frwd_charges === 'object') {
    return ch.frwd_charges;
  }
  return null;
}

/** Match saved serviceability Get-Rates quote to the assigned courier (name may differ slightly on AWB step). */
export function lotQuotedChargesFromServiceability(lot) {
  const vf = lot?.velocity_fulfillment && typeof lot.velocity_fulfillment === 'object'
    ? lot.velocity_fulfillment
    : {};
  const carriers = vf?.serviceability?.carriers;
  if (!Array.isArray(carriers)) return null;
  const cname = String(lot?.velocity_carrier_name || '').trim().toLowerCase();
  if (!cname) return null;
  const hit = carriers.find((c) => {
    const n = String(c?.carrier_name || '').trim().toLowerCase();
    if (!n) return false;
    return n === cname || cname.includes(n) || n.includes(cname);
  });
  if (!hit || typeof hit !== 'object') return null;
  const rq = hit.rate_quote && typeof hit.rate_quote === 'object' ? hit.rate_quote : {};
  const ch = rq.charges && typeof rq.charges === 'object' ? rq.charges : null;
  if (!ch) return null;
  const freight = Number(ch.forward_freight_charges ?? ch.shipping_charges ?? ch.freight_charges);
  const cod = Number(ch.cod_charges);
  let total = Number(ch.total_forward_charges ?? ch.total_charges);
  if (!Number.isFinite(total)) {
    total = (Number.isFinite(freight) ? freight : 0) + (Number.isFinite(cod) && cod > 0 ? cod : 0);
  }
  if (!Number.isFinite(total) || total <= 0) return null;
  return { charges: ch, total, carrierId: hit.carrier_id };
}

/** Patch to merge into velocity_fulfillment so rollups and exports see the quote-backed total. */
export function velocityFulfillmentPatchFromQuotedCharges(quote) {
  if (!quote?.charges || typeof quote.charges !== 'object') return null;
  const ch = quote.charges;
  const freight = Number(ch.forward_freight_charges ?? ch.shipping_charges ?? ch.freight_charges);
  const cod = Number(ch.cod_charges);
  let total = Number(ch.total_forward_charges ?? ch.total_charges);
  if (!Number.isFinite(total)) {
    total = (Number.isFinite(freight) ? freight : 0) + (Number.isFinite(cod) && cod > 0 ? cod : 0);
  }
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    velocity_awb_charges: {
      frwd_charges: ch,
      charges: { frwd_charges: ch },
      source: 'serviceability_rate_quote',
    },
    velocity_shipping_freight: Number.isFinite(freight) ? freight : null,
    velocity_shipping_cod_component: Number.isFinite(cod) ? cod : null,
    velocity_shipping_total: total,
    velocity_shipping_source: 'serviceability_rate_quote',
    awb_charges_recorded_at: new Date().toISOString(),
  };
}

/** One line per lot: prefer Velocity total when set, else manual cost. */
export function lotRecordedShippingLine(lot) {
  const vf = lot?.velocity_fulfillment && typeof lot.velocity_fulfillment === 'object'
    ? lot.velocity_fulfillment
    : {};
  const velRaw = vf.velocity_shipping_total;
  const manualRaw = vf.manual_shipping_cost;
  const vel = velRaw !== undefined && velRaw !== null && velRaw !== '' ? Number(velRaw) : null;
  if (vel != null && Number.isFinite(vel)) {
    return { source: 'velocity', amount: vel, vf };
  }
  const manual = manualRaw !== undefined && manualRaw !== null && manualRaw !== '' ? Number(manualRaw) : null;
  if (manual != null && Number.isFinite(manual)) {
    return { source: 'manual', amount: manual, vf };
  }
  const hasAwb = String(lot?.tracking_number || lot?.velocity_awb || '').trim();
  if (hasAwb) {
    const q = lotQuotedChargesFromServiceability(lot);
    if (q && Number.isFinite(q.total)) {
      return { source: 'velocity', amount: q.total, vf, fromQuote: true };
    }
  }
  return null;
}

/** Legacy / single-shipment row on orders.velocity_fulfillment (no order_shipments row). */
export function singleOrderRecordedShippingFallback(order) {
  const vf = order?.velocity_fulfillment && typeof order.velocity_fulfillment === 'object'
    ? order.velocity_fulfillment
    : {};
  const velRaw = vf.velocity_shipping_total;
  const manualRaw = vf.manual_shipping_cost;
  const vel = velRaw !== undefined && velRaw !== null && velRaw !== '' ? Number(velRaw) : null;
  if (vel != null && Number.isFinite(vel)) {
    return { source: 'velocity', amount: vel, vf };
  }
  const manual = manualRaw !== undefined && manualRaw !== null && manualRaw !== '' ? Number(manualRaw) : null;
  if (manual != null && Number.isFinite(manual)) {
    return { source: 'manual', amount: manual, vf };
  }
  return null;
}

export function orderRecordedShippingFromAggregate(order) {
  const meta = order?.fulfillment_aggregate_meta && typeof order.fulfillment_aggregate_meta === 'object'
    ? order.fulfillment_aggregate_meta
    : null;
  const raw = meta?.recorded_shipping_total;
  const total = raw !== undefined && raw !== null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
  const byLot = Array.isArray(meta?.recorded_shipping_by_lot) ? meta.recorded_shipping_by_lot : [];
  return { total, byLot, updatedAt: meta?.recorded_shipping_updated_at || null };
}
