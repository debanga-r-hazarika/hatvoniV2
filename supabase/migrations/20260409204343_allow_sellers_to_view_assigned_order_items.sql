/*
  # Allow sellers to view assigned order lines

  1. Orders
    - Sellers can read orders that include at least one product assigned to them.

  2. Order items
    - Sellers can read only order_items where product belongs to them.

  3. Existing behavior retained
    - Customers can still read their own orders/items.
    - Admins can still read all orders/items.
*/

-- Orders: extend SELECT visibility to sellers for assigned products
DROP POLICY IF EXISTS "Users can view own orders or admins can view all" ON public.orders;

CREATE POLICY "Users can view own orders or admins can view all"
  ON public.orders FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin() = true
    OR (
      public.is_seller() = true
      AND EXISTS (
        SELECT 1
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id
        WHERE oi.order_id = orders.id
          AND p.seller_id = auth.uid()
      )
    )
  );

-- Order items: extend SELECT visibility to sellers only for their own product lines
DROP POLICY IF EXISTS "Users can view own order items or admins can view all" ON public.order_items;

CREATE POLICY "Users can view own order items or admins can view all"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
    OR public.is_admin() = true
    OR (
      public.is_seller() = true
      AND EXISTS (
        SELECT 1
        FROM public.products p
        WHERE p.id = order_items.product_id
          AND p.seller_id = auth.uid()
      )
    )
  );;
