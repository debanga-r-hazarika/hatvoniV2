ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS shipping_attempt_no int;

UPDATE public.order_shipments
SET shipping_attempt_no = 1
WHERE shipping_attempt_no IS NULL;

ALTER TABLE public.order_shipments
  ALTER COLUMN shipping_attempt_no SET DEFAULT 1;

ALTER TABLE public.order_shipments
  ALTER COLUMN shipping_attempt_no SET NOT NULL;

CREATE OR REPLACE FUNCTION public.hatvoni_velocity_shipment_reorder_code(
  p_order_id uuid,
  p_lot_index int,
  p_attempt_no int
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.hatvoni_velocity_shipment_code(p_order_id, p_lot_index) || '-R' || GREATEST(1, p_attempt_no)::text;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_shipment_lot_reorder_ready(
  p_order_shipment_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_lot public.order_shipments%ROWTYPE;
  v_attempt int;
  v_new_code text;
  v_prev_code text;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can move shipment lots back for reorder';
  END IF;

  SELECT * INTO v_lot FROM public.order_shipments WHERE id = p_order_shipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment lot not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.order_shipment_tracking_events te
    WHERE te.order_shipment_id = p_order_shipment_id
      AND te.source = 'cancel_api'
  ) THEN
    RAISE EXCEPTION 'Cancel courier first before moving this lot back.';
  END IF;

  IF v_lot.velocity_pending_shipment_id IS NOT NULL
     OR v_lot.velocity_shipment_id IS NOT NULL
     OR nullif(trim(coalesce(v_lot.tracking_number, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'This lot still has an active draft or AWB. Cancel courier first.';
  END IF;

  v_attempt := GREATEST(1, coalesce(v_lot.shipping_attempt_no, 1)) + 1;
  v_prev_code := coalesce(v_lot.velocity_external_code, public.hatvoni_velocity_shipment_code(v_lot.order_id, v_lot.lot_index));
  v_new_code := public.hatvoni_velocity_shipment_reorder_code(v_lot.order_id, v_lot.lot_index, v_attempt);

  UPDATE public.order_shipments
  SET
    shipping_attempt_no = v_attempt,
    velocity_external_code = v_new_code,
    velocity_fulfillment = coalesce(velocity_fulfillment, '{}'::jsonb)
      || jsonb_build_object(
        'workflow_stage', 'reorder_ready',
        'reorder_ready_at', now(),
        'previous_velocity_external_code', v_prev_code,
        'reorder_attempt_no', v_attempt
      ),
    carrier_shipment_status = 'pending',
    updated_at = now()
  WHERE id = p_order_shipment_id;

  INSERT INTO public.order_shipment_tracking_events (
    order_shipment_id,
    source,
    activity,
    carrier_remark,
    raw_payload,
    event_time
  ) VALUES (
    p_order_shipment_id,
    'admin_back',
    'BACK_TO_SHIPPING',
    'Admin moved lot back to serviceability and reorder.',
    jsonb_build_object(
      'previous_velocity_external_code', v_prev_code,
      'velocity_external_code', v_new_code,
      'shipping_attempt_no', v_attempt
    ),
    now()
  );

  PERFORM public.recompute_order_fulfillment_aggregate(v_lot.order_id);
  RETURN v_new_code;
END;
$$;

REVOKE ALL ON FUNCTION public.hatvoni_velocity_shipment_reorder_code(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hatvoni_velocity_shipment_reorder_code(uuid, int, int) TO service_role;

REVOKE ALL ON FUNCTION public.admin_mark_shipment_lot_reorder_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_shipment_lot_reorder_ready(uuid) TO authenticated;
