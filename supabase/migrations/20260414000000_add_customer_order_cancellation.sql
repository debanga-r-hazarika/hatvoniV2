/*
  # Add customer order cancellation flow

  1. New function
    - `cancel_customer_order(p_order_id uuid, p_reason text)`
    - Lets an authenticated customer cancel their own order while it is still in a cancellable state
    - Stores the selected cancellation reason and marks both `status` and `insider_order_status` as `cancelled`

  2. Rules
    - The caller must own the order
    - Cancellation is only allowed while the effective status is `pending`, `placed`, or `processing`
    - Delivered, shipped, processed, and already cancelled orders are rejected
*/

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
CREATE OR REPLACE FUNCTION public.cancel_customer_order(p_order_id uuid, p_reason text)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_effective_status text;
  v_reason text;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  v_reason := NULLIF(BTRIM(COALESCE(p_reason, '')), '');

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  IF v_reason NOT IN (
    'Change in plans',
    'Ordered by mistake',
    'Delivery timeline no longer works for me',
    'I found an alternative option',
    'Payment or checkout issue',
    'Other personal reason'
  ) THEN
    RAISE EXCEPTION 'Invalid cancellation reason';
  END IF;

  v_effective_status := LOWER(COALESCE(v_order.insider_order_status, v_order.status::text, 'pending'));

  IF v_effective_status NOT IN ('pending', 'placed', 'processing') THEN
    RAISE EXCEPTION 'Order can only be cancelled before it moves past processing';
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      insider_order_status = 'cancelled',
      cancellation_reason = v_reason,
      insider_notes = 'Customer cancelled order. Reason: ' || v_reason,
      updated_at = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;
