-- Fix enum cast failure in customer order status notification trigger.
-- OLD.status / NEW.status are enums, so COALESCE(..., '') can try to cast
-- '' into public.order_status and fail.

CREATE OR REPLACE FUNCTION public.notify_customer_order_status_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old_status text;
  v_new_status text;
  v_display_id text;
BEGIN
  v_old_status := lower(coalesce(OLD.status::text, ''));
  v_new_status := lower(coalesce(NEW.status::text, ''));

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
$function$;
;
