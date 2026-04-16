import { Link } from 'react-router-dom';

export default function ReturnsShipping() {
  return (
    <main className="max-w-7xl mx-auto px-6 md:px-12 pt-28 pb-12 md:pt-32 md:pb-24">
      {/* Hero Header */}
      <header className="mb-12 md:mb-20">
        <h1 className="text-4xl md:text-6xl text-primary font-brand leading-tight mb-4 tracking-tight">
          Logistics of <span className="text-secondary">Heritage</span>
        </h1>
        <p className="text-base md:text-xl text-on-surface-variant font-headline max-w-2xl leading-relaxed">
          Connecting the heart of North East India to your doorstep, with care
          and cultural integrity.
        </p>
      </header>

      {/* Shipping Cards — stacked on mobile, bento on desktop */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-8 mb-16 md:mb-24">
        {/* Domestic */}
        <div className="md:col-span-7 bg-surface-container-low p-6 md:p-10 rounded-xl relative overflow-hidden flex flex-col justify-between h-56 md:h-auto">
          <div className="z-10">
            <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 inline-block">
              Domestic
            </span>
            <h2 className="font-brand text-2xl md:text-3xl text-primary mb-2">Within India</h2>
            <p className="text-sm font-medium text-on-surface-variant">5-7 Business Days</p>
          </div>
          <div className="z-10 bg-surface/80 backdrop-blur-md p-3 rounded-lg self-start mt-4 md:mt-0">
            <p className="text-[10px] uppercase font-bold tracking-tighter text-secondary">Eco-Conscious Packaging Included</p>
          </div>
          <div className="absolute -right-8 -bottom-8 opacity-10">
            <span className="material-symbols-outlined text-[160px]">local_shipping</span>
          </div>
        </div>

        {/* International */}
        <div className="md:col-span-5 bg-primary p-6 md:p-10 rounded-xl text-on-primary flex flex-col justify-between relative overflow-hidden h-64 md:h-auto">
          <div className="z-10">
            <span className="bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 inline-block">
              Global
            </span>
            <h2 className="font-brand text-2xl md:text-3xl mb-3 tracking-tighter leading-none">
              The World<br />Over
            </h2>
            <p className="text-lg font-light opacity-90 leading-tight">12-18 Business Days</p>
          </div>
          <div className="z-10 mt-4 border-t border-on-primary/10 pt-4">
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-xs font-medium">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Express Customs Clearance
              </li>
              <li className="flex items-center gap-2 text-xs font-medium">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Tracked Air Freight
              </li>
            </ul>
          </div>
          <div className="absolute -right-4 -top-4 opacity-30">
            <div className="w-32 h-32 bg-primary-container rounded-full blur-3xl"></div>
          </div>
        </div>
      </section>

      {/* Returns Policy — editorial vertical timeline on mobile */}
      <section className="mb-16 md:mb-24">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-[2px] w-12 bg-tertiary"></div>
          <h2 className="font-headline text-sm font-extrabold uppercase tracking-[0.2em] text-tertiary">
            Returns &amp; Exchanges
          </h2>
        </div>

        {/* Mobile: vertical timeline. Desktop: horizontal step grid */}
        <div className="md:hidden space-y-8">
          {[
            { title: '14-Day Window', body: 'We accept returns within 14 days of delivery. The item must be unused, in its original sealing, and with all cultural tags intact.' },
            { title: 'Artisan Quality Guarantee', body: 'Since our products are handcrafted by local communities, minor variations in texture and color are marks of authenticity, not defects.' },
            { title: 'Simple Process', body: 'Email heritage@hatvoni.com with your order ID. Our quality team reviews requests within 24-48 business hours.' },
          ].map((step, i) => (
            <div key={i} className="relative pl-8 border-l border-outline-variant/30">
              <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-secondary"></div>
              <h3 className="font-headline font-bold text-base mb-1">{step.title}</h3>
              <p className="text-on-surface-variant text-sm leading-relaxed">{step.body}</p>
            </div>
          ))}
          <button className="bg-primary-container text-on-primary-container px-6 py-3 rounded-xl font-headline font-bold text-sm uppercase tracking-widest active:scale-95 transition-transform">
            Start a Return
          </button>
        </div>

        {/* Desktop: 4-col horizontal steps */}
        <div className="hidden md:block bg-surface-container-highest rounded-2xl p-8 md:p-16 relative overflow-hidden">
          <div className="grid grid-cols-4 gap-8 relative z-10">
            {[
              { icon: 'history', title: '7-Day Window', desc: 'Notify us within 7 days for any damaged or incorrect items.' },
              { icon: 'photo_camera', title: 'Capture Proof', desc: 'Share photos of the seal and packaging if damaged during transit.' },
              { icon: 'support_agent', title: 'Approval', desc: 'Our quality team reviews requests within 24-48 business hours.' },
              { icon: 'currency_rupee', title: 'Full Refund', desc: 'Processed back to original payment method or as Hatvoni credits.' },
            ].map((step) => (
              <div key={step.title} className="text-center space-y-4">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <span className="material-symbols-outlined text-primary">{step.icon}</span>
                </div>
                <p className="font-bold font-headline text-primary">{step.title}</p>
                <p className="text-sm text-on-surface-variant">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <span className="material-symbols-outlined text-[200px]">eco</span>
          </div>
        </div>
      </section>

      {/* Image + Packaging copy */}
      <section className="w-full rounded-2xl overflow-hidden mb-16 md:mb-24 relative h-48 md:h-64">
        <img
          alt="Heritage Textile Detail"
          className="w-full h-full object-cover grayscale opacity-80"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDXuliFEFwyeBVkH7_vbAti6-BBGG4oHigHwv65_ERZF8L3EFn_ymtC_fhNY9pCHpzvsqIxEBDcLRN7EcMC77H-ggTpN0c2w1I6MDE2OJEGTrDEu37mWp3zMwAPlbxBL1Ln_OxE7212-jyK1nOaFs4wTRIloTzyUp6kPFR-MvNjdyHyb1IVmGf304SDqhOLo2kWLXMVFX3q6bEqoqu_GT9828AYUY8kTSAf9B1fET2b2XH5Gt7FYG3tnR8XyZ4QGWdB48LhrUWqWRdM"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/60 to-transparent flex items-end p-6">
          <p className="text-white text-xs font-headline font-bold uppercase tracking-widest">
            Woven with Pride, Delivered with Care.
          </p>
        </div>
      </section>

      {/* Help Section */}
      <section className="bg-surface-container-highest rounded-2xl p-6 md:p-8 mb-12">
        <h4 className="font-headline font-extrabold text-xl mb-4">Need Assistance?</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-surface rounded-xl">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary">chat_bubble</span>
              <span className="font-bold text-sm">Live Support</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-surface rounded-xl">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-secondary">mail</span>
              <span className="font-bold text-sm">Email Logistics</span>
            </div>
            <span className="material-symbols-outlined text-outline-variant">chevron_right</span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-xl mx-auto text-center space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="mailto:support@hatvoni.com" className="px-8 py-4 bg-primary text-white rounded-full font-bold font-headline hover:bg-primary-container transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">mail</span>
            Email Support
          </a>
          <Link to="/contact" className="px-8 py-4 border-2 border-primary text-primary rounded-full font-bold font-headline hover:bg-primary hover:text-white transition-all flex items-center justify-center gap-2">
            <span className="material-symbols-outlined">chat</span>
            Live Chat
          </Link>
        </div>
      </section>
    </main>
  );
}
