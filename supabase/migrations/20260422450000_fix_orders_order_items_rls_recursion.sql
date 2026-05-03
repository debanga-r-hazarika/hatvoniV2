/*
  Infinite recursion on orders ↔ order_items RLS:
  - Policies that reference each other trigger 42P17 when selecting order_items or orders.
  - Fix: SECURITY DEFINER helpers with row_security = off for internal checks only.
*/

CREATE OR REPLACE FUNCTION public.auth_can_view_order_internal(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.user_id = uid) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND coalesce(p.is_admin, false) = true) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = uid AND coalesce(p.is_seller, false) = true) THEN
    IF EXISTS (
      SELECT 1
      FROM public.order_items oi
      LEFT JOIN public.products direct_product ON direct_product.id = oi.product_id
      LEFT JOIN public.lot_items li ON li.lot_id = oi.lot_id
      LEFT JOIN public.products lot_product ON lot_product.key = li.product_key
      WHERE oi.order_id = p_order_id
        AND (
          direct_product.seller_id = uid
          OR lot_product.seller_id = uid
        )
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.employee_modules em ON em.employee_id = e.id
    WHERE e.profile_id = uid
      AND e.is_active = true
      AND em.module IN ('orders', 'logistics', 'customers', 'sellers')
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
COMMENT ON FUNCTION public.auth_can_view_order_internal(uuid) IS
  'RLS bypass helper: whether the current session may see this order (owner, admin, seller line, employee modules).';
REVOKE ALL ON FUNCTION public.auth_can_view_order_internal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_view_order_internal(uuid) TO authenticated;
-- ─── Drop all SELECT policies on orders (recreate single policy) ─────────────

DROP POLICY IF EXISTS "Users can view own orders or admins can view all" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders or admins or sellers" ON public.orders;
DROP POLICY IF EXISTS "Employees can view orders for their module" ON public.orders;
DROP POLICY IF EXISTS "Employees can view orders for logistics module" ON public.orders;
DROP POLICY IF EXISTS "Employees can view orders for customers module" ON public.orders;
DROP POLICY IF EXISTS "Employees can view orders for sellers module" ON public.orders;
CREATE POLICY "Select orders when visible to current user"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.auth_can_view_order_internal(id));
-- ─── Drop all SELECT policies on order_items (recreate single policy) ─────────

DROP POLICY IF EXISTS "Users can view own order items or admins can view all" ON public.order_items;
DROP POLICY IF EXISTS "Users can view own order items or sellers can view their products" ON public.order_items;
DROP POLICY IF EXISTS "Users can view own order items or admins or sellers" ON public.order_items;
DROP POLICY IF EXISTS "Employees can view order items for their module" ON public.order_items;
DROP POLICY IF EXISTS "Employees can view order items for logistics module" ON public.order_items;
DROP POLICY IF EXISTS "Employees can view order items for customers module" ON public.order_items;
DROP POLICY IF EXISTS "Employees can view order items for sellers module" ON public.order_items;
CREATE POLICY "Select order_items when parent order is visible"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (public.auth_can_view_order_internal(order_id));
