/*
  Insider batch assignment enforcement for admin approval workflow.

  Goals:
  - Require batch assignment when sync_with_insider item is approved with available stock.
  - Preserve existing production fallback when stock is not available.
  - Keep full internal audit trail for batch assignment and deduction lifecycle.
*/

ALTER TABLE public.order_item_approvals
  ADD COLUMN IF NOT EXISTS assigned_batch_id text,
  ADD COLUMN IF NOT EXISTS assigned_batch_reference text,
  ADD COLUMN IF NOT EXISTS batch_assignment_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS batch_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS batch_assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_deduction_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS inventory_deduction_ref text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_item_approvals_batch_assignment_status_check'
  ) THEN
    ALTER TABLE public.order_item_approvals
      ADD CONSTRAINT order_item_approvals_batch_assignment_status_check
      CHECK (batch_assignment_status IN ('not_required', 'required', 'assigned'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_item_approvals_inventory_deduction_status_check'
  ) THEN
    ALTER TABLE public.order_item_approvals
      ADD CONSTRAINT order_item_approvals_inventory_deduction_status_check
      CHECK (inventory_deduction_status IN ('pending', 'success', 'failed', 'retried'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_item_approvals_batch_assignment_status
  ON public.order_item_approvals (batch_assignment_status);

CREATE INDEX IF NOT EXISTS idx_order_item_approvals_sync_batch_pending
  ON public.order_item_approvals (status, batch_assignment_status)
  WHERE sync_with_insider = true;

CREATE TABLE IF NOT EXISTS public.order_item_batch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  event_type text NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_item_batch_events_item_created
  ON public.order_item_batch_events (order_item_id, created_at DESC);

ALTER TABLE public.order_item_batch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view batch events" ON public.order_item_batch_events;
CREATE POLICY "Admins can view batch events"
  ON public.order_item_batch_events FOR SELECT TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

DROP POLICY IF EXISTS "System can insert batch events" ON public.order_item_batch_events;
CREATE POLICY "System can insert batch events"
  ON public.order_item_batch_events FOR INSERT
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.admin_approve_item(
  p_order_item_id   uuid,
  p_product_key     text,
  p_decision        text,
  p_reason          text    DEFAULT NULL,
  p_inventory_snap  jsonb   DEFAULT NULL,
  p_assigned_batch_id text  DEFAULT NULL,
  p_assigned_batch_reference text DEFAULT NULL,
  p_fulfillment_mode text DEFAULT NULL
)
RETURNS public.order_item_approvals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id  uuid;
  v_row       public.order_item_approvals%ROWTYPE;
  v_existing  public.order_item_approvals%ROWTYPE;
  v_order_id  uuid;
  v_status    public.item_approval_status;
  v_qty_available numeric := NULL;
  v_available boolean := false;
  v_mode text := lower(coalesce(p_fulfillment_mode, ''));
  v_batch_status text := 'not_required';
  v_batch_id text := nullif(btrim(coalesce(p_assigned_batch_id, '')), '');
  v_batch_ref text := nullif(btrim(coalesce(p_assigned_batch_reference, '')), '');
  v_inventory_snap jsonb := coalesce(p_inventory_snap, '{}'::jsonb);
BEGIN
  SELECT id INTO v_admin_id FROM public.profiles
  WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can approve/reject own-seller items';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected, got: %', p_decision;
  END IF;

  IF p_decision = 'rejected' AND NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when rejecting an item';
  END IF;

  v_status := p_decision::public.item_approval_status;

  SELECT order_id INTO v_order_id FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found: %', p_order_item_id;
  END IF;

  SELECT * INTO v_existing
  FROM public.order_item_approvals
  WHERE order_item_id = p_order_item_id
    AND product_key = p_product_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval record missing for order item % and product key %', p_order_item_id, p_product_key;
  END IF;

  IF v_existing.sync_with_insider = true AND p_decision = 'approved' THEN
    BEGIN
      v_qty_available := NULLIF(v_inventory_snap->>'qty_available', '')::numeric;
    EXCEPTION WHEN others THEN
      v_qty_available := NULL;
    END;

    IF v_qty_available IS NULL THEN
      SELECT hi.total_qty_available
      INTO v_qty_available
      FROM public.hatvoni_inventory hi
      WHERE hi.tag_key = p_product_key
      LIMIT 1;
    END IF;

    v_available := coalesce(v_qty_available, 0) > 0;

    IF v_available THEN
      IF v_mode <> 'batch' THEN
        RAISE EXCEPTION 'Batch fulfillment mode is required when insider stock is available';
      END IF;
      IF v_batch_id IS NULL THEN
        RAISE EXCEPTION 'Batch ID must be selected before approving insider item';
      END IF;
      IF v_batch_ref IS NULL THEN
        SELECT hil.batch_reference
        INTO v_batch_ref
        FROM public.hatvoni_inventory_lots hil
        WHERE hil.insider_lot_id = v_batch_id
          AND hil.tag_key = p_product_key
        LIMIT 1;
      END IF;
      v_batch_status := 'assigned';
    ELSE
      v_mode := 'production';
      v_batch_id := NULL;
      v_batch_ref := NULL;
      v_batch_status := 'not_required';
    END IF;
  ELSIF v_existing.sync_with_insider = true AND p_decision <> 'approved' THEN
    v_mode := '';
    v_batch_id := NULL;
    v_batch_ref := NULL;
    v_batch_status := 'not_required';
  END IF;

  v_inventory_snap := v_inventory_snap || jsonb_build_object(
    'fulfillment_mode', nullif(v_mode, ''),
    'selected_batch_id', v_batch_id,
    'selected_batch_reference', v_batch_ref
  );

  INSERT INTO public.order_item_approvals (
    order_item_id, product_key, status,
    decision_by, decision_reason, decided_at,
    inventory_snapshot, updated_at,
    assigned_batch_id, assigned_batch_reference,
    batch_assignment_status, batch_assigned_at, batch_assigned_by
  )
  VALUES (
    p_order_item_id, p_product_key, v_status,
    v_admin_id, p_reason, now(),
    v_inventory_snap, now(),
    v_batch_id, v_batch_ref,
    v_batch_status, CASE WHEN v_batch_status = 'assigned' THEN now() ELSE NULL END, CASE WHEN v_batch_status = 'assigned' THEN v_admin_id ELSE NULL END
  )
  ON CONFLICT (order_item_id, product_key) DO UPDATE
    SET status             = EXCLUDED.status,
        decision_by        = EXCLUDED.decision_by,
        decision_reason    = EXCLUDED.decision_reason,
        decided_at         = EXCLUDED.decided_at,
        inventory_snapshot = COALESCE(EXCLUDED.inventory_snapshot, order_item_approvals.inventory_snapshot),
        assigned_batch_id = EXCLUDED.assigned_batch_id,
        assigned_batch_reference = EXCLUDED.assigned_batch_reference,
        batch_assignment_status = EXCLUDED.batch_assignment_status,
        batch_assigned_at = EXCLUDED.batch_assigned_at,
        batch_assigned_by = EXCLUDED.batch_assigned_by,
        updated_at         = now()
  RETURNING * INTO v_row;

  INSERT INTO public.order_workflow_log (
    order_id, event_type, actor_id, actor_role, metadata
  ) VALUES (
    v_order_id,
    'item_' || p_decision,
    v_admin_id,
    'admin',
    jsonb_build_object(
      'order_item_id', p_order_item_id,
      'product_key', p_product_key,
      'decision', p_decision,
      'reason', p_reason,
      'sync_with_insider', v_existing.sync_with_insider,
      'fulfillment_mode', nullif(v_mode, ''),
      'assigned_batch_id', v_batch_id,
      'assigned_batch_reference', v_batch_ref
    )
  );

  IF v_existing.sync_with_insider = true AND p_decision = 'approved' THEN
    INSERT INTO public.order_item_batch_events (
      order_item_id, product_key, event_type, actor_id, payload
    ) VALUES (
      p_order_item_id,
      p_product_key,
      CASE WHEN v_batch_status = 'assigned' THEN 'batch_assigned' ELSE 'batch_not_required' END,
      v_admin_id,
      jsonb_build_object(
        'fulfillment_mode', nullif(v_mode, ''),
        'assigned_batch_id', v_batch_id,
        'assigned_batch_reference', v_batch_ref,
        'inventory_snapshot', v_inventory_snap
      )
    );
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_item_to_lot(
  p_order_item_id    uuid,
  p_order_shipment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid;
  v_item  public.order_items%ROWTYPE;
  v_lot   public.order_shipments%ROWTYPE;
BEGIN
  SELECT id INTO v_admin FROM public.profiles WHERE id = auth.uid() AND is_admin = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only admins can assign items to lots';
  END IF;

  SELECT * INTO v_item FROM public.order_items WHERE id = p_order_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  SELECT * INTO v_lot FROM public.order_shipments WHERE id = p_order_shipment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shipment lot not found';
  END IF;

  IF v_lot.order_id <> v_item.order_id THEN
    RAISE EXCEPTION 'Shipment lot does not belong to the same order as the item';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_item_approvals a
    WHERE a.order_item_id = p_order_item_id
      AND a.sync_with_insider = true
      AND a.status = 'approved'
      AND coalesce(a.batch_assignment_status, 'not_required') <> 'assigned'
  ) THEN
    RAISE EXCEPTION 'Batch ID needs to be set before assigning this insider item to a shipment lot';
  END IF;

  UPDATE public.order_items
  SET order_shipment_id = p_order_shipment_id
  WHERE id = p_order_item_id;
END;
$$;
