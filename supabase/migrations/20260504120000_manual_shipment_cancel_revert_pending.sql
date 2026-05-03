-- Manual shipment cancel: allow order to return to pending (admin-only RPC).
-- Default new shipment lots to processing lifecycle.

ALTER TABLE public.order_shipments
  ALTER COLUMN carrier_shipment_status SET DEFAULT 'processing';

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

  -- Once an order leaves pending, returning to pending is blocked unless an
  -- approved workflow actor sets it (e.g. admin manual shipment cancel).
  IF OLD.status::text <> 'pending' AND NEW.status::text = 'pending' THEN
    IF current_setting('hatvoni.workflow_actor', true) = 'admin:manual_shipment_cancel' THEN
      RETURN NEW;
    END IF;
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
$$;

CREATE OR REPLACE FUNCTION public.admin_revert_order_pending_after_manual_shipment_cancel(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only admins can revert order status after manual shipment cancel';
  END IF;

  PERFORM set_config('hatvoni.workflow_actor', 'admin:manual_shipment_cancel', true);

  UPDATE public.orders
  SET
    status = 'pending'::public.order_status,
    order_status = 'placed',
    customer_status = 'placed',
    shipped_at = NULL,
    updated_at = now(),
    admin_updated_at = now()
  WHERE id = p_order_id;

  PERFORM set_config('hatvoni.workflow_actor', '', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revert_order_pending_after_manual_shipment_cancel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revert_order_pending_after_manual_shipment_cancel(uuid) TO authenticated;
