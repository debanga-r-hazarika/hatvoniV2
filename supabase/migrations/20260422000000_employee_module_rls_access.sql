/*
  # Employee Module RLS Access

  Grants employees read (and where appropriate write) access to the tables
  they need for each assigned module, mirroring admin-level data visibility.

  The support module already has employee-aware policies (added in
  20260417143000_create_support_grievance_system.sql) — it is skipped here.

  Modules covered:
    orders      → orders, order_items, order_item_approvals, order_workflow_log,
                  seller_order_item_decisions
    products    → products, lots, lot_items
    lots        → lots, lot_items  (same tables, same policy names)
    inventory   → hatvoni_inventory, hatvoni_inventory_lots
    coupons     → coupons, coupon_usage, coupon_audit_log
    customers   → profiles (read-only)
    sellers     → profiles (is_seller), seller_pickup_locations
    logistics   → orders (read), seller_pickup_locations

  Helper macro used throughout:
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = '<module>'
    )
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- ORDERS MODULE
-- employees with 'orders' module get full read + update on orders/items
-- ─────────────────────────────────────────────────────────────────────────────

-- orders: SELECT
DROP POLICY IF EXISTS "Employees can view orders for their module" ON public.orders;
CREATE POLICY "Employees can view orders for their module"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  );

-- orders: UPDATE (status changes, shipping updates, etc.)
DROP POLICY IF EXISTS "Employees can update orders for their module" ON public.orders;
CREATE POLICY "Employees can update orders for their module"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  );

-- order_items: SELECT
DROP POLICY IF EXISTS "Employees can view order items for their module" ON public.order_items;
CREATE POLICY "Employees can view order items for their module"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  );

-- order_item_approvals: SELECT + UPDATE (employees can review items)
DROP POLICY IF EXISTS "Employees can view order item approvals" ON public.order_item_approvals;
CREATE POLICY "Employees can view order item approvals"
  ON public.order_item_approvals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  );

DROP POLICY IF EXISTS "Employees can update order item approvals" ON public.order_item_approvals;
CREATE POLICY "Employees can update order item approvals"
  ON public.order_item_approvals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  );

-- order_workflow_log: SELECT
DROP POLICY IF EXISTS "Employees can view workflow logs for their module" ON public.order_workflow_log;
CREATE POLICY "Employees can view workflow logs for their module"
  ON public.order_workflow_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  );

-- seller_order_item_decisions: SELECT (orders employees need to see seller decisions)
DROP POLICY IF EXISTS "Employees can view seller decisions for orders module" ON public.seller_order_item_decisions;
CREATE POLICY "Employees can view seller decisions for orders module"
  ON public.seller_order_item_decisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'orders'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- LOGISTICS MODULE
-- employees with 'logistics' module can view orders + manage pickup locations
-- ─────────────────────────────────────────────────────────────────────────────

-- orders: SELECT (logistics needs to see orders for shipping)
DROP POLICY IF EXISTS "Employees can view orders for logistics module" ON public.orders;
CREATE POLICY "Employees can view orders for logistics module"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'logistics'
    )
  );

-- orders: UPDATE (logistics can update shipping status)
DROP POLICY IF EXISTS "Employees can update orders for logistics module" ON public.orders;
CREATE POLICY "Employees can update orders for logistics module"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'logistics'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'logistics'
    )
  );

-- order_items: SELECT (logistics needs item details)
DROP POLICY IF EXISTS "Employees can view order items for logistics module" ON public.order_items;
CREATE POLICY "Employees can view order items for logistics module"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'logistics'
    )
  );

-- seller_pickup_locations: SELECT + ALL (logistics manages pickup locations)
DROP POLICY IF EXISTS "Employees can view pickup locations for logistics module" ON public.seller_pickup_locations;
CREATE POLICY "Employees can view pickup locations for logistics module"
  ON public.seller_pickup_locations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'logistics'
    )
  );

DROP POLICY IF EXISTS "Employees can manage pickup locations for logistics module" ON public.seller_pickup_locations;
CREATE POLICY "Employees can manage pickup locations for logistics module"
  ON public.seller_pickup_locations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'logistics'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'logistics'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- INVENTORY MODULE
-- employees with 'inventory' module get full access to hatvoni inventory tables
-- ─────────────────────────────────────────────────────────────────────────────

-- hatvoni_inventory: ALL
DROP POLICY IF EXISTS "Employees can manage hatvoni_inventory for inventory module" ON public.hatvoni_inventory;
CREATE POLICY "Employees can manage hatvoni_inventory for inventory module"
  ON public.hatvoni_inventory FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'inventory'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'inventory'
    )
  );

-- hatvoni_inventory_lots: ALL
DROP POLICY IF EXISTS "Employees can manage hatvoni_inventory_lots for inventory module" ON public.hatvoni_inventory_lots;
CREATE POLICY "Employees can manage hatvoni_inventory_lots for inventory module"
  ON public.hatvoni_inventory_lots FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'inventory'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'inventory'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- COUPONS MODULE
-- employees with 'coupons' module get full access to coupon management
-- ─────────────────────────────────────────────────────────────────────────────

-- coupons: ALL
DROP POLICY IF EXISTS "Employees can manage coupons for coupons module" ON public.coupons;
CREATE POLICY "Employees can manage coupons for coupons module"
  ON public.coupons FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'coupons'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'coupons'
    )
  );

-- coupon_usage: SELECT (employees can view usage stats)
DROP POLICY IF EXISTS "Employees can view coupon usage for coupons module" ON public.coupon_usage;
CREATE POLICY "Employees can view coupon usage for coupons module"
  ON public.coupon_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'coupons'
    )
  );

-- coupon_audit_log: SELECT
DROP POLICY IF EXISTS "Employees can view coupon audit logs for coupons module" ON public.coupon_audit_log;
CREATE POLICY "Employees can view coupon audit logs for coupons module"
  ON public.coupon_audit_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'coupons'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- CUSTOMERS MODULE
-- employees with 'customers' module can view all profiles (read-only)
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles: SELECT
DROP POLICY IF EXISTS "Employees can view profiles for customers module" ON public.profiles;
CREATE POLICY "Employees can view profiles for customers module"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'customers'
    )
  );

-- orders: SELECT (customers module needs order history per customer)
DROP POLICY IF EXISTS "Employees can view orders for customers module" ON public.orders;
CREATE POLICY "Employees can view orders for customers module"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'customers'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- SELLERS MODULE
-- employees with 'sellers' module can view/manage seller profiles and locations
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles: SELECT (to view seller profiles)
DROP POLICY IF EXISTS "Employees can view profiles for sellers module" ON public.profiles;
CREATE POLICY "Employees can view profiles for sellers module"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'sellers'
    )
  );

-- profiles: UPDATE (sellers module can ban/unban and toggle is_own_seller)
DROP POLICY IF EXISTS "Employees can update profiles for sellers module" ON public.profiles;
CREATE POLICY "Employees can update profiles for sellers module"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'sellers'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'sellers'
    )
  );

-- seller_pickup_locations: ALL (sellers module manages pickup locations)
DROP POLICY IF EXISTS "Employees can manage pickup locations for sellers module" ON public.seller_pickup_locations;
CREATE POLICY "Employees can manage pickup locations for sellers module"
  ON public.seller_pickup_locations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'sellers'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'sellers'
    )
  );

-- orders: SELECT (sellers module needs to see seller-related orders)
DROP POLICY IF EXISTS "Employees can view orders for sellers module" ON public.orders;
CREATE POLICY "Employees can view orders for sellers module"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'sellers'
    )
  );

-- seller_order_item_decisions: SELECT
DROP POLICY IF EXISTS "Employees can view seller decisions for sellers module" ON public.seller_order_item_decisions;
CREATE POLICY "Employees can view seller decisions for sellers module"
  ON public.seller_order_item_decisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'sellers'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTS MODULE
-- employees with 'products' module get full access to products, lots, lot_items
-- ─────────────────────────────────────────────────────────────────────────────

-- products: ALL
DROP POLICY IF EXISTS "Employees can manage products for products module" ON public.products;
CREATE POLICY "Employees can manage products for products module"
  ON public.products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'products'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'products'
    )
  );

-- lots: ALL
DROP POLICY IF EXISTS "Employees can manage lots for products module" ON public.lots;
CREATE POLICY "Employees can manage lots for products module"
  ON public.lots FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'products'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'products'
    )
  );

-- lot_items: ALL
DROP POLICY IF EXISTS "Employees can manage lot items for products module" ON public.lot_items;
CREATE POLICY "Employees can manage lot items for products module"
  ON public.lot_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'products'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'products'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- LOTS MODULE
-- employees with 'lots' module get full access to lots and lot_items
-- (products table read-only so they can see product names/keys)
-- ─────────────────────────────────────────────────────────────────────────────

-- lots: ALL
DROP POLICY IF EXISTS "Employees can manage lots for lots module" ON public.lots;
CREATE POLICY "Employees can manage lots for lots module"
  ON public.lots FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'lots'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'lots'
    )
  );

-- lot_items: ALL
DROP POLICY IF EXISTS "Employees can manage lot items for lots module" ON public.lot_items;
CREATE POLICY "Employees can manage lot items for lots module"
  ON public.lot_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'lots'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'lots'
    )
  );

-- products: SELECT (lots module needs to read product catalog)
DROP POLICY IF EXISTS "Employees can view products for lots module" ON public.products;
CREATE POLICY "Employees can view products for lots module"
  ON public.products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN   public.employee_modules em ON em.employee_id = e.id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
        AND  em.module    = 'lots'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RECIPES MODULE
-- employees with 'recipes' module get full access to recipes tables
-- ─────────────────────────────────────────────────────────────────────────────

-- recipes: ALL (if table exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recipes'
  ) THEN
    EXECUTE $pol$
      DROP POLICY IF EXISTS "Employees can manage recipes for recipes module" ON public.recipes;
      CREATE POLICY "Employees can manage recipes for recipes module"
        ON public.recipes FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM public.employees e
            JOIN   public.employee_modules em ON em.employee_id = e.id
            WHERE  e.profile_id = auth.uid()
              AND  e.is_active  = true
              AND  em.module    = 'recipes'
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.employees e
            JOIN   public.employee_modules em ON em.employee_id = e.id
            WHERE  e.profile_id = auth.uid()
              AND  e.is_active  = true
              AND  em.module    = 'recipes'
          )
        );
    $pol$;
  END IF;
END $$;
