-- Item-level refund tracking to support per-product refund visibility.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS refund_status text
    CHECK (refund_status IN ('not_required', 'pending', 'initiated', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS refund_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS refund_reference text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

UPDATE public.order_items
SET
  refund_status = COALESCE(refund_status, CASE
    WHEN EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND COALESCE(o.refund_status, 'not_required') <> 'not_required'
    ) THEN 'initiated'
    ELSE 'not_required'
  END),
  refund_amount = COALESCE(refund_amount, 0);

CREATE INDEX IF NOT EXISTS idx_order_items_refund_status ON public.order_items(refund_status);;
