/*
  # Rename insider-prefixed columns and table

  Drops the Insider dependency naming from the orders table and sync log table.
  All references to these columns in triggers and functions are updated here.

  Column renames on public.orders:
    insider_order_status  → order_status
    insider_notes         → order_notes
    last_received_version → sync_version_received
    last_synced_at        → admin_updated_at

  Table rename:
    insider_sync_failures → order_sync_log
*/

-- ============================================================
-- 1. Rename columns on public.orders
-- ============================================================

ALTER TABLE public.orders
  RENAME COLUMN insider_order_status  TO order_status;

ALTER TABLE public.orders
  RENAME COLUMN insider_notes         TO order_notes;

ALTER TABLE public.orders
  RENAME COLUMN last_received_version TO sync_version_received;

ALTER TABLE public.orders
  RENAME COLUMN last_synced_at        TO admin_updated_at;

-- ============================================================
-- 2. Rename the sync failures table
-- ============================================================

ALTER TABLE public.insider_sync_failures
  RENAME TO order_sync_log;

-- Update the RLS policy name to match (drop old, recreate)
DROP POLICY IF EXISTS "Admins can read insider sync failures" ON public.order_sync_log;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'order_sync_log'
      AND policyname  = 'Admins can read order sync log'
  ) THEN
    CREATE POLICY "Admins can read order sync log"
      ON public.order_sync_log
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.is_admin = true
        )
      );
  END IF;
END $$;

-- ============================================================
-- 3. Update the index that referenced last_received_version
-- ============================================================

DROP INDEX IF EXISTS public.idx_orders_last_received_version;

CREATE INDEX IF NOT EXISTS idx_orders_sync_version_received
  ON public.orders (sync_version_received);

-- ============================================================
-- 4. Replace the order defaults trigger function
--    (was referencing insider_order_status, insider_notes,
--     last_received_version, last_synced_at)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_order_external_ids_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
DECLARE
  normalized_payment_method text := lower(coalesce(NEW.payment_method, 'cod'));
  normalized_payment_status  text := lower(coalesce(NEW.payment_status, 'pending'));
  is_razorpay_payment boolean :=
    normalized_payment_method IN ('razorpay', 'razorpay_upi', 'razorpay_cards');
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  NEW.external_order_id := NEW.id::text;

  IF NEW.user_id IS NOT NULL THEN
    NEW.external_customer_id := NEW.user_id::text;
  END IF;

  NEW.shipment_provider    := NULL;
  NEW.tracking_number      := NULL;
  NEW.shipment_status      := NULL;
  NEW.shipped_at           := NULL;
  NEW.processed_at         := NULL;
  NEW.order_notes          := NULL;
  NEW.sync_version_received := 0;

  IF is_razorpay_payment AND normalized_payment_status <> 'paid' THEN
    NEW.order_status    := NULL;
    NEW.admin_updated_at := NULL;
  ELSE
    NEW.order_status    := COALESCE(NEW.order_status, 'placed');
    NEW.admin_updated_at := COALESCE(NEW.admin_updated_at, now());
  END IF;

  RETURN NEW;
END;
$func$;

-- ============================================================
-- 5. Replace the cancel_customer_order function
--    (was referencing insider_order_status, insider_notes)
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_order_id uuid, p_reason text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_order          public.orders%ROWTYPE;
  v_effective_status text;
  v_reason         text;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id      = p_order_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  IF v_reason NOT IN (
    'Change in plans',
    'Ordered by mistake',
    'Delivery timeline no longer works for me',
    'I found an alternative option',
    'Payment or checkout issue',
    'Other personal reason'
  ) THEN
    RAISE EXCEPTION 'Invalid cancellation reason';
  END IF;

  v_effective_status := LOWER(COALESCE(v_order.order_status, v_order.status::text, 'pending'));

  IF v_effective_status NOT IN ('pending', 'placed', 'processing') THEN
    RAISE EXCEPTION 'Order can only be cancelled before it moves past processing';
  END IF;

  UPDATE public.orders
  SET status             = 'cancelled',
      order_status       = 'cancelled',
      cancellation_reason = v_reason,
      order_notes        = 'Customer cancelled order. Reason: ' || v_reason,
      updated_at         = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$func$;
