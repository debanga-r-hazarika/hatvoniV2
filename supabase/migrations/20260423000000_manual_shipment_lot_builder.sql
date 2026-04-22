/*
  Manual shipment lot builder — admin creates empty lots and assigns items manually.

  Replaces the auto-warehouse-grouping approach with a fully manual workflow:
  - admin_create_empty_shipment_lots(order_id, lot_count)  → creates N empty order_shipments rows
  - admin_assign_item_to_lot(order_item_id, order_shipment_id)  → links one item to one lot
  - admin_unassign_item_from_lot(order_item_id)  → removes lot link from item
  - admin_add_shipment_lot(order_id)  → appends one more lot to an existing multi-shipment order
  - admin_revert_shipment_lots(order_id)  → deletes all lots, resets fulfillment_mode to NULL
*/

-- ─── 1. Create N empty lots ────────────────────────────────────────────────────

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

  IF EXISTS (SELECT 1 FROM public.order_shipments WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Shipment lots already exist for this order. Use admin_add_shipment_lot to add more.';
  END IF;

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

-- ─── 2. Assign one order_item to a lot ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_assign_item_to_lot(
  p_order_item_id    uuid,
  p_order_shipment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_item  public.order_items%ROWTYPE;
  v_lot   public.order_shipments%ROWTYPE;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can assign items to lots';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  SELECT * INTO v_lot FROM public.order_shipments WHERE id = p_order_shipment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment lot not found';
  END IF;

  IF v_lot.order_id <> v_item.order_id THEN
    RAISE EXCEPTION 'Shipment lot does not belong to the same order as the item';
  END IF;

  UPDATE public.order_items
  SET order_shipment_id = p_order_shipment_id
  WHERE id = p_order_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_assign_item_to_lot(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_assign_item_to_lot(uuid, uuid) TO authenticated;

-- ─── 3. Unassign an item from its lot ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_unassign_item_from_lot(
  p_order_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can unassign items from lots';
  END IF;

  UPDATE public.order_items
  SET order_shipment_id = NULL
  WHERE id = p_order_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unassign_item_from_lot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unassign_item_from_lot(uuid) TO authenticated;

-- ─── 4. Add one more lot to an existing multi-shipment order ──────────────────

CREATE OR REPLACE FUNCTION public.admin_add_shipment_lot(
  p_order_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin    uuid;
  v_order    public.orders%ROWTYPE;
  v_next_idx int;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can add shipment lots';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF coalesce(v_order.fulfillment_mode, '') <> 'multi_shipment' THEN
    RAISE EXCEPTION 'Order is not in multi_shipment mode';
  END IF;

  SELECT coalesce(max(lot_index), 0) + 1 INTO v_next_idx
  FROM public.order_shipments
  WHERE order_id = p_order_id;

  INSERT INTO public.order_shipments (
    order_id,
    lot_index,
    label,
    velocity_external_code
  ) VALUES (
    p_order_id,
    v_next_idx,
    'Shipment ' || v_next_idx,
    public.hatvoni_velocity_shipment_code(p_order_id, v_next_idx)
  );

  RETURN v_next_idx;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_shipment_lot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_shipment_lot(uuid) TO authenticated;

-- ─── 5. Revert all lots — delete shipments, unlink items, reset mode ──────────

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

  -- Guard: cannot revert if any lot already has a Velocity shipment or AWB
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

  -- Unlink all items
  UPDATE public.order_items
  SET order_shipment_id = NULL
  WHERE order_id = p_order_id;

  -- Delete all lots (cascade deletes tracking events)
  DELETE FROM public.order_shipments WHERE order_id = p_order_id;

  -- Reset fulfillment mode
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
