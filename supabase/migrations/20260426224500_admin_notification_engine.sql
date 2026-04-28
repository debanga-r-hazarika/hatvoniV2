/*
  # Admin Notification Engine

  Creates a module-aware notification system for admin/staff users.

  Key ideas:
  - Notifications are fanned out per recipient (one row per user).
  - Recipients are all admins + active employees assigned to event modules.
  - Works across modules (orders/support/etc) using a shared payload shape.
*/

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_recipient_created
  ON public.admin_notifications(recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_recipient_unread
  ON public.admin_notifications(recipient_user_id, is_read)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_admin_notifications_module_created
  ON public.admin_notifications(module, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own admin notifications" ON public.admin_notifications;
CREATE POLICY "Users can read own admin notifications"
  ON public.admin_notifications
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can mark own admin notifications" ON public.admin_notifications;
CREATE POLICY "Users can mark own admin notifications"
  ON public.admin_notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can insert admin notifications" ON public.admin_notifications;
CREATE POLICY "Service role can insert admin notifications"
  ON public.admin_notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.admin_notification_recipient_ids(p_modules text[])
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH module_list AS (
    SELECT unnest(COALESCE(p_modules, ARRAY[]::text[])) AS module
  ),
  admin_ids AS (
    SELECT p.id
    FROM public.profiles p
    WHERE p.is_admin = true
  ),
  employee_ids AS (
    SELECT DISTINCT e.profile_id AS id
    FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    JOIN module_list ml ON ml.module = em.module
    WHERE e.is_active = true
  )
  SELECT DISTINCT id FROM admin_ids
  UNION
  SELECT DISTINCT id FROM employee_ids
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
DECLARE
  v_module text;
BEGIN
  IF COALESCE(array_length(p_modules, 1), 0) = 0 THEN
    RETURN;
  END IF;

  v_module := p_modules[1];

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
    rid,
    v_module,
    p_event_type,
    p_title,
    p_message,
    p_entity_type,
    p_entity_id,
    COALESCE(p_meta, '{}'::jsonb)
  FROM public.admin_notification_recipient_ids(p_modules) rid;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_order_admin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_id text;
  v_new_status text;
  v_old_status text;
BEGIN
  v_display_id := UPPER(REPLACE(COALESCE(NEW.id::text, ''), '-', ''));
  v_display_id := 'ORD-' || LEFT(v_display_id, 8);
  v_new_status := LOWER(COALESCE(NEW.order_status, NEW.status, ''));
  v_old_status := LOWER(COALESCE(OLD.order_status, OLD.status, ''));

  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_admin_notification(
      ARRAY['orders', 'logistics'],
      'order_placed',
      'New order placed',
      'A new order ' || v_display_id || ' has been placed.',
      'order',
      NEW.id,
      jsonb_build_object(
        'order_id', NEW.id,
        'status', v_new_status,
        'payment_status', NEW.payment_status,
        'total_amount', NEW.total_amount
      )
    );
    RETURN NEW;
  END IF;

  IF v_new_status <> v_old_status THEN
    IF v_new_status = 'cancelled' THEN
      PERFORM public.emit_admin_notification(
        ARRAY['orders', 'support', 'logistics'],
        'order_cancelled',
        'Order cancelled by customer',
        'Order ' || v_display_id || ' was cancelled.',
        'order',
        NEW.id,
        jsonb_build_object(
          'order_id', NEW.id,
          'old_status', v_old_status,
          'new_status', v_new_status,
          'reason', COALESCE(NEW.cancellation_reason, NEW.order_notes, '')
        )
      );
    ELSIF v_new_status IN ('processing', 'shipped', 'delivered') THEN
      PERFORM public.emit_admin_notification(
        ARRAY['orders', 'logistics'],
        'order_status_changed',
        'Order status updated',
        'Order ' || v_display_id || ' moved to ' || v_new_status || '.',
        'order',
        NEW.id,
        jsonb_build_object(
          'order_id', NEW.id,
          'old_status', v_old_status,
          'new_status', v_new_status
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_admin_event ON public.orders;
CREATE TRIGGER trg_notify_order_admin_event
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_admin_event();

CREATE OR REPLACE FUNCTION public.notify_support_ticket_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_admin_notification(
      ARRAY['support'],
      'support_ticket_created',
      'New support ticket',
      'Ticket ' || COALESCE(NEW.ticket_number, NEW.id::text) || ' is waiting in queue.',
      'support_ticket',
      NEW.id,
      jsonb_build_object(
        'ticket_id', NEW.id,
        'ticket_number', NEW.ticket_number,
        'priority', NEW.priority,
        'request_type', NEW.request_type
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_support_ticket_created ON public.support_tickets;
CREATE TRIGGER trg_notify_support_ticket_created
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_support_ticket_created();
