/*
  # Dispatch admin push notifications from DB trigger

  Uses pg_net to call send-admin-push edge function whenever a new
  admin_notifications row is inserted.
*/

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.integration_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO private.integration_config(key, value)
VALUES
  ('admin_push_function_url', 'https://dhtwkfethmqcgpqdbksi.supabase.co/functions/v1/send-admin-push'),
  ('admin_push_dispatch_secret', 'CHANGE_ME')
ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.enqueue_admin_push_notification(p_notification_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  endpoint_url text;
  trigger_secret text;
BEGIN
  IF p_notification_id IS NULL THEN
    RETURN;
  END IF;

  SELECT value INTO endpoint_url
  FROM private.integration_config
  WHERE key = 'admin_push_function_url';

  SELECT value INTO trigger_secret
  FROM private.integration_config
  WHERE key = 'admin_push_dispatch_secret';

  IF endpoint_url IS NULL OR endpoint_url = '' THEN
    RETURN;
  END IF;

  IF trigger_secret IS NULL OR trigger_secret = '' OR trigger_secret = 'CHANGE_ME' THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := endpoint_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-dispatch-secret', trigger_secret
    ),
    body := jsonb_build_object('notification_id', p_notification_id)
  );
EXCEPTION WHEN OTHERS THEN
  -- swallow trigger-side errors to avoid impacting notification insert
  RETURN;
END;
$$;
CREATE OR REPLACE FUNCTION public.trigger_admin_push_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_admin_push_notification(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enqueue_admin_push_notification ON public.admin_notifications;
CREATE TRIGGER trg_enqueue_admin_push_notification
  AFTER INSERT ON public.admin_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_admin_push_notification();
