/*
  # Create seller pickup locations

  1. New Tables
    - `seller_pickup_locations`
      - `id` (uuid, primary key)
      - `seller_id` (uuid, references profiles)
      - `warehouse_name` (text)
      - `street_address` (text)
      - `pincode` (text)
      - `city` (text)
      - `state` (text)
      - `warehouse_contact_person` (text)
      - `warehouse_contact_number` (text)
      - `warehouse_email_id` (text)
      - `is_default` (boolean)
      - `created_at` / `updated_at`

  2. Security
    - Sellers can view their own pickup locations
    - Admins can manage pickup locations for any seller

  3. Behavior
    - A trigger keeps only one default pickup location per seller
*/

CREATE TABLE IF NOT EXISTS public.seller_pickup_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_name text NOT NULL,
  street_address text NOT NULL,
  pincode text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  warehouse_contact_person text NOT NULL,
  warehouse_contact_number text NOT NULL,
  warehouse_email_id text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seller_pickup_locations
  ADD CONSTRAINT seller_pickup_locations_pincode_format
  CHECK (pincode ~ '^[0-9]{6}$');
ALTER TABLE public.seller_pickup_locations
  ADD CONSTRAINT seller_pickup_locations_contact_number_format
  CHECK (warehouse_contact_number ~ '^[0-9]{10}$');
ALTER TABLE public.seller_pickup_locations
  ADD CONSTRAINT seller_pickup_locations_email_format
  CHECK (warehouse_email_id ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
CREATE INDEX IF NOT EXISTS idx_seller_pickup_locations_seller_id
  ON public.seller_pickup_locations (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_pickup_locations_default
  ON public.seller_pickup_locations (seller_id, is_default)
  WHERE is_default = true;
ALTER TABLE public.seller_pickup_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers can view own pickup locations" ON public.seller_pickup_locations;
DROP POLICY IF EXISTS "Admins can manage pickup locations" ON public.seller_pickup_locations;
CREATE POLICY "Sellers can view own pickup locations"
  ON public.seller_pickup_locations
  FOR SELECT
  TO authenticated
  USING (
    seller_id = auth.uid()
    OR public.is_admin() = true
  );
CREATE POLICY "Admins can manage pickup locations"
  ON public.seller_pickup_locations
  FOR ALL
  TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);
CREATE OR REPLACE FUNCTION public.ensure_single_default_seller_pickup_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.seller_pickup_locations
      SET is_default = false,
          updated_at = now()
    WHERE seller_id = NEW.seller_id
      AND id <> NEW.id
      AND is_default = true;
  END IF;

  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trigger_ensure_single_default_seller_pickup_location ON public.seller_pickup_locations;
CREATE TRIGGER trigger_ensure_single_default_seller_pickup_location
  BEFORE INSERT OR UPDATE ON public.seller_pickup_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_seller_pickup_location();
