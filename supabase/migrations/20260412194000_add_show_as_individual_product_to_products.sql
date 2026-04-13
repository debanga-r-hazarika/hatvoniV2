/*
  # Add individual listing visibility flag for products

  - Adds products.show_as_individual_product
  - Defaults to true for backward compatibility
  - Allows admins to hide products from direct product listings while keeping lot usage
*/

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS show_as_individual_product boolean;

UPDATE public.products
SET show_as_individual_product = true
WHERE show_as_individual_product IS NULL;

ALTER TABLE public.products
  ALTER COLUMN show_as_individual_product SET DEFAULT true;

ALTER TABLE public.products
  ALTER COLUMN show_as_individual_product SET NOT NULL;
