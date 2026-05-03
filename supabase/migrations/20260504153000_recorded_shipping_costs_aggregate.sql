-- Sum per-lot recorded shipping (Velocity AWB charges + manual shipping cost) into orders.fulfillment_aggregate_meta
-- for reporting. Recompute when velocity_fulfillment changes.

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
  v_recorded_total    numeric;
  v_recorded_break    jsonb;
  v_vf                jsonb;
  v_fallback          numeric;
  v_one_lot_idx       int;
  v_one_lot_label     text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_cnt
  FROM public.order_shipments
  WHERE order_id = p_order_id;

  IF v_cnt = 0 THEN
    v_vf := v_order.velocity_fulfillment;
    v_recorded_total := COALESCE(
      NULLIF(trim(v_vf->>'velocity_shipping_total'), '')::numeric,
      0
    );
    IF v_recorded_total > 0 THEN
      v_recorded_break := jsonb_build_array(
        jsonb_build_object(
          'lot_index', NULL,
          'label', 'Single shipment',
          'source', 'velocity',
          'amount', v_recorded_total
        )
      );
    ELSE
      v_recorded_break := '[]'::jsonb;
    END IF;

    UPDATE public.orders
    SET
      fulfillment_aggregate_meta = coalesce(fulfillment_aggregate_meta, '{}'::jsonb) || jsonb_build_object(
        'recorded_shipping_total', v_recorded_total,
        'recorded_shipping_by_lot', v_recorded_break,
        'recorded_shipping_updated_at', now()
      ),
      updated_at = now()
    WHERE id = p_order_id;

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

  SELECT COALESCE(SUM(
    COALESCE(
      NULLIF(trim(os.velocity_fulfillment->>'velocity_shipping_total'), '')::numeric,
      NULLIF(trim(os.velocity_fulfillment->>'manual_shipping_cost'), '')::numeric,
      0::numeric
    )
  ), 0)
  INTO v_recorded_total
  FROM public.order_shipments os
  WHERE os.order_id = p_order_id;

  SELECT COALESCE(jsonb_agg(sub.row_json ORDER BY sub.lot_idx), '[]'::jsonb)
  INTO v_recorded_break
  FROM (
    SELECT
      os.lot_index AS lot_idx,
      jsonb_build_object(
        'lot_index', os.lot_index,
        'label', os.label,
        'source', CASE
          WHEN NULLIF(trim(os.velocity_fulfillment->>'velocity_shipping_total'), '') IS NOT NULL THEN 'velocity'
          WHEN NULLIF(trim(os.velocity_fulfillment->>'manual_shipping_cost'), '') IS NOT NULL THEN 'manual'
          ELSE 'none'
        END,
        'amount', COALESCE(
          NULLIF(trim(os.velocity_fulfillment->>'velocity_shipping_total'), '')::numeric,
          NULLIF(trim(os.velocity_fulfillment->>'manual_shipping_cost'), '')::numeric
        )
      ) AS row_json
    FROM public.order_shipments os
    WHERE os.order_id = p_order_id
  ) sub;

  -- Single-lot orders sometimes store AWB charges only on orders.velocity_fulfillment (legacy assign path).
  IF v_cnt = 1 AND coalesce(v_recorded_total, 0) = 0 THEN
    v_vf := v_order.velocity_fulfillment;
    v_fallback := COALESCE(NULLIF(trim(v_vf->>'velocity_shipping_total'), '')::numeric, 0);
    IF v_fallback > 0 THEN
      v_recorded_total := v_fallback;
      SELECT os.lot_index, os.label INTO v_one_lot_idx, v_one_lot_label
      FROM public.order_shipments os
      WHERE os.order_id = p_order_id
      LIMIT 1;
      v_recorded_break := jsonb_build_array(
        jsonb_build_object(
          'lot_index', v_one_lot_idx,
          'label', v_one_lot_label,
          'source', 'velocity',
          'amount', v_fallback
        )
      );
    END IF;
  END IF;

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
      'recorded_shipping_total', v_recorded_total,
      'recorded_shipping_by_lot', v_recorded_break,
      'recorded_shipping_updated_at', now(),
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
    OR NEW.velocity_fulfillment IS DISTINCT FROM OLD.velocity_fulfillment
  ) THEN
    PERFORM public.recompute_order_fulfillment_aggregate(NEW.order_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.recompute_order_fulfillment_aggregate(uuid) IS
  'Derives customer/order status from shipment lots and rolls up recorded per-lot shipping costs (Velocity + manual) into fulfillment_aggregate_meta.';
