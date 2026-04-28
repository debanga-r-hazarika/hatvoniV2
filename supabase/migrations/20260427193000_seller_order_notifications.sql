/*
  # Seller notifications for purchased products

  Third-party sellers receive notifications when their products are bought,
  so they can confirm/reject in seller panel.
*/

CREATE TABLE IF NOT EXISTS public.seller_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_notifications_recipient_created
  ON public.seller_notifications(recipient_seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_seller_notifications_recipient_unread
  ON public.seller_notifications(recipient_seller_id, is_read)
  WHERE is_read = false;

ALTER TABLE public.seller_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can read own notifications" ON public.seller_notifications;
CREATE POLICY "Sellers can read own notifications"
  ON public.seller_notifications
  FOR SELECT
  TO authenticated
  USING (recipient_seller_id = auth.uid());

DROP POLICY IF EXISTS "Sellers can mark own notifications" ON public.seller_notifications;
CREATE POLICY "Sellers can mark own notifications"
  ON public.seller_notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_seller_id = auth.uid())
  WITH CHECK (recipient_seller_id = auth.uid());

DROP POLICY IF EXISTS "Service role can insert seller notifications" ON public.seller_notifications;
CREATE POLICY "Service role can insert seller notifications"
  ON public.seller_notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.notify_sellers_for_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_display_id text;
BEGIN
  v_display_id := UPPER(REPLACE(COALESCE(NEW.id::text, ''), '-', ''));
  v_display_id := 'ORD-' || LEFT(v_display_id, 8);

  WITH direct_sellers AS (
    SELECT DISTINCT p.seller_id AS seller_id
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = NEW.id
      AND p.seller_id IS NOT NULL
  ),
  lot_sellers AS (
    SELECT DISTINCT p.seller_id AS seller_id
    FROM public.order_items oi
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(oi.lot_snapshot, '[]'::jsonb)) ls
    JOIN public.products p ON p.key = (ls->>'product_key')
    WHERE oi.order_id = NEW.id
      AND p.seller_id IS NOT NULL
  ),
  all_sellers AS (
    SELECT seller_id FROM direct_sellers
    UNION
    SELECT seller_id FROM lot_sellers
  ),
  third_party_sellers AS (
    SELECT DISTINCT s.seller_id
    FROM all_sellers s
    JOIN public.profiles pr ON pr.id = s.seller_id
    WHERE pr.is_seller = true
      AND COALESCE(pr.is_own_seller, false) = false
  )
  INSERT INTO public.seller_notifications (
    recipient_seller_id,
    event_type,
    title,
    message,
    order_id,
    meta
  )
  SELECT
    tps.seller_id,
    'seller_order_received',
    'New order for your products',
    'Order ' || v_display_id || ' contains your product(s). Please review and confirm.',
    NEW.id,
    jsonb_build_object('order_id', NEW.id, 'display_id', v_display_id)
  FROM third_party_sellers tps;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_sellers_for_new_order ON public.orders;
CREATE TRIGGER trg_notify_sellers_for_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_sellers_for_new_order();
