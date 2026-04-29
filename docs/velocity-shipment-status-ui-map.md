# Velocity / Shipfast shipment status → UI & storage

Raw webhook values are normalized to **canonical snake_case** before saving on `order_shipments.carrier_shipment_status`. The admin UI shows **human labels** (for example `in_transit` → **Shipped**).

## Canonical values (dropdown + webhooks)

| Canonical stored (`carrier_shipment_status`) | Shown in lot status chip / webhook table |
|-----------------------------------------------|-------------------------------------------|
| `pending` | Pending |
| `processing` | Processing |
| `ready_for_pickup` | Ready for pickup |
| `pickup_scheduled` | Pickup scheduled |
| `in_transit` | **Shipped** |
| `out_for_delivery` | Out for delivery |
| `reattempt_delivery` | Reattempt delivery |
| `delivered` | Delivered |
| `need_attention` | Need attention |
| `ndr_raised` | NDR raised |
| `not_picked` | Not picked |
| `externally_fulfilled` | Externally fulfilled |
| `rto_cancelled` | RTO cancelled |
| `rto_initiated` | RTO initiated |
| `rto_in_transit` | RTO in transit |
| `rto_need_attention` | RTO need attention |
| `rto_delivered` | RTO delivered |
| `cancelled` | Cancelled |
| `rejected` | Rejected |
| `lost` | Lost |

## Webhook / API synonyms → canonical (normalization)

These are folded to the canonical token **before** DB write (edge function + admin save):

| Incoming examples | Stored as |
|-------------------|-----------|
| `SHIPPED`, `Shipped`, `shipped`, `DISPATCHED`, `dispatched`, `picked_up`, `pickup_done` | `in_transit` |
| `IN_TRANSIT`, `InTransit`, `in-transit` | `in_transit` |
| `manifest`, `manifested`, `forward` | `processing` |

Other tokens: spaces and hyphens become underscores; `camelCase` becomes `snake_case`. Unknown strings stay as-is (may map to **exception_attention** in `hatvoni_shipment_lifecycle_bucket`).

## Aggregation bucket (multi-lot orders)

See `public.hatvoni_shipment_lifecycle_bucket` in migrations. Synonyms such as `shipped` and `dispatched` are treated like `in_transit` (**active_delivery**) so they do not incorrectly raise order-level **attention_required**.

## Source of truth in code

- Labels & dropdown: `src/lib/velocityShipmentStatusCatalog.js`
- Webhook normalization: `supabase/functions/velocity-orchestrator/index.ts` (`normalizeWebhookCarrierStatus`)
