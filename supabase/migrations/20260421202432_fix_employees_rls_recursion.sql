-- Fix infinite recursion: employees and employee_modules RLS policies
-- use inline `SELECT is_admin FROM profiles` which re-triggers profiles RLS.
-- Replace with is_admin() SECURITY DEFINER function which bypasses RLS.

-- ── employees table ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage employees" ON public.employees;
CREATE POLICY "Admins can manage employees"
  ON public.employees
  FOR ALL
  TO authenticated
  USING   (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);

-- ── employee_modules table ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage employee modules" ON public.employee_modules;
CREATE POLICY "Admins can manage employee modules"
  ON public.employee_modules
  FOR ALL
  TO authenticated
  USING   (public.is_admin() = true)
  WITH CHECK (public.is_admin() = true);;
