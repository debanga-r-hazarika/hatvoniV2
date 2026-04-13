
-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can view own orders or admins can view all" ON public.orders;
DROP POLICY IF EXISTS "Users can view own order items or admins can view all" ON public.order_items;

-- Create simplified orders policy (no recursive order_items check)
CREATE POLICY "Users can view own orders or admins or sellers"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin() = true
    OR is_seller() = true
  );

-- Create simplified order_items policy with direct product checks
CREATE POLICY "Users can view own order items or sellers can view their products"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    -- Customer can view their own order items
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
    -- Admin can view all
    OR is_admin() = true
    -- Seller can view items containing their products
    OR (
      is_seller() = true
      AND (
        -- Direct product assignment
        EXISTS (
          SELECT 1 FROM products p
          WHERE p.id = order_items.product_id
            AND p.seller_id = auth.uid()
        )
        -- Product in lot
        OR EXISTS (
          SELECT 1 FROM lot_items li
          JOIN products p ON p.key = li.product_key
          WHERE li.lot_id = order_items.lot_id
            AND p.seller_id = auth.uid()
        )
      )
    )
  );
;
