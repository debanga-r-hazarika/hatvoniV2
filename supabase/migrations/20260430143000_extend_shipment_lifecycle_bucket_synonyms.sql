-- Treat courier/admin synonyms like "shipped" / "dispatched" as active_delivery
-- (same bucket as in_transit) so manual + legacy rows do not fall through to exception_attention.

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
