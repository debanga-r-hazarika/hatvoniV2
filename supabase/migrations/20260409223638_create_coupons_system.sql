/*
  # Create Professional Coupon/Offer System

  1. New Tables
    - `coupons` - Master coupon definitions
    - `coupon_conditions` - Complex conditions like products, categories, values
    - `coupon_usage` - Track coupon usage per user

  2. Coupon Types
    - FIXED: Fixed amount discount
    - PERCENTAGE: Percentage-based discount
    - FREE_SHIPPING: Free delivery (ignores min/max discount amount)
    - BOGO: Buy One Get One variant

  3. Conditions
    - Minimum cart value
    - Maximum discount amount
    - Product-specific
    - Category-specific
    - Date/time based
    - Usage limits (global and per-user)

  4. Security
    - RLS policies for admin management and user usage tracking
*/

-- Create coupon type enum
DO $$ BEGIN
  CREATE TYPE coupon_type AS ENUM ('FIXED', 'PERCENTAGE', 'FREE_SHIPPING', 'BOGO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create coupon status enum
DO $$ BEGIN
  CREATE TYPE coupon_status AS ENUM ('active', 'inactive', 'scheduled', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Main coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text,
  description text,
  type coupon_type NOT NULL DEFAULT 'FIXED',
  status coupon_status NOT NULL DEFAULT 'active',
  
  -- Discount values
  discount_amount numeric(10,2),          -- For FIXED and BOGO types
  discount_percentage numeric(5,2),       -- For PERCENTAGE type (0-100)
  max_discount_amount numeric(10,2),      -- Maximum discount cap
  
  -- BOGO specific
  bogo_buy_qty integer DEFAULT 1,         -- Quantity to buy
  bogo_get_qty integer DEFAULT 1,         -- Quantity to get free
  
  -- Validity conditions
  minimum_cart_value numeric(10,2),       -- Minimum cart total to apply
  valid_from timestamptz,                 -- Coupon start date
  valid_till timestamptz,                 -- Coupon end date
  
  -- Usage limits
  max_uses integer,                       -- Global usage limit (NULL = unlimited)
  max_uses_per_user integer DEFAULT 1,    -- Per-user usage limit
  current_uses integer DEFAULT 0,         -- Track global usage
  
  -- Applicability
  applicable_product_ids uuid[],          -- Specific lot/product IDs (NULL = all)
  applicable_categories text[],           -- Specific categories (NULL = all)
  exclude_product_ids uuid[],             -- Exclude specific products
  exclude_categories text[],              -- Exclude specific categories
  
  -- Additional flags
  is_stackable boolean DEFAULT false,     -- Can be combined with other coupons
  applies_to_shipping boolean DEFAULT false, -- If PERCENTAGE, also apply to shipping
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Coupon usage tracking table
CREATE TABLE IF NOT EXISTS public.coupon_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  discount_applied numeric(10,2),
  
  -- For auditing
  cart_value_at_usage numeric(10,2),
  
  UNIQUE(coupon_id, order_id)
);

-- Coupon audit log for redemptions and changes
CREATE TABLE IF NOT EXISTS public.coupon_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'created', 'updated', 'deleted', 'used', 'expired'
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_status ON public.coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_valid_from_till ON public.coupons(valid_from, valid_till);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_id ON public.coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_id ON public.coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order_id ON public.coupon_usage(order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_audit_coupon_id ON public.coupon_audit_log(coupon_id);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for coupons table
-- Authenticated users can view active coupons
CREATE POLICY "Users can view active coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING (status = 'active' AND (valid_from IS NULL OR valid_from <= now()) AND (valid_till IS NULL OR valid_till > now()));

-- Admins can view all coupons
CREATE POLICY "Admins can view all coupons"
  ON public.coupons FOR SELECT
  TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- Admins can create coupons
CREATE POLICY "Admins can create coupons"
  ON public.coupons FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- Admins can update coupons
CREATE POLICY "Admins can update coupons"
  ON public.coupons FOR UPDATE
  TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true)
  WITH CHECK ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- Admins can delete coupons
CREATE POLICY "Admins can delete coupons"
  ON public.coupons FOR DELETE
  TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- RLS Policies for coupon_usage table
-- Users can view their own usage
CREATE POLICY "Users can view own coupon usage"
  ON public.coupon_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all usage
CREATE POLICY "Admins can view all coupon usage"
  ON public.coupon_usage FOR SELECT
  TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- System can insert usage records (via triggers/functions)
CREATE POLICY "System can insert coupon usage"
  ON public.coupon_usage FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for coupon_audit_log table
-- Admins can view audit logs
CREATE POLICY "Admins can view coupon audit logs"
  ON public.coupon_audit_log FOR SELECT
  TO authenticated
  USING ((SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true);

-- Create helper function to validate and apply a coupon
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
  v_response jsonb;
  v_is_applicable boolean := false;
BEGIN
  -- Fetch coupon
  SELECT * INTO v_coupon FROM public.coupons
  WHERE LOWER(code) = LOWER(p_coupon_code)
  LIMIT 1;

  -- Check coupon exists
  IF v_coupon IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Coupon code not found',
      'code', 'COUPON_NOT_FOUND'
    );
  END IF;

  -- Check if coupon is active
  IF v_coupon.status != 'active' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Coupon is not active',
      'code', 'COUPON_INACTIVE'
    );
  END IF;

  -- Check if coupon is within valid date range
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

  -- Check global usage limit
  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Coupon usage limit exceeded',
      'code', 'COUPON_LIMIT_EXCEEDED'
    );
  END IF;

  -- Check per-user usage limit
  SELECT COUNT(*) INTO v_user_used_count FROM public.coupon_usage
  WHERE coupon_id = v_coupon.id AND user_id = p_user_id;

  IF v_user_used_count >= COALESCE(v_coupon.max_uses_per_user, 1) THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'You have already used this coupon',
      'code', 'COUPON_ALREADY_USED'
    );
  END IF;

  -- Check minimum cart value
  IF v_coupon.minimum_cart_value IS NOT NULL AND p_cart_value < v_coupon.minimum_cart_value THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Cart value is below minimum required',
      'code', 'CART_VALUE_TOO_LOW',
      'min_required', v_coupon.minimum_cart_value
    );
  END IF;

  -- Return valid coupon details
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
    'is_stackable', v_coupon.is_stackable
  );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on validation function
GRANT EXECUTE ON FUNCTION public.validate_coupon_code TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon_code TO anon;;
