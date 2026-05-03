-- Derive order status from shipment lots for BOTH single and multi fulfillment modes.
-- Webhook and shipment actions should update order_shipments, then call this aggregate.

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
  v_pend              int;
  v_trans             int;
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

  SELECT count(*)::int INTO v_cnt FROM public.order_shipments WHERE order_id = p_order_id;
  IF v_cnt = 0 THEN
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'delivered'),
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'failed'),
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'pending_ship'),
    count(*) FILTER (WHERE public.hatvoni_shipment_lifecycle_bucket(carrier_shipment_status) = 'in_transit')
  INTO v_del, v_fail, v_pend, v_trans
  FROM public.order_shipments
  WHERE order_id = p_order_id;

  IF v_fail > 0 AND v_del + v_trans + v_pend = 0 THEN
    v_customer := 'cancelled';
    v_ord_stat := 'cancelled';
    v_new_status := 'cancelled'::public.order_status;
  ELSIF v_del = v_cnt THEN
    v_customer := 'delivered';
    v_ord_stat := 'delivered';
    v_new_status := 'delivered'::public.order_status;
  ELSIF v_del > 0 AND (v_trans > 0 OR v_pend > 0) THEN
    v_customer := 'partially_delivered';
    v_ord_stat := 'partially_delivered';
    v_new_status := v_order.status;
  ELSIF v_pend > 0 AND (v_trans > 0 OR v_del > 0) THEN
    v_customer := 'partially_shipped';
    v_ord_stat := 'partially_shipped';
    v_new_status := 'shipped'::public.order_status;
  ELSIF v_trans > 0 AND v_pend = 0 AND v_del = 0 THEN
    v_customer := 'shipped';
    v_ord_stat := 'shipped';
    v_new_status := 'shipped'::public.order_status;
  ELSIF v_pend = v_cnt THEN
    v_customer := 'processing';
    v_ord_stat := 'processing';
    v_new_status := v_order.status;
  ELSE
    v_customer := 'shipped';
    v_ord_stat := 'shipped';
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
    customer_status   = v_customer,
    order_status      = coalesce(v_ord_stat, order_status),
    shipment_status   = coalesce(nullif(trim(v_shipment_roll), ''), shipment_status),
    status            = CASE
      WHEN v_new_status IS NOT NULL AND v_new_status <> v_old_status THEN v_new_status
      ELSE status
    END,
    shipped_at        = CASE
      WHEN v_new_status = 'shipped'::public.order_status AND shipped_at IS NULL THEN now()
      ELSE shipped_at
    END,
    processed_at      = CASE
      WHEN v_new_status = 'delivered'::public.order_status AND processed_at IS NULL THEN now()
      ELSE processed_at
    END,
    updated_at        = now()
  WHERE id = p_order_id;

  PERFORM set_config('hatvoni.workflow_actor', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_order_fulfillment_aggregate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_order_fulfillment_aggregate(uuid) TO service_role;
COMMENT ON FUNCTION public.recompute_order_fulfillment_aggregate IS
  'Derives orders.customer_status / status from all order_shipments for both single and multi fulfillment modes.';
