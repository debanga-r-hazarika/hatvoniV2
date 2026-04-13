CREATE TABLE IF NOT EXISTS public.customer_sync_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  source text NOT NULL,
  external_customer_id uuid NOT NULL,
  error_message text NOT NULL,
  payload jsonb
);

CREATE INDEX IF NOT EXISTS idx_customer_sync_failures_customer_id 
  ON public.customer_sync_failures(external_customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_sync_failures_created_at 
  ON public.customer_sync_failures(created_at DESC);;
