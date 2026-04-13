
-- Add product layout metadata columns
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'layout_variant'
  ) THEN
    ALTER TABLE products ADD COLUMN layout_variant text DEFAULT 'auto';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'layout_sort_order'
  ) THEN
    ALTER TABLE products ADD COLUMN layout_sort_order integer DEFAULT 999;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'layout_locked'
  ) THEN
    ALTER TABLE products ADD COLUMN layout_locked boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'layout_section'
  ) THEN
    ALTER TABLE products ADD COLUMN layout_section text DEFAULT 'cycle';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_layout_section ON products(layout_section);
CREATE INDEX IF NOT EXISTS idx_products_layout_sort_order ON products(layout_sort_order);
;
