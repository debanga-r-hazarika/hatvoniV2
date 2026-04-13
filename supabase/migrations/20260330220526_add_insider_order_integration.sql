/*
  # Add Insider Order Integration Fields and Logging

  1. Orders integration columns
    - external_order_id
    - external_customer_id
    - insider_order_status
    - shipment_provider
    - tracking_number
    - shipment_status
    - shipped_at
    - processed_at
    - insider_notes
    - last_received_version
    - last_synced_at

  2. Product mapping column
    - products.external_product_id

  3. Sync failure log table
    - insider_sync_failures

  4. Insert trigger
    - Force stable external IDs and safe defaults on order creation
*/

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS external_product_id text;

UPDATE public.products
SET external_product_id = id::text
WHERE external_product_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_external_product_id_unique
  ON public.products (external_product_id)
  WHERE external_product_id IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS external_customer_id text,
  ADD COLUMN IF NOT EXISTS insider_order_status text,
  ADD COLUMN IF NOT EXISTS shipment_provider text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS shipment_status text,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS insider_notes text,
  ADD COLUMN IF NOT EXISTS last_received_version bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

UPDATE public.orders
SET external_order_id = id::text
WHERE external_order_id IS NULL;

UPDATE public.orders
SET external_customer_id = user_id::text
WHERE external_customer_id IS NULL AND user_id IS NOT NULL;

UPDATE public.orders
SET insider_order_status = COALESCE(insider_order_status, 'placed')
WHERE insider_order_status IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_external_order_id_unique
  ON public.orders (external_order_id)
  WHERE external_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_last_received_version
  ON public.orders (last_received_version);

CREATE TABLE IF NOT EXISTS public.insider_sync_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL,
  external_order_id text,
  external_customer_id text,
  version bigint,
  error_message text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.insider_sync_failures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'insider_sync_failures'
      AND policyname = 'Admins can read insider sync failures'
  ) THEN
    CREATE POLICY "Admins can read insider sync failures"
      ON public.insider_sync_failures
      FOR SELECT
      TO authenticated
      USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
  END IF;
END $$;

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

  IF NEW.insider_order_status IS NULL THEN
    NEW.insider_order_status := 'placed';
  END IF;

  NEW.last_received_version := 0;
  NEW.last_synced_at := COALESCE(NEW.last_synced_at, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_external_ids_defaults_trigger ON public.orders;

CREATE TRIGGER set_order_external_ids_defaults_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_external_ids_defaults();;
