/*
  # Harden Insider-owned Projection Fields

  Ensure customer inserts cannot pre-populate insider-managed shipment/projection fields.
*/

CREATE OR REPLACE FUNCTION public.set_order_external_ids_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  NEW.external_order_id := NEW.id::text;

  IF NEW.user_id IS NOT NULL THEN
    NEW.external_customer_id := NEW.user_id::text;
  END IF;

  NEW.insider_order_status := 'placed';
  NEW.shipment_provider := NULL;
  NEW.tracking_number := NULL;
  NEW.shipment_status := NULL;
  NEW.shipped_at := NULL;
  NEW.processed_at := NULL;
  NEW.insider_notes := NULL;
  NEW.last_received_version := 0;
  NEW.last_synced_at := COALESCE(NEW.last_synced_at, now());

  RETURN NEW;
END;
$$;;
