# Shipfast Shipping Lot Webhook Logic

This document defines the required logic for single shipping and multi shipping with Shipfast (Velocity) webhooks.

## Required Webhook Subscriptions

Use both events as mandatory:

- `status_change` (mandatory)
- `tracking_addition` (mandatory)

## Core Identifiers

- **Shipping Lot ID**: your business lot identifier, e.g. `HAT-5266A73899-L1`
- **Shipfast Order ID** (`order_id`): Shipfast internal order id (always unique per Shipfast order)
- **Shipfast Shipment ID** (`shipment_id`): Shipfast shipment id
- **External Order ID** (`order_external_id`): must be set to the Shipping Lot ID

Rule:

- `order_external_id = shipping_lot_id`
- Shipfast IDs (`order_id`, `shipment_id`) remain different and are stored as provider identifiers

## Business Model

### 1) Single Shipping

- One customer order has one shipping lot
- One shipping lot maps to one Shipfast order/shipment
- Example:
  - customer order: `HAT-5266A73899`
  - lot id / external id: `HAT-5266A73899-L1`
  - Shipfast order id: `ORD...` (different)
  - Shipfast shipment id: `SHI...` (different)

### 2) Multi Shipping

- One customer order has 2 or more shipping lots
- Each shipping lot creates its own Shipfast order/shipment
- Each lot has a unique external id format:
  - `HAT-5266A73899-L1`
  - `HAT-5266A73899-L2`
  - `HAT-5266A73899-L3` ...
- All these lots belong to the same parent customer order

## Data Mapping (Webhook -> Internal)

For each webhook payload:

- `data.order_external_id` -> `shipping_lot_id` (primary business key)
- `data.order_id` -> `shipfast_order_id`
- `data.shipment_id` -> `shipfast_shipment_id`
- `data.tracking_number` -> `awb`
- `data.status` -> `shipment_status`
- `data.sub_status` -> `shipment_sub_status`
- `data.carrier_name` -> `carrier_name`
- `data.tracking_url` -> `tracking_url`
- `event` -> `webhook_event_type`
- `event_id` -> `webhook_event_id` (for idempotency)
- `event_timestamp` -> `webhook_received_event_time`

## Event Handling Logic

### A) `status_change` (mandatory)

Purpose:

- Update the latest status of that specific shipping lot
- Keep the lot-level shipment state in sync with Shipfast

Processing:

1. Validate webhook and parse payload
2. Check `event_id`; if already processed, ignore (idempotent)
3. Resolve shipping lot using `order_external_id`
4. Update lot shipment status fields:
   - `status`, `sub_status`, `ndr_reason`, `estimated_delivery_date`, `original_edd`
5. Save status history record for audit

### B) `tracking_addition` (mandatory)

Purpose:

- Build the shipping timeline for an **individual shipping lot**

Processing:

1. Validate webhook and parse payload
2. Check `event_id`; if already processed, ignore
3. Resolve lot using `order_external_id`
4. Read `data.new_tracking` and insert timeline point:
   - `tracking_id`
   - `event_date_time`
   - `location`
   - `remarks`
5. Keep timeline ordered by `event_date_time` ascending for display

Important UI rule:

- `tracking_addition` drives the lot-level timeline shown to customer
- Timeline is never merged across different lot IDs

## Order-Level Aggregation Logic

Compute parent customer order status from all lot statuses:

- If all lots `delivered` -> order status `delivered`
- If some delivered and others not delivered -> `partially_delivered`
- If any lot in `ndr_raised`, `need_attention`, `rto_*`, `lost` -> `action_required`
- Else -> `in_progress`

## UI Display Rules

- Show one card/row per shipping lot
- Each card uses lot id (`order_external_id`) as title
- Show lot-specific:
  - AWB (`tracking_number`)
  - carrier
  - current status
  - tracking URL
  - timeline from `tracking_addition`

Never combine events from multiple lots into one timeline.

## Reliability and Delivery Requirements

- Return HTTP `200` quickly for successful webhook receipt
- Handle within Shipfast timeout window (10 seconds)
- Shipfast retries failed deliveries (up to three attempts)
- Use `event_id` dedupe table/log for idempotent processing

## Minimum Tables (Suggested)

- `orders` (parent customer order)
- `shipping_lots` (one row per lot id / external id)
- `shipping_lot_status_history` (status snapshots from `status_change`)
- `shipping_lot_tracking_timeline` (timeline points from `tracking_addition`)
- `webhook_event_log` (event_id dedupe + raw payload)

