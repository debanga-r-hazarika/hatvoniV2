/*
  # Remove admin override notification controls

  Notification delivery is determined by:
  1) Module access (admin/employee_modules)
  2) User's own notification preferences
*/

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
  WITH self_exact AS (
    SELECT in_app_enabled
    FROM public.admin_notification_preferences
    WHERE user_id = p_user_id
      AND module = p_module
      AND event_type = p_event_type
    LIMIT 1
  ),
  self_module AS (
    SELECT in_app_enabled
    FROM public.admin_notification_preferences
    WHERE user_id = p_user_id
      AND module = p_module
      AND event_type = '*'
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT in_app_enabled FROM self_exact),
    (SELECT in_app_enabled FROM self_module),
    true
  );
$$;
