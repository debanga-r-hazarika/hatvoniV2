CREATE OR REPLACE FUNCTION public.recompute_order_aggregate_on_lot_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.order_id IS NOT NULL THEN
      PERFORM public.recompute_order_fulfillment_aggregate(OLD.order_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_order_fulfillment_aggregate(NEW.order_id);
    RETURN NEW;
  END IF;

  IF (
    COALESCE(NEW.carrier_shipment_status, '') IS DISTINCT FROM COALESCE(OLD.carrier_shipment_status, '')
    OR COALESCE(NEW.tracking_number, '') IS DISTINCT FROM COALESCE(OLD.tracking_number, '')
    OR COALESCE(NEW.velocity_awb, '') IS DISTINCT FROM COALESCE(OLD.velocity_awb, '')
    OR NEW.velocity_fulfillment IS DISTINCT FROM OLD.velocity_fulfillment
  ) THEN
    PERFORM public.recompute_order_fulfillment_aggregate(NEW.order_id);
  END IF;

  RETURN NEW;
END;
$$;;
