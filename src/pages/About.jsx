export default function About() {
  return (
    <main className="pt-8 md:pt-12">
      {/* Hero */}
      <section className="relative h-[870px] flex items-center overflow-hidden px-6 md:px-12 mb-24">
        <div className="absolute inset-0 z-0">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuBBLX96F_KbOITMSv8dOyJk3xnCDVotxakfhGmaAFDWxbQi2K2bNhzof1YeS58_aEYk87CehTFn3Jpjbz7iLnlzqtrfXFmUiq68qLjPSY8zdpgm8g91a5g6JePBQTxILpWCVuyrOgLGFpeON9btZg_AKvXSSYxx_4VtIvUKCxo0tJRuU1Vu1VV9UTAT-Z_7eCcxmFwRdzwzyHrwGmZuuEvbyc7V_UtkkYQtlo-NwkjC7X4tiVoCY0fibK-Ac1qNxG-ELn4Tt4qu-WOB"
            alt="Northeast India Hills"
            className="w-full h-full object-cover grayscale-[20%] sepia-[10%]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/60 to-transparent" />
        </div>
        <div className="relative z-10 max-w-4xl text-white">
          <h1 className="font-brand text-5xl md:text-8xl leading-tight mb-8" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            Honoring<br />Ancestral Wisdom
          </h1>
          <p className="font-body text-xl md:text-2xl font-light max-w-2xl text-white/90 leading-relaxed">
            Hatvoni is more than a brand; it's a bridge to the sacred hills and fertile valleys of the Seven Sisters.
          </p>
        </div>
      </section>

      {/* The Story */}
      <section className="max-w-screen-2xl mx-auto px-6 md:px-12 mb-32 grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
        <div className="md:col-span-5 order-2 md:order-1">
          <div className="space-y-8">
            <span className="font-headline text-secondary font-bold tracking-[0.2em] uppercase text-sm">Our Origins</span>
            <h2 className="font-brand text-4xl text-primary leading-tight">Born in the Hills of the Seven Sisters</h2>
            <div className="space-y-6 text-on-surface-variant font-body leading-loose">
              <p>Our journey began in the mist-shrouded peaks of Arunachal Pradesh and the emerald plains of Assam. Hatvoni was conceived as a tribute to the resilient spirit of the agrarian communities that have flourished here for millennia.</p>
              <p>We work directly with local farmers who still use the methods of their ancestors—hand-harvesting spices, sun-drying herbs, and cold-pressing oils in small batches to preserve the vital energy of the land.</p>
            </div>
            <div className="pt-6">
              <a href="#" className="inline-flex items-center space-x-3 text-primary font-bold group">
                <span className="border-b-2 border-primary pb-1">Discover our process</span>
                <span className="material-symbols-outlined transition-transform group-hover:translate-x-2">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
        <div className="md:col-span-7 order-1 md:order-2 relative h-[600px]">
          <div className="absolute inset-0 rounded-xl overflow-hidden shadow-2xl rotate-1 translate-x-4">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuCbt3jLfoQk5v2Jk4Ib0GjU5RjacJ2JNVbRYFu1A0oa7-_ZLwbiXuwvYl-Mz8mvIBA3Uf4q77QZQ6BN4NxPswg0CA-0_adkhgpOGe0Y2fgU-zoq819avGSnN75msxZotbSnbu-uF5fCIrBgVo9aIy-XrTjRkvtZKea02acxemvqmhQQINCZGO7rUmsPRwghWnjWv-9T2Jk7cBqgyi9WfsB-uSJ_64K3qgX7E8A9E2012cImWfpXq5MOh_RcCGFoDZ4zYtL4-ARKOVnJ"
              alt="Artisan at work"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute -bottom-10 -left-10 w-64 h-80 bg-secondary-container rounded-xl overflow-hidden hidden md:block border-8 border-white shadow-xl">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAlM8Q05uawNQtIYsXI5o5lK2PduIzqU2uM-SnpdBGHHawqtL-SQlCJ_FHFpF1AcZOYa-kxnoYgjJ2RMppFt2htKiMVAnq3m-8QADM0x7vZje0ItJZvfpkVQJtoAQmSxobYQDHXEjXhes5-uk-Z5Vh43ZB3LUMOI0yS6dn8jyatolYaJwtLVdoXpba_BMzlr7lYzViSvR8NM-NmFMTCV4t4q6XWCkSYlzeb4y716EMHUOdu-dK9b14bIZCRQabvRlcnPwse5Kae_XRN"
              alt="Harvest spices"
              className="w-full h-full object-cover grayscale"
            />
          </div>
        </div>
      </section>

      {/* Core Mission Pillars */}
      <section className="bg-surface-container-low py-32 px-6 md:px-12 overflow-hidden">
        <div className="max-w-screen-2xl mx-auto">
          <div className="mb-20 text-center max-w-2xl mx-auto">
            <h2 className="font-brand text-4xl text-primary mb-6">Our Foundational Pillars</h2>
            <p className="text-on-surface-variant">We are committed to a sustainable future that respects the rhythmic pulse of the earth and the hands that tend it.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-2 md:row-span-2 bg-white p-12 rounded-xl flex flex-col justify-between group overflow-hidden relative shadow-sm">
              <div className="relative z-10">
                <span className="material-symbols-outlined text-secondary text-5xl mb-8 block">eco</span>
                <h3 className="font-brand text-2xl font-bold text-primary mb-4">Biodynamic Preservation</h3>
                <p className="text-on-surface-variant leading-relaxed">Protecting native heirloom seeds and promoting ancient polyculture farming methods that rejuvenate the soil naturally without chemical interference.</p>
              </div>
              <div className="absolute bottom-0 right-0 opacity-5 group-hover:opacity-10 transition-opacity translate-y-10 translate-x-10">
                <span className="material-symbols-outlined" style={{ fontSize: '20rem' }}>forest</span>
              </div>
            </div>
            <div className="md:col-span-2 bg-primary text-white p-12 rounded-xl flex items-center justify-between shadow-sm">
              <div className="max-w-xs">
                <h3 className="font-headline text-2xl font-bold mb-4">Ethical Sourcing</h3>
                <p className="text-white/80">Every product ensures 100% fair trade and direct-to-farmer profit sharing.</p>
              </div>
              <span className="material-symbols-outlined text-secondary-container text-6xl">handshake</span>
            </div>
            <div className="bg-secondary-container p-8 rounded-xl flex flex-col justify-center shadow-sm">
              <h4 className="font-brand text-4xl text-on-secondary-container mb-2">100%</h4>
              <p className="font-headline font-bold text-on-secondary-container/80 uppercase text-xs tracking-widest">Artisanal Quality</p>
            </div>
            <div className="bg-white p-8 rounded-xl flex flex-col justify-center border-2 border-dashed border-outline-variant shadow-sm">
              <h4 className="font-brand text-4xl text-primary mb-2">Heritage</h4>
              <p className="font-headline font-bold text-primary/80 uppercase text-xs tracking-widest">Preserved Skills</p>
            </div>
          </div>
        </div>
      </section>

      {/* Faces of Hatvoni */}
      <section className="py-32 max-w-screen-2xl mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row gap-16 items-start">
          <div className="md:w-1/3 md:sticky top-32">
            <h2 className="font-brand text-4xl text-primary leading-tight mb-8">The Faces of Hatvoni</h2>
            <p className="text-on-surface-variant leading-loose mb-12">Meet the guardians of the Seven Sisters' culinary legacy. From master picklers to spice harvesters, these are the individuals whose wisdom is captured in every Hatvoni jar.</p>
            <div className="flex space-x-2">
              <div className="w-12 h-1 bg-secondary" />
              <div className="w-12 h-1 bg-primary/20" />
              <div className="w-12 h-1 bg-primary/20" />
            </div>
          </div>
          <div className="md:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="space-y-6">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBA8HJpFxDW0U_PJxceLjDUyn9UawPx5yD0uPFAzz8WEDaa6jRrQ9MZQYSX2u2hhF3frdgtZJA8Gw28JTezp7JaYuiKHpnVUsNxPVxGGQeAZL4LtiRqyqCZA1CItec-S0ekZ5bVAuJQjsGTjpkFGLmzKbo7PE5ID-Uh_zS630fs5AoSYLQPl1WOeHuQfcOpvAp1Vma4W2RC5y1r0UN3GP4cFHms-0WuT2tS3VnzpAivSR6snDJJ3W_g5JgdhG-COVCgSOg-LSdFKKVQ"
                alt="Local Producer"
                className="w-full aspect-[3/4] object-cover rounded-xl"
              />
              <h4 className="font-brand text-xl font-bold text-primary">Ananya's Garden, Assam</h4>
              <p className="text-on-surface-variant">Ananya oversees our heritage rice collective, ensuring the ancient 'Boka Saul' variety remains as potent as it was in her grandfather's time.</p>
            </div>
            <div className="space-y-6 pt-32 md:pt-40">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDuLgIyYW8ShMe7Xn2hNURJ3Fa-7QXW7-TIVSYDPEkq931mRKaFUdiGNaY-lCyZmT4nLqXZECrPJzQpztgttpQFhgRtpr0RxNrzOkFsN6meG4Y1JqjGHEKNfnQVKNxHnQI6WKLs6BbvqTef35usm5UVGKIaq_WkUjG8ZL7yZMOJeX5C6iet_AZTnbe1U-RRghzfEgCt7rHtE29E524kYfW4fSERA7kNKYKTLQhlljLxVqFvWAeWFEKsOcgAXYm2maLdSpoLmz7ePrvh"
                alt="Traditional Fermentation"
                className="w-full aspect-[3/4] object-cover rounded-xl"
              />
              <h4 className="font-brand text-xl font-bold text-primary">The Fermentation Lab</h4>
              <p className="text-on-surface-variant">Our slow-aging process takes place in the cooler altitudes of Mizoram, where temperature and spirit align perfectly.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative bg-primary py-32 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #ffffff 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        </div>
        <div className="relative z-10 text-center max-w-3xl mx-auto px-6">
          <h2 className="font-brand text-4xl md:text-5xl text-secondary-container mb-8">Bring the wisdom of the hills home.</h2>
          <p className="text-white/80 font-body text-lg mb-12">Experience the authentic flavors and artisanal purity of North East India delivered to your doorstep.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <button className="bg-secondary-container text-on-secondary-container font-headline font-bold px-10 py-5 rounded-xl hover:bg-secondary-fixed-dim transition-colors uppercase tracking-widest text-sm">Shop Collection</button>
            <button className="border border-white/30 text-white font-headline font-bold px-10 py-5 rounded-xl hover:bg-white/10 transition-colors uppercase tracking-widest text-sm">View Our Heritage</button>
          </div>
        </div>
      </section>
    </main>
  );
}
