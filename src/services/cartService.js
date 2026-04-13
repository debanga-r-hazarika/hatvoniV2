const CART_KEY = 'hatvoni_cart_v1';
const CART_EVENT = 'hatvoni-cart-updated';

const safeParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: item.id,
      item_type: item.item_type || (item.product_id ? 'product' : 'lot'),
      entity_id: item.entity_id || item.product_id || item.lot_id || item.id,
      lot_id: item.lot_id || null,
      product_id: item.product_id || null,
      name: item.name,
      price: Number(item.price || 0),
      qty: Math.max(1, Number(item.qty || 1)),
      image_url: item.image_url || '',
      category: item.category || 'Heritage',
      description: item.description || '',
      status: item.status || 'active',
      lot_items: Array.isArray(item.lot_items) ? item.lot_items : [],
    }))
    .filter((item) => item.id && item.name);
};

const calculateLotPriceFromItems = (lotItems, fallbackPrice = 0) => {
  if (!Array.isArray(lotItems) || lotItems.length === 0) return Number(fallbackPrice || 0);

  let hasPricedItem = false;
  const total = lotItems.reduce((sum, item) => {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    const unitPrice = Number(
      item?.products?.price ||
      item?.unit_price ||
      item?.price ||
      0,
    );
    if (unitPrice > 0) hasPricedItem = true;
    return sum + (unitPrice * quantity);
  }, 0);

  return hasPricedItem ? total : Number(fallbackPrice || 0);
};

const emitCartUpdate = () => {
  window.dispatchEvent(new Event(CART_EVENT));
};

const getCartItems = () => {
  const parsed = safeParse(localStorage.getItem(CART_KEY));
  return normalizeItems(parsed);
};

const saveCartItems = (items) => {
  const normalized = normalizeItems(items);
  localStorage.setItem(CART_KEY, JSON.stringify(normalized));
  emitCartUpdate();
  return normalized;
};

const addToCart = (product, qty = 1) => {
  const quantity = Math.max(1, Number(qty || 1));
  const current = getCartItems();
  const itemType = product.item_type || (product.lot_id || product.lot_name ? 'lot' : 'product');
  const entityId = product.lot_id || product.product_id || product.id;
  const cartId = `${itemType}:${entityId}`;
  const existing = current.find((item) => item.id === cartId);

  const name = product.lot_name || product.name;
  const imageUrl = product.image_url || product.lot_image_url || product.lot_items?.[0]?.products?.image_url || '';
  const lotItems = product.lot_items || product.bundle_items || [];
  const resolvedPrice = calculateLotPriceFromItems(lotItems, product.price);

  if (existing) {
    const updated = current.map((item) => (
      item.id === cartId
        ? { ...item, qty: item.qty + quantity }
        : item
    ));
    return saveCartItems(updated);
  }

  return saveCartItems([
    ...current,
    {
      id: cartId,
      item_type: itemType,
      entity_id: entityId,
      lot_id: itemType === 'lot' ? entityId : null,
      product_id: itemType === 'product' ? entityId : null,
      name,
      price: Number(resolvedPrice || 0),
      qty: quantity,
      image_url: imageUrl,
      category: product.category || (itemType === 'lot' ? 'Lot' : 'Product'),
      description: product.description || '',
      status: product.status || 'active',
      lot_items: lotItems,
    },
  ]);
};

const updateCartItemQty = (productId, qty) => {
  const quantity = Math.max(1, Number(qty || 1));
  const updated = getCartItems().map((item) => (
    item.id === productId ? { ...item, qty: quantity } : item
  ));
  return saveCartItems(updated);
};

const removeCartItem = (productId) => {
  const updated = getCartItems().filter((item) => item.id !== productId);
  return saveCartItems(updated);
};

const clearCart = () => {
  localStorage.removeItem(CART_KEY);
  emitCartUpdate();
};

const getCartCount = () => getCartItems().reduce((sum, item) => sum + item.qty, 0);

const subscribe = (callback) => {
  const handler = () => callback(getCartItems());
  window.addEventListener(CART_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CART_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
};

export const cartService = {
  CART_EVENT,
  getCartItems,
  saveCartItems,
  addToCart,
  updateCartItemQty,
  removeCartItem,
  clearCart,
  getCartCount,
  subscribe,
};
