-- admin_finalize_order sets hatvoni.workflow_actor so guard allows status change

CREATE OR REPLACE FUNCTION public.admin_finalize_order(
  p_order_id uuid,
  p_action   text,
  p_reason   text DEFAULT NULL
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id        uuid;
  v_order           public.orders%ROWTYPE;
  v_readiness       RECORD;
  v_new_status      public.order_status;
  v_from_status     text;
  v_confirmed_items jsonb;
  v_rejected_items  jsonb;
BEGIN
  SELECT id INTO v_admin_id FROM public.profiles
  WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can finalize orders';
  END IF;

  IF p_action NOT IN ('accept', 'reject_full', 'proceed_partial') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be accept, reject_full, or proceed_partial', p_action;
  END IF;

  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_from_status := v_order.status::text;

  IF v_order.status::text NOT IN ('pending') THEN
    RAISE EXCEPTION 'Order % is in status %, cannot finalize. Only pending orders can be finalized.',
      p_order_id, v_order.status;
  END IF;

  SELECT * INTO v_readiness FROM public.get_order_item_readiness(p_order_id);

  IF NOT v_readiness.all_decided THEN
    RAISE EXCEPTION 'Cannot finalize order: % item(s) still pending review (seller: %, admin: %)',
      (v_readiness.seller_pending + v_readiness.admin_pending),
      v_readiness.seller_pending,
      v_readiness.admin_pending;
  END IF;

  IF p_action = 'accept' AND v_readiness.has_rejections THEN
    RAISE EXCEPTION 'Cannot accept order: % item(s) were rejected. Use proceed_partial or reject_full instead.',
      (v_readiness.seller_rejected + v_readiness.admin_rejected);
  END IF;

  IF p_action IN ('reject_full', 'proceed_partial') AND NOT v_readiness.has_rejections THEN
    RAISE EXCEPTION 'No rejections found. Use accept action when all items are approved.';
  END IF;

  IF p_action = 'proceed_partial' AND NOT v_readiness.has_approvals THEN
    RAISE EXCEPTION 'Cannot proceed partial: no approved items exist. Use reject_full instead.';
  END IF;

  v_new_status := CASE p_action
    WHEN 'accept'          THEN 'processing'::public.order_status
    WHEN 'reject_full'     THEN 'rejected'::public.order_status
    WHEN 'proceed_partial' THEN 'partially_approved'::public.order_status
  END;

  IF p_action IN ('proceed_partial', 'reject_full') THEN
    SELECT jsonb_agg(jsonb_build_object(
      'order_item_id', d.order_item_id,
      'product_key',   d.product_key,
      'seller_id',     d.seller_id,
      'reason',        d.decision_reason,
      'overridden',    (d.override_by IS NOT NULL)
    ))
    INTO v_rejected_items
    FROM public.seller_order_item_decisions d
    JOIN public.order_items oi ON oi.id = d.order_item_id
    WHERE oi.order_id = p_order_id AND d.decision = 'rejected';

    SELECT jsonb_agg(jsonb_build_object(
      'order_item_id', a.order_item_id,
      'product_key',   a.product_key,
      'reason',        a.decision_reason
    ))
    INTO v_rejected_items
    FROM public.order_item_approvals a
    JOIN public.order_items oi ON oi.id = a.order_item_id
    WHERE oi.order_id = p_order_id AND a.status = 'rejected';

    SELECT jsonb_agg(jsonb_build_object(
      'order_item_id', d.order_item_id,
      'product_key',   d.product_key
    ))
    INTO v_confirmed_items
    FROM public.seller_order_item_decisions d
    JOIN public.order_items oi ON oi.id = d.order_item_id
    WHERE oi.order_id = p_order_id AND d.decision = 'approved';
  END IF;

  PERFORM set_config('hatvoni.workflow_actor', 'admin:finalize_order', true);

  UPDATE public.orders
  SET
    status                = v_new_status,
    partial_fulfillment   = (p_action = 'proceed_partial'),
    confirmed_items       = CASE WHEN p_action = 'proceed_partial' THEN v_confirmed_items ELSE confirmed_items END,
    rejected_items        = CASE WHEN p_action IN ('proceed_partial', 'reject_full') THEN v_rejected_items ELSE rejected_items END,
    refund_status         = CASE
      WHEN p_action = 'reject_full'
        AND payment_method IN ('razorpay', 'razorpay_upi', 'razorpay_cards')
        AND payment_status = 'paid'
      THEN 'pending'
      ELSE refund_status
    END,
    admin_updated_at      = now(),
    updated_at            = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role,
    from_status, to_status, metadata
  ) VALUES (
    p_order_id,
    'order_' || p_action,
    v_admin_id,
    'admin',
    v_from_status,
    v_new_status::text,
    jsonb_build_object(
      'action',           p_action,
      'reason',           p_reason,
      'readiness',        row_to_json(v_readiness)
    )
  );

  RETURN v_order;
END;
$$;;
