-- Velocity public tracking URL + last snapshot from /order-tracking (customer + admin UI).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS velocity_tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS velocity_tracking_snapshot JSONB DEFAULT NULL;
COMMENT ON COLUMN public.orders.velocity_tracking_url IS 'Carrier / Velocity tracking page URL from API or webhook.';
COMMENT ON COLUMN public.orders.velocity_tracking_snapshot IS 'Latest tracking: activities array, shipment_status, track_url (JSON).';
