alter table public.products
  add column if not exists magnetic_title text,
  add column if not exists magnetic_text text;

create index if not exists idx_products_magnetic_title on public.products (magnetic_title);;
