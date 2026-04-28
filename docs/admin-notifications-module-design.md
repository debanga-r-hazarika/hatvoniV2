# Admin Notifications - Module Design

This document defines the notification strategy for admin and staff modules.

## Audience Model

- Admins receive all module notifications.
- Staff receive only notifications for modules assigned in `employee_modules`.
- Notifications are stored per recipient in `admin_notifications`.

## Core Principles

- Notify only for important business events, not every row change.
- Prefer actionable titles/messages.
- Include machine-readable `meta` payload for future deep links and filters.
- Keep event types stable and explicit (`order_cancelled`, `inventory_low_stock`, etc.).

## Module Notification Matrix

### Orders module

- `order_placed`: new order created.
- `order_cancelled`: order moved to cancelled.
- `order_status_changed`: key lifecycle moves (processing/shipped/delivered).

### Logistics module

- `shipment_created`: shipment lot created.
- `shipment_updated`: carrier status/tracking number changed.
- Also receives order lifecycle events relevant to shipment flow.

### Support module

- `support_ticket_created`: new ticket in queue.
- `support_ticket_status_changed`: ticket status transitions.
- Also receives `order_cancelled` for potential follow-up/refund SLA.

### Products module

- `product_created`: new product added.
- `product_updated`: status/active/price changed.

### Lots module

- `lot_created`: new lot added.
- `lot_updated`: lot status/price changed.

### Coupons module

- `coupon_created`: new coupon created.
- `coupon_updated`: coupon status/auto-apply changed.

### Inventory module

- `inventory_low_stock`: stock drops below threshold.
- `inventory_out_of_stock`: stock reaches zero.

### Customers module

- `customer_registered`: new profile created.
- `customer_ban_changed`: customer suspended/restored.

### Sellers module

- `seller_flag_changed`: user seller status toggled.

## Future Extensions

- Add notification preferences per user (mute event types, quiet hours).
- Add severity and priority fields for escalation workflows.
- Add deep-link routes in `meta` for one-click navigation in admin UI.
- Add digest mode (hourly summary) for high-volume modules.
