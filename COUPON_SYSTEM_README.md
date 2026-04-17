# Professional Coupon/Offer System

This project includes a database-backed coupon system with admin management, checkout validation, usage tracking, targeted discounts, and auto-apply support.

## What It Supports

- FIXED coupons for flat discounts
- PERCENTAGE coupons with optional max caps
- FREE_SHIPPING coupons
- BOGO coupons
- Product-specific coupons
- Category-specific coupons
- Excluded products and categories
- Stackable coupons
- Auto-apply coupons
- Usage limits per coupon and per user

## How Auto-Apply Works

- Admin can mark a coupon as `auto_apply`
- Checkout checks active auto-apply coupons against the cart
- If several coupons qualify, the system picks the best `apply_priority`, then the larger discount
- Users can remove an auto-applied coupon manually

## Targeted Discounts

Coupons can be limited to specific products or categories using:

- `applicable_product_ids`
- `applicable_categories`
- `exclude_product_ids`
- `exclude_categories`

For targeted coupons, the discount is calculated only against matching cart items.

## Database Notes

The coupons table includes fields such as:

- `code`
- `type`
- `status`
- `discount_amount`
- `discount_percentage`
- `max_discount_amount`
- `minimum_cart_value`
- `valid_from`
- `valid_till`
- `max_uses`
- `max_uses_per_user`
- `is_stackable`
- `auto_apply`
- `apply_priority`
- `applicable_product_ids`
- `applicable_categories`
- `exclude_product_ids`
- `exclude_categories`

Coupon validation is performed through the PostgreSQL function `validate_coupon_code`.

## Admin Screen

The admin coupon page at `/admin/coupons` lets admins:

- Create and edit coupons
- Set auto-apply behavior
- Limit coupons to products or categories
- Set usage limits and validity windows
- View coupon usage statistics

## Checkout Behavior

- Customers can still enter a coupon manually
- Auto-applied coupons are shown in checkout and can be removed
- If multiple coupons are valid, the system chooses the highest-priority auto-applied coupon

## Example Auto-Apply Coupon

```javascript
{
  code: "WELCOME100",
  type: "FIXED",
  discount_amount: 100,
  minimum_cart_value: 999,
  auto_apply: true,
  is_stackable: false,
  display_name: "Welcome Offer"
}
```

## Example Targeted Coupon

```javascript
{
  code: "RICE25",
  type: "FIXED",
  discount_amount: 100,
  applicable_categories: ["Rice", "Grains"],
  minimum_cart_value: 500,
  display_name: "Rice & Grains - Rs. 100 Off"
}
```

## Recommendation

For production use, keep the coupon-selection rule simple:

1. If a coupon is not stackable, treat it as exclusive.
2. If multiple auto-apply coupons qualify, choose the highest-priority one.
3. If two coupons share the same priority, choose the larger discount.
4. If the user removes an auto-applied coupon, do not reapply it immediately.
# Professional Coupon/Offer System

A comprehensive, production-ready coupon and offer management system for your e-commerce platform. Supports multiple coupon types, complex eligibility conditions, and detailed usage tracking.

## Features

### Coupon Types
- **FIXED**: Fixed amount discount (e.g., Rs. 100 off)
- **PERCENTAGE**: Percentage-based discount with optional cap (e.g., 20% off, max Rs. 500)
- **FREE_SHIPPING**: Waive shipping costs
- **BOGO**: Buy One Get One variant (e.g., Buy 2 Get 1 Free)

### Conditions & Eligibility
- ✅ Minimum cart value requirements
- ✅ Date/time validity (Valid From - Valid Till)
- ✅ Global usage limits (max uses across all users)
- ✅ Per-user usage limits (max uses per customer)
- ✅ Product-specific coupons (applicable to specific lots/products)
- ✅ Category-specific coupons
- ✅ Exclude specific products/categories
- ✅ Stackable coupons flag
- ✅ Auto-apply coupons when criteria match
- ✅ Maximum discount cap for percentage-based offers

### Advanced Features
- 🔒 Admin-only coupon management
- 📊 Usage statistics and analytics
- 📋 Audit logging of all coupon activities
- 💾 Database-backed validation (PostgreSQL functions)
- 🛡️ Row-level security (RLS) policies
- 🎯 Real-time availability display to customers

### Auto-Apply Rules
- Coupons marked `auto_apply` are selected automatically when they match the cart
- If multiple auto-apply coupons qualify, the system picks the best `apply_priority`, then the larger discount
- Users can remove an auto-applied coupon manually

---

## Database Schema

### Tables Created

#### `coupons` (Main coupon definitions)
Store all coupon templates and their configuration.

```sql
CREATE TABLE coupons (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,              -- e.g., "SUMMER20"
  display_name text,                       -- User-facing name
  description text,                        -- Description of offer
  type coupon_type,                        -- FIXED | PERCENTAGE | FREE_SHIPPING | BOGO
  status coupon_status,                    -- active | inactive | scheduled | expired
  
  -- Discount values
  discount_amount numeric,                 -- For FIXED/BOGO types
  discount_percentage numeric,             -- For PERCENTAGE type
  max_discount_amount numeric,             -- Maximum discount cap
  
  -- BOGO specific
  bogo_buy_qty integer,                   -- Quantity to buy
  bogo_get_qty integer,                   -- Quantity to get free
  
  -- Validity
  minimum_cart_value numeric,              -- Min cart total to apply
  valid_from timestamptz,                  -- Start date
  valid_till timestamptz,                  -- End date
  
  -- Usage limits
  max_uses integer,                        -- Global limit (NULL = unlimited)
  max_uses_per_user integer,               -- Per-user limit
  current_uses integer,                    -- Track global usage
  
  -- Applicability
  applicable_product_ids uuid[],           -- Specific products
  applicable_categories text[],            -- Specific categories
  exclude_product_ids uuid[],              -- Excluded products
  exclude_categories text[],               -- Excluded categories
  
  -- Metadata
  is_stackable boolean,
  applies_to_shipping boolean,
  created_by uuid REFERENCES auth.users,
   - ✅ Auto-apply coupons when criteria match
  coupon_id uuid REFERENCES coupons,
  user_id uuid REFERENCES auth.users,
  order_id uuid REFERENCES orders,
  used_at timestamptz,
  discount_applied numeric,
  cart_value_at_usage numeric
);
```

#### `coupon_audit_log` (Audit trail)
```sql
CREATE TABLE coupon_audit_log (
  id uuid PRIMARY KEY,
  coupon_id uuid REFERENCES coupons,
  action text,                             -- created | updated | used | expired
  changed_by uuid,
  details jsonb,
  created_at timestamptz
);
```

### Key Indexes
- `idx_coupons_code` - Fast coupon lookup by code
- `idx_coupons_status` - Filter by status
- `idx_coupon_usage_coupon_id` - Track coupon usage
- `idx_coupon_usage_user_id` - User's coupon history

---

## Services

### `couponService` (`src/services/couponService.js`)

#### `validateCoupon(couponCode, userId, cartValue, cartItems)`
Validates a coupon code and returns details if valid.

**Parameters:**
- `couponCode` (string) - The coupon code to validate
- `userId` (uuid) - User attempting to use the coupon
- `cartValue` (number) - Current cart subtotal
- `cartItems` (array) - Array of cart items with `lot_id`, `category`, `price`, `qty`

**Returns:**
```javascript
{
  valid: true,
  coupon_id: "uuid",
  code: "SUMMER20",
  type: "PERCENTAGE",
  display_name: "Summer Sale",
  description: "20% off all products",
  discount_percentage: 20,
  max_discount_amount: 500,
  is_stackable: false,
  auto_apply: false
}
```

**Error Response:**
```javascript
{
  valid: false,
  error: "Coupon has expired",
  code: "COUPON_EXPIRED"
}
```

#### `calculateDiscount(coupon, cartValue, shippingCost)`
Calculates the actual discount amount based on coupon type.

```javascript
const discount = couponService.calculateDiscount(
  validatedCoupon,
  2000,  // cartValue
  79    // shippingCost
);

// Returns: {
//   discountAmount: 400,
//   discountType: "PERCENTAGE",
//   couponCode: "SUMMER20",
//   breakdown: {...}
// }
```

#### `recordCouponUsage(couponCode, userId, orderId, discountApplied, cartValue)`
Records coupon usage in the database.

```javascript
await couponService.recordCouponUsage(
  "SUMMER20",
  user.id,
  order.id,
  400,    // discount applied
  2000    // cart value
);
```

#### `getAvailableCoupons()`
Fetch all currently active coupons for display to customers.

```javascript
const coupons = await couponService.getAvailableCoupons();
// [
//   {
//     id: "uuid",
//     code: "SUMMER20",
//     display_name: "Summer Sale",
//     type: "PERCENTAGE",
//     discount_percentage: 20,
//     valid_till: "2026-08-31T23:59:59Z"
//   },
//   ...
// ]
```

#### `getUserCouponHistory(userId)`
Get user's coupon usage history.

#### `getCouponDetailsForAdmin(couponCode)`
Get full coupon details with usage statistics (admin only).

---

## Components

### `CouponInput` (`src/components/CouponInput.jsx`)

Ready-to-use coupon input component with validation feedback.

**Props:**
```jsx
<CouponInput
  appliedCoupon={coupon}              // Currently applied coupon
  onCouponApplied={handleApply}       // Callback when coupon applied
  onCouponRemoved={handleRemove}      // Callback when coupon removed
  cartValue={2000}                    // Cart subtotal
  cartItems={items}                   // Cart items array
  userId={user?.id}                   // Current user ID
  showAvailableCoupons={true}         // Show available coupons list
  disabled={false}                    // Disable input
/>
```

**Features:**
- ✅ Auto-formatted coupon code input (uppercase)
- ✅ Real-time validation feedback
- ✅ Display available coupons for selection
- ✅ Success/error messaging
- ✅ Coupon removal functionality
- ✅ Responsive design with dark mode support

---

## Checkout Integration

The coupon system is fully integrated into the checkout flow:

```jsx
import { couponService } from '../services/couponService';
import CouponInput from '../components/CouponInput';

export default function Checkout() {
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);

  // Calculate totals with coupon discount
  const totalsWithCoupon = useMemo(() => {
    let discount = 0;
    if (appliedCoupon?.valid) {
      const calc = couponService.calculateDiscount(
        appliedCoupon,
        subtotal,
        shipping
      );
      discount = calc.discountAmount;
    }
    return {
      ...totals,
      discount,
      finalTotal: totals.total - discount
    };
  }, [totals, appliedCoupon]);

  // Record coupon usage after order creation
  if (appliedCoupon?.valid) {
    await couponService.recordCouponUsage(
      appliedCoupon.code,
      user.id,
      order.id,
      couponDiscount,
      subtotal
    );
  }

  return (
    <>
      {/* Coupon input in order summary */}
      <CouponInput
        appliedCoupon={appliedCoupon}
        onCouponApplied={setAppliedCoupon}
        onCouponRemoved={() => setAppliedCoupon(null)}
        cartValue={totals.subtotal}
        cartItems={cartItems}
        userId={user?.id}
        showAvailableCoupons={true}
      />

      {/* Display discount in totals */}
      {couponDiscount > 0 && (
        <div className="flex justify-between">
          <span>Coupon Discount</span>
          <span>-Rs. {couponDiscount.toLocaleString()}</span>
        </div>
      )}

      {/* Final total */}
      <strong>Rs. {totalsWithCoupon.finalTotal}</strong>
    </>
  );
}
```

---

## Admin Interface

Access the admin coupon management page at `/admin/coupons` (requires admin role).

### Capabilities

#### ✅ Create Coupons
- Set coupon code, type, and discount value
- Configure validity dates
- Set usage limits (global and per-user)
- Optional product/category targeting

#### ✅ Edit Coupons
- Modify all coupon settings except code
- Update status (active/inactive/scheduled/expired)
- Adjust discount amounts

#### ✅ View Statistics
- Total uses and remaining quota
- Total discount given
- Average discount per use
- Detailed usage history with timestamps

#### ✅ Delete Coupons
- Remove coupons from system
- Audit trail preserved

---

## Examples

### Example 1: Fixed Amount Discount
```javascript
{
  code: "WELCOME50",
  type: "FIXED",
  discount_amount: 50,
  minimum_cart_value: 200,
  max_uses_per_user: 1,
  valid_till: "2026-12-31",
  display_name: "Welcome Discount - Rs. 50 Off"
}
```

### Example 2: Percentage Discount with Cap
```javascript
{
  code: "SUMMER20",
  type: "PERCENTAGE",
  discount_percentage: 20,
  max_discount_amount: 500,           // Max Rs. 500 off
  minimum_cart_value: 1000,
  max_uses: 1000,                     // 1000 global uses
  max_uses_per_user: 3,
  valid_from: "2026-06-01",
  valid_till: "2026-08-31"
}
```

### Example 3: Free Shipping
```javascript
{
  code: "FREESHIP",
  type: "FREE_SHIPPING",
  minimum_cart_value: 500,
  max_uses_per_user: 1,
  valid_till: "2026-06-30"
}
```

### Example 4: BOGO (Buy 2 Get 1)
```javascript
{
  code: "BOGO2GET1",
  type: "BOGO",
  discount_amount: 500,               // Value of 1 item
  bogo_buy_qty: 2,
  bogo_get_qty: 1,
  max_uses: 100
}
```

### Example 5: Category-Specific
```javascript
{
  code: "RICE25",
  type: "FIXED",
  discount_amount: 100,
  applicable_categories: ["Rice", "Grains"],
  minimum_cart_value: 500,
  display_name: "Rice & Grains - Rs. 100 Off"
}
```

### Example 6: Auto-Apply Coupon
```javascript
{
  code: "WELCOME100",
  type: "FIXED",
  discount_amount: 100,
  minimum_cart_value: 999,
  auto_apply: true,
  is_stackable: false,
  display_name: "Welcome Offer"
}
```


### Key Indexes
- `idx_coupons_code` - Fast coupon lookup by code
- `idx_coupons_status` - Filter by status
- `idx_coupon_usage_coupon_id` - Track coupon usage
- `idx_coupon_usage_user_id` - User's coupon history

---

## Services

### `couponService` (`src/services/couponService.js`)

#### `validateCoupon(couponCode, userId, cartValue, cartItems)`
Validates a coupon code and returns details if valid.

**Parameters:**
- `couponCode` (string) - The coupon code to validate
- `userId` (uuid) - User attempting to use the coupon
- `cartValue` (number) - Current cart subtotal
- `cartItems` (array) - Array of cart items with `lot_id`, `category`, `price`, `qty`

**Returns:**
```javascript
{
  valid: true,
  coupon_id: "uuid",
  code: "SUMMER20",
  type: "PERCENTAGE",
  display_name: "Summer Sale",
  description: "20% off all products",
  discount_percentage: 20,
  max_discount_amount: 500,
  is_stackable: false
}
```

**Error Response:**
```javascript
{
  valid: false,
  error: "Coupon has expired",
  code: "COUPON_EXPIRED"
}
```

#### `calculateDiscount(coupon, cartValue, shippingCost)`
Calculates the actual discount amount based on coupon type.

```javascript
const discount = couponService.calculateDiscount(
  validatedCoupon,
  2000,  // cartValue
  79    // shippingCost
);

// Returns: {
//   discountAmount: 400,
//   discountType: "PERCENTAGE",
//   couponCode: "SUMMER20",
//   breakdown: {...}
// }
```

#### `recordCouponUsage(couponCode, userId, orderId, discountApplied, cartValue)`
Records coupon usage in the database.

```javascript
await couponService.recordCouponUsage(
  "SUMMER20",
  user.id,
);
```

#### `getAvailableCoupons()`
Fetch all currently active coupons for display to customers.

```javascript
const coupons = await couponService.getAvailableCoupons();
// [
//   {
//     id: "uuid",
//     code: "SUMMER20",
//     display_name: "Summer Sale",
//     type: "PERCENTAGE",
//     discount_percentage: 20,
//     valid_till: "2026-08-31T23:59:59Z"
//   },
//   ...
// ]
```

#### `getUserCouponHistory(userId)`
Get user's coupon usage history.

#### `getCouponDetailsForAdmin(couponCode)`
Get full coupon details with usage statistics (admin only).

---

## Components

### `CouponInput` (`src/components/CouponInput.jsx`)

Ready-to-use coupon input component with validation feedback.

**Props:**
```jsx
<CouponInput
  appliedCoupon={coupon}              // Currently applied coupon
  onCouponApplied={handleApply}       // Callback when coupon applied
  onCouponRemoved={handleRemove}      // Callback when coupon removed
  cartValue={2000}                    // Cart subtotal
  cartItems={items}                   // Cart items array
  userId={user?.id}                   // Current user ID
  showAvailableCoupons={true}         // Show available coupons list
  disabled={false}                    // Disable input
/>
```

**Features:**
- ✅ Auto-formatted coupon code input (uppercase)
- ✅ Real-time validation feedback
- ✅ Display available coupons for selection
- ✅ Success/error messaging
- ✅ Coupon removal functionality
- ✅ Responsive design with dark mode support

---

## Checkout Integration

The coupon system is fully integrated into the checkout flow:

```jsx
import { couponService } from '../services/couponService';
import CouponInput from '../components/CouponInput';

export default function Checkout() {
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);

  // Calculate totals with coupon discount
  const totalsWithCoupon = useMemo(() => {
    let discount = 0;
    if (appliedCoupon?.valid) {
      const calc = couponService.calculateDiscount(
        appliedCoupon,
        subtotal,
        shipping
      );
      discount = calc.discountAmount;
    }
    return {
      ...totals,
      discount,
      finalTotal: totals.total - discount
    };
  }, [totals, appliedCoupon]);

  // Record coupon usage after order creation
  if (appliedCoupon?.valid) {
    await couponService.recordCouponUsage(
      appliedCoupon.code,
      user.id,
      order.id,
      couponDiscount,
      subtotal
    );
  }

  return (
    <>
      {/* Coupon input in order summary */}
      <CouponInput
        appliedCoupon={appliedCoupon}
        onCouponApplied={setAppliedCoupon}
        onCouponRemoved={() => setAppliedCoupon(null)}
        cartValue={totals.subtotal}
        cartItems={cartItems}
        userId={user?.id}
        showAvailableCoupons={true}
      />

      {/* Display discount in totals */}
      {couponDiscount > 0 && (
        <div className="flex justify-between">
          <span>Coupon Discount</span>
          <span>-Rs. {couponDiscount.toLocaleString()}</span>
        </div>
      )}

      {/* Final total */}
      <strong>Rs. {totalsWithCoupon.finalTotal}</strong>
    </>
  );
}
```

---

## Admin Interface

Access the admin coupon management page at `/admin/coupons` (requires admin role).

### Capabilities

#### ✅ Create Coupons
- Set coupon code, type, and discount value
- Configure validity dates
- Set usage limits (global and per-user)
- Optional product/category targeting

#### ✅ Edit Coupons
- Modify all coupon settings except code
- Update status (active/inactive/scheduled/expired)
- Adjust discount amounts

#### ✅ View Statistics
- Total uses and remaining quota
- Total discount given
- Average discount per use
- Detailed usage history with timestamps

#### ✅ Delete Coupons
- Remove coupons from system
- Audit trail preserved

---

## Examples

### Example 1: Fixed Amount Discount
```javascript
{
  code: "WELCOME50",
  type: "FIXED",
  discount_amount: 50,
  minimum_cart_value: 200,
  max_uses_per_user: 1,
  valid_till: "2026-12-31",
  display_name: "Welcome Discount - Rs. 50 Off"
}
```

### Example 2: Percentage Discount with Cap
```javascript
{
  code: "SUMMER20",
  type: "PERCENTAGE",
  discount_percentage: 20,
  max_discount_amount: 500,           // Max Rs. 500 off
  minimum_cart_value: 1000,
  max_uses: 1000,                     // 1000 global uses
  max_uses_per_user: 3,
  valid_from: "2026-06-01",
  valid_till: "2026-08-31"
}
```

### Example 3: Free Shipping
```javascript
{
  code: "FREESHIP",
  type: "FREE_SHIPPING",
  minimum_cart_value: 500,
  max_uses_per_user: 1,
  valid_till: "2026-06-30"
}
```

### Example 4: BOGO (Buy 2 Get 1)
```javascript
{
  code: "BOGO2GET1",
  type: "BOGO",
  discount_amount: 500,               // Value of 1 item
  bogo_buy_qty: 2,
  bogo_get_qty: 1,
  max_uses: 100
}
```

### Example 5: Category-Specific
```javascript
{
  code: "RICE25",
  type: "FIXED",
  discount_amount: 100,
  applicable_categories: ["Rice", "Grains"],
  minimum_cart_value: 500,
  display_name: "Rice & Grains - Rs. 100 Off"
}
```

---

## Validation Rules

The system enforces these validation rules:

| Rule | Description |
|------|-------------|
| **Code Uniqueness** | Coupon codes must be unique |
| **Active Status** | Only active coupons can be used |
| **Date Validity** | Coupon must be within valid_from and valid_till dates |
| **Global Limit** | Current uses must not exceed max_uses |
| **User Limit** | User's usage must not exceed max_uses_per_user |
| **Cart Total** | Cart value must meet minimum_cart_value requirement |
| **Product Match** | At least one cart item must match applicable_product_ids or applicable_categories |
| **Applicability** | Coupon must apply to at least one item in the cart |

---

## Database Queries

### Find all active coupons expiring tomorrow
```sql
SELECT * FROM coupons
WHERE status = 'active'
  AND valid_till::date = CURRENT_DATE + 1;
```

### Get top 10 most used coupons
```sql
SELECT c.code, c.type, COUNT(cu.id) as uses
FROM coupons c
LEFT JOIN coupon_usage cu ON c.id = cu.coupon_id
GROUP BY c.id
ORDER BY uses DESC
LIMIT 10;
```

### Calculate total revenue lost to coupons
```sql
SELECT SUM(discount_applied) as total_discount
FROM coupon_usage
WHERE used_at >= CURRENT_DATE - INTERVAL '30 days';
```

### Get user's coupon usage history
```sql
SELECT c.code, c.display_name, cu.used_at, cu.discount_applied
FROM coupon_usage cu
JOIN coupons c ON cu.coupon_id = c.id
WHERE cu.user_id = $1
ORDER BY cu.used_at DESC;
```

---

## Security Considerations

✅ **Row-Level Security (RLS)**
- Customers can only view active coupons
- Admins can manage all coupons
- Users can only see their own usage history

✅ **Validation on Backend**
- Coupon validation happens via PostgreSQL function (`validate_coupon_code`)
- Server-side validation prevents manipulation

✅ **Usage Tracking**
- All coupon usage is recorded with order linkage
- Audit logs track all modifications

✅ **Rate Limiting**
- Implement rate limiting on coupon validation endpoint

---

## Performance Tips

1. **Index Optimization**: Coupons table is indexed by code, status, and validity dates
2. **Caching**: Cache available coupons list (refreshed every hour)
3. **Batch Operations**: Process coupon expirations in batch jobs
4. **Archive Old Records**: Archive coupon_usage records >1 year old

---

## Troubleshooting

### Coupon not validating
1. Check coupon status is 'active'
2. Verify current date is within valid_from and valid_till
3. Ensure cart value meets minimum_cart_value
4. Check global usage hasn't exceeded max_uses
5. Verify at least one cart item matches applicability criteria

### Database migration failed
1. Ensure Supabase project is initialized
2. Check migration file syntax
3. Verify all ENUM types are created correctly
4. Run migration manually in Supabase SQL editor

### Coupon not appearing in checkout
1. Verify coupon status is 'active'
2. Check valid_till date hasn't passed
3. Ensure minimum_cart_value condition is met
4. Reload available coupons list

---

## File Structure

```
src/
  components/
    CouponInput.jsx                  # Coupon input component
  pages/
    AdminCoupons.jsx                 # Admin management page
    Checkout.jsx                     # Integrated checkout
  services/
    couponService.js                 # Coupon business logic
supabase/
  migrations/
    20260410150000_create_coupons_system.sql  # Database schema
```

---

## Future Enhancements

- 🔄 Referral coupon generation
- 📧 Email coupon distribution
- 🎯 ML-based recommendations
- 💳 Payment method-specific coupons
- 🌍 Geo-location based offers
- 🎁 Tiered loyalty coupons
- 📱 QR code coupons

---

## Support

For issues or feature requests, please refer to the migration file comments or review the RLS policies in the database schema.

---

**Version**: 1.0.0  
**Last Updated**: April 10, 2026  
**Status**: Production Ready ✅
