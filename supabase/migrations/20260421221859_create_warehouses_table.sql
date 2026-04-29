-- Step 1: Create warehouses table (without cross-reference policy)
CREATE TABLE IF NOT EXISTS public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_name text NOT NULL,
  velocity_warehouse_id text,
  street_address text NOT NULL,
  pincode text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  contact_person text NOT NULL,
  contact_number text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses
  ADD CONSTRAINT warehouses_pincode_format
  CHECK (pincode ~ '^[0-9]{6}$');

ALTER TABLE public.warehouses
  ADD CONSTRAINT warehouses_contact_number_format
  CHECK (contact_number ~ '^[0-9]{10}$');

CREATE INDEX IF NOT EXISTS idx_warehouses_pincode
  ON public.warehouses (pincode);

CREATE INDEX IF NOT EXISTS idx_warehouses_velocity_id
  ON public.warehouses (velocity_warehouse_id)
  WHERE velocity_warehouse_id IS NOT NULL;

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage warehouses"
  ON public.warehouses
  FOR ALL
  TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

-- Step 2: Create seller_warehouses junction table
CREATE TABLE IF NOT EXISTS public.seller_warehouses (
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_warehouses_seller_id
  ON public.seller_warehouses (seller_id);

CREATE INDEX IF NOT EXISTS idx_seller_warehouses_warehouse_id
  ON public.seller_warehouses (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_seller_warehouses_default
  ON public.seller_warehouses (seller_id, is_default)
  WHERE is_default = true;

ALTER TABLE public.seller_warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage seller warehouse assignments"
  ON public.seller_warehouses
  FOR ALL
  TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

CREATE POLICY "Sellers can view own warehouse assignments"
  ON public.seller_warehouses
  FOR SELECT
  TO authenticated
  USING (
    seller_id = auth.uid()
    OR public.is_admin() = true
  );

-- Step 3: Now add the cross-reference policy on warehouses (seller_warehouses exists now)
CREATE POLICY "Sellers can view assigned warehouses"
  ON public.warehouses
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() = true
    OR EXISTS (
      SELECT 1 FROM public.seller_warehouses sw
      WHERE sw.warehouse_id = warehouses.id
        AND sw.seller_id = auth.uid()
    )
  );

-- Step 4: Trigger to enforce single default warehouse per seller
CREATE OR REPLACE FUNCTION public.ensure_single_default_seller_warehouse()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.seller_warehouses
      SET is_default = false
    WHERE seller_id = NEW.seller_id
      AND warehouse_id <> NEW.warehouse_id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ensure_single_default_seller_warehouse ON public.seller_warehouses;

CREATE TRIGGER trigger_ensure_single_default_seller_warehouse
  BEFORE INSERT OR UPDATE ON public.seller_warehouses
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_seller_warehouse();;
