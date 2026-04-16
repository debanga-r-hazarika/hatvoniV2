import React from 'react';

export default function RecipePageTable({ data, onEdit }) {
  const item = data[0] || {};

  return (
    <div className="rounded-[2.5rem] border border-outline-variant/30 bg-white p-2 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500 overflow-hidden">
      <div className="bg-primary p-10 rounded-[2.25rem] text-white overflow-hidden relative">
         <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
         <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-xl">
               <span className="text-[10px] font-black uppercase tracking-[0.4em] text-secondary mb-3 block">Frontend Presentation Layer</span>
               <h3 className="font-brand text-4xl font-bold mb-4 tracking-tight leading-none">Recipes Interface Configuration</h3>
               <p className="text-white/70 text-base leading-relaxed font-medium">Global control for seasonal headings, editorial descriptions, and newsletter call-to-actions across the culinary section of the platform.</p>
            </div>
            <button
               onClick={() => onEdit(item)}
               className="h-16 px-8 bg-white text-primary rounded-2xl font-brand font-black text-lg hover:bg-secondary hover:text-white transition-all active:scale-95 shadow-2xl shadow-black/20 flex items-center gap-3"
            >
               <span className="material-symbols-outlined font-bold">edit_document</span>
               Edit Live Sections
            </button>
         </div>
      </div>

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="rounded-[2rem] bg-surface-container-low p-6 border border-outline-variant/10 group hover:border-primary/30 transition-all hover:bg-white hover:shadow-xl hover:shadow-primary/5">
             <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-xl">article</span>
             </div>
             <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Hero Main Heading</p>
             <p className="font-brand font-bold text-primary text-xl leading-tight line-clamp-2">{item.hero_title || 'Unset'}</p>
          </div>

          <div className="rounded-[2rem] bg-surface-container-low p-6 border border-outline-variant/10 group hover:border-secondary/30 transition-all hover:bg-white hover:shadow-xl hover:shadow-secondary/5">
             <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-xl">temp_preferences_eco</span>
             </div>
             <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Seasonal Section</p>
             <p className="font-brand font-bold text-primary text-xl leading-tight line-clamp-2">{item.seasonal_heading || 'Unset'}</p>
          </div>

          <div className="rounded-[2rem] bg-surface-container-low p-6 border border-outline-variant/10 group hover:border-amber-300/30 transition-all hover:bg-white hover:shadow-xl hover:shadow-amber-500/5">
             <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-xl">menu_book</span>
             </div>
             <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Story Index Title</p>
             <p className="font-brand font-bold text-primary text-xl leading-tight line-clamp-2">{item.story_title || 'Unset'}</p>
          </div>

          <div className="rounded-[2rem] bg-surface-container-low p-6 border border-outline-variant/10 group hover:border-sky-300/30 transition-all hover:bg-white hover:shadow-xl hover:shadow-sky-500/5">
             <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-xl">mail</span>
             </div>
             <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant/40 mb-2">Engagement Hook</p>
             <p className="font-brand font-bold text-primary text-xl leading-tight line-clamp-2">{item.newsletter_title || 'Unset'}</p>
          </div>
        </div>
        
        <div className="mt-8 flex items-center gap-4 p-5 rounded-[2rem] bg-slate-50 border border-slate-100 italic text-slate-500 text-xs text-center justify-center">
           <span className="material-symbols-outlined text-lg">info</span>
           Any changes saved here will propagate instantly to all users browsing the Recipes Discovery page.
        </div>
      </div>
    </div>
  );
}
