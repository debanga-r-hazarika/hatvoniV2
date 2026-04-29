CREATE OR REPLACE FUNCTION public.admin_prepare_single_shipment_lot(
  p_order_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_order public.orders%ROWTYPE;
  v_lot_id uuid;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can prepare single shipment lots';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status::text <> 'processing' THEN
    RAISE EXCEPTION 'Order must be in processing to configure shipment lots';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_shipments s
    WHERE s.order_id = p_order_id
      AND (
        s.velocity_shipment_id IS NOT NULL
        OR s.velocity_pending_shipment_id IS NOT NULL
        OR nullif(trim(coalesce(s.tracking_number, '')), '') IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Cannot switch mode after shipment draft/AWB is present';
  END IF;

  UPDATE public.order_items
  SET order_shipment_id = NULL
  WHERE order_id = p_order_id;

  DELETE FROM public.order_shipments
  WHERE order_id = p_order_id;

  INSERT INTO public.order_shipments (
    order_id,
    lot_index,
    label,
    velocity_external_code
  ) VALUES (
    p_order_id,
    1,
    'Shipment 1',
    public.hatvoni_velocity_shipment_code(p_order_id, 1)
  )
  RETURNING id INTO v_lot_id;

  UPDATE public.order_items
  SET order_shipment_id = v_lot_id
  WHERE order_id = p_order_id;

  UPDATE public.orders
  SET
    fulfillment_mode = 'multi_shipment',
    updated_at = now(),
    admin_updated_at = now()
  WHERE id = p_order_id;

  RETURN v_lot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_prepare_single_shipment_lot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_prepare_single_shipment_lot(uuid) TO authenticated;
