/*
  # Expand Admin Notifications Across All Modules

  Adds module-accurate fanout and module-specific event triggers.
*/

CREATE OR REPLACE FUNCTION public.admin_notification_targets(p_modules text[])
RETURNS TABLE(recipient_user_id uuid, module text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH modules AS (
    SELECT DISTINCT unnest(COALESCE(p_modules, ARRAY[]::text[])) AS module
  ),
  admin_targets AS (
    SELECT p.id AS recipient_user_id, m.module
    FROM public.profiles p
    CROSS JOIN modules m
    WHERE p.is_admin = true
  ),
  employee_targets AS (
    SELECT DISTINCT e.profile_id AS recipient_user_id, m.module
    FROM modules m
    JOIN public.employee_modules em ON em.module = m.module
    JOIN public.employees e ON e.id = em.employee_id
    WHERE e.is_active = true
  )
  SELECT DISTINCT recipient_user_id, module FROM admin_targets
  UNION
  SELECT DISTINCT recipient_user_id, module FROM employee_targets
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
  FROM public.admin_notification_targets(p_modules) t;
END;
$$;
CREATE OR REPLACE FUNCTION public.notify_product_admin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_admin_notification(
      ARRAY['products'],
      'product_created',
      'New product added',
      'Product "' || COALESCE(NEW.name, 'Unnamed') || '" was created.',
      'product',
      NEW.id,
      jsonb_build_object('status', NEW.status, 'is_active', NEW.is_active, 'category', NEW.category)
    );
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '')
     OR COALESCE(OLD.is_active, false) IS DISTINCT FROM COALESCE(NEW.is_active, false)
     OR COALESCE(OLD.price, 0) IS DISTINCT FROM COALESCE(NEW.price, 0) THEN
    PERFORM public.emit_admin_notification(
      ARRAY['products'],
      'product_updated',
      'Product updated',
      'Product "' || COALESCE(NEW.name, 'Unnamed') || '" was updated.',
      'product',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_price', OLD.price,
        'new_price', NEW.price,
        'old_is_active', OLD.is_active,
        'new_is_active', NEW.is_active
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_product_admin_event ON public.products;
CREATE TRIGGER trg_notify_product_admin_event
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_product_admin_event();
CREATE OR REPLACE FUNCTION public.notify_lot_admin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_admin_notification(
      ARRAY['lots'],
      'lot_created',
      'New lot created',
      'Lot "' || COALESCE(NEW.lot_name, 'Unnamed') || '" was created.',
      'lot',
      NEW.id,
      jsonb_build_object('status', NEW.status, 'price', NEW.price)
    );
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '')
     OR COALESCE(OLD.price, 0) IS DISTINCT FROM COALESCE(NEW.price, 0) THEN
    PERFORM public.emit_admin_notification(
      ARRAY['lots'],
      'lot_updated',
      'Lot updated',
      'Lot "' || COALESCE(NEW.lot_name, 'Unnamed') || '" was updated.',
      'lot',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_price', OLD.price,
        'new_price', NEW.price
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_lot_admin_event ON public.lots;
CREATE TRIGGER trg_notify_lot_admin_event
  AFTER INSERT OR UPDATE ON public.lots
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_lot_admin_event();
CREATE OR REPLACE FUNCTION public.notify_coupon_admin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_admin_notification(
      ARRAY['coupons'],
      'coupon_created',
      'Coupon created',
      'Coupon "' || COALESCE(NEW.code, 'UNKNOWN') || '" was created.',
      'coupon',
      NEW.id,
      jsonb_build_object('status', NEW.status, 'auto_apply', NEW.auto_apply)
    );
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '')
     OR COALESCE(OLD.auto_apply, false) IS DISTINCT FROM COALESCE(NEW.auto_apply, false) THEN
    PERFORM public.emit_admin_notification(
      ARRAY['coupons'],
      'coupon_updated',
      'Coupon updated',
      'Coupon "' || COALESCE(NEW.code, 'UNKNOWN') || '" was updated.',
      'coupon',
      NEW.id,
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_auto_apply', OLD.auto_apply,
        'new_auto_apply', NEW.auto_apply
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_coupon_admin_event ON public.coupons;
CREATE TRIGGER trg_notify_coupon_admin_event
  AFTER INSERT OR UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_coupon_admin_event();
CREATE OR REPLACE FUNCTION public.notify_inventory_admin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_qty numeric;
  v_new_qty numeric;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_old_qty := COALESCE(OLD.total_qty_available, 0);
  v_new_qty := COALESCE(NEW.total_qty_available, 0);

  IF v_old_qty >= 10 AND v_new_qty < 10 THEN
    PERFORM public.emit_admin_notification(
      ARRAY['inventory'],
      'inventory_low_stock',
      'Low stock alert',
      'Inventory "' || COALESCE(NEW.display_name, NEW.tag_key, 'Item') || '" is below threshold.',
      'inventory',
      NEW.id,
      jsonb_build_object('old_qty', v_old_qty, 'new_qty', v_new_qty, 'tag_key', NEW.tag_key)
    );
  ELSIF v_old_qty > 0 AND v_new_qty = 0 THEN
    PERFORM public.emit_admin_notification(
      ARRAY['inventory'],
      'inventory_out_of_stock',
      'Out of stock alert',
      'Inventory "' || COALESCE(NEW.display_name, NEW.tag_key, 'Item') || '" is now out of stock.',
      'inventory',
      NEW.id,
      jsonb_build_object('old_qty', v_old_qty, 'new_qty', v_new_qty, 'tag_key', NEW.tag_key)
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_inventory_admin_event ON public.hatvoni_inventory;
CREATE TRIGGER trg_notify_inventory_admin_event
  AFTER UPDATE ON public.hatvoni_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_inventory_admin_event();
CREATE OR REPLACE FUNCTION public.notify_logistics_admin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_admin_notification(
      ARRAY['logistics'],
      'shipment_created',
      'Shipment lot created',
      'A new shipment lot was created for an order.',
      'order_shipment',
      NEW.id,
      jsonb_build_object('order_id', NEW.order_id, 'lot_index', NEW.lot_index, 'label', NEW.label)
    );
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.carrier_shipment_status, '') IS DISTINCT FROM COALESCE(NEW.carrier_shipment_status, '')
     OR COALESCE(OLD.tracking_number, '') IS DISTINCT FROM COALESCE(NEW.tracking_number, '') THEN
    PERFORM public.emit_admin_notification(
      ARRAY['logistics'],
      'shipment_updated',
      'Shipment status updated',
      'Shipment lot status/tracking has been updated.',
      'order_shipment',
      NEW.id,
      jsonb_build_object(
        'order_id', NEW.order_id,
        'lot_index', NEW.lot_index,
        'old_carrier_status', OLD.carrier_shipment_status,
        'new_carrier_status', NEW.carrier_shipment_status,
        'old_tracking_number', OLD.tracking_number,
        'new_tracking_number', NEW.tracking_number
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_logistics_admin_event ON public.order_shipments;
CREATE TRIGGER trg_notify_logistics_admin_event
  AFTER INSERT OR UPDATE ON public.order_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_logistics_admin_event();
CREATE OR REPLACE FUNCTION public.notify_support_admin_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '') THEN
    PERFORM public.emit_admin_notification(
      ARRAY['support'],
      'support_ticket_status_changed',
      'Support ticket status changed',
      'Ticket ' || COALESCE(NEW.ticket_number, NEW.id::text) || ' moved to ' || COALESCE(NEW.status, 'unknown') || '.',
      'support_ticket',
      NEW.id,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'assigned_to', NEW.assigned_to)
    );
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_support_admin_event_update ON public.support_tickets;
CREATE TRIGGER trg_notify_support_admin_event_update
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_support_admin_event_update();
CREATE OR REPLACE FUNCTION public.notify_profile_admin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text;
BEGIN
  v_name := trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
  IF v_name = '' THEN
    v_name := COALESCE(NEW.email, NEW.id::text);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.emit_admin_notification(
      ARRAY['customers'],
      'customer_registered',
      'New customer registered',
      v_name || ' just registered.',
      'profile',
      NEW.id,
      jsonb_build_object('email', NEW.email)
    );
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.is_seller, false) IS DISTINCT FROM COALESCE(NEW.is_seller, false) THEN
    PERFORM public.emit_admin_notification(
      ARRAY['sellers', 'customers'],
      'seller_flag_changed',
      'Seller access updated',
      v_name || ' seller status was changed.',
      'profile',
      NEW.id,
      jsonb_build_object('old_is_seller', OLD.is_seller, 'new_is_seller', NEW.is_seller, 'email', NEW.email)
    );
  END IF;

  IF COALESCE(OLD.is_banned, false) IS DISTINCT FROM COALESCE(NEW.is_banned, false) THEN
    PERFORM public.emit_admin_notification(
      ARRAY['customers'],
      'customer_ban_changed',
      'Customer access updated',
      v_name || ' account was ' || CASE WHEN NEW.is_banned THEN 'suspended' ELSE 'restored' END || '.',
      'profile',
      NEW.id,
      jsonb_build_object('old_is_banned', OLD.is_banned, 'new_is_banned', NEW.is_banned, 'email', NEW.email)
    );
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_profile_admin_event ON public.profiles;
CREATE TRIGGER trg_notify_profile_admin_event
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_profile_admin_event();
