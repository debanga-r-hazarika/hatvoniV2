CREATE OR REPLACE FUNCTION public.get_private_integration_config(p_key text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = private
AS $$
  SELECT value
  FROM private.integration_config
  WHERE key = p_key
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_private_integration_config(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_private_integration_config(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_private_integration_config(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_private_integration_config(text) TO service_role;

UPDATE private.integration_config
SET value = encode(gen_random_bytes(32), 'hex'),
    updated_at = now()
WHERE key = 'customer_sync_trigger_secret'
  AND value = 'CHANGE_ME';;
