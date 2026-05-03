-- Guardrails for mixed multi-lot cancellation states.
-- If any lot is in cancelled_reorder_ready, mode changes/rebuilds are allowed
-- only when every lot is in cancelled_reorder_ready.

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

  IF EXISTS (
    SELECT 1
    FROM public.order_shipments s
    WHERE s.order_id = p_order_id
      AND lower(coalesce(s.velocity_fulfillment->>'workflow_stage', '')) = 'cancelled_reorder_ready'
  ) AND EXISTS (
    SELECT 1
    FROM public.order_shipments s
    WHERE s.order_id = p_order_id
      AND lower(coalesce(s.velocity_fulfillment->>'workflow_stage', '')) <> 'cancelled_reorder_ready'
  ) THEN
    RAISE EXCEPTION 'Cannot recreate lots while some lots are still active. Cancel all active lots first.';
  END IF;

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
GRANT EXECUTE ON FUNCTION public.admin_create_empty_shipment_lots(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_revert_shipment_lots(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can revert shipment lots';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_shipments s
    WHERE s.order_id = p_order_id
      AND lower(coalesce(s.velocity_fulfillment->>'workflow_stage', '')) = 'cancelled_reorder_ready'
  ) AND EXISTS (
    SELECT 1
    FROM public.order_shipments s
    WHERE s.order_id = p_order_id
      AND lower(coalesce(s.velocity_fulfillment->>'workflow_stage', '')) <> 'cancelled_reorder_ready'
  ) THEN
    RAISE EXCEPTION 'Cannot change mode while some lots are still active. Cancel all active lots first.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_shipments
    WHERE order_id = p_order_id
      AND (
        velocity_shipment_id IS NOT NULL
        OR velocity_pending_shipment_id IS NOT NULL
        OR tracking_number IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'Cannot revert — one or more lots already have a Velocity shipment or AWB. Cancel those shipments first.';
  END IF;

  UPDATE public.order_items
  SET order_shipment_id = NULL
  WHERE order_id = p_order_id;

  DELETE FROM public.order_shipments WHERE order_id = p_order_id;

  UPDATE public.orders
  SET
    fulfillment_mode = NULL,
    updated_at       = now(),
    admin_updated_at = now()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revert_shipment_lots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revert_shipment_lots(uuid) TO authenticated;

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
    SELECT 1
    FROM public.order_shipments s
    WHERE s.order_id = p_order_id
      AND lower(coalesce(s.velocity_fulfillment->>'workflow_stage', '')) = 'cancelled_reorder_ready'
  ) AND EXISTS (
    SELECT 1
    FROM public.order_shipments s
    WHERE s.order_id = p_order_id
      AND lower(coalesce(s.velocity_fulfillment->>'workflow_stage', '')) <> 'cancelled_reorder_ready'
  ) THEN
    RAISE EXCEPTION 'Cannot switch to single shipment while some lots are still active. Cancel all active lots first.';
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

CREATE OR REPLACE FUNCTION public.guard_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Once an order leaves pending (approval step 1), do not allow returning to pending.
  IF OLD.status::text <> 'pending' AND NEW.status::text = 'pending' THEN
    RAISE EXCEPTION 'Order is already approved/processed and cannot return to pending approval.';
  END IF;

  IF current_setting('hatvoni.workflow_actor', true) IS NOT NULL
     AND current_setting('hatvoni.workflow_actor', true) <> '' THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'pending' AND NEW.status::text = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'processing' AND NEW.status::text IN ('shipped', 'delivered', 'cancelled') THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'shipped' AND NEW.status::text IN ('delivered', 'cancelled') THEN
    RETURN NEW;
  END IF;

  IF OLD.status::text = 'partially_approved' AND NEW.status::text IN ('processing', 'shipped', 'delivered', 'cancelled') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Direct order status change from % to % is not allowed. Use admin_finalize_order() instead.',
    OLD.status, NEW.status;
END;
$$;;
