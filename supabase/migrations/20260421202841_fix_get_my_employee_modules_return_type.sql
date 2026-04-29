-- Drop and recreate get_my_employee_modules with SETOF text return type
-- PostgREST wraps text[] as [{"get_my_employee_modules": [...]}] which the
-- frontend cannot map directly. SETOF text returns a flat ["mod1","mod2"] array.

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
$$;;
