ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_gateway text,
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_signature text,
  ADD COLUMN IF NOT EXISTS payment_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.orders
SET payment_method = COALESCE(NULLIF(shipping_address->>'payment_method', ''), 'cod')
WHERE payment_method IS NULL OR payment_method = '';

UPDATE public.orders
SET payment_status = CASE
  WHEN payment_method = 'cod' THEN 'pending'
  ELSE COALESCE(NULLIF(payment_status, ''), 'pending')
END
WHERE payment_status IS NULL OR payment_status = '';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cod', 'razorpay', 'razorpay_upi', 'razorpay_cards'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'initiated', 'paid', 'failed', 'refunded'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_razorpay_order_id_unique
  ON public.orders (razorpay_order_id)
  WHERE razorpay_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_payment_status
  ON public.orders (payment_status);

CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'razorpay_webhook_events'
      AND policyname = 'Admins can read razorpay webhook events'
  ) THEN
    CREATE POLICY "Admins can read razorpay webhook events"
      ON public.razorpay_webhook_events
      FOR SELECT
      TO authenticated
      USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
  END IF;
END $$;;
