-- Migration: Add Velocity Shipping columns to orders table
-- Run this in your Supabase SQL editor or via supabase db push

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS velocity_shipment_id   TEXT,
  ADD COLUMN IF NOT EXISTS velocity_awb            TEXT,
  ADD COLUMN IF NOT EXISTS velocity_label_url      TEXT,
  ADD COLUMN IF NOT EXISTS velocity_carrier_name   TEXT;

-- Index for looking up orders by velocity shipment ID
CREATE INDEX IF NOT EXISTS idx_orders_velocity_shipment_id
  ON public.orders (velocity_shipment_id)
  WHERE velocity_shipment_id IS NOT NULL;

-- Add 'shipment_created' to the order_workflow_log event types (no-op if already flexible)
-- If you have a CHECK constraint on event_type, run:
-- ALTER TABLE public.order_workflow_log DROP CONSTRAINT IF EXISTS order_workflow_log_event_type_check;
