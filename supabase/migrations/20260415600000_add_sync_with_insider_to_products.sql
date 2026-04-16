/*
  # Add sync_with_insider flag to products

  When true, this product's quantity and availability status are driven by
  Insider inventory (hatvoni_inventory / hatvoni_inventory_lots) rather than
  the manual stock_quantity field.

  The product's `key` column must match a `tag_key` in hatvoni_inventory for
  the sync to work.
*/

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sync_with_insider boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.sync_with_insider IS
  'When true, stock quantity and availability are sourced from Insider inventory '
  '(hatvoni_inventory). The product key must match a tag_key in hatvoni_inventory.';

-- Index for quick filtering of synced products
CREATE INDEX IF NOT EXISTS idx_products_sync_with_insider
  ON public.products (sync_with_insider)
  WHERE sync_with_insider = true;
