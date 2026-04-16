/*
  # Enforce sync_with_insider only for own-seller products

  sync_with_insider = true is only meaningful (and allowed) when the product
  is assigned to an own seller (profiles.is_own_seller = true).

  PostgreSQL does not allow subqueries in CHECK constraints, so this is
  enforced via a BEFORE trigger instead.
*/

CREATE OR REPLACE FUNCTION public.check_sync_with_insider_own_seller()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only validate when sync_with_insider is being turned on
  IF NEW.sync_with_insider = true AND NEW.seller_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = NEW.seller_id
        AND is_own_seller = true
    ) THEN
      RAISE EXCEPTION 'sync_with_insider can only be enabled for products assigned to an own seller (is_own_seller = true)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_sync_with_insider_own_seller ON public.products;

CREATE TRIGGER trg_check_sync_with_insider_own_seller
  BEFORE INSERT OR UPDATE OF sync_with_insider, seller_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.check_sync_with_insider_own_seller();
