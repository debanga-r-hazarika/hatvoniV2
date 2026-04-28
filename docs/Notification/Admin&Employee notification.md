# Admin & Employee Notifications

This document is reserved for future notification architecture notes.

## Scope

- Admin notification behavior
- Employee notification behavior
- Module-based access and preference rules
- Push/in-app delivery strategy

## Notes

### Third-Party Seller Order Notifications

- Table: `public.seller_notifications`
- Trigger: `trg_notify_sellers_for_new_order` on `public.orders` (`AFTER INSERT`)
- Event: `seller_order_received`
- Audience:
  - Only seller profiles where `is_seller = true`
  - Excludes insider/own sellers (`is_own_seller = false` required)
  - Seller detected from:
    - Direct `order_items.product_id -> products.seller_id`
    - Lot snapshot items (`order_items.lot_snapshot[].product_key -> products.key -> products.seller_id`)
- Delivery:
  - In-app seller bell (`SellerNotificationsMenu`) in navbar
  - Realtime updates via Supabase channel on `seller_notifications`
- Action:
  - Notification deep-links to `SellerOrderDetail` (`/seller/orders/:order_id`) so seller can confirm/reject

### Customer Order Update Notifications

- Table: `public.customer_notifications`
- Trigger: `trg_notify_customer_order_status_update` on `public.orders` (`AFTER UPDATE OF status`)
- Event: `order_status_updated`
- Audience:
  - `orders.user_id` (the customer who placed the order)
- Fire condition:
  - `orders.status` value changed (old status != new status)
- Delivery:
  - In-app customer bell (`CustomerNotificationsMenu`) in navbar
  - Realtime updates via Supabase channel on `customer_notifications`
- Action:
  - Notification deep-links to order detail page (`/order/:order_id`)
