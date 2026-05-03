/*
  # Support / Grievance System

  Adds a ticket-based customer support workflow with:
  - multiple request types (grievance, issue, report, support)
  - SLA tracking via automatic due date assignment
  - threaded ticket messages
  - role-based access (customer vs admin/support staff)
*/

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START 1;
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('grievance', 'issue', 'report', 'support')),
  category text NOT NULL CHECK (category IN (
    'delivery_delay',
    'damaged_item',
    'missing_item',
    'wrong_item',
    'quality_issue',
    'payment_issue',
    'refund_request',
    'return_request',
    'app_issue',
    'other'
  )),
  subject text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
  sla_hours integer NOT NULL DEFAULT 48,
  sla_due_at timestamptz NOT NULL,
  first_response_at timestamptz,
  resolved_at timestamptz,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_rating integer CHECK (customer_rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('customer', 'support', 'system')),
  is_internal boolean NOT NULL DEFAULT false,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order_id ON public.support_tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_due_at ON public.support_tickets(sla_due_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON public.support_tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id_created_at ON public.support_ticket_messages(ticket_id, created_at);
CREATE OR REPLACE FUNCTION public.compute_support_sla_hours(p_request_type text, p_priority text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base_hours integer;
BEGIN
  CASE p_request_type
    WHEN 'grievance' THEN base_hours := 72;
    WHEN 'issue' THEN base_hours := 48;
    WHEN 'report' THEN base_hours := 24;
    ELSE base_hours := 24;
  END CASE;

  CASE p_priority
    WHEN 'urgent' THEN RETURN GREATEST(12, base_hours / 2);
    WHEN 'high' THEN RETURN GREATEST(24, (base_hours * 3) / 4);
    WHEN 'low' THEN RETURN LEAST(120, base_hours + 24);
    ELSE RETURN base_hours;
  END CASE;
END;
$$;
CREATE OR REPLACE FUNCTION public.support_tickets_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_seq bigint;
BEGIN
  IF NEW.ticket_number IS NULL OR length(trim(NEW.ticket_number)) = 0 THEN
    next_seq := nextval('public.support_ticket_number_seq');
    NEW.ticket_number := 'SUP-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(next_seq::text, 5, '0');
  END IF;

  NEW.sla_hours := public.compute_support_sla_hours(NEW.request_type, NEW.priority);
  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := now() + make_interval(hours => NEW.sla_hours);
  END IF;

  IF NEW.status IN ('resolved', 'closed') AND NEW.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.support_tickets_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.request_type <> OLD.request_type OR NEW.priority <> OLD.priority THEN
    NEW.sla_hours := public.compute_support_sla_hours(NEW.request_type, NEW.priority);

    IF OLD.status IN ('open', 'in_progress', 'waiting_customer') THEN
      NEW.sla_due_at := COALESCE(OLD.created_at, now()) + make_interval(hours => NEW.sla_hours);
    END IF;
  END IF;

  IF NEW.status IN ('resolved', 'closed') AND OLD.resolved_at IS NULL THEN
    NEW.resolved_at := now();
  ELSIF NEW.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at := NULL;
  END IF;

  IF NEW.first_response_at IS NULL AND OLD.first_response_at IS NULL AND NEW.status IN ('in_progress', 'waiting_customer', 'resolved', 'closed') THEN
    NEW.first_response_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_support_tickets_before_insert ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_before_insert
BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_before_insert();
DROP TRIGGER IF EXISTS trg_support_tickets_before_update ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_before_update
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_before_update();
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
-- Customers can access only their own tickets.
CREATE POLICY "Customers can read own support tickets"
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Customers can create own support tickets"
  ON public.support_tickets
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Customers can update own support tickets"
  ON public.support_tickets
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid() AND
    status IN ('open', 'waiting_customer', 'closed')
  );
-- Admins and support-module employees can fully manage tickets.
CREATE POLICY "Support staff can manage support tickets"
  ON public.support_tickets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.employee_modules em ON em.employee_id = e.id
      WHERE e.profile_id = auth.uid()
        AND e.is_active = true
        AND em.module = 'support'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.employee_modules em ON em.employee_id = e.id
      WHERE e.profile_id = auth.uid()
        AND e.is_active = true
        AND em.module = 'support'
    )
  );
CREATE POLICY "Customers can read own support messages"
  ON public.support_ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.user_id = auth.uid()
    )
    AND is_internal = false
  );
CREATE POLICY "Customers can add own support messages"
  ON public.support_ticket_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.user_id = auth.uid()
    )
    AND author_id = auth.uid()
    AND author_role = 'customer'
    AND is_internal = false
  );
CREATE POLICY "Support staff can manage support messages"
  ON public.support_ticket_messages
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.employee_modules em ON em.employee_id = e.id
      WHERE e.profile_id = auth.uid()
        AND e.is_active = true
        AND em.module = 'support'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.employee_modules em ON em.employee_id = e.id
      WHERE e.profile_id = auth.uid()
        AND e.is_active = true
        AND em.module = 'support'
    )
  );
