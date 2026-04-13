/*
  # Add seller support and product ownership

  1. Profiles
    - Add is_seller boolean role flag
    - Extend role enum with seller value

  2. Products
    - Add seller_id foreign key to profiles
    - Allow sellers to manage only their own products

  3. RLS
    - Keep admin controls
    - Add seller-scoped controls for product CRUD
*/

-- Extend role enum for seller support
DO $$
BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'seller';
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Add seller flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_seller boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_seller_true
  ON public.profiles (is_seller)
  WHERE is_seller = true;

-- Add product owner mapping to seller profile
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_seller_id
  ON public.products (seller_id);

-- Seller helper function
CREATE OR REPLACE FUNCTION public.is_seller()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT is_seller FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- Recreate products policies with seller scoping
DROP POLICY IF EXISTS "Anyone can view active products" ON public.products;
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;

CREATE POLICY "Anyone can view active products"
  ON public.products FOR SELECT
  USING (
    is_active = true
    OR public.is_admin() = true
    OR (public.is_seller() = true AND seller_id = auth.uid())
  );

CREATE POLICY "Admins and sellers can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin() = true
    OR (public.is_seller() = true AND seller_id = auth.uid())
  );

CREATE POLICY "Admins and sellers can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (
    public.is_admin() = true
    OR (public.is_seller() = true AND seller_id = auth.uid())
  )
  WITH CHECK (
    public.is_admin() = true
    OR (public.is_seller() = true AND seller_id = auth.uid())
  );

CREATE POLICY "Admins and sellers can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (
    public.is_admin() = true
    OR (public.is_seller() = true AND seller_id = auth.uid())
  );;
