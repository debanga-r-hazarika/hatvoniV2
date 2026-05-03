/*
  # Admin controls employee notification delivery

  Admin can explicitly enable/disable notification delivery for each employee
  by module and by event type.
*/

CREATE TABLE IF NOT EXISTS public.employee_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  event_type text NOT NULL DEFAULT '*',
  in_app_enabled boolean NOT NULL DEFAULT true,
  managed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module, event_type)
);
CREATE INDEX IF NOT EXISTS idx_emp_notif_pref_user
  ON public.employee_notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_notif_pref_user_module
  ON public.employee_notification_preferences(user_id, module);
ALTER TABLE public.employee_notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage employee notification preferences" ON public.employee_notification_preferences;
CREATE POLICY "Admins can manage employee notification preferences"
  ON public.employee_notification_preferences
  FOR ALL
  TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
DROP POLICY IF EXISTS "Employees can read own managed notification preferences" ON public.employee_notification_preferences;
CREATE POLICY "Employees can read own managed notification preferences"
  ON public.employee_notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
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
  WITH managed_exact AS (
    SELECT in_app_enabled
    FROM public.employee_notification_preferences
    WHERE user_id = p_user_id
      AND module = p_module
      AND event_type = p_event_type
    LIMIT 1
  ),
  managed_module AS (
    SELECT in_app_enabled
    FROM public.employee_notification_preferences
    WHERE user_id = p_user_id
      AND module = p_module
      AND event_type = '*'
    LIMIT 1
  ),
  self_exact AS (
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
    (SELECT in_app_enabled FROM managed_exact),
    (SELECT in_app_enabled FROM managed_module),
    (SELECT in_app_enabled FROM self_exact),
    (SELECT in_app_enabled FROM self_module),
    true
  );
$$;
