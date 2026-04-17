ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS auto_apply boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_coupons_auto_apply ON public.coupons(auto_apply);

UPDATE public.coupons
SET auto_apply = true
WHERE code IN ('WELCOME100', 'SAVE10');

CREATE OR REPLACE FUNCTION public.validate_coupon_code(
  p_coupon_code text,
  p_user_id uuid,
  p_cart_value numeric,
  p_cart_items jsonb
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon RECORD;
  v_user_used_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Authentication required',
      'code', 'UNAUTHORIZED'
    );
  END IF;

  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    p_user_id := auth.uid();
  END IF;

  SELECT * INTO v_coupon FROM public.coupons
  WHERE LOWER(code) = LOWER(p_coupon_code)
  LIMIT 1;

  IF v_coupon IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Coupon code not found',
      'code', 'COUPON_NOT_FOUND'
    );
  END IF;

  IF v_coupon.status != 'active' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Coupon is not active',
      'code', 'COUPON_INACTIVE'
    );
  END IF;

  IF v_coupon.valid_from IS NOT NULL AND v_coupon.valid_from > now() THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Coupon is not yet valid',
      'code', 'COUPON_NOT_STARTED'
    );
  END IF;

  IF v_coupon.valid_till IS NOT NULL AND v_coupon.valid_till <= now() THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Coupon has expired',
      'code', 'COUPON_EXPIRED'
    );
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Coupon usage limit exceeded',
      'code', 'COUPON_LIMIT_EXCEEDED'
    );
  END IF;

  SELECT COUNT(*) INTO v_user_used_count FROM public.coupon_usage
  WHERE coupon_id = v_coupon.id AND user_id = p_user_id;

  IF v_user_used_count >= COALESCE(v_coupon.max_uses_per_user, 1) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'You have already used this coupon',
      'code', 'COUPON_ALREADY_USED'
    );
  END IF;

  IF v_coupon.minimum_cart_value IS NOT NULL AND p_cart_value < v_coupon.minimum_cart_value THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Cart value is below minimum required',
      'code', 'CART_VALUE_TOO_LOW',
      'min_required', v_coupon.minimum_cart_value
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'type', v_coupon.type,
    'display_name', v_coupon.display_name,
    'description', v_coupon.description,
    'discount_amount', v_coupon.discount_amount,
    'discount_percentage', v_coupon.discount_percentage,
    'max_discount_amount', v_coupon.max_discount_amount,
    'bogo_buy_qty', v_coupon.bogo_buy_qty,
    'bogo_get_qty', v_coupon.bogo_get_qty,
    'is_stackable', v_coupon.is_stackable,
    'auto_apply', COALESCE(v_coupon.auto_apply, false),
    'apply_priority', v_coupon.apply_priority,
    'applies_to_shipping', COALESCE(v_coupon.applies_to_shipping, false),
    'applicable_product_ids', v_coupon.applicable_product_ids,
    'applicable_categories', v_coupon.applicable_categories,
    'exclude_product_ids', v_coupon.exclude_product_ids,
    'exclude_categories', v_coupon.exclude_categories
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.validate_coupon_code TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_coupon_code FROM anon;
