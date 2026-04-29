# Order Status Aggregation Validation and Rollout

## Canonical bucket mapping

- `delivered` -> `delivered`
- `rto_delivered`, `cancelled`, `rejected`, `lost` -> `failed_final`
- `rto_initiated`, `rto_in_transit`, `rto_need_attention` -> `return_in_progress`
- `in_transit`, `out_for_delivery`, `reattempt_delivery`, `externally_fulfilled`, `rto_cancelled` -> `active_delivery`
- `need_attention`, `ndr_raised`, `not_picked` -> `exception_attention`
- `pending`, `processing`, `ready_for_pickup`, `pickup_scheduled` -> `pre_shipping`
- unknown statuses -> `exception_attention`

## Aggregate precedence assertions

Run these assertions against `public.recompute_order_fulfillment_aggregate`:

1. Any lot in `exception_attention` => `orders.order_status = attention_required`
2. Any mix of delivered + failed_final => `partially_failed`
3. Any lot in return flow => `partially_returning`
4. Any delivered and not all delivered => `partially_delivered`
5. All active_delivery (or active+pre without delivered/fail/return) => `in_transit`
6. All pre_shipping => `processing`
7. All delivered => `delivered`
8. All failed_final => `failed`

## SQL validation matrix (2-lot and 3-lot)

Validate with representative combinations from `docs/lotStatusCombination.md`:

- `delivered + delivered` => `delivered`
- `delivered + in_transit` => `partially_delivered`
- `delivered + rto_delivered` => `partially_failed`
- `in_transit + rto_in_transit` => `partially_returning`
- `delivered + ndr_raised` => `attention_required`
- `processing + processing` => `processing`
- `rto_delivered + lost` => `failed`
- `processing + in_transit` => `in_transit`

For 3 lots:

- `delivered + in_transit + in_transit` => `partially_delivered`
- `delivered + rto_delivered + lost` => `partially_failed`
- `in_transit + rto_in_transit + in_transit` => `partially_returning`
- `delivered + ndr_raised + in_transit` => `attention_required`
- `processing + processing + processing` => `processing`

## Operational edge-case tests

- Duplicate webhook `event_id` retries do not change final state unexpectedly.
- Out-of-order tracking and status webhooks still converge after recompute.
- Unknown raw status maps to `exception_attention`.
- Manual lot status edits trigger aggregate recompute.
- Velocity and manual lot updates coexist in one order and aggregate deterministically.

## Rollout steps

1. Deploy migration introducing new bucket mapping + aggregate logic + lot-change trigger.
2. Deploy updated `velocity-orchestrator` function.
3. Backfill open orders:
   - `select public.recompute_order_fulfillment_aggregate(id) from public.orders where status in ('processing','shipped') or fulfillment_mode = 'multi_shipment';`
4. Monitor for 24-48h:
   - orders with `order_status = attention_required`
   - orders where `fulfillment_aggregate_meta.exception_count > 0`
   - mismatch between lot states and aggregate state

## Observability queries

```sql
-- 1) Hotspot: orders requiring action
select id, order_status, customer_status, fulfillment_aggregate_meta, updated_at
from public.orders
where order_status in ('attention_required', 'partially_failed', 'partially_returning')
order by updated_at desc
limit 200;
```

```sql
-- 2) Unknown/exception pressure by day
select date_trunc('day', updated_at) as day, count(*) as affected_orders
from public.orders
where coalesce((fulfillment_aggregate_meta->>'exception_count')::int, 0) > 0
group by 1
order by 1 desc;
```

```sql
-- 3) Data sanity: lot counts vs aggregate metadata
select o.id,
       coalesce((o.fulfillment_aggregate_meta->>'lot_count')::int, -1) as aggregate_lot_count,
       count(s.id)::int as actual_lot_count
from public.orders o
left join public.order_shipments s on s.order_id = o.id
group by o.id, o.fulfillment_aggregate_meta
having coalesce((o.fulfillment_aggregate_meta->>'lot_count')::int, -1) <> count(s.id)::int
order by o.id desc
limit 200;
```
