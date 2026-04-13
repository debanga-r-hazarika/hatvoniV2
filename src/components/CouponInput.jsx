import { useEffect, useState } from 'react';
import { couponService } from '../services/couponService';

export default function CouponInput({
  appliedCoupon,
  onCouponApplied,
  onCouponRemoved,
  cartValue,
  cartItems,
  userId,
  disabled = false,
  showAvailableCoupons = false,
}) {
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [showCouponsList, setShowCouponsList] = useState(false);

  // Fetch available coupons on mount
  useEffect(() => {
    if (showAvailableCoupons) {
      const loadCoupons = async () => {
        const coupons = await couponService.getAvailableCoupons();
        setAvailableCoupons(coupons);
      };
      loadCoupons();
    }
  }, [showAvailableCoupons]);

  const handleValidateCoupon = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!couponCode.trim()) {
      setError('Please enter a coupon code');
      return;
    }

    if (!userId) {
      setError('Please log in to use a coupon');
      return;
    }

    if (cartValue <= 0) {
      setError('Your cart is empty');
      return;
    }

    if (appliedCoupon?.valid) {
      setError('Only one coupon can be applied. Remove existing coupon first.');
      return;
    }

    setLoading(true);

    try {
      const validation = await couponService.validateCoupon(
        couponCode,
        userId,
        cartValue,
        cartItems
      );

      if (!validation.valid) {
        setError(validation.error || 'Invalid coupon code');
      } else {
        if (String(validation.type || '').toUpperCase() === 'FREE_SHIPPING') {
          setError('Free shipping is applied automatically when cart value reaches threshold.');
          return;
        }

        setSuccess(`Coupon applied! ${validation.display_name || ''}`);
        setCouponCode('');
        onCouponApplied(validation);
      }
    } catch (err) {
      console.error('Error validating coupon:', err);
      setError('Error validating coupon. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setError('');
    setSuccess('');
    setCouponCode('');
    onCouponRemoved();
  };

  const handleApplyCouponFromList = async (coupon) => {
    if (appliedCoupon?.valid) {
      setError('Only one coupon can be applied. Remove existing coupon first.');
      return;
    }

    setCouponCode(coupon.code);
    setShowCouponsList(false);
    
    // Validate immediately
    const validation = await couponService.validateCoupon(
      coupon.code,
      userId,
      cartValue,
      cartItems
    );

    if (!validation.valid) {
      setError(validation.error || 'Coupon not applicable');
    } else {
      if (String(validation.type || '').toUpperCase() === 'FREE_SHIPPING') {
        setError('Free shipping is applied automatically when cart value reaches threshold.');
        return;
      }

      setSuccess(`${coupon.display_name || coupon.code} applied!`);
      onCouponApplied(validation);
    }
  };

  return (
    <div className="mt-4">
      {appliedCoupon?.valid && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-semibold text-green-800">Coupon Applied</h4>
              <p className="text-sm text-green-700 font-semibold mt-1">
                {appliedCoupon.display_name || appliedCoupon.code}
              </p>
              <p className="text-xs text-green-600">Code: {appliedCoupon.code}</p>
              {appliedCoupon.description && (
                <p className="text-xs text-green-600 mt-0.5">{appliedCoupon.description}</p>
              )}
            </div>
            <button
              onClick={handleRemoveCoupon}
              className="text-green-700 hover:text-green-900 font-semibold text-sm"
              type="button"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Available Coupons List */}
      {showAvailableCoupons && availableCoupons.length > 0 && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setShowCouponsList(!showCouponsList)}
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
          >
            {showCouponsList ? '▼' : '▶'} Available Offers ({availableCoupons.length})
          </button>
          
          {showCouponsList && (
            <div className="mt-2 space-y-2 bg-blue-50 dark:bg-blue-900 p-3 rounded-lg">
              {availableCoupons
                .filter((coupon) => String(coupon.type || '').toUpperCase() !== 'FREE_SHIPPING')
                .map((coupon) => (
                <div
                  key={coupon.id}
                  className="p-2 bg-white dark:bg-gray-800 rounded border border-blue-200 dark:border-blue-700 cursor-pointer hover:bg-blue-50 dark:hover:bg-gray-700"
                  onClick={() => handleApplyCouponFromList(coupon)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">
                        {coupon.display_name || coupon.code}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Code: {coupon.code}
                      </p>
                      {coupon.type === 'FIXED' && coupon.discount_amount && (
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-1">
                          ₹{coupon.discount_amount} off
                        </p>
                      )}
                      {coupon.type === 'PERCENTAGE' && coupon.discount_percentage && (
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-1">
                          {coupon.discount_percentage}% off
                        </p>
                      )}
                      {coupon.type === 'FREE_SHIPPING' && (
                        <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-1">
                          Free Shipping
                        </p>
                      )}
                    </div>
                    {coupon.valid_till && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Until: {new Date(coupon.valid_till).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coupon Input Form */}
      <form onSubmit={handleValidateCoupon} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Have a Coupon Code?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter coupon code"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              disabled={loading || disabled}
              maxLength={50}
            />
            <button
              type="submit"
              disabled={loading || disabled || !couponCode.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition"
            >
              {loading ? 'Checking...' : 'Apply'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-200">
              <span className="font-semibold">✗ </span>
              {error}
            </p>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="p-3 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-200">
              <span className="font-semibold">✓ </span>
              {success}
            </p>
          </div>
        )}
      </form>

      {/* Coupon Tips */}
      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-600 dark:text-gray-400">
        <p className="font-semibold mb-1">Tips:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Coupon codes are case-insensitive</li>
          <li>Some coupons may have usage limits</li>
          <li>Check coupon validity dates</li>
          <li>Only one coupon can be applied at a time</li>
        </ul>
      </div>
    </div>
  );
}
