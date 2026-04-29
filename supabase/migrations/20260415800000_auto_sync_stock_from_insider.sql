/*
  # Auto-sync stock_quantity from Insider inventory

  When hatvoni_inventory is inserted or updated, automatically push
  total_qty_available → stock_quantity (and is_active based on stock)
  for every product where:
    - sync_with_insider = true
    - key = hatvoni_inventory.tag_key

  This means the moment receive-inventory-sync upserts hatvoni_inventory,
  the product's stock_quantity is immediately up to date — no manual step needed.
*/

-- ─── Trigger function ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_product_stock_from_insider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.products
  SET
    stock_quantity = FLOOR(NEW.total_qty_available)::integer,
    -- keep is_active in sync: out-of-stock → inactive, back in stock → active
    is_active = CASE
      WHEN NEW.total_qty_available > 0 THEN true
      ELSE false
    END,
    updated_at = now()
  WHERE sync_with_insider = true
    AND key = NEW.tag_key;

  RETURN NEW;
END;
$$;
-- ─── Attach trigger to hatvoni_inventory ─────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sync_product_stock_from_insider ON public.hatvoni_inventory;
CREATE TRIGGER trg_sync_product_stock_from_insider
  AFTER INSERT OR UPDATE OF total_qty_available
  ON public.hatvoni_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_stock_from_insider();
-- ─── Back-fill: sync current inventory into products right now ───────────────
-- Runs once at migration time so existing products are immediately correct.

UPDATE public.products p
SET
  stock_quantity = FLOOR(hi.total_qty_available)::integer,
  is_active      = CASE WHEN hi.total_qty_available > 0 THEN true ELSE false END,
  updated_at     = now()
FROM public.hatvoni_inventory hi
WHERE p.sync_with_insider = true
  AND p.key = hi.tag_key;
