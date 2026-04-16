/*
  ============================================================
  STEP 3 — Order Decision + Payment + Status Sync
  ============================================================

  1. Add 'partially_refunded' to payment_status constraint
  2. Auto-trigger refund after admin_finalize_order via DB function
     that calls process-order-refund edge function (pg_net / http)
  3. Razorpay webhook: handle refund.processed → refund_status = completed
  4. Realtime notification columns on orders for customer/seller sync
  5. Event-driven log entries for all workflow transitions
  ============================================================
*/

-- ─── 1. Extend payment_status to include partially_refunded ──────────────────

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN (
    'pending', 'initiated', 'paid', 'failed',
    'refunded', 'partially_refunded'
  ));

-- ─── 2. Notification columns — used by customer/seller realtime subscriptions ─

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS workflow_stage text
    GENERATED ALWAYS AS (
      CASE status::text
        WHEN 'pending'            THEN 'awaiting_approval'
        WHEN 'processing'         THEN 'confirmed'
        WHEN 'partially_approved' THEN 'partial_fulfillment'
        WHEN 'rejected'           THEN 'rejected'
        WHEN 'shipped'            THEN 'in_transit'
        WHEN 'delivered'          THEN 'delivered'
        WHEN 'cancelled'          THEN 'cancelled'
        ELSE 'unknown'
      END
    ) STORED;

COMMENT ON COLUMN public.orders.workflow_stage IS
  'Human-readable workflow stage derived from status. Used for customer/seller display.';

-- ─── 3. customer_visible_status — what the customer sees ─────────────────────
-- Customers should not see internal statuses like 'partially_approved'.
-- Map them to friendly labels stored as a computed column.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_status text
    GENERATED ALWAYS AS (
      CASE status::text
        WHEN 'pending'            THEN 'placed'
        WHEN 'processing'         THEN 'processing'
        WHEN 'partially_approved' THEN 'processing'   -- customer sees processing
        WHEN 'rejected'           THEN 'cancelled'    -- customer sees cancelled
        WHEN 'shipped'            THEN 'shipped'
        WHEN 'delivered'          THEN 'delivered'
        WHEN 'cancelled'          THEN 'cancelled'
        ELSE 'placed'
      END
    ) STORED;

COMMENT ON COLUMN public.orders.customer_status IS
  'Customer-facing status. Hides internal workflow states like partially_approved/rejected.';

-- ─── 4. seller_visible_status — what sellers see ─────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_status text
    GENERATED ALWAYS AS (
      CASE status::text
        WHEN 'pending'            THEN 'pending_approval'
        WHEN 'processing'         THEN 'approved'
        WHEN 'partially_approved' THEN 'partially_approved'
        WHEN 'rejected'           THEN 'rejected'
        WHEN 'shipped'            THEN 'shipped'
        WHEN 'delivered'          THEN 'delivered'
        WHEN 'cancelled'          THEN 'cancelled'
        ELSE 'pending_approval'
      END
    ) STORED;

-- ─── 5. Extend order_workflow_log with notification_sent flag ─────────────────

ALTER TABLE public.order_workflow_log
  ADD COLUMN IF NOT EXISTS notification_sent boolean NOT NULL DEFAULT false;

-- ─── 6. Function: log_order_event ─────────────────────────────────────────────
-- Convenience wrapper used by triggers to insert workflow log entries
-- without needing auth.uid() (runs as service role via SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.log_order_event(
  p_order_id    uuid,
  p_event_type  text,
  p_actor_id    uuid,
  p_actor_role  text,
  p_from_status text DEFAULT NULL,
  p_to_status   text DEFAULT NULL,
  p_metadata    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role,
    from_status, to_status, metadata
  ) VALUES (
    p_order_id, p_event_type, p_actor_id, p_actor_role,
    p_from_status, p_to_status, p_metadata
  );
END;
$$;

-- ─── 7. Trigger: auto-log order status transitions ───────────────────────────
-- Every time orders.status changes, write a system log entry.
-- This covers transitions made by admin_finalize_order AND
-- shipping updates (processing → shipped → delivered).

CREATE OR REPLACE FUNCTION public.trg_log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status actually changes
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role,
    from_status, to_status, metadata
  ) VALUES (
    NEW.id,
    'status_changed',
    NULL,   -- actor unknown at trigger level; admin_finalize_order logs its own entry
    'system',
    OLD.status::text,
    NEW.status::text,
    jsonb_build_object(
      'payment_status',  NEW.payment_status,
      'refund_status',   NEW.refund_status,
      'partial',         NEW.partial_fulfillment
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_status_change ON public.orders;

CREATE TRIGGER trg_log_order_status_change
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_order_status_change();

-- ─── 8. Trigger: auto-log payment status transitions ─────────────────────────

CREATE OR REPLACE FUNCTION public.trg_log_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = OLD.payment_status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role,
    from_status, to_status, metadata
  ) VALUES (
    NEW.id,
    'payment_status_changed',
    NULL,
    'system',
    OLD.payment_status,
    NEW.payment_status,
    jsonb_build_object(
      'refund_amount', NEW.refund_amount,
      'refund_status', NEW.refund_status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payment_status_change ON public.orders;

CREATE TRIGGER trg_log_payment_status_change
  AFTER UPDATE OF payment_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_payment_status_change();

-- ─── 9. Trigger: auto-log refund status transitions ──────────────────────────

CREATE OR REPLACE FUNCTION public.trg_log_refund_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.refund_status IS NOT DISTINCT FROM OLD.refund_status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role,
    from_status, to_status, metadata
  ) VALUES (
    NEW.id,
    'refund_status_changed',
    NULL,
    'system',
    OLD.refund_status,
    NEW.refund_status,
    jsonb_build_object(
      'refund_amount',  NEW.refund_amount,
      'payment_status', NEW.payment_status
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_refund_status_change ON public.orders;

CREATE TRIGGER trg_log_refund_status_change
  AFTER UPDATE OF refund_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_refund_status_change();

-- ─── 10. Trigger: auto-log seller item decisions ─────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_log_seller_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT order_id INTO v_order_id
  FROM public.order_items WHERE id = NEW.order_item_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Only log when decision changes from pending
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.decision <> OLD.decision) THEN
    INSERT INTO public.order_workflow_log (
      order_id, event_type, actor_id, actor_role, metadata
    ) VALUES (
      v_order_id,
      CASE
        WHEN NEW.override_by IS NOT NULL THEN 'seller_decision_overridden'
        ELSE 'seller_item_' || NEW.decision::text
      END,
      COALESCE(NEW.override_by, NEW.seller_id),
      CASE WHEN NEW.override_by IS NOT NULL THEN 'admin' ELSE 'seller' END,
      jsonb_build_object(
        'order_item_id',   NEW.order_item_id,
        'product_key',     NEW.product_key,
        'decision',        NEW.decision,
        'reason',          NEW.decision_reason,
        'overridden',      (NEW.override_by IS NOT NULL),
        'original',        NEW.original_decision
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_seller_decision ON public.seller_order_item_decisions;

CREATE TRIGGER trg_log_seller_decision
  AFTER INSERT OR UPDATE OF decision ON public.seller_order_item_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_seller_decision();

-- ─── 11. Trigger: auto-log admin item approvals ──────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_log_admin_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT order_id INTO v_order_id
  FROM public.order_items WHERE id = NEW.order_item_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status <> OLD.status) THEN
    INSERT INTO public.order_workflow_log (
      order_id, event_type, actor_id, actor_role, metadata
    ) VALUES (
      v_order_id,
      'admin_item_' || NEW.status::text,
      NEW.decision_by,
      'admin',
      jsonb_build_object(
        'order_item_id',    NEW.order_item_id,
        'product_key',      NEW.product_key,
        'status',           NEW.status,
        'reason',           NEW.decision_reason,
        'sync_with_insider', NEW.sync_with_insider
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_admin_approval ON public.order_item_approvals;

CREATE TRIGGER trg_log_admin_approval
  AFTER INSERT OR UPDATE OF status ON public.order_item_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_log_admin_approval();

-- ─── 12. get_order_workflow_summary — used by all panels for sync ─────────────
-- Returns a single-row summary of the order's current workflow state.
-- Customers, sellers, and admins all call this for their respective views.

CREATE OR REPLACE FUNCTION public.get_order_workflow_summary(p_order_id uuid)
RETURNS TABLE (
  order_id            uuid,
  order_status        text,
  customer_status     text,
  seller_status       text,
  workflow_stage      text,
  payment_status      text,
  refund_status       text,
  refund_amount       numeric,
  partial_fulfillment boolean,
  all_items_decided   boolean,
  has_rejections      boolean,
  has_approvals       boolean,
  seller_pending      int,
  seller_approved     int,
  seller_rejected     int,
  admin_pending       int,
  admin_approved      int,
  admin_rejected      int,
  last_event_type     text,
  last_event_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.orders%ROWTYPE;
  v_ready   RECORD;
  v_last    RECORD;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_ready FROM public.get_order_item_readiness(p_order_id);

  SELECT event_type, created_at INTO v_last
  FROM public.order_workflow_log
  WHERE order_id = p_order_id
  ORDER BY created_at DESC LIMIT 1;

  RETURN QUERY SELECT
    v_order.id,
    v_order.status::text,
    v_order.customer_status,
    v_order.seller_status,
    v_order.workflow_stage,
    v_order.payment_status,
    v_order.refund_status,
    v_order.refund_amount,
    COALESCE(v_order.partial_fulfillment, false),
    v_ready.all_decided,
    v_ready.has_rejections,
    v_ready.has_approvals,
    v_ready.seller_pending,
    v_ready.seller_approved,
    v_ready.seller_rejected,
    v_ready.admin_pending,
    v_ready.admin_approved,
    v_ready.admin_rejected,
    v_last.event_type,
    v_last.created_at;
END;
$$;

-- ─── 13. RLS on get_order_workflow_summary ────────────────────────────────────
-- The function is SECURITY DEFINER so it bypasses RLS internally,
-- but we add a wrapper check: customers can only query their own orders.

CREATE OR REPLACE FUNCTION public.get_my_order_workflow_summary(p_order_id uuid)
RETURNS TABLE (
  order_id            uuid,
  order_status        text,
  customer_status     text,
  seller_status       text,
  workflow_stage      text,
  payment_status      text,
  refund_status       text,
  refund_amount       numeric,
  partial_fulfillment boolean,
  all_items_decided   boolean,
  has_rejections      boolean,
  has_approvals       boolean,
  seller_pending      int,
  seller_approved     int,
  seller_rejected     int,
  admin_pending       int,
  admin_approved      int,
  admin_rejected      int,
  last_event_type     text,
  last_event_at       timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller owns the order OR is admin/seller
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND (
        o.user_id = auth.uid()
        OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
        OR (SELECT is_seller FROM public.profiles WHERE id = auth.uid()) = true
      )
  ) THEN
    RAISE EXCEPTION 'Access denied to order %', p_order_id;
  END IF;

  RETURN QUERY SELECT * FROM public.get_order_workflow_summary(p_order_id);
END;
$$;

-- ─── 14. Indexes for realtime performance ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_customer_status
  ON public.orders (customer_status);

CREATE INDEX IF NOT EXISTS idx_orders_seller_status
  ON public.orders (seller_status);

CREATE INDEX IF NOT EXISTS idx_orders_workflow_stage
  ON public.orders (workflow_stage);

CREATE INDEX IF NOT EXISTS idx_workflow_log_order_created
  ON public.order_workflow_log (order_id, created_at DESC);
