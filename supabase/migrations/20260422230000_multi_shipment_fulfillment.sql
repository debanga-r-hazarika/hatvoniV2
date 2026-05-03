/*
  Multi-warehouse fulfillment: shipment lots + tracking events + aggregated order-facing status.

  - Webhooks update order_shipments (and append order_shipment_tracking_events), not orders.status directly.
  - recompute_order_fulfillment_aggregate() derives customer_status / order_status / orders.status from all lots.
*/

-- ─── 1. orders: fulfillment mode ────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_mode text;
COMMENT ON COLUMN public.orders.fulfillment_mode IS
  'legacy_single: one Velocity forward order tied to orders row; multi_shipment: use order_shipments lots.';
DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_fulfillment_mode_check
    CHECK (fulfillment_mode IS NULL OR fulfillment_mode IN ('legacy_single', 'multi_shipment'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- ─── 2. Shipment lots (one row per Velocity forward-order / warehouse lot) ───

CREATE TABLE IF NOT EXISTS public.order_shipments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  warehouse_id          uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  lot_index             int NOT NULL DEFAULT 1,
  label                 text NOT NULL DEFAULT 'Shipment 1',
  velocity_external_code text NOT NULL,
  velocity_shipment_id   text,
  velocity_pending_shipment_id text,
  carrier_shipment_status text,
  tracking_number        text,
  velocity_awb           text,
  velocity_tracking_url  text,
  velocity_carrier_name  text,
  velocity_label_url     text,
  velocity_tracking_snapshot jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_shipments_order_lot_unique UNIQUE (order_id, lot_index),
  CONSTRAINT order_shipments_velocity_code_unique UNIQUE (velocity_external_code)
);
CREATE INDEX IF NOT EXISTS idx_order_shipments_order_id ON public.order_shipments (order_id);
-- ─── 3. Granular tracking events (webhook-driven) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_shipment_tracking_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_shipment_id    uuid NOT NULL REFERENCES public.order_shipments(id) ON DELETE CASCADE,
  source               text NOT NULL DEFAULT 'webhook',
  activity             text,
  location             text,
  carrier_remark       text,
  raw_payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_time           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_os_te_shipment_time
  ON public.order_shipment_tracking_events (order_shipment_id, event_time DESC NULLS LAST);
-- ─── 4. Link line items to a lot (optional until admin prepares multi lots) ────

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS order_shipment_id uuid REFERENCES public.order_shipments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_order_shipment_id
  ON public.order_items (order_shipment_id)
  WHERE order_shipment_id IS NOT NULL;
-- ─── 5. Hatvoni order code (matches Edge baseVelocityOrderCode) ─────────────────

CREATE OR REPLACE FUNCTION public.hatvoni_velocity_order_code(p_order_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 'HAT-' || upper(substring(replace(p_order_id::text, '-', ''), 1, 10));
$$;
CREATE OR REPLACE FUNCTION public.hatvoni_velocity_shipment_code(p_order_id uuid, p_lot_index int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public.hatvoni_velocity_order_code(p_order_id) || '-L' || p_lot_index::text;
$$;
CREATE OR REPLACE FUNCTION public.resolve_order_from_velocity_external_id(p_ext text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT o.id
  FROM public.orders o
  WHERE o.id::text = trim(p_ext)
     OR public.hatvoni_velocity_order_code(o.id) = trim(p_ext)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_order_from_velocity_external_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_order_from_velocity_external_id(text) TO service_role;
-- ─── 6. Normalize carrier status → lifecycle bucket ────────────────────────────

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
    RETURN 'pending_ship';
  END IF;
  IF s = 'delivered' THEN
    RETURN 'delivered';
  END IF;
  IF s IN ('cancelled', 'rejected', 'lost') THEN
    RETURN 'failed';
  END IF;
  IF s IN (
    'pending', 'processing', 'ready_for_pickup', 'pickup_scheduled', 'not_picked'
  ) THEN
    RETURN 'pending_ship';
  END IF;
  IF s IN (
    'in_transit', 'out_for_delivery', 'reattempt_delivery', 'externally_fulfilled',
    'need_attention', 'ndr_raised', 'rto_initiated', 'rto_in_transit', 'rto_need_attention', 'rto_cancelled'
  ) THEN
    RETURN 'in_transit';
  END IF;
  IF s IN ('rto_delivered') THEN
    RETURN 'failed';
  END IF;
  RETURN 'in_transit';
END;
$$;
-- ─── 7. Aggregate fulfillment state → order columns ─────────────────────────────

CREATE OR REPLACE FUNCTION public.recompute_order_fulfillment_aggregate(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order             public.orders%ROWTYPE;
  v_mode              text;
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

  v_mode := v_order.fulfillment_mode;

  SELECT count(*)::int INTO v_cnt FROM public.order_shipments WHERE order_id = p_order_id;
  IF v_cnt = 0 OR coalesce(v_mode, 'legacy_single') <> 'multi_shipment' THEN
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

  -- Derive customer-facing strings (prefer granular partial states)
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
  'Derives orders.customer_status / status from all order_shipments. Invoked after shipment-level webhook writes.';
-- ─── 8. Admin: create lots from default product warehouses ─────────────────────

CREATE OR REPLACE FUNCTION public.admin_prepare_multi_shipment_lots(p_order_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_order public.orders%ROWTYPE;
  v_wh    uuid;
  rec     RECORD;
  v_idx   int := 0;
  v_n     int := 0;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can prepare shipment lots';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status::text <> 'processing' THEN
    RAISE EXCEPTION 'Order must be in processing to split shipments';
  END IF;

  IF EXISTS (SELECT 1 FROM public.order_shipments WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Shipment lots already exist for this order';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.order_shipment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Order items already linked to shipment rows';
  END IF;

  -- Build distinct warehouses from line items (default warehouse per product / lot source product)
  FOR rec IN
    WITH lines AS (
      SELECT oi.id AS order_item_id,
        coalesce(
          pw_direct.warehouse_id,
          pw_lot.warehouse_id
        ) AS warehouse_id
      FROM public.order_items oi
      LEFT JOIN public.product_warehouses pw_direct
        ON pw_direct.product_id = oi.product_id AND pw_direct.is_default = true
      LEFT JOIN public.lots l ON l.id = oi.lot_id
      LEFT JOIN public.product_warehouses pw_lot
        ON pw_lot.product_id = l.source_product_id AND pw_lot.is_default = true
      WHERE oi.order_id = p_order_id
    )
    SELECT DISTINCT warehouse_id AS wid FROM lines WHERE warehouse_id IS NOT NULL ORDER BY wid
  LOOP
    v_wh := rec.wid;
    v_idx := v_idx + 1;
    INSERT INTO public.order_shipments (
      order_id, warehouse_id, lot_index, label, velocity_external_code
    ) VALUES (
      p_order_id,
      v_wh,
      v_idx,
      'Shipment ' || v_idx,
      public.hatvoni_velocity_shipment_code(p_order_id, v_idx)
    );

    UPDATE public.order_items oi
    SET order_shipment_id = (
      SELECT s.id FROM public.order_shipments s
      WHERE s.order_id = p_order_id AND s.lot_index = v_idx
      LIMIT 1
    )
    WHERE oi.order_id = p_order_id
      AND coalesce(
        (SELECT pw.warehouse_id FROM public.product_warehouses pw
         WHERE pw.product_id = oi.product_id AND pw.is_default = true LIMIT 1),
        (SELECT pw2.warehouse_id FROM public.lots l
         JOIN public.product_warehouses pw2 ON pw2.product_id = l.source_product_id AND pw2.is_default = true
         WHERE l.id = oi.lot_id LIMIT 1)
      ) = v_wh;

    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'No warehouse assignments found for order items — set default warehouses on products first';
  END IF;

  UPDATE public.orders
  SET fulfillment_mode = 'multi_shipment', updated_at = now(), admin_updated_at = now()
  WHERE id = p_order_id;

  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_prepare_multi_shipment_lots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_prepare_multi_shipment_lots(uuid) TO authenticated;
-- ─── 9. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.order_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_shipment_tracking_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage order_shipments" ON public.order_shipments;
CREATE POLICY "Admins manage order_shipments"
  ON public.order_shipments FOR ALL TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);
DROP POLICY IF EXISTS "Customers view own order_shipments" ON public.order_shipments;
CREATE POLICY "Customers view own order_shipments"
  ON public.order_shipments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_shipments.order_id AND o.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Employees logistics view order_shipments" ON public.order_shipments;
CREATE POLICY "Employees logistics view order_shipments"
  ON public.order_shipments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.employee_modules em ON em.employee_id = e.id
      WHERE e.profile_id = auth.uid()
        AND e.is_active = true
        AND em.module IN ('logistics', 'orders')
    )
  );
DROP POLICY IF EXISTS "Admins manage tracking events" ON public.order_shipment_tracking_events;
CREATE POLICY "Admins manage tracking events"
  ON public.order_shipment_tracking_events FOR ALL TO authenticated
  USING (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);
DROP POLICY IF EXISTS "Customers view own tracking events" ON public.order_shipment_tracking_events;
CREATE POLICY "Customers view own tracking events"
  ON public.order_shipment_tracking_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.order_shipments s
      JOIN public.orders o ON o.id = s.order_id
      WHERE s.id = order_shipment_tracking_events.order_shipment_id
        AND o.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Employees logistics view tracking events" ON public.order_shipment_tracking_events;
CREATE POLICY "Employees logistics view tracking events"
  ON public.order_shipment_tracking_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      JOIN public.employee_modules em ON em.employee_id = e.id
      WHERE e.profile_id = auth.uid()
        AND e.is_active = true
        AND em.module IN ('logistics', 'orders')
    )
  );
