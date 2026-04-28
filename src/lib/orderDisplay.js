const ROMAN_NUMERALS = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

export function toRoman(value) {
  let num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return '';
  if (num > 3999) return String(num);

  let out = '';
  for (const [n, sym] of ROMAN_NUMERALS) {
    while (num >= n) {
      out += sym;
      num -= n;
    }
  }
  return out;
}

export function getOrderDisplayId(order) {
  if (order?.display_order_id) return String(order.display_order_id);
  const fallback = String(order?.id || '').slice(0, 8).toUpperCase();
  return fallback ? `#${fallback}` : '—';
}

export function getOrderItemDisplayId(order, item, index = 0) {
  const base = getOrderDisplayId(order);
  const lineNumber = Number(item?.line_number);
  const safeLine = Number.isInteger(lineNumber) && lineNumber > 0 ? lineNumber : index + 1;
  const suffix = toRoman(safeLine) || String(safeLine);
  return `${base}-${suffix}`;
}
