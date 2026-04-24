-- Add velocity_fulfillment jsonb to order_shipments so per-lot serviceability
-- snapshots (carriers, dims, pickup) can be restored on page reload.
ALTER TABLE public.order_shipments
  ADD COLUMN IF NOT EXISTS velocity_fulfillment jsonb;
