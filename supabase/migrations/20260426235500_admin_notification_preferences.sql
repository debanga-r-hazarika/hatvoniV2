/*
  # Admin Notification Preferences

  Per-user controls for module/event notifications.
*/

CREATE TABLE IF NOT EXISTS public.admin_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  event_type text NOT NULL DEFAULT '*',
  in_app_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module, event_type)
);

CREATE INDEX IF NOT EXISTS idx_admin_notif_pref_user
  ON public.admin_notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_notif_pref_user_module
  ON public.admin_notification_preferences(user_id, module);

ALTER TABLE public.admin_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notification preferences" ON public.admin_notification_preferences;
CREATE POLICY "Users can read own notification preferences"
  ON public.admin_notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own notification preferences" ON public.admin_notification_preferences;
CREATE POLICY "Users can manage own notification preferences"
  ON public.admin_notification_preferences
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.should_send_admin_notification(
  p_user_id uuid,
  p_module text,
  p_event_type text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH exact_pref AS (
    SELECT in_app_enabled
    FROM public.admin_notification_preferences
    WHERE user_id = p_user_id
      AND module = p_module
      AND event_type = p_event_type
    LIMIT 1
  ),
  module_pref AS (
    SELECT in_app_enabled
    FROM public.admin_notification_preferences
    WHERE user_id = p_user_id
      AND module = p_module
      AND event_type = '*'
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT in_app_enabled FROM exact_pref),
    (SELECT in_app_enabled FROM module_pref),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.emit_admin_notification(
  p_modules text[],
  p_event_type text,
  p_title text,
  p_message text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(array_length(p_modules, 1), 0) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.admin_notifications (
    recipient_user_id,
    module,
    event_type,
    title,
    message,
    entity_type,
    entity_id,
    meta
  )
  SELECT
    t.recipient_user_id,
    t.module,
    p_event_type,
    p_title,
    p_message,
    p_entity_type,
    p_entity_id,
    COALESCE(p_meta, '{}'::jsonb)
  FROM public.admin_notification_targets(p_modules) t
  WHERE public.should_send_admin_notification(t.recipient_user_id, t.module, p_event_type) = true;
END;
$$;
