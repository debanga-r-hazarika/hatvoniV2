const fs = require('fs');

const targetFile = 'c:\\Users\\deban\\Downloads\\CLIENT\\CUSTOMER SITE\\src\\pages\\AdminOrders.jsx';
let code = fs.readFileSync(targetFile, 'utf8');

// 1. Clean up "ItemDecisionPanel" outer wrapper
code = code.replace(
  /<section className="bg-white rounded-xl p-4 lg:p-5 border border-\[#bec9bf\]\/30 shadow-sm">/g,
  '<section className="bg-white rounded-2xl p-6 lg:p-8 border border-[#e5e7eb] shadow-[0_2px_12px_rgb(0,0,0,0.03)] relative">'
);

// Add Step numbering visually to section headers
code = code.replace(
  /<h2 className="text-\[10px\] uppercase tracking-wider font-bold text-\[#004a2b\] mb-2 flex items-center gap-2">\s*<span className="material-symbols-outlined">fact_check<\/span>\s*Item-Level Approval\s*<\/h2>/g,
  `<h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
    <div className="w-6 h-6 rounded-full bg-[#004a2b] text-white flex items-center justify-center text-xs font-bold shrink-0">1</div>
    Item-Level Approval
  </h2>`
);

code = code.replace(
  /<h2 className="text-\[10px\] uppercase tracking-wider font-bold text-\[#004a2b\] mb-1 flex items-center gap-2">\s*<span className="material-symbols-outlined">rule<\/span>\s*Order Decision\s*<\/h2>/g,
  `<h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
    <div className="w-6 h-6 rounded-full bg-[#004a2b] text-white flex items-center justify-center text-xs font-bold shrink-0">2</div>
    Order Finalization & Decision
  </h2>`
);

// Redesign ItemDecisionPanel inner cards
code = code.replace(
  /className="rounded-xl border border-\[#bec9bf\]\/20 p-4 bg-\[#fbfaf1\]"/g,
  'className="rounded-lg border border-gray-200 p-4 bg-white shadow-sm hover:shadow-md transition-shadow duration-200"'
);

// Item info text colors
code = code.replace(
  /<p className="font-semibold text-\[#004a2b\] text-sm truncate">/g,
  '<p className="font-semibold text-gray-900 text-sm truncate">'
);
code = code.replace(
  /<span className="text-\[10px\] text-\[#815500\] font-bold uppercase tracking-wider">/g,
  '<span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">'
);

// Order Finalization Panel - outer container
code = code.replace(
  /<section className="bg-white rounded-xl p-4 lg:p-5 border border-\[#bec9bf\]\/30 shadow-\[0_10px_40px_rgba\(0,123,71,0\.03\)\] relative overflow-hidden">/g,
  '<section className="bg-white rounded-2xl p-6 lg:p-8 border border-[#e5e7eb] shadow-[0_2px_12px_rgb(0,0,0,0.03)] relative">'
);

// Remove the swoosh bg
code = code.replace(
  /<div className="absolute top-0 right-0 w-32 h-32 bg-\[#004a2b\]\/5 rounded-bl-\[100px\] -z-10" \/>/g,
  ''
);

// Order Decision Action Headers
code = code.replace(
  /<p className="text-\[10px\] font-black uppercase tracking-\[0\.2em\] text-\[#3f4942\]\/60 mb-3">ACTION<\/p>/g,
  '<p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">Choose Action</p>'
);

// Clean up Finalization confirm block
code = code.replace(
  /<div className="rounded-xl border border-\[#bec9bf\]\/30 bg-\[#f5f4eb\]\/50 p-4">/g,
  '<div className="rounded-xl border border-gray-200 bg-gray-50 p-5">'
);

// Shipping Panel Section Redesign
// Header
code = code.replace(
  /<h2 className="text-\[10px\] uppercase tracking-wider font-bold text-\[#004a2b\] mb-3 flex items-center gap-2">\s*<span className="material-symbols-outlined">local_shipping<\/span>\s*Shipping &amp; Logistics\s*<\/h2>/g,
  `<h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
    <div className="w-6 h-6 rounded-full bg-[#004a2b] text-white flex items-center justify-center text-xs font-bold shrink-0">3</div>
    Shipping & Logistics
  </h2>`
);

// Shipping Mode Tabs
code = code.replace(
  /className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center \${shippingMode === 'manual' \? 'bg-white text-\[#004a2b\] shadow-sm' : 'text-\[#3f4942\]\/60 hover:text-\[#1b1c19\]'}`}/g,
  `className={\`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all \${shippingMode === 'manual' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-900 border border-transparent'}\`}`
);
code = code.replace(
  /className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider text-center \${shippingMode === 'velocity' \? 'bg-[#004a2b] text-white shadow-sm' : 'text-\[#3f4942\]\/60 hover:text-\[#1b1c19\]'}`}/g,
  `className={\`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all \${shippingMode === 'velocity' ? 'bg-[#004a2b] text-white shadow-sm border border-[#004a2b]' : 'text-gray-500 hover:text-gray-900 border border-transparent'}\`}`
);
// Fix container for tabs
code = code.replace(
  /<div className="flex bg-\[#f5f4eb\] p-1 rounded-xl mb-5">/g,
  '<div className="flex bg-gray-100 p-1.5 rounded-xl mb-6 gap-1">'
);

// Velocity Steps Containers
code = code.replace(
  /className="rounded-xl border border-\[#bec9bf\]\/30 bg-\[#fbfaf1\] p-5"/g,
  'className="rounded-xl border border-gray-200 bg-white shadow-sm p-6"'
);
code = code.replace(
  /className="rounded-xl border border-\[#bec9bf\]\/20 bg-\[#f5f4eb\]\/50 p-4"/g,
  'className="rounded-xl border border-gray-200 bg-gray-50 p-5"'
);

// Form Inputs Global style in panels
code = code.replace(
  /className={`w-full px-3 py-2\.5 border border-\[#bec9bf\]\/50 rounded-xl bg-\[#fbfaf1\] text-sm focus:ring-2 focus:ring-\[#004a2b\]\/10/g,
  'className={`w-full px-3.5 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-[#004a2b]/20 focus:border-[#004a2b] transition-colors'
);
code = code.replace(
  /className={`w-full px-4 py-3 border border-\[#bec9bf\]\/50 rounded-xl bg-\[#fbfaf1\]/g,
  'className={`w-full px-3.5 py-2.5 border border-gray-300 rounded-lg bg-white bg-white text-sm focus:ring-2 focus:ring-[#004a2b]/20 focus:border-[#004a2b] transition-colors'
);
code = code.replace(
  /className="w-full px-3 py-2 border border-\[#bec9bf\]\/50 rounded-lg bg-white text-sm focus:ring-2 focus:ring-\[#004a2b\]\/10"/g,
  'className="w-full px-3.5 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-[#004a2b]/20 focus:border-[#004a2b] transition-colors"'
);
code = code.replace(
  /className="w-full px-3 py-2 border border-\[#bec9bf\]\/50 rounded-lg bg-white text-sm focus:ring-2 focus:ring-\[#004a2b\]\/10 min-h-\[80px\]"/g,
  'className="w-full px-3.5 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-[#004a2b]/20 focus:border-[#004a2b] transition-colors min-h-[80px]"'
);

// Manual Shipping Save action
code = code.replace(
  /className="w-full sm:w-auto px-6 py-2\.5 rounded-xl bg-\[#004a2b\] text-white text-sm font-bold hover:opacity-90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"/g,
  'className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold shadow-sm hover:bg-gray-800 disabled:opacity-60 transition-all flex items-center justify-center gap-2"'
);

// Adjust modal shadows
code = code.replace(
  /className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl border border-\[#bec9bf\]\/20"/g,
  'className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100"'
);

// Rewrite Order Detail wrapping structures a bit
code = code.replace(
  /className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5"/g,
  'className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8"'
);

// Write changes back
fs.writeFileSync(targetFile, code, 'utf8');
console.log('UI modernized.');
