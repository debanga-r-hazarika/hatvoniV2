/*
  # Seller order visibility for lot-based order model

  1. Orders SELECT
    - Sellers can read orders that contain lots with products assigned to them.

  2. Order items SELECT
    - Sellers can read only order items whose lot contains a product assigned to them.

  3. Backward compatibility
    - Also supports legacy direct product_id order items.
*/

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
        LEFT JOIN public.products direct_product ON direct_product.id = oi.product_id
        LEFT JOIN public.lot_items li ON li.lot_id = oi.lot_id
        LEFT JOIN public.products lot_product ON lot_product.key = li.product_key
        WHERE oi.order_id = orders.id
          AND (
            direct_product.seller_id = auth.uid()
            OR lot_product.seller_id = auth.uid()
          )
      )
    )
  );

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
      AND (
        EXISTS (
          SELECT 1
          FROM public.products direct_product
          WHERE direct_product.id = order_items.product_id
            AND direct_product.seller_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1
          FROM public.lot_items li
          JOIN public.products lot_product ON lot_product.key = li.product_key
          WHERE li.lot_id = order_items.lot_id
            AND lot_product.seller_id = auth.uid()
        )
      )
    )
  );;
