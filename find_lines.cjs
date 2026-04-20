const fs = require('fs');
const code = fs.readFileSync('c:\\Users\\deban\\Downloads\\CLIENT\\CUSTOMER SITE\\src\\pages\\AdminOrders.jsx', 'utf8');
const lines = code.split('\\n').map(l => l.replace('\\r', ''));

const findLine = (str) => lines.findIndex(l => l.includes(str));

console.log({
  orderDetailStart: findLine('function OrderDetail({ orderId, onBack }) {'),
  itemDecisionStart: findLine('function ItemDecisionPanel({ items,'),
  orderFinalizationStart: findLine('function OrderFinalizationPanel({ orderId,'),
  shippingStart: findLine('function ShippingPanel({ order,'),
});
