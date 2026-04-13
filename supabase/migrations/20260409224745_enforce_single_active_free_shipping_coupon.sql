CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_free_shipping_coupon
ON public.coupons(type)
WHERE type = 'FREE_SHIPPING' AND status = 'active';;
