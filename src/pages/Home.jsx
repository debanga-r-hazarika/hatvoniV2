import { Link } from 'react-router-dom';

// ── Figma asset URLs (fresh fetch) ──────────────────────────────────────────
const imgHeroBg        = "https://www.figma.com/api/mcp/asset/310de7a5-23a3-430c-a32d-7213d3f7548f";
const imgHeroProduct   = "https://www.figma.com/api/mcp/asset/5708da04-aea6-4ea6-85da-ae69333e903e";
const imgOrigins1      = "https://www.figma.com/api/mcp/asset/3b35020a-3c56-4e00-af2e-011a20f63260";
const imgOrigins2      = "https://www.figma.com/api/mcp/asset/a371e91a-e592-459a-8ea7-1342d2d2aecc";
const imgOrigins3      = "https://www.figma.com/api/mcp/asset/93819dda-f63e-4d6c-ae5a-32460e5f76b8";
const imgEthicalIcon   = "https://www.figma.com/api/mcp/asset/676239be-3a45-4631-b1fb-d5acb98523d1";
const imgBioIcon       = "https://www.figma.com/api/mcp/asset/c4cc43f7-0344-4993-80c4-300f8c4e1b0a";
const imgProductBottle = "https://www.figma.com/api/mcp/asset/a2bd73e5-06f9-4fbe-94bc-73e3578f5839";
const imgLabel1        = "https://www.figma.com/api/mcp/asset/5833bcff-3233-47eb-810f-17a0407f4991";
const imgLabel2        = "https://www.figma.com/api/mcp/asset/13c9cc5d-2326-4f30-b711-177567396fe9";
const imgEssence       = "https://www.figma.com/api/mcp/asset/8bb0bb1f-36a3-4437-b260-ea8dc05c06e2";
const imgLogoVec1      = "https://www.figma.com/api/mcp/asset/9b0ba32c-1eb8-46d5-abf3-af0e758ee4b1";
const imgLogoVec2      = "https://www.figma.com/api/mcp/asset/777ffe7d-abd2-4daf-9839-59aa5e6ed117";
const imgLogoGroup     = "https://www.figma.com/api/mcp/asset/21a44aa3-d33e-45c9-81f6-baf7cdc5e8ed";
const imgLogoVec3      = "https://www.figma.com/api/mcp/asset/e702a796-4a9a-490d-883e-b8b97f401b86";

const products = [
  { id: 1, name: 'Kola Khar',        subtitle: 'Traditional Alkaline Water', price: '₹100.00', original: '₹150.00', label: imgLabel1 },
  { id: 2, name: 'Matimah Khar',     subtitle: 'Traditional Alkaline Water', price: '₹100.00', original: '₹150.00', label: imgLabel2 },
  { id: 3, name: 'Khardwi Khar',     subtitle: 'Traditional Alkaline Water', price: '₹100.00', original: '₹150.00', label: imgLabel1 },
  { id: 4, name: 'Dry Bamboo Shoot', subtitle: 'Fermented Item',             price: '₹120.00', original: '₹180.00', label: imgLabel2 },
];

export default function Home() {
  return (
    <>
      {/* ════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ minHeight: '100vh' }}>
        {/* Full-bleed background photo */}
        <img
          src={imgHeroBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Gradient overlay — matches Figma: top-right transparent → bottom-left green */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(196deg, rgba(255,255,164,0) 17%, rgba(0,74,43,0.55) 67%)' }}
        />
        {/* Bottom fade to black (product silhouette area) */}
        <div
          className="absolute bottom-0 left-0 right-0 h-56"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(11,11,11,0.79) 100%)' }}
        />

        {/* Product image — bottom-left, partially cropped */}
        <div className="absolute bottom-0 left-0 w-[55%] pointer-events-none select-none" style={{ maxWidth: 900 }}>
          <img src={imgHeroProduct} alt="" className="w-full object-contain object-bottom" />
        </div>

        {/* Hero text */}
        <div className="relative z-10 flex flex-col justify-center min-h-screen px-8 md:px-24 pt-28 pb-32">
          {/* "Honouring" — Luxurious Script, very large */}
          <div
            className="text-white leading-none"
            style={{ fontFamily: "'Luxurious Script', cursive", fontSize: 'clamp(72px, 9.5vw, 137px)', lineHeight: 1.65 }}
          >
            Honouring
          </div>
          {/* "Ancestral Wisdom" — Rammetto One bold */}
          <div
            className="text-white leading-none -mt-2"
            style={{ fontFamily: "'Rammetto One', sans-serif", fontSize: 'clamp(40px, 5.8vw, 83px)', lineHeight: 1.08 }}
          >
            Ancestral Wisdom
          </div>
          {/* "of  North East, India" — script again */}
          <div
            className="text-white leading-none mt-1"
            style={{ fontFamily: "'Luxurious Script', cursive", fontSize: 'clamp(36px, 5.5vw, 90px)', lineHeight: 1.7 }}
          >
            of&nbsp;&nbsp;North East, India
          </div>

          {/* CTA buttons */}
          <div className="flex flex-wrap gap-4 mt-10">
            <Link to="/about">
              <button
                className="px-8 py-3.5 rounded-xl text-white text-xl font-normal transition-opacity hover:opacity-90"
                style={{ background: '#fcb748', fontFamily: "'Inter', sans-serif" }}
              >
                Explore Our Story
              </button>
            </Link>
            <Link to="/products">
              <button
                className="px-8 py-3.5 rounded-xl text-white text-xl font-normal border border-white hover:bg-white/10 transition-colors"
                style={{ fontFamily: "'Inter', sans-serif" }}
              >
                See Products
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          OUR ORIGINS
      ════════════════════════════════════════════ */}
      <section className="py-24 px-8 md:px-20 bg-[#fbfaf1]">
        <div className="max-w-5xl mx-auto text-center">
          <p
            className="font-semibold text-[#815500] tracking-[5px] uppercase mb-5"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: 20 }}
          >
            OUR ORIGINS
          </p>
          <h2
            className="text-[#004a2b] mb-8"
            style={{ fontFamily: "'Rammetto One', sans-serif", fontSize: 36, lineHeight: '45px' }}
          >
            Born in the Hills of the Seven Sisters
          </h2>
          <p className="text-[#3f4942] text-base leading-8 mb-2" style={{ fontFamily: "'Inter', sans-serif" }}>
            Our journey began in the mist-shrouded peaks of Arunachal Pradesh and the emerald plains of Assam.
            Hatvoni was conceived as a tribute to the resilient spirit of the agrarian communities that have flourished here for millennia.
          </p>
          <p className="text-[#3f4942] text-base leading-8 mb-14" style={{ fontFamily: "'Inter', sans-serif" }}>
            We work directly with local farmers who still use the methods of their ancestors — hand-harvesting spices, sun-drying herbs, and fermenting items in small batches to preserve the vital energy of the land.
          </p>

          {/* 3-photo mosaic */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            <div className="rounded-2xl overflow-hidden aspect-[3/4]">
              <img src={imgOrigins1} alt="Artisan at work" className="w-full h-full object-cover" />
            </div>
            <div className="rounded-2xl overflow-hidden aspect-[3/4]">
              <img src={imgOrigins2} alt="North East landscape" className="w-full h-full object-cover" />
            </div>
            <div className="rounded-2xl overflow-hidden aspect-[3/4]">
              <img src={imgOrigins3} alt="Traditional farming" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Discover link */}
          <div className="flex items-center gap-2 justify-start">
            <Link
              to="/about"
              className="border-b-2 border-[#004a2b] pb-0.5 text-[#004a2b] font-semibold text-base hover:opacity-70 transition-opacity"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Discover our process
            </Link>
            <span className="material-symbols-outlined text-[#004a2b] text-lg">arrow_right_alt</span>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          FOUNDATIONAL PILLARS
      ════════════════════════════════════════════ */}
      <section className="py-24 px-8 md:px-20 bg-[#fbfaf1]">
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-center text-[#004a2b] mb-14"
            style={{ fontFamily: "'Rammetto One', sans-serif", fontSize: 36, lineHeight: '45px' }}
          >
            Our Foundational Pillars
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left — Biodynamic Preservation */}
            <div className="flex flex-col gap-4 p-10 rounded-2xl bg-white border border-[#004a2b]/10">
              <img src={imgBioIcon} alt="" className="w-10 h-10 object-contain" />
              <h3
                className="font-bold text-[#004a2b] text-2xl"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Biodynamic Preservation
              </h3>
              <p className="text-[#3f4942] text-base leading-[26px]" style={{ fontFamily: "'Inter', sans-serif" }}>
                Protecting native heirloom seeds and promoting ancient polyculture farming methods that rejuvenate the soil naturally without chemical interference.
              </p>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-6">
              {/* Ethical Sourcing — dark green card */}
              <div
                className="rounded-2xl p-10 flex items-center justify-between gap-6"
                style={{ background: '#004a2b' }}
              >
                <div className="flex flex-col gap-4">
                  <h3
                    className="font-bold text-white text-2xl"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    Ethical Sourcing
                  </h3>
                  <p className="text-white/80 text-base leading-6" style={{ fontFamily: "'Inter', sans-serif" }}>
                    Every product ensures 100% fair trade<br />and direct-to-farmer profit sharing.
                  </p>
                </div>
                <img src={imgEthicalIcon} alt="" className="w-14 h-14 shrink-0 object-contain" />
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-6">
                <div className="rounded-2xl p-8 flex flex-col justify-center" style={{ background: '#fcb748' }}>
                  <p
                    className="text-xs font-bold text-[rgba(0,74,43,0.8)] tracking-[1.2px] uppercase mb-1"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    Artisanal Quality
                  </p>
                  <p
                    className="text-[#004a2b] text-4xl"
                    style={{ fontFamily: "'Rammetto One', sans-serif" }}
                  >
                    100%
                  </p>
                </div>
                <div className="rounded-2xl p-8 flex flex-col justify-center border border-black bg-white">
                  <p
                    className="text-xs font-bold text-[rgba(0,74,43,0.8)] tracking-[1.2px] uppercase mb-1"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    Preserved Skills
                  </p>
                  <p
                    className="text-[#004a2b] text-4xl"
                    style={{ fontFamily: "'Rammetto One', sans-serif" }}
                  >
                    Heritage
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          THE ESSENCE — PRODUCTS (amber bg)
      ════════════════════════════════════════════ */}
      <section className="py-24 px-8 md:px-20" style={{ background: '#fcb748' }}>
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-center text-[#004a2b] mb-14"
            style={{ fontFamily: "'Rammetto One', sans-serif", fontSize: 36, lineHeight: '45px' }}
          >
            The Essence of North East India
          </h2>

          {/* Product cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            {products.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl p-5 flex flex-col">
                {/* Bottle + label */}
                <div className="relative flex items-center justify-center h-64 mb-4">
                  <img src={imgProductBottle} alt="" className="h-full object-contain" />
                  <img
                    src={p.label}
                    alt=""
                    className="absolute w-16 object-contain"
                    style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                <p
                  className="text-[#004a2b] text-sm font-light leading-relaxed"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {p.subtitle}
                </p>
                <p
                  className="text-[#004a2b] font-semibold text-xl mt-1"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  {p.name}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[#004a2b] font-semibold text-xl" style={{ fontFamily: "'Inter', sans-serif" }}>
                    {p.price}
                  </span>
                  <span
                    className="text-[#004a2b] font-semibold text-xl line-through opacity-60"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {p.original}
                  </span>
                </div>
                <p className="text-[#004a2b] text-xs font-light mt-0.5" style={{ fontFamily: "'Inter', sans-serif" }}>
                  (Incl. all taxes)
                </p>
              </div>
            ))}
          </div>

          {/* View All */}
          <div className="flex justify-center">
            <Link to="/products">
              <button
                className="px-10 py-3.5 rounded-xl text-[#fcb748] text-xl font-normal hover:opacity-90 transition-opacity"
                style={{ background: '#004a2b', fontFamily: "'Inter', sans-serif" }}
              >
                View All
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          BRING THE WISDOM HOME — CTA
      ════════════════════════════════════════════ */}
      <section className="py-24 px-8 md:px-20 bg-[#fbfaf1]">
        <div className="max-w-5xl mx-auto">
          {/* Essence photo */}
          <div className="rounded-2xl overflow-hidden mb-16" style={{ maxHeight: 480 }}>
            <img src={imgEssence} alt="North East India essence" className="w-full h-full object-cover" />
          </div>

          <div className="text-center">
            <h2
              className="text-[#004a2b] mb-6"
              style={{ fontFamily: "'Rammetto One', sans-serif", fontSize: 36, lineHeight: '45px' }}
            >
              Bring the wisdom of the<br />hills home.
            </h2>
            <p
              className="text-[rgba(0,0,0,0.8)] text-lg leading-7 max-w-2xl mx-auto mb-10"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Experience the authentic flavors and artisanal purity of North East India delivered to your doorstep.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/products">
                <button
                  className="px-10 py-3.5 rounded-xl text-[#004a2b] text-xl font-normal hover:opacity-90 transition-opacity"
                  style={{ background: '#fcb748', fontFamily: "'Inter', sans-serif" }}
                >
                  Shop Collection
                </button>
              </Link>
              <Link to="/about">
                <button
                  className="px-10 py-3.5 rounded-xl text-[#2a2a2a] text-xl font-normal border border-[#2a2a2a] hover:bg-black/5 transition-colors"
                  style={{ fontFamily: "'Inter', sans-serif" }}
                >
                  View our heritage
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════ */}
      <footer className="py-20 px-8 md:px-20" style={{ background: '#004a2b' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              {/* Logo vectors */}
              <div className="flex items-center gap-1 mb-3">
                <img src={imgLogoVec1} alt="" className="h-5 object-contain" />
                <img src={imgLogoVec2} alt="" className="h-5 object-contain" />
                <img src={imgLogoGroup} alt="" className="h-5 object-contain" />
                <img src={imgLogoVec3} alt="" className="h-5 object-contain" />
              </div>
              <p className="text-white text-xs mb-3" style={{ fontFamily: "'Inter', sans-serif" }}>
                Authentic Flavours from Seven Sister's
              </p>
              <p
                className="text-white/80 text-base leading-relaxed"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Honoring the agricultural heritage of the Seven Sisters through ethical, artisanal nourishment.
              </p>
            </div>

            {/* Explore */}
            <div>
              <p
                className="text-white text-xs font-bold tracking-[1.35px] uppercase mb-5"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Explore
              </p>
              {['Sustainability', 'Shipping Policy', 'Privacy Policy', 'Terms of Service'].map((item) => (
                <p
                  key={item}
                  className="text-white text-base mb-3 cursor-pointer hover:opacity-70 transition-opacity"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {item}
                </p>
              ))}
            </div>

            {/* Community */}
            <div>
              <p
                className="text-white text-xs font-bold tracking-[1.35px] uppercase mb-5"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Community
              </p>
              {['Journal', 'Farmer Collective', 'Press Kit'].map((item) => (
                <p
                  key={item}
                  className="text-white text-base mb-3 cursor-pointer hover:opacity-70 transition-opacity"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {item}
                </p>
              ))}
            </div>

            {/* Stay Connected */}
            <div>
              <p
                className="text-white text-xs font-bold tracking-[1.35px] uppercase mb-5"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Stay Connected
              </p>
              <p className="text-white text-base mb-3" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Your mail
              </p>
              <form onSubmit={(e) => e.preventDefault()} className="flex items-center">
                <input
                  type="email"
                  placeholder="Enter email"
                  className="flex-1 bg-transparent border border-white text-white placeholder:text-white/40 px-3 py-2 text-sm outline-none"
                />
                <button
                  type="submit"
                  className="border border-white border-l-0 px-3 py-2 text-white text-xs font-bold tracking-[1.35px] uppercase hover:bg-white/10 transition-colors"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  Subscribe →
                </button>
              </form>
            </div>
          </div>

          {/* Social icons row */}
          <div className="flex items-center gap-5 mb-8">
            {[imgLogoVec1, imgLogoVec2, imgLogoGroup, imgLogoVec3].map((src, i) => (
              <img key={i} src={src} alt="" className="h-5 w-5 object-contain opacity-80 hover:opacity-100 cursor-pointer transition-opacity" />
            ))}
          </div>

          <div className="border-t border-white/10 pt-6">
            <p
              className="text-white/40 text-sm"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              © 2024 Hatvoni. Honoring the agricultural heritage of the Seven Sisters.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
