import { useState } from 'react';
import { Link } from 'react-router-dom';

const faqs = [
  {
    question: "Where do your ingredients come from?",
    answer: "Every jar of Hatvoni is sourced directly from small-scale farmers across the Seven Sisters. We prioritize traditional forest-farming methods that have been passed down for generations."
  },
  {
    question: "Is your packaging biodegradable?",
    answer: "Yes. We use recyclable glass containers and our outer packaging is made from unbleached handmade paper from the region, minimizing our environmental footprint."
  },
  {
    question: "How long does shipping take?",
    answer: "Domestic orders typically arrive within 5-7 business days. Due to the remote locations of some of our partner farms, preparation may take an extra 48 hours to ensure freshness."
  },
  {
    question: "Can I visit the farms?",
    answer: "We are currently developing our 'Heritage Trail' program. Join our newsletter to be the first to know about curated farm-stay experiences."
  },
  {
    question: "Are your products 100% organic?",
    answer: "Yes. All our farmers practice age-old natural farming techniques. No chemical pesticides or synthetic fertilizers are ever used in the growth or processing of Hatvoni offerings."
  },
  {
    question: "What does \"Hatvoni\" mean?",
    answer: "Hatvoni represents the harmony between tradition and modern nutrition. It is a tribute to the agrarian wisdom passed down through generations in the Himalayan foothills."
  },
];

const categories = [
  { icon: 'local_shipping', label: 'Shipping', color: 'bg-surface-container-low' },
  { icon: 'verified', label: 'Quality', color: 'bg-primary-container text-on-primary-container' },
  { icon: 'payments', label: 'Refunds', color: 'bg-secondary-container text-on-secondary-container' },
  { icon: 'eco', label: 'Organic', color: 'bg-surface-container-highest' },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <main className="min-h-screen">
      {/* Hero — stack on mobile, side-by-side on desktop */}
      <header className="relative pt-28 pb-16 md:pt-32 md:pb-24 px-6 md:px-8 bg-surface overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center gap-10 md:gap-16">
          <div className="flex-1 z-10">
            <h1 className="font-brand text-4xl md:text-7xl text-primary leading-none mb-4 uppercase tracking-tighter">
              Support<br />Center
            </h1>
            <p className="text-on-surface-variant font-headline font-medium text-base md:text-lg leading-relaxed max-w-md">
              How can we help you preserve the heritage of North East India today?
            </p>
          </div>
          <div className="flex-1 relative w-full">
            <img
              alt="Traditional Spices"
              className="rounded-xl w-full h-56 md:h-[400px] object-cover shadow-lg"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDGr7HIijnnNV-0RmTt_qJ4bLaIzxzjFI1ZurtgJVEDBu6EmKa8X0m1q0mi5XFsoT8SqVYtUYpGDc3dPpUWCIyWkHNeURaEz_OCCkWBPkGaCBB0sK4SYYDUoXPM1y1-To3yan1IydYxekRku4e9bIczlpL4YZuQk5rSQ0ySZyLPxrssHmb-PvxP592t6j0pBKM_0XDPhvFp4GKOGbS6Dfmh3Tdp9CsFA1Y2Ib1Jc4wfg6aJ8kIf3He4ixIy953Fd11vga2K4FskWEZA"
            />
          </div>
        </div>
      </header>

      {/* Category Chips — 2-col grid on mobile */}
      <section className="px-6 md:px-8 py-8 bg-surface-container-low">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-0">
            {categories.map((cat) => (
              <div key={cat.label} className={`${cat.color} p-5 rounded-xl flex flex-col items-center text-center active:scale-95 transition-transform cursor-pointer`}>
                <span className="material-symbols-outlined text-3xl mb-2">{cat.icon}</span>
                <p className="font-headline font-bold text-xs uppercase tracking-wider">{cat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="py-12 md:py-20 px-6 md:px-8 bg-surface-container-low">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <span className="w-12 h-1 bg-tertiary"></span>
            <h2 className="font-brand text-xl md:text-2xl text-primary">Common Questions</h2>
          </div>
          <div className="space-y-2 md:space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-surface rounded-xl overflow-hidden border border-outline-variant/10">
                <button
                  onClick={() => setOpenIndex(openIndex === index ? -1 : index)}
                  className="w-full flex justify-between items-center p-5 md:p-6 text-left focus:outline-none hover:bg-surface-container transition-colors"
                >
                  <span className="font-headline font-bold text-base md:text-lg text-on-surface pr-4">{faq.question}</span>
                  <span
                    className="material-symbols-outlined text-primary transition-transform duration-300 flex-shrink-0"
                    style={{ transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0)' }}
                  >
                    expand_more
                  </span>
                </button>
                <div className={`px-5 md:px-6 overflow-hidden transition-all duration-300 ${openIndex === index ? 'max-h-48 pb-6' : 'max-h-0'}`}>
                  <p className="text-on-surface-variant leading-relaxed text-sm md:text-base">{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / Support CTA */}
      <section className="px-6 md:px-8 py-12 md:py-20 bg-surface">
        <div className="max-w-4xl mx-auto">
          <div className="bg-surface-container-low p-8 md:p-12 rounded-3xl text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary-container/10 rounded-bl-full"></div>
            <span className="material-symbols-outlined text-secondary text-5xl mb-4 inline-block">support_agent</span>
            <h3 className="font-headline font-bold text-xl md:text-2xl text-on-surface mb-3">Still have questions?</h3>
            <p className="text-on-surface-variant mb-8 text-sm">Our heritage consultants are available Monday to Friday to assist you.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="mailto:support@hatvoni.com"
                className="bg-primary-container text-on-primary-container py-4 px-8 rounded-xl font-headline font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">mail</span>
                Email Support
              </a>
              <Link
                to="/contact"
                className="bg-surface border border-outline-variant/30 py-4 px-8 rounded-xl font-headline font-bold uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-surface-variant active:scale-95 transition-all"
              >
                <span className="material-symbols-outlined text-sm">chat_bubble</span>
                Live Chat
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Grid — 2-col on mobile, 4-col on desktop */}
      <section className="pb-16 md:pb-24 px-6 md:px-8 bg-surface">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {[
            "https://lh3.googleusercontent.com/aida-public/AB6AXuCKGJAn3VEEpv9kx37BvdmTq6ksp5oBLGNGkz7-oj082mrxotOr8BWVsg95N5EIop_kfOyMOuf-iDDXaXA4dLfxudKn3cK73AJfcU96BhBOyHS7FAiXXgMPhE1GazgJELDDAkiCTMFhRDr0PHiR8xFk4cUkr1YWlzFPP9jObpi9eNm_tCFoNPitcJCT5P4cs0eLuY3yiJY8FDhZ2fcYwy7KzEZU0odw_-4-QRXWmNHki_VSDIFa0MZAQXfTOoZxeAAH6lQclL8JTRGi",
            "https://lh3.googleusercontent.com/aida-public/AB6AXuCPbh_4MQtxen0yvIhC9DEvuMhRkp11cwvmuH-cDn1MnKuDCu8y3w54Z12uf5HD6u6YSy706-CT1gpLlC9AxPvnEG3Ko6gMQAAARTgHxtLn99cxCppUAAc7PaB6EmnB-5DuLN9Sjn4tfso_jVRqcrBi7YEL8Chbm4DZ9G01nXo-LOHPMj1zd7RM6qPZVVXhckv1OKlg-CpeJzql5rsXb3YW4eMGfyAcPT73y_nm3JoV9tpsPhj3DIlyarB6g6TQlrXsjBsIkXcx50fG",
            "https://lh3.googleusercontent.com/aida-public/AB6AXuDnvzFxItcUPIGjp4RuS2x38mUkwJ7dzsQMYvXisYM25i7mB-s-IpK3nVjkXz1z68V6qCQgqRDu_HjgrVS1XPy3EV8Cfe4043rTX499ZWg4VJmSxddytGSmPOsSunKV5ymPArILljnWUr5moUam7tasw_tLztcpSrVjSKFbWjYjL5E69krAwGgKacVNXUrEOdAlxrZrsmaQ8ZFjTfERGpGs0ryJe_l5F9SHtmvBO3Pvm15hK_V5Lc9EnGBKppz2_A00NNYPhCgQldXk",
            "https://lh3.googleusercontent.com/aida-public/AB6AXuBoeo56mGbqbflKRBCv7VDFAObStQgWPnkREsLE71anqkjGUg3BqV1kRvpBIORop9_evRouAJ0I79orqLwUnwqgDfLcdnjgsecK6PqE4jpAUSVhnZ-sC4eSX73IC-JlgVetrjfotc7FUbI_HxxVp7VHn5ZQSNDlP78xOEcDVzMxOQamWYtJCjI2JFDRppSXxHvNmgNbd4Q1nB0iqxpwf53tuV7p6ZKqRdpp5LI3OTCdPWzQWf0BdEBaIPRscWgm9O41P_enJUTz_UW4",
          ].map((src, i) => (
            <img key={i} className={`w-full h-40 md:h-64 object-cover rounded-lg ${i % 2 !== 0 ? 'mt-4 md:mt-16' : ''}`} alt={`Heritage ${i}`} src={src} />
          ))}
        </div>
      </section>
    </main>
  );
}
