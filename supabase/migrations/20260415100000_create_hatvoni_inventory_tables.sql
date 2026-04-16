-- ============================================================
-- hatvoni_inventory: tag-level summary (one row per product tag)
-- Synced from Insider DB via receive-inventory-sync edge function.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hatvoni_inventory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_key             text NOT NULL UNIQUE,
  display_name        text NOT NULL,
  unit                text NOT NULL DEFAULT 'unit',
  total_qty_available numeric NOT NULL DEFAULT 0,
  lot_count           int NOT NULL DEFAULT 0,
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hatvoni_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage hatvoni_inventory" ON public.hatvoni_inventory;
CREATE POLICY "Admins can manage hatvoni_inventory"
  ON public.hatvoni_inventory
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- ============================================================
-- hatvoni_inventory_lots: lot-level detail (one row per batch lot)
-- Captures batch_reference, output_size, unit, production_date from Insider.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hatvoni_inventory_lots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_key             text NOT NULL REFERENCES public.hatvoni_inventory(tag_key) ON DELETE CASCADE,
  insider_lot_id      text NOT NULL UNIQUE,   -- processed_goods.id from Insider
  batch_reference     text NOT NULL,          -- e.g. LOT-PG-001
  product_type        text NOT NULL,          -- e.g. "Banana Alkyl Liquid"
  qty_available       numeric NOT NULL DEFAULT 0,
  unit                text NOT NULL DEFAULT 'unit',
  output_size         numeric,                -- e.g. 250
  output_size_unit    text,                   -- e.g. ml, g
  production_date     date,
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hatvoni_inventory_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage hatvoni_inventory_lots" ON public.hatvoni_inventory_lots;
CREATE POLICY "Admins can manage hatvoni_inventory_lots"
  ON public.hatvoni_inventory_lots
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_hatvoni_inventory_tag_key ON public.hatvoni_inventory (tag_key);
CREATE INDEX IF NOT EXISTS idx_hatvoni_inventory_lots_tag_key ON public.hatvoni_inventory_lots (tag_key);
CREATE INDEX IF NOT EXISTS idx_hatvoni_inventory_lots_insider_lot_id ON public.hatvoni_inventory_lots (insider_lot_id);
