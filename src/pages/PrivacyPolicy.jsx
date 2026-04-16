export default function PrivacyPolicy() {
  return (
    <main className="relative min-h-screen">
      {/* Hero Section */}
      <header className="relative pt-28 pb-16 md:pt-32 md:pb-24 px-6 md:px-8 overflow-hidden bg-surface-container-low">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="inline-block px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-semibold mb-5 tracking-widest uppercase">
            Legal Clarity
          </div>
          <h1 className="font-brand text-4xl md:text-7xl text-primary leading-tight mb-6">
            Privacy<br className="md:hidden" /> Policy
          </h1>
          <p className="text-base md:text-xl text-on-surface-variant font-light leading-relaxed max-w-2xl">
            Your trust is the soil in which our heritage grows. We treat your
            data with the same artisanal care we give to our harvests.
          </p>
          <div className="mt-8 md:mt-12 w-full h-px bg-outline-variant/30"></div>
          <div className="mt-4 text-sm font-label text-outline uppercase tracking-tighter">
            Effective Date: October 24, 2024
          </div>
        </div>
      </header>

      {/* Content Section */}
      <section className="py-12 md:py-20 px-6 md:px-8 max-w-4xl mx-auto">
        <div className="space-y-16 md:space-y-24">

          {/* Section 01 — Information We Collect */}
          <article>
            <div className="flex items-start gap-4 mb-6">
              <span className="text-tertiary font-brand text-2xl">01</span>
              <h2 className="font-headline font-extrabold text-xl uppercase tracking-tight text-primary pt-1">
                Information We Collect
              </h2>
            </div>
            <p className="text-on-surface-variant leading-relaxed mb-6">
              We gather information that helps us personalize your journey
              through the flavors of North East India. This includes details you
              provide when crafting an account or placing an order.
            </p>
            <div className="bg-surface-container-low p-6 rounded-xl border-l-4 border-secondary">
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <span className="material-symbols-outlined text-secondary text-sm mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                  <span><strong className="text-on-surface">Identity:</strong> Name, shipping address, and contact details.</span>
                </li>
                <li className="flex gap-3">
                  <span className="material-symbols-outlined text-secondary text-sm mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                  <span><strong className="text-on-surface">Payment:</strong> Processed via certified secure gateways — never stored locally.</span>
                </li>
                <li className="flex gap-3">
                  <span className="material-symbols-outlined text-secondary text-sm mt-1" style={{ fontVariationSettings: "'FILL' 1" }}>circle</span>
                  <span><strong className="text-on-surface">Digital Trace:</strong> IP addresses and cookies to enhance browsing.</span>
                </li>
              </ul>
            </div>
          </article>

          {/* Section 02 — How We Use It */}
          <article>
            <div className="flex items-start gap-4 mb-6">
              <span className="text-tertiary font-brand text-2xl">02</span>
              <h2 className="font-headline font-extrabold text-xl uppercase tracking-tight text-primary pt-1">
                How We Use It
              </h2>
            </div>
            <p className="text-on-surface-variant leading-relaxed mb-6">
              Your data powers the logistics of heritage. We use it to ensure
              your Lakadong Turmeric or Wild Forest Honey reaches your doorstep
              with precision.
            </p>
            {/* Mobile: 2-col bento; Desktop: 2-col larger cards */}
            <div className="grid grid-cols-2 md:grid-cols-2 gap-4 md:gap-6">
              <div className="bg-primary-container text-on-primary-container p-5 rounded-xl flex flex-col items-center text-center">
                <span className="material-symbols-outlined mb-2">local_shipping</span>
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-tighter">Fulfillment</span>
              </div>
              <div className="bg-surface-container-highest p-5 rounded-xl flex flex-col items-center text-center">
                <span className="material-symbols-outlined text-secondary mb-2">auto_awesome</span>
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-tighter">Curation</span>
              </div>
              <div className="bg-surface-container-highest p-5 rounded-xl flex flex-col items-center text-center">
                <span className="material-symbols-outlined text-tertiary mb-2">chat</span>
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-tighter">Communication</span>
              </div>
              <div className="bg-primary-container text-on-primary-container p-5 rounded-xl flex flex-col items-center text-center">
                <span className="material-symbols-outlined mb-2">verified_user</span>
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-tighter">Security</span>
              </div>
            </div>
          </article>

          {/* Security Oath — full bleed card */}
          <article className="relative overflow-hidden bg-primary p-8 md:p-12 rounded-3xl text-white">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-secondary-container" style={{ fontVariationSettings: "'FILL' 1" }}>verified_user</span>
                <h2 className="font-headline font-bold text-lg uppercase tracking-widest">Our Security Oath</h2>
              </div>
              <p className="text-sm md:text-base opacity-90 leading-relaxed mb-6">
                We employ industry-standard encryption to protect your personal
                harvest. Your payment details are never stored on our local
                servers; they are handled by certified secure gateways.
              </p>
              <div className="w-24 h-1 bg-secondary-container rounded-full"></div>
            </div>
            <div className="absolute top-0 right-0 opacity-10 pointer-events-none">
              <span className="material-symbols-outlined text-[200px]">eco</span>
            </div>
          </article>

          {/* Section 03 — Your Rights */}
          <article className="border-t border-outline-variant pt-12 md:pt-32 md:pt-40">
            <div className="flex items-start gap-4 mb-8">
              <span className="text-tertiary font-brand text-2xl">03</span>
              <h2 className="font-headline font-extrabold text-xl uppercase tracking-tight text-primary pt-1">
                Your Rights
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { icon: 'visibility', title: 'Access', desc: 'Request a copy of the personal data we hold about you.' },
                { icon: 'edit', title: 'Correction', desc: 'Request that we update or fix any inaccurate information.' },
                { icon: 'delete', title: 'Erasure', desc: 'Request that we delete your data from our active systems.' },
              ].map((item) => (
                <div key={item.title} className="bg-surface-container-low p-6 rounded-xl flex md:flex-col items-center md:items-start gap-4">
                  <div className="w-12 h-12 bg-surface rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-primary">{item.icon}</span>
                  </div>
                  <div>
                    <h4 className="font-headline text-base font-bold mb-1">{item.title}</h4>
                    <p className="text-sm text-on-surface-variant">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Cookie Preferences */}
          <article className="bg-surface-container-low rounded-2xl p-6 flex items-center justify-between group active:bg-surface-container-high transition-colors">
            <div>
              <h4 className="font-bold text-primary mb-1">Cookie Preferences</h4>
              <p className="text-xs text-on-surface-variant">Manage how we use trackers</p>
            </div>
            <span className="material-symbols-outlined text-secondary">chevron_right</span>
          </article>

          {/* Contact CTA */}
          <article className="text-center space-y-4 pb-8">
            <p className="text-xs font-bold text-outline uppercase tracking-[0.3em]">Questions?</p>
            <a
              className="font-headline text-lg font-extrabold text-primary underline underline-offset-8 decoration-secondary-container decoration-4"
              href="mailto:privacy@hatvoni.com"
            >
              privacy@hatvoni.com
            </a>
            <p className="mt-8 text-[10px] text-outline-variant font-medium">Last Updated: October 24, 2024</p>
          </article>
        </div>
      </section>
    </main>
  );
}
