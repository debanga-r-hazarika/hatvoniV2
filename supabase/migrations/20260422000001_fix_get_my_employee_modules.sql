/*
  # Fix get_my_employee_modules return type

  The original function returned text[] which PostgREST wraps as a single-row
  object: [{"get_my_employee_modules": ["orders","inventory"]}]
  The frontend expected a flat string array: ["orders","inventory"]

  Changing to SETOF text makes PostgREST return the flat array directly.
*/

DROP FUNCTION IF EXISTS public.get_my_employee_modules();
CREATE FUNCTION public.get_my_employee_modules()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT em.module
  FROM   public.employee_modules em
  JOIN   public.employees e ON e.id = em.employee_id
  WHERE  e.profile_id = auth.uid()
    AND  e.is_active  = true
$$;
