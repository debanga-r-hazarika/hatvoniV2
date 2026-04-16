-- Add partial fulfillment tracking columns to customer site orders table
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partial_fulfillment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected_items      jsonb,
  ADD COLUMN IF NOT EXISTS confirmed_items     jsonb,
  ADD COLUMN IF NOT EXISTS refund_amount       numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status       text CHECK (refund_status IN ('not_required','pending','initiated','completed','failed'));
