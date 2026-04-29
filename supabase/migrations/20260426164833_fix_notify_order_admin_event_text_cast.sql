CREATE OR REPLACE FUNCTION public.notify_order_admin_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_display_id text;
  v_new_status text;
  v_old_status text;
BEGIN
  v_display_id := UPPER(REPLACE(COALESCE(NEW.id::text, ''), '-', ''));
  v_display_id := 'ORD-' || LEFT(v_display_id, 8);
  v_new_status := LOWER(COALESCE(NEW.order_status::text, NEW.status::text, ''));
  v_old_status := LOWER(COALESCE(OLD.order_status::text, OLD.status::text, ''));

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
$function$;;
