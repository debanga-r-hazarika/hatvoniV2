export const ADMIN_NOTIFICATION_EVENTS = {
  orders: [
    { id: 'order_placed', label: 'Order placed' },
    { id: 'order_cancelled', label: 'Order cancelled' },
    { id: 'order_status_changed', label: 'Order status changed' },
  ],
  logistics: [
    { id: 'shipment_created', label: 'Shipment lot created' },
    { id: 'shipment_updated', label: 'Shipment status/tracking updated' },
    { id: 'order_placed', label: 'Order placed (logistics visibility)' },
    { id: 'order_status_changed', label: 'Order status changed' },
    { id: 'order_cancelled', label: 'Order cancelled' },
  ],
  support: [
    { id: 'support_ticket_created', label: 'New support ticket' },
    { id: 'support_ticket_status_changed', label: 'Support ticket status changed' },
    { id: 'order_cancelled', label: 'Order cancelled follow-up' },
  ],
  inventory: [
    { id: 'inventory_low_stock', label: 'Low stock alert' },
    { id: 'inventory_out_of_stock', label: 'Out of stock alert' },
  ],
  coupons: [
    { id: 'coupon_created', label: 'Coupon created' },
    { id: 'coupon_updated', label: 'Coupon updated' },
  ],
  customers: [
    { id: 'customer_registered', label: 'New customer registered' },
    { id: 'customer_ban_changed', label: 'Customer suspend/restore' },
    { id: 'seller_flag_changed', label: 'Customer seller access changed' },
  ],
  sellers: [
    { id: 'seller_flag_changed', label: 'Seller access changed' },
  ],
  products: [
    { id: 'product_created', label: 'Product created' },
    { id: 'product_updated', label: 'Product updated' },
  ],
  lots: [
    { id: 'lot_created', label: 'Lot created' },
    { id: 'lot_updated', label: 'Lot updated' },
  ],
  recipes: [],
};
