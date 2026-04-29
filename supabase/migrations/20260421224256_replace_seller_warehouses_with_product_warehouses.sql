-- Drop the seller_warehouses table (wrong model — warehouses belong to products, not sellers)
DROP TABLE IF EXISTS public.seller_warehouses CASCADE;

-- Drop the trigger function that was for seller_warehouses
DROP FUNCTION IF EXISTS public.ensure_single_default_seller_warehouse() CASCADE;

-- Create product_warehouses junction table
CREATE TABLE IF NOT EXISTS public.product_warehouses (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_product_warehouses_product_id
  ON public.product_warehouses (product_id);

CREATE INDEX IF NOT EXISTS idx_product_warehouses_warehouse_id
  ON public.product_warehouses (warehouse_id);

CREATE INDEX IF NOT EXISTS idx_product_warehouses_default
  ON public.product_warehouses (product_id, is_default)
  WHERE is_default = true;

ALTER TABLE public.product_warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage product warehouse assignments"
  ON public.product_warehouses
  FOR ALL
  TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

CREATE POLICY "Sellers can view warehouse assignments for their products"
  ON public.product_warehouses
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() = true
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id
        AND p.seller_id = auth.uid()
    )
  );

-- Trigger: ensure only one default warehouse per product
CREATE OR REPLACE FUNCTION public.ensure_single_default_product_warehouse()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.product_warehouses
      SET is_default = false
    WHERE product_id = NEW.product_id
      AND warehouse_id <> NEW.warehouse_id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ensure_single_default_product_warehouse ON public.product_warehouses;

CREATE TRIGGER trigger_ensure_single_default_product_warehouse
  BEFORE INSERT OR UPDATE ON public.product_warehouses
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_default_product_warehouse();

-- Also update the warehouses SELECT policy to reference product_warehouses instead
DROP POLICY IF EXISTS "Sellers can view assigned warehouses" ON public.warehouses;

CREATE POLICY "Sellers can view warehouses assigned to their products"
  ON public.warehouses
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin() = true
    OR EXISTS (
      SELECT 1 FROM public.product_warehouses pw
      JOIN public.products p ON p.id = pw.product_id
      WHERE pw.warehouse_id = warehouses.id
        AND p.seller_id = auth.uid()
    )
  );;
