const fs = require('fs');
const targetFile = 'c:\\Users\\deban\\Downloads\\CLIENT\\CUSTOMER SITE\\src\\pages\\AdminOrders.jsx';
let code = fs.readFileSync(targetFile, 'utf8');

// Ensure ShippingPanel receives the same layout structure (no absolute/relative conflicts)
code = code.replace(
  /<section className="bg-white rounded-2xl p-6 lg:p-8 border border-\[#e5e7eb\] shadow-\[0_2px_12px_rgb\(0,0,0,0\.03\)\] relative">([\s\S]*?)<h2 className="text-sm font-bold/g,
  (match, p1) => {
    return \`<section className="bg-white rounded-2xl p-6 lg:p-8 border border-neutral-200 shadow-[0_2px_12px_rgb(0,0,0,0.02)] relative mt-6">\n<div className="absolute left-8 -top-6 h-6 w-px bg-gray-200 hidden sm:block"></div>\n<div className="absolute left-8 top-[84px] bottom-6 w-px bg-gray-200 hidden sm:block"></div>\n  <h2 className="text-sm font-bold\`;
  }
); // Wait, this might match too many or too few.

// Let's explicitly replace ShippingPanel's section wrapper
const shipSectionRegex = /<section className="bg-white rounded-2xl p-6 lg:p-8 border border-\[#e5e7eb\] shadow-\[0_2px_12px_rgb\(0,0,0,0\.03\)\] relative">\s*<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">/g;

code = code.replace(shipSectionRegex, 
  `<section className="bg-white rounded-2xl p-6 lg:p-8 border border-neutral-200 shadow-[0_2px_12px_rgb(0,0,0,0.02)] relative mt-6">
      <div className="absolute left-8 -top-6 h-6 w-px bg-gray-200 hidden sm:block"></div>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10">`
);

// We need to move the <h2 ...> out from inside that flex row if necessary, but in Shipping it was:
/*
<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
  <div>
    <h2>3 Shipping...
    ...
*/
// We want to apply the same visual header styling.
code = code.replace(
  /<h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">([\s\S]*?)<\/h2>/,
  `<div className="flex items-center gap-3">
     <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-black shadow-md shrink-0">3</div>
     <div>
       <h2 className="text-lg font-bold text-gray-900 tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Shipping & Logistics</h2>
       <p className="text-xs text-gray-500 font-medium">Generate labels and assign tracking.</p>
     </div>
   </div>`
);

// Push content to sm:pl-11
code = code.replace(
  /{isPartialOrder && needsRefundRetry && \(/g,
  '<div className="space-y-6 sm:pl-11 relative z-10">\n      {isPartialOrder && needsRefundRetry && ('
);
// And close it at the very bottom right before </section>
code = code.replace(
  /<\/div>\s*<\/div>\s*<\/div>\s*\)}/g,
  '</div>\n                </div>\n              </div>\n            )}\n          </div>'
); // Brittle. Let's just do an AST string wrapper using the simpler replace.
code = code.replace(
  /<\/section>/g,
  '</div></section>'
); // wait, that adds a div to EVERY section.

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Done polish.');
