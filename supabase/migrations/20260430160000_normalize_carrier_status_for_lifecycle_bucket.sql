-- Align DB bucket matching with JS normalizeShipmentStatusKey:
-- carrier values like "in transit", "IN TRANSIT", "out-for-delivery" must map like "in_transit",
-- otherwise they incorrectly hit exception_attention → orders.order_status attention_required.

CREATE OR REPLACE FUNCTION public.hatvoni_shipment_lifecycle_bucket(p_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  s text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF s = '' THEN
    RETURN 'pre_shipping';
  END IF;

  s := regexp_replace(regexp_replace(s, '[[:space:]-]+', '_', 'g'), '_+', '_', 'g');
  s := trim(both '_' from s);

  IF s = '' THEN
    RETURN 'pre_shipping';
  END IF;

  -- Compact tokens some carriers send without separators
  IF s IN ('intransit', 'outfordelivery') THEN
    s := CASE s WHEN 'intransit' THEN 'in_transit' ELSE 'out_for_delivery' END;
  END IF;

  IF s = 'delivered' THEN
    RETURN 'delivered';
  END IF;

  IF s IN ('rto_delivered', 'cancelled', 'rejected', 'lost') THEN
    RETURN 'failed_final';
  END IF;

  IF s IN ('rto_initiated', 'rto_in_transit', 'rto_need_attention') THEN
    RETURN 'return_in_progress';
  END IF;

  IF s IN (
    'in_transit',
    'shipped',
    'dispatched',
    'dispatch',
    'picked_up',
    'pickup_done',
    'out_for_delivery',
    'reattempt_delivery',
    'externally_fulfilled',
    'rto_cancelled'
  ) THEN
    RETURN 'active_delivery';
  END IF;

  IF s IN ('need_attention', 'ndr_raised', 'not_picked') THEN
    RETURN 'exception_attention';
  END IF;

  IF s IN ('pending', 'processing', 'ready_for_pickup', 'pickup_scheduled', 'manifested', 'manifest') THEN
    RETURN 'pre_shipping';
  END IF;

  RETURN 'exception_attention';
END;
$$;
