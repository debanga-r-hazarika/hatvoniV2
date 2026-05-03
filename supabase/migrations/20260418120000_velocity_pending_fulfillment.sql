-- Persist Velocity forward-order draft (before AWB) so admins can resume, refresh safely, and avoid duplicate SHI creation.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS velocity_pending_shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS velocity_fulfillment JSONB DEFAULT NULL;
COMMENT ON COLUMN public.orders.velocity_pending_shipment_id IS 'Velocity SHI… id after forward-order API; cleared after assign or draft cancel.';
COMMENT ON COLUMN public.orders.velocity_fulfillment IS 'Snapshot: pickup, dimensions, serviceability summary for UI resume.';
CREATE INDEX IF NOT EXISTS idx_orders_velocity_pending_shipment_id
  ON public.orders (velocity_pending_shipment_id)
  WHERE velocity_pending_shipment_id IS NOT NULL;
