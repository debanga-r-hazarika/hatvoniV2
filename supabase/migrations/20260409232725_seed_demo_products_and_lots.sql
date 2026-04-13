/*
  # Seed demo products and demo lots

  Adds customer-facing demo catalog data for local/dev use.
  - Upserts demo products by `key`
  - Creates demo lots by `lot_name` if missing
  - Creates lot_items links if missing
*/

WITH demo_products AS (
  SELECT *
  FROM (
    VALUES
      (
        'kola-khar',
        'Kola Khar',
        'Traditional alkaline extract made from sun-dried banana peels. A classic Assamese pantry essential.',
        450.00::numeric(10,2),
        'https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=1200&q=80',
        'Traditional Khar',
        120,
        'demo-kola-khar'
      ),
      (
        'matimah-khar',
        'Matimah Khar',
        'Earthy and smooth alkaline preparation crafted for hearty curries and seasonal vegetables.',
        390.00::numeric(10,2),
        'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80',
        'Traditional Khar',
        90,
        'demo-matimah-khar'
      ),
      (
        'khardwi-khar',
        'Khardwi Khar',
        'A lighter, beginner-friendly khar profile with balanced strength and clean finish.',
        330.00::numeric(10,2),
        'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1200&q=80',
        'Traditional Khar',
        110,
        'demo-khardwi-khar'
      ),
      (
        'jorhat-spice-mix',
        'Jorhat Spice Mix',
        'Small-batch spice blend designed to pair with khar recipes and Assamese comfort food.',
        210.00::numeric(10,2),
        'https://images.unsplash.com/photo-1532336414038-cf19250c5757?auto=format&fit=crop&w=1200&q=80',
        'Spice Blend',
        150,
        'demo-jorhat-spice-mix'
      )
  ) AS v(
    key,
    name,
    description,
    price,
    image_url,
    category,
    stock_quantity,
    external_product_id
  )
),
upsert_products AS (
  INSERT INTO public.products (
    key,
    name,
    description,
    price,
    image_url,
    category,
    stock_quantity,
    is_active,
    status,
    external_product_id
  )
  SELECT
    d.key,
    d.name,
    d.description,
    d.price,
    d.image_url,
    d.category,
    d.stock_quantity,
    true,
    'active',
    d.external_product_id
  FROM demo_products d
  ON CONFLICT (key) DO UPDATE
    SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      price = EXCLUDED.price,
      image_url = EXCLUDED.image_url,
      category = EXCLUDED.category,
      stock_quantity = EXCLUDED.stock_quantity,
      is_active = true,
      status = 'active',
      external_product_id = EXCLUDED.external_product_id,
      updated_at = now()
  RETURNING id, key
),
all_demo_products AS (
  SELECT p.id, p.key
  FROM public.products p
  JOIN demo_products d ON d.key = p.key
),
demo_lots AS (
  SELECT *
  FROM (
    VALUES
      (
        'Assam Starter Khar Kit',
        'A curated starter lot for first-time buyers with one core khar and one spice companion.',
        599.00::numeric(10,2),
        'active',
        'kola-khar',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80'
      ),
      (
        'Family Khar Combo',
        'A value bundle designed for family cooking with multiple khar styles.',
        999.00::numeric(10,2),
        'active',
        'matimah-khar',
        'https://images.unsplash.com/photo-1495195134817-aeb325a55b65?auto=format&fit=crop&w=1200&q=80'
      ),
      (
        'Heritage Premium Lot',
        'Premium assortment combining traditional flavors with everyday utility.',
        1249.00::numeric(10,2),
        'active',
        'khardwi-khar',
        'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1200&q=80'
      )
  ) AS v(
    lot_name,
    description,
    price,
    status,
    source_product_key,
    image_url
  )
),
insert_lots AS (
  INSERT INTO public.lots (
    lot_name,
    description,
    price,
    status,
    source_product_id,
    image_url,
    created_at,
    updated_at
  )
  SELECT
    dl.lot_name,
    dl.description,
    dl.price,
    dl.status,
    ap.id,
    dl.image_url,
    now(),
    now()
  FROM demo_lots dl
  JOIN all_demo_products ap ON ap.key = dl.source_product_key
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.lots l
    WHERE l.lot_name = dl.lot_name
  )
  RETURNING id, lot_name
)
SELECT 1;

INSERT INTO public.lot_items (lot_id, product_key, quantity, created_at)
SELECT l.id, x.product_key, x.quantity, now()
FROM (
  VALUES
    ('Assam Starter Khar Kit', 'kola-khar', 1),
    ('Assam Starter Khar Kit', 'jorhat-spice-mix', 1),
    ('Family Khar Combo', 'kola-khar', 1),
    ('Family Khar Combo', 'matimah-khar', 1),
    ('Family Khar Combo', 'jorhat-spice-mix', 2),
    ('Heritage Premium Lot', 'kola-khar', 1),
    ('Heritage Premium Lot', 'matimah-khar', 1),
    ('Heritage Premium Lot', 'khardwi-khar', 1),
    ('Heritage Premium Lot', 'jorhat-spice-mix', 2)
) AS x(lot_name, product_key, quantity)
JOIN public.lots l ON l.lot_name = x.lot_name
JOIN public.products p ON p.key = x.product_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lot_items li
  WHERE li.lot_id = l.id
    AND li.product_key = x.product_key
);;
