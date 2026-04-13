ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS apply_priority integer NOT NULL DEFAULT 100;

UPDATE public.coupons
SET apply_priority = CASE
  WHEN type = 'FIXED' THEN 10
  WHEN type = 'PERCENTAGE' THEN 20
  WHEN type = 'BOGO' THEN 30
  WHEN type = 'FREE_SHIPPING' THEN 40
  ELSE 100
END
WHERE apply_priority = 100;

CREATE INDEX IF NOT EXISTS idx_coupons_apply_priority ON public.coupons(apply_priority);;
