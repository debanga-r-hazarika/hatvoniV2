import { supabase } from '../lib/supabase';

/**
 * Professional Coupon/Offer System Service
 * Handles validation, calculation, and tracking of coupons
 */

const COUPON_TYPES = {
  FIXED: 'FIXED',
  PERCENTAGE: 'PERCENTAGE',
  FREE_SHIPPING: 'FREE_SHIPPING',
  BOGO: 'BOGO',
};

const COUPON_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SCHEDULED: 'scheduled',
  EXPIRED: 'expired',
};

const DEFAULT_APPLY_PRIORITY_BY_TYPE = {
  FIXED: 10,
  PERCENTAGE: 20,
  BOGO: 30,
  FREE_SHIPPING: 40,
};

const hasCouponTargetScope = (coupon) => {
  return Boolean(
    (coupon?.applicable_product_ids && coupon.applicable_product_ids.length > 0) ||
    (coupon?.applicable_categories && coupon.applicable_categories.length > 0)
  );
};

const getCouponApplyPriority = (coupon) => {
  const explicitPriority = Number(coupon?.apply_priority);
  if (Number.isFinite(explicitPriority)) return explicitPriority;
  return DEFAULT_APPLY_PRIORITY_BY_TYPE[coupon?.type] ?? 100;
};

const sortCouponsForApplication = (coupons = []) => {
  return [...coupons].sort((a, b) => {
    const priorityDiff = getCouponApplyPriority(a) - getCouponApplyPriority(b);
    if (priorityDiff !== 0) return priorityDiff;
    return String(a?.code || '').localeCompare(String(b?.code || ''));
  });
};

const getCouponItemId = (item) => item?.entity_id || item?.lot_id || item?.product_id || item?.id;

const isCouponApplicableToItem = (coupon, item) => {
  const itemId = getCouponItemId(item);
  const itemCategory = item?.category;

  const matchesProduct =
    !coupon?.applicable_product_ids ||
    coupon.applicable_product_ids.length === 0 ||
    coupon.applicable_product_ids.includes(itemId);

  const matchesCategory =
    !coupon?.applicable_categories ||
    coupon.applicable_categories.length === 0 ||
    coupon.applicable_categories.includes(itemCategory);

  const isNotExcluded =
    (!coupon?.exclude_product_ids || !coupon.exclude_product_ids.includes(itemId)) &&
    (!coupon?.exclude_categories || !coupon.exclude_categories.includes(itemCategory));

  return (matchesProduct || matchesCategory) && isNotExcluded;
};

const getEligibleCartSubtotal = (coupon, cartItems = [], fallbackSubtotal = 0) => {
  if (!hasCouponTargetScope(coupon)) {
    return Math.max(0, Number(fallbackSubtotal || 0));
  }

  return (cartItems || []).reduce((sum, item) => {
    if (!isCouponApplicableToItem(coupon, item)) {
      return sum;
    }

    return sum + (Math.max(0, Number(item?.price || 0)) * Math.max(0, Number(item?.qty || 0)));
  }, 0);
};

const calculateBogoDiscount = (coupon, cartItems = []) => {
  const buyQty = Math.max(1, Number(coupon?.bogo_buy_qty || 1));
  const getQty = Math.max(1, Number(coupon?.bogo_get_qty || 1));
  const groupQty = buyQty + getQty;

  const applicableItems = (cartItems || [])
    .filter((item) => isCouponApplicableToItem(coupon, item))
    .map((item) => ({
      unitPrice: Math.max(0, Number(item?.price || 0)),
      qty: Math.max(0, Number(item?.qty || 0)),
    }))
    .filter((item) => item.qty > 0 && item.unitPrice > 0);

  if (applicableItems.length === 0) {
    return { discount: 0, freeUnits: 0, eligibleSets: 0 };
  }

  const totalQty = applicableItems.reduce((sum, item) => sum + item.qty, 0);
  const eligibleSets = Math.floor(totalQty / groupQty);
  let freeQtyRemaining = eligibleSets * getQty;

  if (freeQtyRemaining <= 0) {
    return { discount: 0, freeUnits: 0, eligibleSets };
  }

  const originalFreeUnits = freeQtyRemaining;

  // Merchant-safe BOGO: discount cheapest eligible units first.
  const sortedByPrice = [...applicableItems].sort((a, b) => a.unitPrice - b.unitPrice);
  let discount = 0;

  for (const item of sortedByPrice) {
    if (freeQtyRemaining <= 0) break;
    const unitsToDiscount = Math.min(item.qty, freeQtyRemaining);
    discount += unitsToDiscount * item.unitPrice;
    freeQtyRemaining -= unitsToDiscount;
  }

  return {
    discount: Math.round(discount * 100) / 100,
    freeUnits: originalFreeUnits,
    eligibleSets,
  };
};

/**
 * Validate and fetch coupon details
 * @param {string} couponCode - The coupon code to validate
 * @param {uuid} userId - User ID for usage tracking
 * @param {number} cartValue - Current cart subtotal
 * @param {array} cartItems - Array of cart items with lot_id, category, price, qty
 * @returns {Promise<object>} - Validation result with coupon details or error
 */
export const validateCoupon = async (couponCode, userId, cartValue, cartItems = []) => {
  try {
    if (!couponCode || !couponCode.trim()) {
      return {
        valid: false,
        error: 'Coupon code is required',
        code: 'EMPTY_CODE',
      };
    }

    // Call the backend validation function
    const { data, error } = await supabase.rpc('validate_coupon_code', {
      p_coupon_code: couponCode.trim(),
      p_user_id: userId,
      p_cart_value: cartValue,
      p_cart_items: JSON.stringify(cartItems),
    });

    if (error) {
      console.error('Coupon validation error:', error);
      return {
        valid: false,
        error: 'Error validating coupon',
        code: 'VALIDATION_ERROR',
      };
    }

    if (!data.valid) {
      return data;
    }

    // Additional client-side validation for product/category applicability
    const applicabilityCheck = validateCouponApplicability(data, cartItems);
    if (!applicabilityCheck.applicable) {
      return {
        valid: false,
        error: applicabilityCheck.reason,
        code: 'NOT_APPLICABLE_TO_ITEMS',
      };
    }

    return data;
  } catch (err) {
    console.error('Coupon validation exception:', err);
    return {
      valid: false,
      error: 'Unexpected error validating coupon',
      code: 'EXCEPTION',
    };
  }
};

/**
 * Validate if coupon applies to the cart items
 * @param {object} coupon - Validated coupon object
 * @param {array} cartItems - Array of cart items
 * @returns {object} - Applicability check result
 */
const validateCouponApplicability = (coupon, cartItems) => {
  // If no applicable products/categories specified, applies to all
  if (
    (!coupon.applicable_product_ids || coupon.applicable_product_ids.length === 0) &&
    (!coupon.applicable_categories || coupon.applicable_categories.length === 0)
  ) {
    return { applicable: true };
  }

  // Check if at least one cart item matches the coupon applicability
  const hasApplicableItem = cartItems.some((item) => {
    const itemId = getCouponItemId(item);
    const matchesProduct =
      !coupon.applicable_product_ids ||
      coupon.applicable_product_ids.length === 0 ||
      coupon.applicable_product_ids.includes(itemId);

    const matchesCategory =
      !coupon.applicable_categories ||
      coupon.applicable_categories.length === 0 ||
      coupon.applicable_categories.includes(item.category);

    const isNotExcluded =
      (!coupon.exclude_product_ids || !coupon.exclude_product_ids.includes(itemId)) &&
      (!coupon.exclude_categories || !coupon.exclude_categories.includes(item.category));

    return (matchesProduct && matchesCategory && isNotExcluded) ||
           (matchesProduct && isNotExcluded) ||
           (matchesCategory && isNotExcluded);
  });

  if (!hasApplicableItem) {
    return {
      applicable: false,
      reason: 'This coupon does not apply to any items in your cart',
    };
  }

  return { applicable: true };
};

/**
 * Calculate the discount amount based on coupon type
 * @param {object} coupon - Validated coupon object
 * @param {number} cartValue - Cart subtotal
 * @param {number} shippingCost - Shipping cost
 * @returns {object} - Discount calculation with breakdown
 */
export const calculateDiscount = (coupon, cartValue, shippingCost = 0, cartItems = []) => {
  if (!coupon || !coupon.valid) {
    return {
      discountAmount: 0,
      discountType: null,
      breakdown: {},
    };
  }

  let discountAmount = 0;
  const eligibleCartSubtotal = getEligibleCartSubtotal(coupon, cartItems, cartValue);
  const breakdown = {
    type: coupon.type,
    couponCode: coupon.code,
    originalAmount: coupon.discount_amount,
    originalPercentage: coupon.discount_percentage,
    eligibleSubtotal: eligibleCartSubtotal,
    appliesToShipping: Boolean(coupon.applies_to_shipping),
  };

  switch (coupon.type) {
    case COUPON_TYPES.FIXED:
      discountAmount = Math.min(Number(coupon.discount_amount || 0), eligibleCartSubtotal);
      breakdown.appliedAmount = discountAmount;
      break;

    case COUPON_TYPES.PERCENTAGE:
      {
        const discountBase = coupon.applies_to_shipping
          ? eligibleCartSubtotal + Math.max(0, Number(shippingCost || 0))
          : eligibleCartSubtotal;

        discountAmount = (discountBase * (coupon.discount_percentage || 0)) / 100;
      }
      // Cap by max_discount_amount if specified
      if (coupon.max_discount_amount) {
        discountAmount = Math.min(discountAmount, coupon.max_discount_amount);
      }
      breakdown.appliedAmount = discountAmount;
      breakdown.calculatedPercentage = (coupon.discount_percentage || 0);
      break;

    case COUPON_TYPES.FREE_SHIPPING:
      discountAmount = shippingCost;
      breakdown.appliedAmount = discountAmount;
      breakdown.shippingWaived = true;
      break;

    case COUPON_TYPES.BOGO:
      {
        const bogo = calculateBogoDiscount(coupon, cartItems);
        discountAmount = Number(bogo.discount || 0);
        breakdown.bogoDetails = {
          buyQty: coupon.bogo_buy_qty,
          getQty: coupon.bogo_get_qty,
          freeUnits: Number(bogo.freeUnits || 0),
          eligibleSets: Number(bogo.eligibleSets || 0),
        };
      }
      breakdown.appliedAmount = discountAmount;
      break;

    default:
      discountAmount = 0;
  }

  // Ensure discount doesn't exceed cart value + shipping
  const maxDiscount = cartValue + (coupon.type === COUPON_TYPES.FREE_SHIPPING ? shippingCost : 0);
  discountAmount = Math.min(Math.max(0, discountAmount), maxDiscount);

  return {
    discountAmount: Math.round(discountAmount * 100) / 100, // Round to 2 decimals
    discountType: coupon.type,
    couponId: coupon.coupon_id,
    couponCode: coupon.code,
    breakdown,
  };
};

/**
 * Calculate multi-coupon discount in a deterministic order.
 * Priority order defaults to FIXED -> PERCENTAGE -> BOGO -> FREE_SHIPPING,
 * and can be overridden by coupon.apply_priority.
 */
export const calculateMultiCouponDiscount = (coupons = [], cartValue = 0, shippingCost = 0, cartItems = []) => {
  const validCoupons = (coupons || []).filter((coupon) => coupon?.valid);
  const sortedCoupons = sortCouponsForApplication(validCoupons);

  let remainingSubtotal = Math.max(0, Number(cartValue || 0));
  let remainingShipping = Math.max(0, Number(shippingCost || 0));
  const breakdown = [];

  sortedCoupons.forEach((coupon) => {
    const type = String(coupon?.type || '').toUpperCase();
    let discountAmount = 0;
    let bogoDetails = null;

    if (type === COUPON_TYPES.FREE_SHIPPING) {
      discountAmount = remainingShipping;
      remainingShipping = Math.max(0, remainingShipping - discountAmount);
    } else {
      const calc = calculateDiscount(coupon, remainingSubtotal, remainingShipping, cartItems);
      discountAmount = Number(calc.discountAmount || 0);
      if (type === COUPON_TYPES.BOGO) {
        bogoDetails = calc?.breakdown?.bogoDetails || null;
      }
      remainingSubtotal = Math.max(0, remainingSubtotal - discountAmount);
    }

    breakdown.push({
      code: coupon.code,
      coupon_id: coupon.coupon_id,
      type: coupon.type,
      apply_priority: getCouponApplyPriority(coupon),
      discount: Math.round(discountAmount * 100) / 100,
      bogo_free_units: Number(bogoDetails?.freeUnits || 0),
      bogo_eligible_sets: Number(bogoDetails?.eligibleSets || 0),
      bogo_buy_qty: Number(bogoDetails?.buyQty || coupon?.bogo_buy_qty || 0),
      bogo_get_qty: Number(bogoDetails?.getQty || coupon?.bogo_get_qty || 0),
    });
  });

  const totalDiscountRaw = breakdown.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  const maxAllowedDiscount = Math.max(0, Number(cartValue || 0) + Number(shippingCost || 0));
  const totalDiscount = Math.min(totalDiscountRaw, maxAllowedDiscount);

  return {
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    breakdown,
    appliedCouponsInOrder: sortedCoupons,
  };
};

/**
 * Select the best auto-applied coupon from a set of validated coupons.
 * Lower apply_priority wins first, then larger discount, then code for deterministic tie-breaking.
 */
export const selectBestAutoAppliedCoupon = (coupons = [], cartValue = 0, shippingCost = 0, cartItems = []) => {
  const eligibleCoupons = (coupons || []).filter((coupon) => coupon?.valid && coupon?.auto_apply);

  if (eligibleCoupons.length === 0) {
    return null;
  }

  const rankedCoupons = eligibleCoupons
    .map((coupon) => {
      const calculation = calculateDiscount(coupon, cartValue, shippingCost, cartItems);

      return {
        coupon,
        discountAmount: Number(calculation.discountAmount || 0),
        calculation,
      };
    })
    .filter((entry) => entry.discountAmount > 0)
    .sort((a, b) => {
      const priorityDiff = getCouponApplyPriority(a.coupon) - getCouponApplyPriority(b.coupon);
      if (priorityDiff !== 0) return priorityDiff;

      const discountDiff = Number(b.discountAmount || 0) - Number(a.discountAmount || 0);
      if (discountDiff !== 0) return discountDiff;

      return String(a.coupon?.code || '').localeCompare(String(b.coupon?.code || ''));
    });

  const bestCoupon = rankedCoupons[0];
  if (!bestCoupon) {
    return null;
  }

  return {
    ...bestCoupon.coupon,
    auto_applied: true,
    auto_apply_discount: bestCoupon.discountAmount,
    auto_apply_breakdown: bestCoupon.calculation.breakdown,
  };
};

/**
 * Record coupon usage in the database
 * @param {string} couponCode - The coupon code used
 * @param {uuid} userId - User ID
 * @param {uuid} orderId - Order ID (optional, for post-purchase tracking)
 * @param {number} discountApplied - The discount amount applied
 * @param {number} cartValue - Cart value at time of use
 * @returns {Promise<object>} - Success or error result
 */
export const recordCouponUsage = async (
  couponCode,
  userId,
  orderId = null,
  discountApplied = 0,
  cartValue = 0
) => {
  try {
    // First, get the coupon ID
    const { data: couponData, error: couponError } = await supabase
      .from('coupons')
      .select('id')
      .eq('code', couponCode.trim().toUpperCase())
      .single();

    if (couponError || !couponData) {
      return {
        success: false,
        error: 'Coupon not found',
      };
    }

    // Insert usage record
    const { error } = await supabase
      .from('coupon_usage')
      .insert({
        coupon_id: couponData.id,
        user_id: userId,
        order_id: orderId,
        discount_applied: discountApplied,
        cart_value_at_usage: cartValue,
      });

    if (error) {
      console.error('Error recording coupon usage:', error);
      return {
        success: false,
        error: 'Failed to record coupon usage',
      };
    }

    // Increment the global usage counter using a read-then-write update.
    const { data: currentCoupon } = await supabase
      .from('coupons')
      .select('current_uses')
      .eq('id', couponData.id)
      .single();

    await supabase
      .from('coupons')
      .update({ current_uses: Number(currentCoupon?.current_uses || 0) + 1 })
      .eq('id', couponData.id);

    return {
      success: true,
      message: 'Coupon usage recorded',
    };
  } catch (err) {
    console.error('Exception recording coupon usage:', err);
    return {
      success: false,
      error: 'Unexpected error recording usage',
    };
  }
};

/**
 * Get available coupons for display (not during checkout validation)
 * @returns {Promise<array>} - Array of active coupons
 */
export const getAvailableCoupons = async () => {
  try {
    const now = Date.now();
    const { data, error } = await supabase
      .from('coupons')
      .select('id, code, display_name, description, type, discount_amount, discount_percentage, valid_from, valid_till, apply_priority, auto_apply, applicable_product_ids, applicable_categories, exclude_product_ids, exclude_categories, applies_to_shipping')
      .eq('status', 'active')
      .limit(50);

    if (error) {
      console.error('Error fetching available coupons:', error);
      return [];
    }

    const filtered = (data || []).filter((coupon) => {
      const startsAt = coupon.valid_from ? new Date(coupon.valid_from).getTime() : null;
      const endsAt = coupon.valid_till ? new Date(coupon.valid_till).getTime() : null;
      const hasStarted = startsAt === null || startsAt <= now;
      const notExpired = endsAt === null || endsAt > now;
      return hasStarted && notExpired;
    });

    return sortCouponsForApplication(filtered);
  } catch (err) {
    console.error('Exception fetching available coupons:', err);
    return [];
  }
};

/**
 * Get user's coupon usage history
 * @param {uuid} userId - User ID
 * @returns {Promise<array>} - Array of coupon usage records
 */
export const getUserCouponHistory = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('coupon_usage')
      .select(
        `
        id,
        coupon_id,
        coupons (code, display_name, type),
        used_at,
        discount_applied,
        order_id
      `
      )
      .eq('user_id', userId)
      .order('used_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching coupon history:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Exception fetching coupon history:', err);
    return [];
  }
};

/**
 * Get coupon details for admin (requires admin role)
 * @param {string} couponCode - The coupon code
 * @returns {Promise<object>} - Full coupon details
 */
export const getCouponDetailsForAdmin = async (couponCode) => {
  try {
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('code', couponCode.trim().toUpperCase())
      .single();

    if (error) {
      return { error: 'Coupon not found' };
    }

    // Get usage stats
    const { data: usageData } = await supabase
      .from('coupon_usage')
      .select('id, user_id, used_at, discount_applied')
      .eq('coupon_id', data.id);

    return {
      ...data,
      usage_stats: {
        total_uses: usageData?.length || 0,
        total_discount_given: usageData?.reduce((sum, u) => sum + (u.discount_applied || 0), 0) || 0,
        usage_records: usageData || [],
      },
    };
  } catch (err) {
    console.error('Exception fetching coupon details:', err);
    return { error: 'Failed to fetch coupon details' };
  }
};

export const couponService = {
  validateCoupon,
  calculateDiscount,
  calculateMultiCouponDiscount,
  recordCouponUsage,
  getAvailableCoupons,
  getUserCouponHistory,
  getCouponDetailsForAdmin,
  COUPON_TYPES,
  COUPON_STATUS,
};
