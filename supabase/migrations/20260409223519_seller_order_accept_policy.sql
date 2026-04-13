
CREATE POLICY "Sellers can accept orders (update to processing)"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    public.is_seller() = true
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
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
  WITH CHECK (
    public.is_seller() = true
    AND status IN ('pending', 'processing')
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      LEFT JOIN public.products direct_product ON direct_product.id = oi.product_id
      LEFT JOIN public.lot_items li ON li.lot_id = oi.lot_id
      LEFT JOIN public.products lot_product ON lot_product.key = li.product_key
      WHERE oi.order_id = orders.id
        AND (
          direct_product.seller_id = auth.uid()
          OR lot_product.seller_id = auth.uid()
        )
    )
  );
;
