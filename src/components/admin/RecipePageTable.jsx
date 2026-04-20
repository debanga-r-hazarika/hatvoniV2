import React from 'react';

export default function RecipePageTable({ data, onEdit }) {
  const item = data[0] || {};

  const sections = [
    { icon: 'article',              label: 'Hero Title',        value: item.hero_title,        color: '#004a2b' },
    { icon: 'temp_preferences_eco', label: 'Seasonal Heading',  value: item.seasonal_heading,  color: '#815500' },
    { icon: 'menu_book',            label: 'Story Title',       value: item.story_title,       color: '#b45309' },
    { icon: 'mail',                 label: 'Newsletter Title',  value: item.newsletter_title,  color: '#0369a1' },
  ];

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <div className="bg-[#004a2b] rounded-xl p-6 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#815500] mb-1">Page Configuration</p>
          <h3 className="text-xl font-bold tracking-tight" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>Recipe Page Sections</h3>
          <p className="text-white/60 text-xs mt-1 max-w-md">Control headings, descriptions, and call-to-actions shown on the recipes page.</p>
        </div>
        <button
          onClick={() => onEdit(item)}
          className="h-9 px-5 bg-white text-[#004a2b] rounded-lg text-xs font-bold hover:bg-[#815500] hover:text-white transition-all active:scale-[0.98] flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-base">edit</span>
          Edit Sections
        </button>
      </div>

      {/* Section Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {sections.map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-[#bec9bf]/20 p-4 hover:shadow-md hover:border-[#004a2b]/15 transition-all group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 transition-transform group-hover:scale-105" style={{ backgroundColor: `${s.color}0d` }}>
              <span className="material-symbols-outlined text-base" style={{ color: s.color }}>{s.icon}</span>
            </div>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-[#3f4942]/40 mb-1">{s.label}</p>
            <p className="text-sm font-bold text-[#004a2b] leading-snug line-clamp-2" style={{ fontFamily: '"Plus Jakarta Sans",sans-serif' }}>
              {s.value || <span className="text-[#3f4942]/30 font-normal italic">Not set</span>}
            </p>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-[#3f4942]/30 font-medium py-2">
        Changes propagate instantly to the live recipes page.
      </p>
    </div>
  );
}
