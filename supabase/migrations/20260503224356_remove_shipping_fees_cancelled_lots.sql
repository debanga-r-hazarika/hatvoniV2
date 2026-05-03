-- Remove shipping fees from cancelled Velocity AWB shipments (both multi-shipment lots and single-shipment orders)
-- When a Velocity AWB is cancelled, shipping fees should be removed as they are no longer applicable

-- Fix multi-shipment lots (order_shipments table)
UPDATE public.order_shipments
SET
  velocity_fulfillment = velocity_fulfillment - 'velocity_shipping_total' 
                                              - 'velocity_shipping_freight' 
                                              - 'velocity_shipping_cod_component' 
                                              - 'velocity_shipping_source' 
                                              - 'velocity_awb_charges' 
                                              - 'awb_charges_recorded_at',
  updated_at = now()
WHERE
  velocity_fulfillment IS NOT NULL
  AND lower(coalesce(velocity_fulfillment->>'workflow_stage', '')) = 'cancelled_reorder_ready'
  AND (
    velocity_fulfillment->>'velocity_shipping_total' IS NOT NULL
    OR velocity_fulfillment->>'velocity_shipping_freight' IS NOT NULL
    OR velocity_fulfillment->>'velocity_awb_charges' IS NOT NULL
  );

-- Fix single-shipment orders (orders table)
-- Only clear shipping fees if the order has been cancelled and has velocity_fulfillment with shipping costs
UPDATE public.orders
SET
  velocity_fulfillment = velocity_fulfillment - 'velocity_shipping_total' 
                                              - 'velocity_shipping_freight' 
                                              - 'velocity_shipping_cod_component' 
                                              - 'velocity_shipping_source' 
                                              - 'velocity_awb_charges' 
                                              - 'awb_charges_recorded_at',
  updated_at = now()
WHERE
  velocity_fulfillment IS NOT NULL
  AND lower(coalesce(shipment_status, '')) = 'cancelled'
  AND tracking_number IS NULL
  AND velocity_awb IS NULL
  AND (
    velocity_fulfillment->>'velocity_shipping_total' IS NOT NULL
    OR velocity_fulfillment->>'velocity_shipping_freight' IS NOT NULL
    OR velocity_fulfillment->>'velocity_awb_charges' IS NOT NULL
  );

-- Recompute aggregates for affected orders to update recorded_shipping_total
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  -- Recompute for orders with affected lots
  FOR v_order_id IN
    SELECT DISTINCT order_id
    FROM public.order_shipments
    WHERE
      velocity_fulfillment IS NOT NULL
      AND lower(coalesce(velocity_fulfillment->>'workflow_stage', '')) = 'cancelled_reorder_ready'
  LOOP
    PERFORM public.recompute_order_fulfillment_aggregate(v_order_id);
  END LOOP;

  -- Recompute for single-shipment orders that were fixed
  FOR v_order_id IN
    SELECT id
    FROM public.orders
    WHERE
      velocity_fulfillment IS NOT NULL
      AND lower(coalesce(shipment_status, '')) = 'cancelled'
      AND tracking_number IS NULL
      AND velocity_awb IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.order_shipments WHERE order_id = orders.id
      )
  LOOP
    PERFORM public.recompute_order_fulfillment_aggregate(v_order_id);
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.order_shipments.velocity_fulfillment IS 
  'Velocity fulfillment metadata including workflow_stage, pickup details, and shipping costs. Shipping costs are cleared when AWB is cancelled.';

COMMENT ON COLUMN public.orders.velocity_fulfillment IS 
  'Velocity fulfillment metadata for single-shipment orders. Shipping costs are cleared when AWB is cancelled.';;
