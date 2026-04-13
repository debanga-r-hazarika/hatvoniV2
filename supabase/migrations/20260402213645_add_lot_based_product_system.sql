/*
  # Add lot-based product system

  1. Products become the internal catalog
    - Add products.key for Insider processed goods tag mapping
    - Add products.status for explicit lifecycle state

  2. Customer-facing lots
    - lots table for bundle catalog
    - lot_items table for product_key + quantity membership

  3. Order snapshots
    - order_items gain lot_id, lot_name, lot_snapshot

  4. Backfill
    - Create one starter lot per product so the customer catalog has content immediately
*/

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS key text,
  ADD COLUMN IF NOT EXISTS status text;

UPDATE public.products
SET key = COALESCE(NULLIF(key, ''), NULLIF(external_product_id, ''), id::text)
WHERE key IS NULL OR key = '';

UPDATE public.products
SET status = CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'inactive' END
WHERE status IS NULL OR status = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_key_unique'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_key_unique UNIQUE (key);
  END IF;
END $$;

ALTER TABLE public.products
  ALTER COLUMN key SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  source_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lot_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.lots(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.products(key) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lot_name text,
  ADD COLUMN IF NOT EXISTS lot_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_lots_status ON public.lots(status);
CREATE INDEX IF NOT EXISTS idx_lot_items_lot_id ON public.lot_items(lot_id);
CREATE INDEX IF NOT EXISTS idx_lot_items_product_key ON public.lot_items(product_key);
CREATE INDEX IF NOT EXISTS idx_order_items_lot_id ON public.order_items(lot_id);

INSERT INTO public.lots (lot_name, description, price, status, source_product_id, image_url, created_at, updated_at)
SELECT
  p.name,
  p.description,
  p.price,
  COALESCE(p.status, CASE WHEN COALESCE(p.is_active, true) THEN 'active' ELSE 'inactive' END),
  p.id,
  p.image_url,
  COALESCE(p.created_at, now()),
  COALESCE(p.updated_at, now())
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lots l
  WHERE l.source_product_id = p.id
);

INSERT INTO public.lot_items (lot_id, product_key, quantity, created_at)
SELECT
  l.id,
  p.key,
  1,
  now()
FROM public.lots l
JOIN public.products p ON p.id = l.source_product_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lot_items li
  WHERE li.lot_id = l.id
    AND li.product_key = p.key
);

UPDATE public.order_items oi
SET
  lot_id = l.id,
  lot_name = l.lot_name,
  lot_snapshot = jsonb_build_array(
    jsonb_build_object(
      'product_key', p.key,
      'product_name', p.name,
      'quantity', oi.quantity,
      'unit_price', oi.price,
      'unit', 'unit'
    )
  )
FROM public.products p
JOIN public.lots l ON l.source_product_id = p.id
WHERE oi.product_id = p.id
  AND oi.lot_id IS NULL;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lot_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Anyone can view active products'
  ) THEN
    CREATE POLICY "Anyone can view active products"
      ON public.products FOR SELECT
      USING (COALESCE(status, CASE WHEN COALESCE(is_active, true) THEN 'active' ELSE 'inactive' END) = 'active' OR auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Admins can manage products'
  ) THEN
    CREATE POLICY "Admins can manage products"
      ON public.products FOR ALL
      TO authenticated
      USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
      WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'Anyone can view active lots'
  ) THEN
    CREATE POLICY "Anyone can view active lots"
      ON public.lots FOR SELECT
      USING (status = 'active' OR auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lots' AND policyname = 'Admins can manage lots'
  ) THEN
    CREATE POLICY "Admins can manage lots"
      ON public.lots FOR ALL
      TO authenticated
      USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
      WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lot_items' AND policyname = 'Anyone can view lot items for active lots'
  ) THEN
    CREATE POLICY "Anyone can view lot items for active lots"
      ON public.lot_items FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.lots l
          WHERE l.id = lot_items.lot_id
            AND (l.status = 'active' OR auth.uid() IS NOT NULL)
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'lot_items' AND policyname = 'Admins can manage lot items'
  ) THEN
    CREATE POLICY "Admins can manage lot items"
      ON public.lot_items FOR ALL
      TO authenticated
      USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
      WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);
  END IF;
END $$;;
