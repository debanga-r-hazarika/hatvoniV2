-- Add is_own_seller flag to profiles table.
-- This allows admins to explicitly mark a seller as an in-house / own seller
-- (previously this was inferred from the seller's name/email containing "hatvoni").

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_own_seller boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.is_own_seller IS
  'When true, this seller is treated as an in-house / own seller (e.g. Hatvoni Heritage). '
  'Own sellers skip the manual approve/reject decision flow for order items.';
