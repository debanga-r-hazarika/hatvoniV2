/*
  # Prevent unpaid Razorpay orders from being marked as placed

  - Update order defaults trigger to avoid setting insider projection fields for unpaid online payments
  - Backfill existing unpaid Razorpay orders so they no longer appear confirmed
*/

CREATE OR REPLACE FUNCTION public.set_order_external_ids_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_payment_method text := lower(coalesce(NEW.payment_method, 'cod'));
  normalized_payment_status text := lower(coalesce(NEW.payment_status, 'pending'));
  is_razorpay_payment boolean := normalized_payment_method IN ('razorpay', 'razorpay_upi', 'razorpay_cards');
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  NEW.external_order_id := NEW.id::text;

  IF NEW.user_id IS NOT NULL THEN
    NEW.external_customer_id := NEW.user_id::text;
  END IF;

  NEW.shipment_provider := NULL;
  NEW.tracking_number := NULL;
  NEW.shipment_status := NULL;
  NEW.shipped_at := NULL;
  NEW.processed_at := NULL;
  NEW.insider_notes := NULL;
  NEW.last_received_version := 0;

  IF is_razorpay_payment AND normalized_payment_status <> 'paid' THEN
    NEW.insider_order_status := NULL;
    NEW.last_synced_at := NULL;
  ELSE
    NEW.insider_order_status := COALESCE(NEW.insider_order_status, 'placed');
    NEW.last_synced_at := COALESCE(NEW.last_synced_at, now());
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.orders
SET
  insider_order_status = NULL,
  last_synced_at = NULL,
  updated_at = now()
WHERE lower(coalesce(payment_method, '')) IN ('razorpay', 'razorpay_upi', 'razorpay_cards')
  AND lower(coalesce(payment_status, 'pending')) <> 'paid'
  AND coalesce(status, 'pending') <> 'cancelled'
  AND (
    insider_order_status IS NOT NULL
    OR last_synced_at IS NOT NULL
  );
