/*
  # Customer notifications for order updates

  Notify customers whenever their order status meaningfully changes.
*/

CREATE TABLE IF NOT EXISTS public.customer_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_notifications_recipient_created
  ON public.customer_notifications(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_notifications_recipient_unread
  ON public.customer_notifications(recipient_user_id, is_read)
  WHERE is_read = false;
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own customer notifications" ON public.customer_notifications;
CREATE POLICY "Users can read own customer notifications"
  ON public.customer_notifications
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own customer notifications" ON public.customer_notifications;
CREATE POLICY "Users can update own customer notifications"
  ON public.customer_notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());
DROP POLICY IF EXISTS "Service role can insert customer notifications" ON public.customer_notifications;
CREATE POLICY "Service role can insert customer notifications"
  ON public.customer_notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);
CREATE OR REPLACE FUNCTION public.notify_customer_order_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
  v_display_id text;
BEGIN
  v_old_status := lower(coalesce(OLD.status, ''));
  v_new_status := lower(coalesce(NEW.status, ''));

  IF coalesce(NEW.user_id, OLD.user_id) IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_old_status = v_new_status THEN
    RETURN NEW;
  END IF;

  IF v_new_status = '' THEN
    RETURN NEW;
  END IF;

  v_display_id := UPPER(REPLACE(COALESCE(NEW.id::text, ''), '-', ''));
  v_display_id := 'ORD-' || LEFT(v_display_id, 8);

  INSERT INTO public.customer_notifications (
    recipient_user_id,
    event_type,
    title,
    message,
    order_id,
    meta
  )
  VALUES (
    NEW.user_id,
    'order_status_updated',
    'Order update received',
    'Your order ' || v_display_id || ' is now ' || initcap(replace(v_new_status, '_', ' ')) || '.',
    NEW.id,
    jsonb_build_object(
      'order_id', NEW.id,
      'display_id', v_display_id,
      'old_status', v_old_status,
      'new_status', v_new_status
    )
  );

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_customer_order_status_update ON public.orders;
CREATE TRIGGER trg_notify_customer_order_status_update
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_customer_order_status_update();
