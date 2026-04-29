-- Robust multi-lot order status aggregation
-- - Keep shipment lots as source of truth
-- - Derive order-level status from all lots
-- - Keep internal orders.status enum compatible

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_aggregate_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.hatvoni_shipment_lifecycle_bucket(p_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  s text := lower(trim(coalesce(p_status, '')));
BEGIN
  IF s = '' THEN
    RETURN 'pre_shipping';
  END IF;

  IF s = 'delivered' THEN
    RETURN 'delivered';
  END IF;

  IF s IN ('rto_delivered', 'cancelled', 'rejected', 'lost') THEN
    RETURN 'failed_final';
  END IF;

  IF s IN ('rto_initiated', 'rto_in_transit', 'rto_need_attention') THEN
    RETURN 'return_in_progress';
  END IF;

  IF s IN ('in_transit', 'out_for_delivery', 'reattempt_delivery', 'externally_fulfilled', 'rto_cancelled') THEN
    RETURN 'active_delivery';
  END IF;

  IF s IN ('need_attention', 'ndr_raised', 'not_picked') THEN
    RETURN 'exception_attention';
  END IF;

  IF s IN ('pending', 'processing', 'ready_for_pickup', 'pickup_scheduled') THEN
    RETURN 'pre_shipping';
  END IF;

  -- Unknown statuses are treated as attention-required so they never disappear silently.
  RETURN 'exception_attention';
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_order_fulfillment_aggregate(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order             public.orders%ROWTYPE;
  v_cnt               int;
  v_del               int;
  v_fail              int;
  v_returning         int;
  v_active            int;
  v_exception         int;
  v_pre               int;
  v_customer          text;
  v_ord_stat          text;
  v_new_status        public.order_status;
  v_old_status        public.order_status;
  v_shipment_roll     text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_cnt
  FROM public.order_shipments
  WHERE order_id = p_order_id;

  IF v_cnt = 0 THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'delivered'),
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'failed_final'),
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'return_in_progress'),
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'active_delivery'),
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'exception_attention'),
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'pre_shipping')
  INTO v_del, v_fail, v_returning, v_active, v_exception, v_pre
  FROM public.order_shipments
  WHERE order_id = p_order_id;

  IF v_exception > 0 THEN
    v_customer := 'attention_required';
    v_ord_stat := 'attention_required';
    v_new_status := 'shipped'::public.order_status;
  ELSIF v_del > 0 AND v_fail > 0 THEN
    v_customer := 'partially_failed';
    v_ord_stat := 'partially_failed';
    v_new_status := 'shipped'::public.order_status;
  ELSIF v_returning > 0 THEN
    v_customer := 'partially_returning';
    v_ord_stat := 'partially_returning';
    v_new_status := 'shipped'::public.order_status;
  ELSIF v_del > 0 AND v_del < v_cnt THEN
    v_customer := 'partially_delivered';
    v_ord_stat := 'partially_delivered';
    v_new_status := 'shipped'::public.order_status;
  ELSIF v_del = v_cnt THEN
    v_customer := 'delivered';
    v_ord_stat := 'delivered';
    v_new_status := 'delivered'::public.order_status;
  ELSIF v_fail = v_cnt THEN
    v_customer := 'failed';
    v_ord_stat := 'failed';
    v_new_status := 'cancelled'::public.order_status;
  ELSIF v_active = v_cnt OR (v_active > 0 AND v_pre > 0 AND v_del = 0 AND v_fail = 0 AND v_returning = 0) THEN
    v_customer := 'in_transit';
    v_ord_stat := 'in_transit';
    v_new_status := 'shipped'::public.order_status;
  ELSIF v_pre = v_cnt THEN
    v_customer := 'processing';
    v_ord_stat := 'processing';
    v_new_status := 'processing'::public.order_status;
  ELSE
    v_customer := 'in_transit';
    v_ord_stat := 'in_transit';
    v_new_status := 'shipped'::public.order_status;
  END IF;

  SELECT string_agg(carrier_shipment_status, ', ' ORDER BY lot_index)
  INTO v_shipment_roll
  FROM public.order_shipments
  WHERE order_id = p_order_id;

  v_old_status := v_order.status;
  PERFORM set_config('hatvoni.workflow_actor', 'system:fulfillment_aggregate', true);

  UPDATE public.orders
  SET
    customer_status = v_customer,
    order_status = coalesce(v_ord_stat, order_status),
    shipment_status = coalesce(nullif(trim(v_shipment_roll), ''), shipment_status),
    fulfillment_aggregate_meta = jsonb_build_object(
      'lot_count', v_cnt,
      'delivered_count', v_del,
      'failed_count', v_fail,
      'returning_count', v_returning,
      'active_count', v_active,
      'exception_count', v_exception,
      'pre_shipping_count', v_pre,
      'updated_at', now()
    ),
    status = CASE
      WHEN v_new_status IS NOT NULL AND v_new_status <> v_old_status THEN v_new_status
      ELSE status
    END,
    shipped_at = CASE
      WHEN v_new_status = 'shipped'::public.order_status AND shipped_at IS NULL THEN now()
      ELSE shipped_at
    END,
    processed_at = CASE
      WHEN v_new_status = 'delivered'::public.order_status AND processed_at IS NULL THEN now()
      ELSE processed_at
    END,
    updated_at = now()
  WHERE id = p_order_id;

  PERFORM set_config('hatvoni.workflow_actor', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_order_aggregate_on_lot_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.order_id IS NOT NULL THEN
      PERFORM public.recompute_order_fulfillment_aggregate(OLD.order_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_order_fulfillment_aggregate(NEW.order_id);
    RETURN NEW;
  END IF;

  IF (
    COALESCE(NEW.carrier_shipment_status, '') IS DISTINCT FROM COALESCE(OLD.carrier_shipment_status, '')
    OR COALESCE(NEW.tracking_number, '') IS DISTINCT FROM COALESCE(OLD.tracking_number, '')
    OR COALESCE(NEW.velocity_awb, '') IS DISTINCT FROM COALESCE(OLD.velocity_awb, '')
  ) THEN
    PERFORM public.recompute_order_fulfillment_aggregate(NEW.order_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_order_aggregate_on_lot_change ON public.order_shipments;
CREATE TRIGGER trg_recompute_order_aggregate_on_lot_change
AFTER INSERT OR UPDATE OR DELETE ON public.order_shipments
FOR EACH ROW
EXECUTE FUNCTION public.recompute_order_aggregate_on_lot_change();

COMMENT ON FUNCTION public.hatvoni_shipment_lifecycle_bucket(text) IS
  'Maps raw carrier shipment statuses to robust aggregation buckets for lot-based order derivation.';

COMMENT ON FUNCTION public.recompute_order_fulfillment_aggregate(uuid) IS
  'Derives orders.customer_status/order_status from all shipment lots with deterministic multi-lot precedence.';
