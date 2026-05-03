# Velocity AWB Cancellation - Shipping Fee Removal

## Problem
When a Velocity AWB is cancelled, the shipping fees were not being removed from the order/lot. This meant that cancelled shipments still showed shipping costs in the recorded shipping totals, which is incorrect since cancelled shipments don't incur shipping fees.

## Solution
Updated the cancellation logic to remove all shipping fee fields from `velocity_fulfillment` when an AWB is cancelled.

### Changes Made

#### 1. Multi-Shipment Lot Cancellation (`supabase/functions/velocity-orchestrator/index.ts`)
When cancelling a shipment lot (multi-shipment orders), the following fields are now cleared from `velocity_fulfillment`:
- `velocity_shipping_total`
- `velocity_shipping_freight`
- `velocity_shipping_cod_component`
- `velocity_shipping_source`
- `velocity_awb_charges`
- `awb_charges_recorded_at`

#### 2. Single-Shipment Order Cancellation (`supabase/functions/velocity-orchestrator/index.ts`)
When cancelling a single-shipment order with an AWB, the same shipping fee fields are cleared from the order's `velocity_fulfillment`.

#### 3. Historical Data Fix (`supabase/migrations/20260505000000_remove_shipping_fees_cancelled_lots.sql`)
Created a migration to fix existing cancelled orders/lots that still have shipping fees:
- Removes shipping fees from all `order_shipments` with `workflow_stage = 'cancelled_reorder_ready'`
- Removes shipping fees from all `orders` with `shipment_status = 'cancelled'` and no AWB
- Recomputes the `fulfillment_aggregate_meta.recorded_shipping_total` for all affected orders

### How It Works

1. **On Cancellation**: When an admin cancels a Velocity AWB (either for a lot or entire order), the cancellation handler now explicitly sets all shipping fee fields to `null` in the `velocity_fulfillment` JSONB column.

2. **Aggregate Recomputation**: The existing trigger `recompute_order_aggregate_on_lot_change()` automatically detects the change to `velocity_fulfillment` and recalculates the order's total recorded shipping costs via `recompute_order_fulfillment_aggregate()`.

3. **Reorder Flow**: When a cancelled lot is moved back to "reorder ready" state using the "Back" button, the shipping fees remain cleared (as they should be). New shipping fees will be recorded when a new AWB is generated.

### Fields Cleared on Cancellation

```jsonb
{
  "velocity_shipping_total": null,           // Total shipping cost
  "velocity_shipping_freight": null,         // Freight component
  "velocity_shipping_cod_component": null,   // COD charges component
  "velocity_shipping_source": null,          // Source of the charges (e.g., "serviceability_rate_quote")
  "velocity_awb_charges": null,              // Full charge breakdown from Velocity API
  "awb_charges_recorded_at": null           // Timestamp when charges were recorded
}
```

### Testing

To verify the fix:

1. **New Cancellations**: Cancel a Velocity AWB and verify that:
   - The "Carrier shipping fee (this lot)" section no longer shows a fee
   - The order's `fulfillment_aggregate_meta.recorded_shipping_total` is updated correctly

2. **Historical Data**: After running the migration, check that:
   - Previously cancelled lots no longer show shipping fees
   - Order totals are recalculated correctly

3. **Reorder Flow**: After cancelling and clicking "Back":
   - Shipping fees remain cleared
   - New fees are recorded when a new AWB is assigned

### Related Files

- `supabase/functions/velocity-orchestrator/index.ts` - Cancellation logic
- `supabase/migrations/20260505000000_remove_shipping_fees_cancelled_lots.sql` - Historical data fix
- `supabase/migrations/20260504153000_recorded_shipping_costs_aggregate.sql` - Aggregate computation
- `src/lib/recordedShippingCost.js` - Shipping cost display helpers
- `src/components/admin/VelocityLotWorkflow.jsx` - UI for lot workflow
