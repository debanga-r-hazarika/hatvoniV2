/*
  # Create warehouses and product_warehouses tables

  Warehouses are standalone entities. Multiple warehouses can be assigned to a product.

  1. Tables
    - `warehouses` — standalone warehouse records (no seller link)
    - `product_warehouses` — many-to-many: products ↔ warehouses, with is_default flag

  2. Security
    - Admins manage everything
    - Sellers can view warehouses assigned to their own products
*/

-- ── Warehouses ────────────────────────────────────────────────
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
-- ── Product ↔ Warehouse assignments ──────────────────────────
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
-- Add cross-reference policy on warehouses (product_warehouses exists now)
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
