/*
  # Seed additional demo catalog

  Adds more demo products and demo lots for richer storefront testing.
  - Upserts additional demo products by key
  - Inserts additional demo lots if missing
  - Inserts lot item mappings if missing
*/

WITH additional_products AS (
  SELECT *
  FROM (
    VALUES
      (
        'smoked-bamboo-shoot',
        'Smoked Bamboo Shoot',
        'Slow-smoked bamboo shoot with deep aroma for authentic Assamese preparations.',
        260.00::numeric(10,2),
        'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=80',
        'Traditional Ingredients',
        140,
        'demo-smoked-bamboo-shoot'
      ),
      (
        'bhut-jolokia-pickle',
        'Bhut Jolokia Pickle',
        'Fiery king-chili pickle balanced with mustard oil and regional spices.',
        280.00::numeric(10,2),
        'https://images.unsplash.com/photo-1473093226795-af9932fe5856?auto=format&fit=crop&w=1200&q=80',
        'Pickles',
        100,
        'demo-bhut-jolokia-pickle'
      ),
      (
        'joha-rice-premium',
        'Joha Rice Premium',
        'Aromatic joha rice selected for festive and daily Assamese cooking.',
        520.00::numeric(10,2),
        'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=1200&q=80',
        'Rice',
        180,
        'demo-joha-rice-premium'
      ),
      (
        'black-sesame-laddu',
        'Black Sesame Laddu',
        'Traditional sweet bites made with roasted sesame and jaggery.',
        190.00::numeric(10,2),
        'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=80',
        'Traditional Sweets',
        130,
        'demo-black-sesame-laddu'
      ),
      (
        'axomiya-tea-blend',
        'Axomiya Tea Blend',
        'Robust Assam tea blend with malty notes and a bright finish.',
        340.00::numeric(10,2),
        'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=1200&q=80',
        'Beverages',
        220,
        'demo-axomiya-tea-blend'
      ),
      (
        'mustard-oil-cold-pressed',
        'Cold Pressed Mustard Oil',
        'Locally sourced mustard oil for classic northeastern flavor profiles.',
        300.00::numeric(10,2),
        'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=1200&q=80',
        'Cooking Essentials',
        160,
        'demo-mustard-oil-cold-pressed'
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
    ap.key,
    ap.name,
    ap.description,
    ap.price,
    ap.image_url,
    ap.category,
    ap.stock_quantity,
    true,
    'active',
    ap.external_product_id
  FROM additional_products ap
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
  RETURNING id
)
SELECT count(*) FROM upsert_products;

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
  x.lot_name,
  x.description,
  x.price,
  x.status,
  p.id,
  x.image_url,
  now(),
  now()
FROM (
  VALUES
    (
      'Northeast Pantry Starter',
      'Balanced lot for everyday Assamese home cooking essentials.',
      849.00::numeric(10,2),
      'active',
      'smoked-bamboo-shoot',
      'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Spice Heat Collection',
      'A bold bundle for spice lovers and adventurous eaters.',
      999.00::numeric(10,2),
      'active',
      'bhut-jolokia-pickle',
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Festive Assam Hamper',
      'Celebration-ready assortment for gifting and family gatherings.',
      1499.00::numeric(10,2),
      'active',
      'joha-rice-premium',
      'https://images.unsplash.com/photo-1516684732162-798a0062be99?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Tea And Treats Box',
      'Comfort combo with premium tea and traditional sweets.',
      799.00::numeric(10,2),
      'active',
      'axomiya-tea-blend',
      'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Grand Assamese Kitchen Set',
      'Comprehensive bundle combining staples, heat, and heritage flavors.',
      1999.00::numeric(10,2),
      'active',
      'mustard-oil-cold-pressed',
      'https://images.unsplash.com/photo-1466637574441-749b8f19452f?auto=format&fit=crop&w=1200&q=80'
    )
) AS x(lot_name, description, price, status, source_product_key, image_url)
JOIN public.products p ON p.key = x.source_product_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lots l
  WHERE l.lot_name = x.lot_name
);

INSERT INTO public.lot_items (lot_id, product_key, quantity, created_at)
SELECT l.id, x.product_key, x.quantity, now()
FROM (
  VALUES
    ('Northeast Pantry Starter', 'smoked-bamboo-shoot', 1),
    ('Northeast Pantry Starter', 'mustard-oil-cold-pressed', 1),
    ('Northeast Pantry Starter', 'jorhat-spice-mix', 1),

    ('Spice Heat Collection', 'bhut-jolokia-pickle', 1),
    ('Spice Heat Collection', 'smoked-bamboo-shoot', 1),
    ('Spice Heat Collection', 'jorhat-spice-mix', 1),

    ('Festive Assam Hamper', 'joha-rice-premium', 1),
    ('Festive Assam Hamper', 'kola-khar', 1),
    ('Festive Assam Hamper', 'matimah-khar', 1),
    ('Festive Assam Hamper', 'black-sesame-laddu', 2),

    ('Tea And Treats Box', 'axomiya-tea-blend', 1),
    ('Tea And Treats Box', 'black-sesame-laddu', 2),

    ('Grand Assamese Kitchen Set', 'mustard-oil-cold-pressed', 1),
    ('Grand Assamese Kitchen Set', 'joha-rice-premium', 1),
    ('Grand Assamese Kitchen Set', 'smoked-bamboo-shoot', 1),
    ('Grand Assamese Kitchen Set', 'bhut-jolokia-pickle', 1),
    ('Grand Assamese Kitchen Set', 'khardwi-khar', 1)
) AS x(lot_name, product_key, quantity)
JOIN public.lots l ON l.lot_name = x.lot_name
JOIN public.products p ON p.key = x.product_key
WHERE NOT EXISTS (
  SELECT 1
  FROM public.lot_items li
  WHERE li.lot_id = l.id
    AND li.product_key = x.product_key
);;
