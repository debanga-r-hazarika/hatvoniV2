CREATE OR REPLACE FUNCTION public.admin_create_empty_shipment_lots(
  p_order_id  uuid,
  p_lot_count int DEFAULT 2
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_order public.orders%ROWTYPE;
  i       int;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can create shipment lots';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status::text NOT IN ('processing') THEN
    RAISE EXCEPTION 'Order must be in processing status to create shipment lots';
  END IF;

  -- Guard: cannot recreate if any lot already has a Velocity shipment or AWB
  IF EXISTS (
    SELECT 1 FROM public.order_shipments
    WHERE order_id = p_order_id
      AND (
        velocity_shipment_id IS NOT NULL
        OR velocity_pending_shipment_id IS NOT NULL
        OR tracking_number IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Cannot recreate lots — one or more existing lots already have a Velocity shipment or AWB. Revert those first.';
  END IF;

  -- Clean up any leftover empty lots from a previous session
  UPDATE public.order_items
  SET order_shipment_id = NULL
  WHERE order_id = p_order_id;

  DELETE FROM public.order_shipments WHERE order_id = p_order_id;

  p_lot_count := GREATEST(2, LEAST(p_lot_count, 20));

  FOR i IN 1..p_lot_count LOOP
    INSERT INTO public.order_shipments (
      order_id,
      lot_index,
      label,
      velocity_external_code
    ) VALUES (
      p_order_id,
      i,
      'Shipment ' || i,
      public.hatvoni_velocity_shipment_code(p_order_id, i)
    );
  END LOOP;

  UPDATE public.orders
  SET
    fulfillment_mode = 'multi_shipment',
    updated_at       = now(),
    admin_updated_at = now()
  WHERE id = p_order_id;

  RETURN p_lot_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_empty_shipment_lots(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_empty_shipment_lots(uuid, int) TO authenticated;;
