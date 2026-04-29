/*
  # Add seller item decision tracking

  1. New decision table
    - Track approval state per seller-visible line item
    - Support both direct product lines and lot snapshot lines

  2. Validation
    - Reject decisions require a reason
    - Sellers can only write decisions for their own items

  3. Security
    - Enable RLS on the new table
    - Keep seller and admin access scoped to owned rows
*/

DO $$
BEGIN
  CREATE TYPE public.seller_item_decision AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS public.seller_order_item_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision public.seller_item_decision NOT NULL DEFAULT 'pending',
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_order_item_decisions_unique_line UNIQUE (order_item_id, product_key, seller_id),
  CONSTRAINT seller_order_item_decisions_rejected_reason CHECK (
    decision <> 'rejected' OR NULLIF(BTRIM(COALESCE(decision_reason, '')), '') IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS idx_seller_order_item_decisions_seller_id
  ON public.seller_order_item_decisions (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_order_item_decisions_order_item_id
  ON public.seller_order_item_decisions (order_item_id);
CREATE INDEX IF NOT EXISTS idx_seller_order_item_decisions_decision
  ON public.seller_order_item_decisions (decision);
CREATE OR REPLACE FUNCTION public.is_seller_order_item_line_owner(
  p_order_item_id uuid,
  p_product_key text,
  p_seller_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    LEFT JOIN public.products direct_product ON direct_product.id = oi.product_id
    WHERE oi.id = p_order_item_id
      AND (
        (
          direct_product.key = p_product_key
          AND direct_product.seller_id = p_seller_id
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(oi.lot_snapshot, '[]'::jsonb)) AS snapshot
          JOIN public.products lot_product ON lot_product.key = snapshot->>'product_key'
          WHERE snapshot->>'product_key' = p_product_key
            AND lot_product.seller_id = p_seller_id
        )
      )
  )
$$;
ALTER TABLE public.seller_order_item_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sellers can view their item decisions" ON public.seller_order_item_decisions;
CREATE POLICY "Sellers can view their item decisions"
  ON public.seller_order_item_decisions FOR SELECT
  TO authenticated
  USING (
    public.is_admin() = true
    OR seller_id = auth.uid()
  );
DROP POLICY IF EXISTS "Sellers can insert their item decisions" ON public.seller_order_item_decisions;
CREATE POLICY "Sellers can insert their item decisions"
  ON public.seller_order_item_decisions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_seller() = true
    AND seller_id = auth.uid()
    AND public.is_seller_order_item_line_owner(order_item_id, product_key, auth.uid())
  );
DROP POLICY IF EXISTS "Sellers can update their item decisions" ON public.seller_order_item_decisions;
CREATE POLICY "Sellers can update their item decisions"
  ON public.seller_order_item_decisions FOR UPDATE
  TO authenticated
  USING (
    public.is_admin() = true
    OR seller_id = auth.uid()
  )
  WITH CHECK (
    public.is_admin() = true
    OR (
      public.is_seller() = true
      AND seller_id = auth.uid()
      AND public.is_seller_order_item_line_owner(order_item_id, product_key, auth.uid())
    )
  );
