-- Visible order numbers for customer/admin UIs while preserving UUID internals.
-- Format:
--   orders.display_order_id: HAT100001 ... HAT999999
--   order_items.line_number: 1..N (displayed in UI as -I, -II, ...)

CREATE SEQUENCE IF NOT EXISTS public.order_display_seq START WITH 100001 MINVALUE 100001 MAXVALUE 999999;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS display_order_id text;
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS line_number integer;
CREATE OR REPLACE FUNCTION public.assign_display_order_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.display_order_id, '') = '' THEN
    NEW.display_order_id := 'HAT' || nextval('public.order_display_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assign_display_order_id ON public.orders;
CREATE TRIGGER trg_assign_display_order_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_display_order_id();
CREATE OR REPLACE FUNCTION public.assign_order_item_line_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NEW.line_number IS NULL OR NEW.line_number <= 0 THEN
    SELECT COALESCE(MAX(oi.line_number), 0) + 1
      INTO v_next
    FROM public.order_items oi
    WHERE oi.order_id = NEW.order_id;
    NEW.line_number := v_next;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_assign_order_item_line_number ON public.order_items;
CREATE TRIGGER trg_assign_order_item_line_number
  BEFORE INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_item_line_number();
UPDATE public.orders
SET display_order_id = 'HAT' || nextval('public.order_display_seq')::text
WHERE COALESCE(display_order_id, '') = '';
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.order_items
)
UPDATE public.order_items oi
SET line_number = ranked.rn
FROM ranked
WHERE oi.id = ranked.id
  AND (oi.line_number IS NULL OR oi.line_number <= 0);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_display_order_id_unique
  ON public.orders(display_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_order_line_number_unique
  ON public.order_items(order_id, line_number);
