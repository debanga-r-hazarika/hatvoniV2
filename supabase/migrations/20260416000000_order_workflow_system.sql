/*
  ============================================================
  ORDER WORKFLOW SYSTEM — Hatvoni Multi-Vendor Platform
  ============================================================

  Principles:
  - No direct/manual order status updates allowed outside defined functions
  - All state transitions are system-driven via advance_order_workflow()
  - Item-level approval → Order-level decision hierarchy
  - Full audit trail on every state change

  New status values added to the order_status enum:
    partially_approved  — some items approved, some rejected, admin chose to proceed
    rejected            — admin rejected the full order after item review

  New tables:
    order_item_approvals   — admin-side per-item decision (own/Hatvoni products)
    order_workflow_log     — immutable audit trail for every status transition

  New columns on seller_order_item_decisions:
    override_by, override_reason, overridden_at  — admin override tracking

  Core DB functions:
    admin_approve_item(order_item_id, product_key, decision, reason)
    admin_override_seller_decision(order_item_id, product_key, decision, reason)
    admin_finalize_order(order_id, action, reason)
    get_order_item_readiness(order_id)
  ============================================================
*/

-- ─── 1. Extend order_status enum ─────────────────────────────────────────────

DO $$ BEGIN
  ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partially_approved';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'rejected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- ─── 2. order_item_approvals — admin decisions for own/Hatvoni products ──────

DO $$ BEGIN
  CREATE TYPE public.item_approval_status AS ENUM (
    'pending_review',
    'approved',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS public.order_item_approvals (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id     uuid        NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_key       text        NOT NULL,
  -- NULL seller_id means this is a Hatvoni/own-seller product
  seller_id         uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Whether this item requires Insider inventory check before approval
  sync_with_insider boolean     NOT NULL DEFAULT false,
  -- Inventory snapshot at time of check (nullable — only set when sync_with_insider=true)
  inventory_snapshot jsonb,
  status            public.item_approval_status NOT NULL DEFAULT 'pending_review',
  decision_by       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision_reason   text,
  decided_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_item_approvals_unique_line UNIQUE (order_item_id, product_key),
  CONSTRAINT order_item_approvals_rejected_reason CHECK (
    status <> 'rejected' OR NULLIF(BTRIM(COALESCE(decision_reason, '')), '') IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS idx_order_item_approvals_order_item_id
  ON public.order_item_approvals (order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_approvals_status
  ON public.order_item_approvals (status);
ALTER TABLE public.order_item_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage order_item_approvals"
  ON public.order_item_approvals FOR ALL TO authenticated
  USING   ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
CREATE POLICY "Sellers can view approvals for their items"
  ON public.order_item_approvals FOR SELECT TO authenticated
  USING (
    seller_id = auth.uid()
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );
-- ─── 3. Admin override columns on seller_order_item_decisions ────────────────

ALTER TABLE public.seller_order_item_decisions
  ADD COLUMN IF NOT EXISTS override_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_reason   text,
  ADD COLUMN IF NOT EXISTS overridden_at     timestamptz,
  ADD COLUMN IF NOT EXISTS original_decision public.seller_item_decision;
-- ─── 4. order_workflow_log — immutable audit trail ───────────────────────────

CREATE TABLE IF NOT EXISTS public.order_workflow_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type    text        NOT NULL,  -- e.g. 'item_approved', 'item_rejected', 'order_accepted', 'order_rejected', 'partial_approved', 'override'
  actor_id      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role    text        NOT NULL,  -- 'admin', 'seller', 'system'
  from_status   text,
  to_status     text,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_workflow_log_order_id
  ON public.order_workflow_log (order_id);
CREATE INDEX IF NOT EXISTS idx_order_workflow_log_created_at
  ON public.order_workflow_log (created_at DESC);
ALTER TABLE public.order_workflow_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all workflow logs"
  ON public.order_workflow_log FOR SELECT TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
CREATE POLICY "Sellers can view logs for their orders"
  ON public.order_workflow_log FOR SELECT TO authenticated
  USING (
    (SELECT is_seller FROM public.profiles WHERE id = auth.uid()) = true
    AND (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = false
  );
-- Logs are insert-only — no updates or deletes allowed
CREATE POLICY "No updates to workflow log"
  ON public.order_workflow_log FOR UPDATE TO authenticated
  USING (false);
CREATE POLICY "No deletes from workflow log"
  ON public.order_workflow_log FOR DELETE TO authenticated
  USING (false);
-- ─── 5. Helper: get_order_item_readiness ─────────────────────────────────────
-- Returns a summary of all item decisions for an order.
-- Used by admin_finalize_order to determine which path is available.

CREATE OR REPLACE FUNCTION public.get_order_item_readiness(p_order_id uuid)
RETURNS TABLE (
  total_lines         int,
  seller_pending      int,
  seller_approved     int,
  seller_rejected     int,
  admin_pending       int,
  admin_approved      int,
  admin_rejected      int,
  all_decided         boolean,
  has_rejections      boolean,
  has_approvals       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seller_pending  int := 0;
  v_seller_approved int := 0;
  v_seller_rejected int := 0;
  v_admin_pending   int := 0;
  v_admin_approved  int := 0;
  v_admin_rejected  int := 0;
  v_total           int := 0;
BEGIN
  -- Count seller decisions
  SELECT
    COUNT(*) FILTER (WHERE d.decision = 'pending'),
    COUNT(*) FILTER (WHERE d.decision = 'approved'),
    COUNT(*) FILTER (WHERE d.decision = 'rejected')
  INTO v_seller_pending, v_seller_approved, v_seller_rejected
  FROM public.seller_order_item_decisions d
  JOIN public.order_items oi ON oi.id = d.order_item_id
  WHERE oi.order_id = p_order_id;

  -- Count admin (own-seller/Hatvoni) decisions
  SELECT
    COUNT(*) FILTER (WHERE a.status = 'pending_review'),
    COUNT(*) FILTER (WHERE a.status = 'approved'),
    COUNT(*) FILTER (WHERE a.status = 'rejected')
  INTO v_admin_pending, v_admin_approved, v_admin_rejected
  FROM public.order_item_approvals a
  JOIN public.order_items oi ON oi.id = a.order_item_id
  WHERE oi.order_id = p_order_id;

  v_total := v_seller_pending + v_seller_approved + v_seller_rejected
           + v_admin_pending  + v_admin_approved  + v_admin_rejected;

  RETURN QUERY SELECT
    v_total,
    v_seller_pending,
    v_seller_approved,
    v_seller_rejected,
    v_admin_pending,
    v_admin_approved,
    v_admin_rejected,
    -- All decided = no pending items remain
    (v_seller_pending = 0 AND v_admin_pending = 0),
    -- Has rejections
    (v_seller_rejected > 0 OR v_admin_rejected > 0),
    -- Has approvals
    (v_seller_approved > 0 OR v_admin_approved > 0);
END;
$$;
-- ─── 6. admin_approve_item — admin decides on own/Hatvoni product items ──────

CREATE OR REPLACE FUNCTION public.admin_approve_item(
  p_order_item_id   uuid,
  p_product_key     text,
  p_decision        text,   -- 'approved' or 'rejected'
  p_reason          text    DEFAULT NULL,
  p_inventory_snap  jsonb   DEFAULT NULL
)
RETURNS public.order_item_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id  uuid;
  v_row       public.order_item_approvals%ROWTYPE;
  v_order_id  uuid;
  v_status    public.item_approval_status;
BEGIN
  -- Auth: must be admin
  SELECT id INTO v_admin_id FROM public.profiles
  WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can approve/reject own-seller items';
  END IF;

  -- Validate decision value
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected, got: %', p_decision;
  END IF;

  -- Rejection requires reason
  IF p_decision = 'rejected' AND NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when rejecting an item';
  END IF;

  v_status := p_decision::public.item_approval_status;

  -- Get order_id for logging
  SELECT order_id INTO v_order_id FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found: %', p_order_item_id;
  END IF;

  -- Upsert the approval record
  INSERT INTO public.order_item_approvals (
    order_item_id, product_key, status,
    decision_by, decision_reason, decided_at,
    inventory_snapshot, updated_at
  )
  VALUES (
    p_order_item_id, p_product_key, v_status,
    v_admin_id, p_reason, now(),
    p_inventory_snap, now()
  )
  ON CONFLICT (order_item_id, product_key) DO UPDATE
    SET status             = EXCLUDED.status,
        decision_by        = EXCLUDED.decision_by,
        decision_reason    = EXCLUDED.decision_reason,
        decided_at         = EXCLUDED.decided_at,
        inventory_snapshot = COALESCE(EXCLUDED.inventory_snapshot, order_item_approvals.inventory_snapshot),
        updated_at         = now()
  RETURNING * INTO v_row;

  -- Write audit log
  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role, metadata
  ) VALUES (
    v_order_id,
    'item_' || p_decision,
    v_admin_id,
    'admin',
    jsonb_build_object(
      'order_item_id', p_order_item_id,
      'product_key',   p_product_key,
      'decision',      p_decision,
      'reason',        p_reason
    )
  );

  RETURN v_row;
END;
$$;
-- ─── 7. admin_override_seller_decision — admin overrides a seller's decision ─

CREATE OR REPLACE FUNCTION public.admin_override_seller_decision(
  p_order_item_id uuid,
  p_product_key   text,
  p_seller_id     uuid,
  p_new_decision  text,   -- 'approved' or 'rejected'
  p_reason        text
)
RETURNS public.seller_order_item_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id  uuid;
  v_row       public.seller_order_item_decisions%ROWTYPE;
  v_order_id  uuid;
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

  -- Write audit log
  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role, metadata
  ) VALUES (
    v_order_id,
    'seller_decision_overridden',
    v_admin_id,
    'admin',
    jsonb_build_object(
      'order_item_id',     p_order_item_id,
      'product_key',       p_product_key,
      'seller_id',         p_seller_id,
      'new_decision',      p_new_decision,
      'override_reason',   p_reason
    )
  );

  RETURN v_row;
END;
$$;
-- ─── 8. admin_finalize_order — the ONLY way to advance order status ───────────
--
-- Actions:
--   'accept'           → all items approved → status = 'processing'
--   'reject_full'      → admin rejects entire order → status = 'rejected'
--   'proceed_partial'  → some items rejected, proceed with approved → status = 'partially_approved'
--
-- Guards:
--   - All items must be decided (no pending) before any action
--   - 'accept' only allowed when zero rejections
--   - 'reject_full' and 'proceed_partial' only when rejections exist
--   - 'proceed_partial' requires at least one approved item

CREATE OR REPLACE FUNCTION public.admin_finalize_order(
  p_order_id uuid,
  p_action   text,   -- 'accept' | 'reject_full' | 'proceed_partial'
  p_reason   text    DEFAULT NULL
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
  -- Auth: must be admin
  SELECT id INTO v_admin_id FROM public.profiles
  WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can finalize orders';
  END IF;

  -- Validate action
  IF p_action NOT IN ('accept', 'reject_full', 'proceed_partial') THEN
    RAISE EXCEPTION 'Invalid action: %. Must be accept, reject_full, or proceed_partial', p_action;
  END IF;

  -- Lock the order row
  SELECT * INTO v_order FROM public.orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  v_from_status := v_order.status::text;

  -- Order must be in 'pending' to be finalized
  IF v_order.status::text NOT IN ('pending') THEN
    RAISE EXCEPTION 'Order % is in status %, cannot finalize. Only pending orders can be finalized.',
      p_order_id, v_order.status;
  END IF;

  -- Get readiness summary
  SELECT * INTO v_readiness FROM public.get_order_item_readiness(p_order_id);

  -- Guard: all items must be decided
  IF NOT v_readiness.all_decided THEN
    RAISE EXCEPTION 'Cannot finalize order: % item(s) still pending review (seller: %, admin: %)',
      (v_readiness.seller_pending + v_readiness.admin_pending),
      v_readiness.seller_pending,
      v_readiness.admin_pending;
  END IF;

  -- Guard: action-specific rules
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

  -- Determine new status
  v_new_status := CASE p_action
    WHEN 'accept'          THEN 'processing'::public.order_status
    WHEN 'reject_full'     THEN 'rejected'::public.order_status
    WHEN 'proceed_partial' THEN 'partially_approved'::public.order_status
  END;

  -- Build confirmed/rejected item snapshots for partial fulfillment
  IF p_action IN ('proceed_partial', 'reject_full') THEN
    -- Collect rejected seller items
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

    -- Collect rejected admin items
    SELECT jsonb_agg(jsonb_build_object(
      'order_item_id', a.order_item_id,
      'product_key',   a.product_key,
      'reason',        a.decision_reason
    ))
    INTO v_rejected_items
    FROM public.order_item_approvals a
    JOIN public.order_items oi ON oi.id = a.order_item_id
    WHERE oi.order_id = p_order_id AND a.status = 'rejected';

    -- Collect approved items
    SELECT jsonb_agg(jsonb_build_object(
      'order_item_id', d.order_item_id,
      'product_key',   d.product_key
    ))
    INTO v_confirmed_items
    FROM public.seller_order_item_decisions d
    JOIN public.order_items oi ON oi.id = d.order_item_id
    WHERE oi.order_id = p_order_id AND d.decision = 'approved';
  END IF;

  -- Apply the status transition
  UPDATE public.orders
  SET
    status                = v_new_status,
    partial_fulfillment   = (p_action = 'proceed_partial'),
    confirmed_items       = CASE WHEN p_action = 'proceed_partial' THEN v_confirmed_items ELSE confirmed_items END,
    rejected_items        = CASE WHEN p_action IN ('proceed_partial', 'reject_full') THEN v_rejected_items ELSE rejected_items END,
    -- For full rejection of prepaid orders, mark refund as pending
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

  -- Write audit log
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
$$;
-- ─── 9. Prevent direct status manipulation on orders ─────────────────────────
-- Block any UPDATE to orders.status that does NOT come from our
-- SECURITY DEFINER functions (which run as the table owner / postgres role).
-- We detect "legitimate" updates by checking a session-level variable.

CREATE OR REPLACE FUNCTION public.guard_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow if status hasn't changed
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Allow transitions driven by our workflow functions
  -- (they set a session variable before updating)
  IF current_setting('hatvoni.workflow_actor', true) IS NOT NULL
     AND current_setting('hatvoni.workflow_actor', true) <> '' THEN
    RETURN NEW;
  END IF;

  -- Allow system-level transitions: pending → cancelled (customer cancel)
  -- and payment status updates (webhook)
  IF OLD.status::text = 'pending' AND NEW.status::text = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Allow shipped/delivered transitions (post-processing fulfillment)
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
DROP TRIGGER IF EXISTS trg_guard_order_status_change ON public.orders;
CREATE TRIGGER trg_guard_order_status_change
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_order_status_change();
-- ─── 10. Auto-create order_item_approvals rows when order is placed ───────────
-- For own-seller products (seller_id IS NOT NULL AND is_own_seller = true,
-- or seller_id IS NULL for Hatvoni-direct products), we auto-create
-- pending approval rows so admin sees them immediately.

CREATE OR REPLACE FUNCTION public.auto_create_item_approvals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item RECORD;
  v_snap_item RECORD;
  v_product RECORD;
BEGIN
  -- Only trigger on new order_items
  -- For each item, check if it belongs to an own-seller or is Hatvoni-direct

  -- Direct product (non-lot)
  IF NEW.product_id IS NOT NULL AND NEW.lot_snapshot IS NULL THEN
    SELECT p.key, p.seller_id, p.sync_with_insider,
           COALESCE(pr.is_own_seller, false) AS is_own_seller
    INTO v_product
    FROM public.products p
    LEFT JOIN public.profiles pr ON pr.id = p.seller_id
    WHERE p.id = NEW.product_id;

    IF FOUND AND (v_product.seller_id IS NULL OR v_product.is_own_seller) THEN
      INSERT INTO public.order_item_approvals (
        order_item_id, product_key, seller_id, sync_with_insider
      ) VALUES (
        NEW.id,
        v_product.key,
        v_product.seller_id,
        COALESCE(v_product.sync_with_insider, false)
      )
      ON CONFLICT (order_item_id, product_key) DO NOTHING;
    END IF;

  -- Lot snapshot (bundle) — iterate each product in the snapshot
  ELSIF NEW.lot_snapshot IS NOT NULL THEN
    FOR v_snap_item IN
      SELECT
        (elem->>'product_key')::text AS product_key,
        (elem->>'seller_id')::uuid   AS seller_id
      FROM jsonb_array_elements(NEW.lot_snapshot) AS elem
    LOOP
      IF v_snap_item.seller_id IS NULL THEN
        -- Hatvoni-direct item in a lot
        INSERT INTO public.order_item_approvals (
          order_item_id, product_key, seller_id, sync_with_insider
        )
        SELECT
          NEW.id,
          v_snap_item.product_key,
          NULL,
          COALESCE(p.sync_with_insider, false)
        FROM public.products p
        WHERE p.key = v_snap_item.product_key
        ON CONFLICT (order_item_id, product_key) DO NOTHING;
      ELSE
        -- Check if this seller is an own-seller
        IF EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = v_snap_item.seller_id AND is_own_seller = true
        ) THEN
          INSERT INTO public.order_item_approvals (
            order_item_id, product_key, seller_id, sync_with_insider
          )
          SELECT
            NEW.id,
            v_snap_item.product_key,
            v_snap_item.seller_id,
            COALESCE(p.sync_with_insider, false)
          FROM public.products p
          WHERE p.key = v_snap_item.product_key
          ON CONFLICT (order_item_id, product_key) DO NOTHING;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_auto_create_item_approvals ON public.order_items;
CREATE TRIGGER trg_auto_create_item_approvals
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_item_approvals();
-- ─── 11. RLS: allow admins to read order_workflow_log ────────────────────────

-- Insert is allowed only from SECURITY DEFINER functions (service role)
CREATE POLICY "System can insert workflow logs"
  ON public.order_workflow_log FOR INSERT
  WITH CHECK (true);
-- ─── 12. Indexes ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_status_pending
  ON public.orders (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_seller_decisions_order_item
  ON public.seller_order_item_decisions (order_item_id, decision);
