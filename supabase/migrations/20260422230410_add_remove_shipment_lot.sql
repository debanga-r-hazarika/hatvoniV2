CREATE OR REPLACE FUNCTION public.admin_remove_shipment_lot(
  p_order_shipment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_lot   public.order_shipments%ROWTYPE;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can remove shipment lots';
  END IF;

  SELECT * INTO v_lot FROM public.order_shipments WHERE id = p_order_shipment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment lot not found';
  END IF;

  IF v_lot.lot_index <= 2 THEN
    RAISE EXCEPTION 'The first two lots cannot be removed';
  END IF;

  IF v_lot.velocity_shipment_id IS NOT NULL
    OR v_lot.velocity_pending_shipment_id IS NOT NULL
    OR v_lot.tracking_number IS NOT NULL
  THEN
    RAISE EXCEPTION 'Cannot remove a lot that already has a Velocity shipment or AWB';
  END IF;

  -- Unlink any items assigned to this lot
  UPDATE public.order_items
  SET order_shipment_id = NULL
  WHERE order_shipment_id = p_order_shipment_id;

  DELETE FROM public.order_shipments WHERE id = p_order_shipment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_shipment_lot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_remove_shipment_lot(uuid) TO authenticated;;
