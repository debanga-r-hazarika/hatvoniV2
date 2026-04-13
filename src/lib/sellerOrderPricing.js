const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value) => Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export function buildSellerItemsForOrder(orderItems, sellerProductKeysInput) {
  const sellerProductKeys = sellerProductKeysInput instanceof Set
    ? sellerProductKeysInput
    : new Set(sellerProductKeysInput || []);

  return (orderItems || []).flatMap((item) => {
    const orderItemQuantity = Math.max(0, toNumber(item.quantity));
    const paidPerOrderItemUnit = toNumber(item.price);
    const paidTotalForOrderItem = paidPerOrderItemUnit * orderItemQuantity;

    if (Array.isArray(item.lot_snapshot) && item.lot_snapshot.length > 0) {
      const normalizedSnapshot = item.lot_snapshot.map((bundleItem) => {
        const bundleQuantity = Math.max(0, toNumber(bundleItem.quantity));
        const finalQuantity = bundleQuantity * orderItemQuantity;
        const baseUnitPrice = Math.max(0, toNumber(bundleItem.unit_price));
        const baseLineTotal = baseUnitPrice * finalQuantity;

        return {
          product_key: bundleItem.product_key || 'N/A',
          product_name: bundleItem.product_name || bundleItem.product_key || 'Product',
          bundle_quantity: bundleQuantity,
          final_quantity: finalQuantity,
          base_line_total: baseLineTotal,
        };
      });

      const totalBaseLine = normalizedSnapshot.reduce((sum, line) => sum + line.base_line_total, 0);
      const totalQuantity = normalizedSnapshot.reduce((sum, line) => sum + line.final_quantity, 0);

      return normalizedSnapshot
        .filter((line) => sellerProductKeys.has(line.product_key))
        .map((line) => {
          const allocatedLineTotal = totalBaseLine > 0
            ? paidTotalForOrderItem * (line.base_line_total / totalBaseLine)
            : totalQuantity > 0
              ? paidTotalForOrderItem * (line.final_quantity / totalQuantity)
              : 0;

          const finalLineTotal = roundMoney(allocatedLineTotal);
          const finalUnitPrice = line.final_quantity > 0
            ? roundMoney(finalLineTotal / line.final_quantity)
            : 0;

          return {
            id: `${item.id}-${line.product_key}`,
            source_order_item_id: item.id,
            product_name: line.product_name,
            product_key: line.product_key,
            quantity: line.final_quantity,
            unit_price: finalUnitPrice,
            line_total: finalLineTotal,
          };
        });
    }

    const directProductKey = item.products?.key || null;
    const belongsToSeller = directProductKey && sellerProductKeys.has(directProductKey);

    if (belongsToSeller) {
      const quantity = orderItemQuantity;
      const unitPrice = paidPerOrderItemUnit;
      const lineTotal = roundMoney(unitPrice * quantity);

      return [{
        id: item.id,
        source_order_item_id: item.id,
        product_name: item.products?.name || item.lot_name || 'Product',
        product_key: directProductKey,
        quantity,
        unit_price: roundMoney(unitPrice),
        line_total: lineTotal,
      }];
    }

    return [];
  });
}

export function calculateSellerSubtotal(items) {
  return roundMoney((items || []).reduce((sum, item) => sum + toNumber(item.line_total), 0));
}
