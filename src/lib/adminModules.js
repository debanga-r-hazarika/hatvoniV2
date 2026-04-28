export const ADMIN_MODULES = [
  { id: 'orders', label: 'Orders', icon: 'package_2', route: '/admin/orders' },
  { id: 'logistics', label: 'Logistics', icon: 'local_shipping', route: '/admin/logistics' },
  { id: 'support', label: 'Support', icon: 'support_agent', route: '/admin/support' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory_2', route: '/admin/inventory' },
  { id: 'coupons', label: 'Coupons', icon: 'sell', route: '/admin/coupons' },
  { id: 'customers', label: 'Customers', icon: 'group', route: '/admin' },
  { id: 'sellers', label: 'Sellers', icon: 'storefront', route: '/admin/sellers' },
  { id: 'products', label: 'Products', icon: 'category', route: '/admin' },
  { id: 'lots', label: 'Lots', icon: 'all_inclusive', route: '/admin' },
  { id: 'recipes', label: 'Recipes', icon: 'restaurant_menu', route: '/admin' },
];

export const ADMIN_MODULE_MAP = ADMIN_MODULES.reduce((acc, moduleDef) => {
  acc[moduleDef.id] = moduleDef;
  return acc;
}, {});
