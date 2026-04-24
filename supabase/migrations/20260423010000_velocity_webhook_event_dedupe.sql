-- Velocity / Shipfast webhook idempotency ledger.
-- Prevents duplicate processing using webhook event_id.

CREATE TABLE IF NOT EXISTS public.velocity_webhook_event_dedupe (
  event_id text PRIMARY KEY,
  event_type text,
  external_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_velocity_webhook_event_dedupe_external_id
  ON public.velocity_webhook_event_dedupe (external_id)
  WHERE external_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_velocity_webhook_event(
  p_event_id text,
  p_event_type text DEFAULT NULL,
  p_external_id text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int;
BEGIN
  IF coalesce(trim(p_event_id), '') = '' THEN
    RETURN true;
  END IF;

  INSERT INTO public.velocity_webhook_event_dedupe (
    event_id,
    event_type,
    external_id,
    payload
  )
  VALUES (
    trim(p_event_id),
    nullif(trim(coalesce(p_event_type, '')), ''),
    nullif(trim(coalesce(p_external_id, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

REVOKE ALL ON TABLE public.velocity_webhook_event_dedupe FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE public.velocity_webhook_event_dedupe TO service_role;

REVOKE ALL ON FUNCTION public.reserve_velocity_webhook_event(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_velocity_webhook_event(text, text, text, jsonb) TO service_role;
