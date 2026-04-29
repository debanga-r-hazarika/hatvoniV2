-- Update admin_override_seller_decision to distinguish
-- 'acting on behalf of pending seller' from 'overriding an existing decision'
-- in the audit log event_type.

CREATE OR REPLACE FUNCTION public.admin_override_seller_decision(
  p_order_item_id uuid,
  p_product_key   text,
  p_seller_id     uuid,
  p_new_decision  text,
  p_reason        text
)
RETURNS public.seller_order_item_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id        uuid;
  v_row             public.seller_order_item_decisions%ROWTYPE;
  v_order_id        uuid;
  v_existing        public.seller_order_item_decisions%ROWTYPE;
  v_event_type      text;
BEGIN
  -- Auth: must be admin
  SELECT id INTO v_admin_id FROM public.profiles
  WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can override seller decisions';
  END IF;

  -- Validate
  IF p_new_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Override decision must be approved or rejected';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Override reason is required';
  END IF;

  -- Get order_id for logging
  SELECT order_id INTO v_order_id FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found: %', p_order_item_id;
  END IF;

  -- Check if a seller decision already exists (to distinguish on-behalf vs override)
  SELECT * INTO v_existing
  FROM public.seller_order_item_decisions
  WHERE order_item_id = p_order_item_id
    AND product_key   = p_product_key
    AND seller_id     = p_seller_id;

  -- Determine audit event type:
  -- 'admin_decided_on_behalf' = no prior row, or prior row was still 'pending'
  -- 'seller_decision_overridden' = seller had already approved or rejected
  IF NOT FOUND OR v_existing.decision = 'pending' THEN
    v_event_type := 'admin_decided_on_behalf';
  ELSE
    v_event_type := 'seller_decision_overridden';
  END IF;

  -- Upsert: create or override the seller decision record
  INSERT INTO public.seller_order_item_decisions (
    order_item_id, product_key, seller_id,
    decision, decision_reason, decided_at,
    override_by, override_reason, overridden_at, original_decision
  )
  VALUES (
    p_order_item_id, p_product_key, p_seller_id,
    p_new_decision::public.seller_item_decision, p_reason, now(),
    v_admin_id, p_reason, now(), NULL
  )
  ON CONFLICT (order_item_id, product_key, seller_id) DO UPDATE
    SET original_decision = CASE
          WHEN seller_order_item_decisions.override_by IS NULL
          THEN seller_order_item_decisions.decision
          ELSE seller_order_item_decisions.original_decision
        END,
        decision          = p_new_decision::public.seller_item_decision,
        decision_reason   = p_reason,
        decided_at        = now(),
        override_by       = v_admin_id,
        override_reason   = p_reason,
        overridden_at     = now(),
        updated_at        = now()
  RETURNING * INTO v_row;

  -- Write audit log with correct event type
  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role, metadata
  ) VALUES (
    v_order_id,
    v_event_type,
    v_admin_id,
    'admin',
    jsonb_build_object(
      'order_item_id',   p_order_item_id,
      'product_key',     p_product_key,
      'seller_id',       p_seller_id,
      'new_decision',    p_new_decision,
      'override_reason', p_reason
    )
  );

  RETURN v_row;
END;
$$;;
