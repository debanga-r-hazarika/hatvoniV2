/*
  # Employee & Module Management System

  Allows the admin to promote registered customers to "employees" and assign
  them specific admin-panel modules they are allowed to access.

  1. New Tables
    - `employees`
        - `id`           (uuid PK)
        - `profile_id`   (uuid FK → profiles, unique – one employee record per user)
        - `added_by`     (uuid FK → profiles – the admin who promoted them)
        - `is_active`    (boolean – can be deactivated without removing the record)
        - `notes`        (text – optional internal notes)
        - `created_at`, `updated_at`

    - `employee_modules`
        - `id`           (uuid PK)
        - `employee_id`  (uuid FK → employees)
        - `module`       (text – e.g. 'orders', 'inventory', 'coupons', …)
        - `created_at`
        - UNIQUE (employee_id, module)

  2. Profiles helper
    - Add `is_employee` boolean column to profiles (fast lookup, kept in sync by trigger)

  3. Security
    - RLS: only admins can manage employees / modules
    - Employees can read their own employee record and assigned modules
*/

-- ─── employees table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employees (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  added_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employees_profile_id ON public.employees(profile_id);
CREATE INDEX IF NOT EXISTS idx_employees_is_active  ON public.employees(is_active) WHERE is_active = true;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins can manage employees"
  ON public.employees
  FOR ALL
  TO authenticated
  USING   ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- Employees: read their own record
CREATE POLICY "Employees can view own record"
  ON public.employees
  FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

-- ─── employee_modules table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  module      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, module)
);

CREATE INDEX IF NOT EXISTS idx_employee_modules_employee_id ON public.employee_modules(employee_id);

ALTER TABLE public.employee_modules ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "Admins can manage employee modules"
  ON public.employee_modules
  FOR ALL
  TO authenticated
  USING   ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- Employees: read their own modules
CREATE POLICY "Employees can view own modules"
  ON public.employee_modules
  FOR SELECT
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE profile_id = auth.uid()
    )
  );

-- ─── profiles: is_employee flag ──────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_employee boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_employee_true
  ON public.profiles(is_employee)
  WHERE is_employee = true;

-- Keep is_employee in sync automatically
CREATE OR REPLACE FUNCTION public.sync_employee_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET is_employee = true  WHERE id = NEW.profile_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET is_employee = false WHERE id = OLD.profile_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle deactivation: treat inactive as "not employee" for flag purposes
    IF NEW.is_active = false AND OLD.is_active = true THEN
      UPDATE public.profiles SET is_employee = false WHERE id = NEW.profile_id;
    ELSIF NEW.is_active = true AND OLD.is_active = false THEN
      UPDATE public.profiles SET is_employee = true  WHERE id = NEW.profile_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_employee_flag ON public.employees;
CREATE TRIGGER trg_sync_employee_flag
  AFTER INSERT OR UPDATE OR DELETE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.sync_employee_flag();

-- ─── helper function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_my_employee_modules()
RETURNS text[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT em.module
      FROM   public.employee_modules em
      JOIN   public.employees e ON e.id = em.employee_id
      WHERE  e.profile_id = auth.uid()
        AND  e.is_active  = true
    ),
    '{}'::text[]
  )
$$;
