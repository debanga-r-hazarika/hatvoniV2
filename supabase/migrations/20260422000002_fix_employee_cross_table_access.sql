/*
  # Fix employee module cross-table RLS access

  Each module's UI touches multiple tables beyond its primary table.
  This migration adds the missing SELECT policies so employees can
  access all data their assigned module's UI needs.

  orders     → profiles (customer details), products (order items),
               hatvoni_inventory (stock check), seller_pickup_locations (shipping)
  logistics  → profiles (seller/customer info), products (item details)
  customers  → order_items + products (order history detail)
  sellers    → products (seller product list), order_items
  inventory  → products (map tag_key to product names)
  coupons    → products (applicable products display), profiles (usage lookup)
*/

-- ── ORDERS module ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Employees can view profiles for orders module" ON public.profiles;
CREATE POLICY "Employees can view profiles for orders module"
  ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'orders'
  ));
DROP POLICY IF EXISTS "Employees can view products for orders module" ON public.products;
CREATE POLICY "Employees can view products for orders module"
  ON public.products FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'orders'
  ));
DROP POLICY IF EXISTS "Employees can view inventory for orders module" ON public.hatvoni_inventory;
CREATE POLICY "Employees can view inventory for orders module"
  ON public.hatvoni_inventory FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'orders'
  ));
DROP POLICY IF EXISTS "Employees can view pickup locations for orders module" ON public.seller_pickup_locations;
CREATE POLICY "Employees can view pickup locations for orders module"
  ON public.seller_pickup_locations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'orders'
  ));
-- ── LOGISTICS module ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Employees can view profiles for logistics module" ON public.profiles;
CREATE POLICY "Employees can view profiles for logistics module"
  ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'logistics'
  ));
DROP POLICY IF EXISTS "Employees can view products for logistics module" ON public.products;
CREATE POLICY "Employees can view products for logistics module"
  ON public.products FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'logistics'
  ));
-- ── CUSTOMERS module ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Employees can view order items for customers module" ON public.order_items;
CREATE POLICY "Employees can view order items for customers module"
  ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'customers'
  ));
DROP POLICY IF EXISTS "Employees can view products for customers module" ON public.products;
CREATE POLICY "Employees can view products for customers module"
  ON public.products FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'customers'
  ));
-- ── SELLERS module ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Employees can view products for sellers module" ON public.products;
CREATE POLICY "Employees can view products for sellers module"
  ON public.products FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'sellers'
  ));
DROP POLICY IF EXISTS "Employees can view order items for sellers module" ON public.order_items;
CREATE POLICY "Employees can view order items for sellers module"
  ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'sellers'
  ));
-- ── INVENTORY module ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Employees can view products for inventory module" ON public.products;
CREATE POLICY "Employees can view products for inventory module"
  ON public.products FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'inventory'
  ));
-- ── COUPONS module ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Employees can view products for coupons module" ON public.products;
CREATE POLICY "Employees can view products for coupons module"
  ON public.products FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'coupons'
  ));
DROP POLICY IF EXISTS "Employees can view profiles for coupons module" ON public.profiles;
CREATE POLICY "Employees can view profiles for coupons module"
  ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = auth.uid() AND e.is_active = true AND em.module = 'coupons'
  ));
