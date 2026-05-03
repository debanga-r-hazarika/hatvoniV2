/**
 * Canonical carrier_shipment_status values aligned with
 * public.hatvoni_shipment_lifecycle_bucket (snake_case, lowercased in DB).
 * Shipfast/Velocity may send SCREAMING_SNAKE or camelCase — normalize before compare/store.
 */

/** Human-facing labels for the status chip / lot header (not raw API tokens). */
export const SHIPMENT_STATUS_LABELS = {
  pending: 'Pending',
  processing: 'Processing',
  ready_for_pickup: 'Ready for pickup',
  pickup_scheduled: 'Pickup scheduled',
  in_transit: 'Shipped',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  reattempt_delivery: 'Reattempt delivery',
  externally_fulfilled: 'Externally fulfilled',
  rto_cancelled: 'RTO cancelled',
  delivered: 'Delivered',
  need_attention: 'Need attention',
  ndr_raised: 'NDR raised',
  not_picked: 'Not picked',
  rto_initiated: 'RTO initiated',
  rto_in_transit: 'RTO in transit',
  rto_need_attention: 'RTO need attention',
  rto_delivered: 'RTO delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  lost: 'Lost',
};

/** Order for manual lot dropdown (rough lifecycle flow, then exceptions / RTO / terminal). */
export const SHIPMENT_STATUS_DROPDOWN_OPTIONS = [
  { value: 'pending', label: SHIPMENT_STATUS_LABELS.pending },
  { value: 'processing', label: SHIPMENT_STATUS_LABELS.processing },
  { value: 'ready_for_pickup', label: SHIPMENT_STATUS_LABELS.ready_for_pickup },
  { value: 'pickup_scheduled', label: SHIPMENT_STATUS_LABELS.pickup_scheduled },
  { value: 'in_transit', label: SHIPMENT_STATUS_LABELS.in_transit },
  { value: 'out_for_delivery', label: SHIPMENT_STATUS_LABELS.out_for_delivery },
  { value: 'reattempt_delivery', label: SHIPMENT_STATUS_LABELS.reattempt_delivery },
  { value: 'delivered', label: SHIPMENT_STATUS_LABELS.delivered },
  { value: 'need_attention', label: SHIPMENT_STATUS_LABELS.need_attention },
  { value: 'ndr_raised', label: SHIPMENT_STATUS_LABELS.ndr_raised },
  { value: 'not_picked', label: SHIPMENT_STATUS_LABELS.not_picked },
  { value: 'externally_fulfilled', label: SHIPMENT_STATUS_LABELS.externally_fulfilled },
  { value: 'rto_cancelled', label: SHIPMENT_STATUS_LABELS.rto_cancelled },
  { value: 'rto_initiated', label: SHIPMENT_STATUS_LABELS.rto_initiated },
  { value: 'rto_in_transit', label: SHIPMENT_STATUS_LABELS.rto_in_transit },
  { value: 'rto_need_attention', label: SHIPMENT_STATUS_LABELS.rto_need_attention },
  { value: 'rto_delivered', label: SHIPMENT_STATUS_LABELS.rto_delivered },
  { value: 'cancelled', label: SHIPMENT_STATUS_LABELS.cancelled },
  { value: 'rejected', label: SHIPMENT_STATUS_LABELS.rejected },
  { value: 'lost', label: SHIPMENT_STATUS_LABELS.lost },
];

const CANONICAL_SET = new Set(SHIPMENT_STATUS_DROPDOWN_OPTIONS.map((o) => o.value));

/**
 * Map common webhook / courier variants to a canonical bucket key.
 * Prefer storing canonical values so aggregation + manual + webhooks agree.
 */
export const SHIPMENT_STATUS_ALIASES = {
  // Admin / courier wording → same bucket as in_transit
  shipped: 'in_transit',
  dispatched: 'in_transit',
  dispatch: 'in_transit',
  int_transit: 'in_transit',
  intransit: 'in_transit',
  picked_up: 'in_transit',
  pickup_done: 'in_transit',
  manifested: 'processing',
  manifest: 'processing',
  // SCREAMING_SNAKE often already normalizes to snake; extras if API differs
  forward: 'processing',
};

function splitCamelToSnake(s) {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
}

/**
 * Normalize raw webhook or manual input to canonical snake_case status for DB.
 */
export function normalizeShipmentStatusKey(raw) {
  if (raw == null || String(raw).trim() === '') return 'pending';
  let s = String(raw).trim();
  s = splitCamelToSnake(s);
  s = s.replace(/[\s-]+/g, '_');
  s = s.replace(/_+/g, '_');
  s = s.toLowerCase();
  if (SHIPMENT_STATUS_ALIASES[s]) return SHIPMENT_STATUS_ALIASES[s];
  return s;
}

/**
 * Pretty label for lot chip, webhook table, single-shipment panel.
 */
export function formatShipmentStatusForDisplay(raw) {
  const key = normalizeShipmentStatusKey(raw);
  if (SHIPMENT_STATUS_LABELS[key]) return SHIPMENT_STATUS_LABELS[key];
  const r = String(raw || '').trim();
  if (!r) return '—';
  const compact = r.replace(/\s+/g, '').toLowerCase();
  if (compact === 'readyforreceive' || compact === 'readyforpickup') {
    return 'Ready for Receive/Pickup';
  }
  return r
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Mirrors public.hatvoni_shipment_lifecycle_bucket for client-side checks.
 */
export function shipmentLifecycleBucket(p_status) {
  const s = String(p_status || '').trim().toLowerCase();
  if (!s) return 'pre_shipping';
  if (s === 'delivered') return 'delivered';
  if (['rto_delivered', 'cancelled', 'rejected', 'lost'].includes(s)) return 'failed_final';
  if (['rto_initiated', 'rto_in_transit', 'rto_need_attention'].includes(s)) return 'return_in_progress';
  if (['in_transit', 'out_for_delivery', 'reattempt_delivery', 'externally_fulfilled', 'rto_cancelled'].includes(s)) {
    return 'active_delivery';
  }
  if (['need_attention', 'ndr_raised', 'not_picked'].includes(s)) return 'exception_attention';
  if (['pending', 'processing', 'ready_for_pickup', 'pickup_scheduled'].includes(s)) return 'pre_shipping';
  return 'exception_attention';
}

/** Dropdown options plus legacy value if DB has an unknown token. */
export function getShipmentStatusDropdownOptions(currentRaw) {
  const cur = normalizeShipmentStatusKey(currentRaw);
  const out = [...SHIPMENT_STATUS_DROPDOWN_OPTIONS];
  if (cur && !CANONICAL_SET.has(cur)) {
    out.unshift({
      value: cur,
      label: `${formatShipmentStatusForDisplay(currentRaw)} (stored)`,
    });
  }
  return out;
}
