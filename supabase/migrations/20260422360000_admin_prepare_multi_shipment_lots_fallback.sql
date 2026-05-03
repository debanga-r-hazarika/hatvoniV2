-- Resolve warehouse per line: prefer default row, else earliest assignment (matches admin inventory UX).

CREATE OR REPLACE FUNCTION public.admin_prepare_multi_shipment_lots(p_order_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_order public.orders%ROWTYPE;
  v_wh    uuid;
  rec     RECORD;
  v_idx   int := 0;
  v_n     int := 0;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can prepare shipment lots';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status::text <> 'processing' THEN
    RAISE EXCEPTION 'Order must be in processing to split shipments';
  END IF;

  IF EXISTS (SELECT 1 FROM public.order_shipments WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Shipment lots already exist for this order';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.order_shipment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Order items already linked to shipment rows';
  END IF;

  FOR rec IN
    WITH resolved_line AS (
      SELECT
        oi.id AS order_item_id,
        COALESCE(
          (
            SELECT pw.warehouse_id
            FROM public.product_warehouses pw
            WHERE pw.product_id = oi.product_id
            ORDER BY pw.is_default DESC, pw.assigned_at ASC
            LIMIT 1
          ),
          (
            SELECT pw2.warehouse_id
            FROM public.lots l
            JOIN public.product_warehouses pw2 ON pw2.product_id = l.source_product_id
            WHERE l.id = oi.lot_id
            ORDER BY pw2.is_default DESC, pw2.assigned_at ASC
            LIMIT 1
          )
        ) AS warehouse_id
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
    )
    SELECT DISTINCT warehouse_id AS wid
    FROM resolved_line
    WHERE warehouse_id IS NOT NULL
    ORDER BY wid
  LOOP
    v_wh := rec.wid;
    v_idx := v_idx + 1;
    INSERT INTO public.order_shipments (
      order_id, warehouse_id, lot_index, label, velocity_external_code
    ) VALUES (
      p_order_id,
      v_wh,
      v_idx,
      'Shipment ' || v_idx,
      public.hatvoni_velocity_shipment_code(p_order_id, v_idx)
    );

    UPDATE public.order_items oi
    SET order_shipment_id = (
      SELECT s.id FROM public.order_shipments s
      WHERE s.order_id = p_order_id AND s.lot_index = v_idx
      LIMIT 1
    )
    WHERE oi.order_id = p_order_id
      AND COALESCE(
        (
          SELECT pw.warehouse_id
          FROM public.product_warehouses pw
          WHERE pw.product_id = oi.product_id
          ORDER BY pw.is_default DESC, pw.assigned_at ASC
          LIMIT 1
        ),
        (
          SELECT pw2.warehouse_id
          FROM public.lots l
          JOIN public.product_warehouses pw2 ON pw2.product_id = l.source_product_id
          WHERE l.id = oi.lot_id
          ORDER BY pw2.is_default DESC, pw2.assigned_at ASC
          LIMIT 1
        )
      ) = v_wh;

    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'No warehouse assignments found for order items — assign each product to at least one warehouse first';
  END IF;

  UPDATE public.orders
  SET fulfillment_mode = 'multi_shipment', updated_at = now(), admin_updated_at = now()
  WHERE id = p_order_id;

  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_prepare_multi_shipment_lots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_prepare_multi_shipment_lots(uuid) TO authenticated;
