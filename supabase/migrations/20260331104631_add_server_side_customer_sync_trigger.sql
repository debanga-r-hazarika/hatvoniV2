CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

CREATE TABLE IF NOT EXISTS private.integration_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO private.integration_config(key, value)
VALUES
  ('customer_sync_function_url', 'https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/sync-customer-to-insider'),
  ('customer_sync_trigger_secret', 'CHANGE_ME')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.build_customer_sync_payload(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p profiles%ROWTYPE;
  addresses_payload jsonb;
  default_address_payload jsonb;
BEGIN
  SELECT *
  INTO p
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'street', a.address_line1,
        'city', a.city,
        'state', a.state,
        'postal_code', a.postal_code,
        'country', a.country,
        'is_default', a.is_default
      )
      ORDER BY a.is_default DESC, a.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO addresses_payload
  FROM public.addresses a
  WHERE a.user_id = p_user_id;

  SELECT jsonb_build_object(
    'id', a.id,
    'street', a.address_line1,
    'city', a.city,
    'state', a.state,
    'postal_code', a.postal_code,
    'country', a.country,
    'is_default', a.is_default
  )
  INTO default_address_payload
  FROM public.addresses a
  WHERE a.user_id = p_user_id
  ORDER BY a.is_default DESC, a.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'external_customer_id', p.id,
    'first_name', COALESCE(p.first_name, ''),
    'last_name', COALESCE(p.last_name, ''),
    'email', p.email,
    'phone', p.phone,
    'default_address', default_address_payload,
    'all_addresses', addresses_payload
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_customer_sync(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  endpoint_url text;
  trigger_secret text;
  payload jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT value INTO endpoint_url
  FROM private.integration_config
  WHERE key = 'customer_sync_function_url';

  SELECT value INTO trigger_secret
  FROM private.integration_config
  WHERE key = 'customer_sync_trigger_secret';

  IF endpoint_url IS NULL OR endpoint_url = '' THEN
    INSERT INTO public.customer_sync_failures(source, external_customer_id, error_message, payload)
    VALUES (
      'db_trigger_customer_sync',
      p_user_id,
      'Missing customer_sync_function_url in private.integration_config',
      NULL
    );
    RETURN;
  END IF;

  IF trigger_secret IS NULL OR trigger_secret = '' OR trigger_secret = 'CHANGE_ME' THEN
    INSERT INTO public.customer_sync_failures(source, external_customer_id, error_message, payload)
    VALUES (
      'db_trigger_customer_sync',
      p_user_id,
      'Missing customer_sync_trigger_secret in private.integration_config',
      NULL
    );
    RETURN;
  END IF;

  payload := private.build_customer_sync_payload(p_user_id);

  IF payload IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-customer-sync-secret', trigger_secret
    ),
    body := payload
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.customer_sync_failures(source, external_customer_id, error_message, payload)
  VALUES (
    'db_trigger_customer_sync',
    p_user_id,
    SQLERRM,
    jsonb_build_object('context', 'enqueue_customer_sync')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_customer_sync_from_profiles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_customer_sync(COALESCE(NEW.id, OLD.id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_customer_sync_from_addresses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_customer_sync(COALESCE(NEW.user_id, OLD.user_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_sync_profiles_aiu ON public.profiles;
CREATE TRIGGER trg_customer_sync_profiles_aiu
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_customer_sync_from_profiles();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'addresses'
  ) THEN
    DROP TRIGGER IF EXISTS trg_customer_sync_addresses_aiud ON public.addresses;
    CREATE TRIGGER trg_customer_sync_addresses_aiud
    AFTER INSERT OR UPDATE OR DELETE ON public.addresses
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_customer_sync_from_addresses();
  END IF;
END
$$;;
