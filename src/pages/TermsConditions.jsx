export default function TermsConditions() {
  return (
    <main>
      {/* Hero Section */}
      <header className="relative pt-8 pb-16 md:pt-12 md:pb-24 px-6 md:px-8 overflow-hidden">
        <div className="max-w-4xl mx-auto relative z-10">
          <span className="font-headline font-bold uppercase tracking-[0.2em] text-xs text-secondary mb-3 block">
            Legal Documentation
          </span>
          <h1 className="font-brand text-4xl md:text-7xl text-primary mb-6 leading-tight tracking-tight">
            Terms &amp;<br className="md:hidden" /> Conditions
          </h1>
          <p className="font-headline text-on-surface-variant text-sm md:text-lg max-w-2xl border-l-2 border-secondary-container pl-4">
            Last Updated: October 24, 2023. These terms outline our commitment
            to heritage, quality, and your rights as a patron of Hatvoni.
          </p>
        </div>
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-secondary-container/10 rounded-full blur-3xl"></div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 md:px-8 pb-24 md:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-16">

          {/* Sticky TOC — desktop only */}
          <aside className="hidden lg:block lg:col-span-3">
            <nav className="sticky top-32 space-y-6">
              <h3 className="font-brand text-secondary text-sm uppercase tracking-widest">Navigation</h3>
              <ul className="space-y-4 font-headline text-sm text-on-surface-variant">
                {[
                  ['#acceptance', 'Acceptance'],
                  ['#products', 'Product Integrity'],
                  ['#intellectual', 'Heritage Rights'],
                  ['#shipping', 'Shipping Terms'],
                  ['#liability', 'Liability'],
                  ['#governing', 'Governing Law'],
                ].map(([href, label]) => (
                  <li key={href}>
                    <a href={href} className="hover:text-primary transition-colors block border-l-2 border-outline-variant pl-4 py-1 hover:border-primary">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          {/* Terms Content */}
          <div className="lg:col-span-9 space-y-6 md:space-y-10">

            {/* Section 1: Acceptance */}
            <div id="acceptance" className="bg-surface-container-low rounded-xl p-6 md:p-8 transition-transform active:scale-[0.98]">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-secondary-container p-2 rounded-lg">
                  <span className="material-symbols-outlined text-on-secondary-container text-xl">verified_user</span>
                </div>
                <h2 className="font-headline font-extrabold text-lg md:text-xl text-primary uppercase tracking-tight">Acceptance</h2>
              </div>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed">
                By accessing this website, you are agreeing to be bound by these
                Terms and Conditions of Use, all applicable laws and regulations,
                and agree that you are responsible for compliance with any
                applicable local laws. Hatvoni reserves the right to update
                these terms at any time without prior notice.
              </p>
            </div>

            {/* Section 2: Product Integrity */}
            <div id="products" className="relative overflow-hidden bg-primary-container text-white rounded-xl p-6 md:p-8">
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="material-symbols-outlined text-on-primary-container text-xl">nature_people</span>
                  <h2 className="font-headline font-extrabold text-lg md:text-xl uppercase tracking-tight text-on-primary-container">
                    Product Integrity
                  </h2>
                </div>
                <p className="font-body text-sm opacity-90 leading-relaxed mb-4">
                  Our products are harvested using traditional methods.
                  Variations in color, texture, and aroma are natural
                  characteristics of heirloom varieties and are not considered
                  defects.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-primary/30 backdrop-blur-md rounded-lg p-4 border border-white/10">
                    <h4 className="font-headline font-bold text-sm text-primary-fixed mb-1">Natural Variations</h4>
                    <p className="text-xs opacity-80">Batch variations occur due to seasonal harvests in the Seven Sisters region.</p>
                  </div>
                  <div className="bg-primary/30 backdrop-blur-md rounded-lg p-4 border border-white/10">
                    <h4 className="font-headline font-bold text-sm text-primary-fixed mb-1">Usage Advisory</h4>
                    <p className="text-xs opacity-80">Not intended to diagnose, treat, or cure any medical condition.</p>
                  </div>
                </div>
              </div>
              <div className="absolute -right-8 -bottom-8 opacity-20">
                <span className="material-symbols-outlined text-9xl">eco</span>
              </div>
            </div>

            {/* Section 3: Shipping & Returns — 2-col on mobile too */}
            <div id="shipping" className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface-container-highest rounded-xl p-5 border-b-4 border-secondary">
                <h3 className="font-headline font-bold text-sm text-secondary uppercase mb-2">Shipping Logistics</h3>
                <p className="font-body text-xs text-on-surface leading-normal">
                  We ship globally from our regional hubs. Delivery timelines
                  reflect the careful handling required for organic produce.
                  Orders processed within 3-5 business days.
                </p>
              </div>
              <div className="bg-surface-container-low rounded-xl p-5">
                <h3 className="font-headline font-bold text-sm text-primary uppercase mb-2">Returns Policy</h3>
                <p className="font-body text-xs text-on-surface-variant leading-normal">
                  Due to the perishable nature of our artisanal food items,
                  returns are only accepted for transit damage reported within
                  24 hours of delivery.
                </p>
              </div>
            </div>

            {/* Section 4: Intellectual Property */}
            <div id="intellectual" className="p-6 md:p-8 border-y border-outline-variant/30">
              <h2 className="font-headline font-extrabold text-lg md:text-xl text-primary uppercase tracking-tight mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined">copyright</span>
                Heritage Rights
              </h2>
              <div className="space-y-3 font-body text-sm text-on-surface-variant">
                <p>All content, including photography of traditional weaving and botanical specimens, is the intellectual property of Hatvoni Heritage.</p>
                <ul className="space-y-2 mt-3">
                  <li className="flex gap-3">
                    <span className="text-secondary font-bold">•</span>
                    <span>Visual assets may not be reproduced without written consent.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="text-secondary font-bold">•</span>
                    <span>Traditional knowledge shared on this platform is protected under cultural heritage protocols.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Section 5: Liability */}
            <div id="liability" className="bg-primary text-on-primary-container p-6 md:p-10 rounded-xl">
              <h2 className="font-brand text-xl md:text-2xl text-secondary-container mb-4">
                Limitation of Liability
              </h2>
              <p className="leading-relaxed opacity-90 text-sm md:text-base">
                In no event shall Hatvoni or its suppliers be liable for any
                damages arising out of the use or inability to use the materials
                on our site, even if notified of the possibility of such damage.
              </p>
            </div>

            {/* Section 6: Governing Law */}
            <div id="governing" className="bg-tertiary-fixed text-on-tertiary-fixed rounded-xl p-6 md:p-8">
              <h3 className="font-headline font-bold text-sm uppercase tracking-widest mb-3 opacity-70">Governing Law</h3>
              <p className="font-body text-sm font-medium leading-relaxed">
                These terms are governed by the laws of the State of Assam,
                India. Any disputes shall be resolved through amicable mediation
                before legal recourse.
              </p>
            </div>

            {/* Editorial image */}
            <div className="rounded-2xl overflow-hidden aspect-[16/9] relative">
              <img
                alt="Mist covered mountains"
                className="w-full h-full object-cover"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKDwcHRLPpaFPwIhYdIshH47fBaLDakjHb2nQSHFFhPhZtGkovkQw38c4rREOwuu6ts1r4Bcc35q6EMT5wvzpMlBwQp-S19eMb7o4ruhGJU3aSxLwCAiD2oYICYL-Y_AphV4VH08vCGpMHHmVz7WuxOlePRE_MbscoYVJG85dnEoi2QsLQnsE8e9e0ku6FsbCfXtDMvOMNCEd2hJErQBmmcoOY7MZHWugRs3X-cBEbY_bB04W-jT_TmRrlnj0R9YfQrgC45Kfw4WNZ"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent flex items-end p-6">
                <p className="text-white font-headline font-bold text-xs uppercase tracking-widest italic">Respect the source.</p>
              </div>
            </div>

            {/* Acknowledge CTA */}
            <div className="text-center py-6 px-4">
              <p className="font-body text-xs text-outline mb-6">
                By continuing to use this site, you accept our full legal framework.
              </p>
              <button className="w-full md:w-auto md:px-12 bg-primary text-white font-headline font-bold py-4 rounded-xl shadow-lg active:scale-[0.97] transition-all flex items-center justify-center gap-2 mx-auto">
                I Agree to Terms
                <span className="material-symbols-outlined text-sm">done_all</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
