import { Link } from 'react-router-dom';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// ── Figma asset URLs (retained existing placeholders) ──────────────────────────────────────────
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

const products = [
  { id: 1, name: 'Kola Khar',        subtitle: 'Traditional Alkaline Water', price: '₹100.00', original: '₹150.00', label: imgLabel1 },
  { id: 2, name: 'Matimah Khar',     subtitle: 'Traditional Alkaline Water', price: '₹100.00', original: '₹150.00', label: imgLabel2 },
  { id: 3, name: 'Khardwi Khar',     subtitle: 'Traditional Alkaline Water', price: '₹100.00', original: '₹150.00', label: imgLabel1 },
  { id: 4, name: 'Dry Bamboo Shoot', subtitle: 'Fermented Item',             price: '₹120.00', original: '₹180.00', label: imgLabel2 },
];

export default function Home() {
  return (
    <div className="bg-surface">
      {/* ════════════════════════════════════════════
          HERO SECTION
      ════════════════════════════════════════════ */}
      <section className="relative w-full min-h-[100dvh] flex items-center overflow-hidden pt-20 pb-16 md:pb-0">
        {/* Background Image & Intelligent Gradients */}
        <div className="absolute inset-0 z-0">
          <img src={imgHeroBg} alt="North East India Tea Garden" className="w-full h-full object-cover lg:object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/70 to-primary/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-transparent to-transparent hidden md:block" />
        </div>
        
        {/* Decorative Overlay floating product */}
        <div className="absolute right-0 bottom-0 w-[80%] md:w-1/2 max-w-[800px] pointer-events-none opacity-40 md:opacity-100 z-10 translate-x-10 md:translate-x-0">
           <img src={imgHeroProduct} alt="Hatvoni Product Silhouette" className="w-full object-contain object-bottom drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-fade-up delay-300" />
        </div>

        {/* Hero Content */}
        <div className="relative z-20 w-full max-w-screen-2xl mx-auto px-6 md:px-12 xl:px-20 text-white">
          <div className="max-w-2xl animate-fade-up">
            <span className="inline-block py-1.5 px-4 rounded-full bg-secondary-container/20 border border-secondary-container/30 text-secondary-container text-[11px] font-bold tracking-[0.25em] mb-8 backdrop-blur-md">
              THE HERITAGE COLLECTION
            </span>
            
            <div className="mb-8 drop-shadow-md relative">
              {/* Elegant typography mix recreating the original vibe but beautifully spaced */}
              <div style={{ fontFamily: "'Luxurious Script', cursive" }} className="text-[clamp(3.5rem,7vw,5.5rem)] text-secondary-container leading-[0.7] -translate-x-2">
                Honouring
              </div>
              <h1 className="font-brand text-[clamp(2.5rem,5.5vw,4.5rem)] leading-[1.15] mb-2 uppercase tracking-tight text-white mt-1">
                Ancestral <br className="hidden md:block"/> Wisdom
              </h1>
              <div style={{ fontFamily: "'Luxurious Script', cursive" }} className="text-[clamp(2.5rem,5vw,4rem)] text-white/90 leading-[0.8]">
                of North East, India
              </div>
            </div>
            
            <p className="font-body text-lg md:text-[20px] text-white/80 mb-10 max-w-lg leading-relaxed font-light">
              Experience pristine flavours, traditional alkaline waters, and artisanal history directly from the agrarian communities of the Seven Sisters.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/products" className="px-8 py-4 bg-secondary-container text-on-secondary-container font-headline font-bold text-[15px] rounded-full hover:bg-secondary-fixed transition-all duration-300 shadow-[0_0_20px_rgba(252,183,72,0.2)] hover:shadow-[0_0_30px_rgba(252,183,72,0.4)] active:scale-95 group flex items-center justify-center gap-3">
                Shop Collection
                <span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">arrow_forward</span>
              </Link>
              <Link to="/about" className="px-8 py-4 bg-white/10 backdrop-blur-md border border-white/20 text-white font-headline font-bold text-[15px] rounded-full hover:bg-white/20 transition-all duration-300 active:scale-95 flex items-center justify-center">
                Our Story
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          OUR ORIGINS
      ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 px-6 md:px-12 xl:px-20 bg-surface">
        <div className="max-w-screen-2xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            {/* Text Content */}
            <div className="order-2 lg:order-1 animate-fade-up">
              <div className="flex items-center gap-4 mb-6">
                <span className="w-12 h-[2px] bg-secondary"></span>
                <p className="font-headline font-bold text-secondary tracking-[0.25em] uppercase text-sm">
                  Our Origins
                </p>
              </div>
              <h2 className="font-brand text-primary text-[clamp(2rem,4vw,3.5rem)] leading-[1.15] mb-8">
                Born in the Hills of the <br className="hidden lg:block"/> Seven Sisters
              </h2>
              <div className="font-body text-on-surface-variant text-[17px] leading-[1.8] flex flex-col gap-6 mb-10">
                <p>
                  Our journey began in the mist-shrouded peaks of Arunachal Pradesh and the emerald plains of Assam.
                  Hatvoni was conceived as a tribute to the resilient spirit of the agrarian communities that have flourished here for millennia.
                </p>
                <p>
                  We work directly with local farmers who still use the methods of their ancestors — hand-harvesting spices, sun-drying herbs, and fermenting items in small batches to preserve the vital energy of the land.
                </p>
              </div>
              <Link to="/about" className="inline-flex items-center gap-3 text-primary font-headline font-bold text-[15px] border-b-2 border-primary/30 pb-1.5 hover:border-primary transition-all group">
                Discover our process
                <span className="material-symbols-outlined text-xl transition-transform group-hover:translate-x-2">trending_flat</span>
              </Link>
            </div>
            
            {/* Image Mosaic */}
            <div className="order-1 lg:order-2 grid grid-cols-2 gap-4 md:gap-6 relative animate-fade-up delay-200">
              <div className="flex flex-col gap-4 md:gap-6 pt-12 md:pt-20">
                <div className="rounded-[2rem] overflow-hidden aspect-[4/5] shadow-lg">
                  <img src={imgOrigins1} alt="Artisan at work" className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-700" />
                </div>
                <div className="rounded-[2rem] overflow-hidden aspect-square shadow-lg">
                  <img src={imgOrigins3} alt="Traditional farming" className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-700" />
                </div>
              </div>
              <div className="rounded-[2rem] overflow-hidden aspect-[3/4] shadow-xl relative z-10 hidden sm:block">
                <img src={imgOrigins2} alt="North East landscape" className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-700" />
              </div>
              <div className="rounded-[2rem] overflow-hidden aspect-[3/4] shadow-xl relative z-10 sm:hidden pb-12">
                <img src={imgOrigins2} alt="North East landscape" className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-700 object-right" />
              </div>
              
              {/* Decorative element */}
              <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full border border-secondary-container opacity-50 -z-10 animate-[spin_20s_linear_infinite] border-dashed"></div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          FOUNDATIONAL PILLARS
      ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 px-6 md:px-12 xl:px-20 bg-surface-container-low relative overflow-hidden">
        {/* Background Accent Element */}
        <div className="absolute top-0 right-0 w-[40%] h-full bg-primary/[0.03] rounded-l-[100px] pointer-events-none hidden lg:block" />
        
        <div className="max-w-screen-2xl mx-auto relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16 lg:mb-20 animate-fade-up">
            <h2 className="font-brand text-primary text-[clamp(2.5rem,4vw,3.5rem)] mb-6">Our Foundational Pillars</h2>
            <p className="font-body text-on-surface-variant text-lg lg:text-xl">The core beliefs that drive every product we source and every farmer we partner with.</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
            {/* Left Box: Biodynamic */}
            <div className="lg:col-span-5 bg-surface-container-lowest rounded-[2rem] p-8 md:p-12 shadow-sm border border-outline-variant/20 flex flex-col justify-center animate-fade-up delay-100 hover:shadow-md transition-shadow group">
              <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-8 border border-primary/10 group-hover:bg-primary/10 transition-colors">
                <img src={imgBioIcon} alt="Biodynamic" className="w-8 h-8 object-contain" />
              </div>
              <h3 className="font-brand text-primary text-3xl mb-5">Biodynamic<br className="hidden xl:block"/> Preservation</h3>
              <p className="font-body text-on-surface-variant text-[16px] leading-[1.8]">
                Protecting native heirloom seeds and promoting ancient polyculture farming methods that rejuvenate the soil naturally without chemical interference.
              </p>
            </div>
            
            {/* Right Stack */}
            <div className="lg:col-span-7 flex flex-col gap-6 md:gap-8 animate-fade-up delay-200">
              
              {/* Ethical Sourcing Hero Card */}
              <div className="bg-primary rounded-[2rem] p-8 md:p-12 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 group overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer" />
                <div className="relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-secondary-fixed text-[10px] font-bold tracking-[0.15em] mb-5 uppercase border border-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary-fixed animate-pulse"></span>
                    Fair Trade
                  </div>
                  <h3 className="font-brand text-white text-3xl mb-4">Ethical Sourcing</h3>
                  <p className="font-body text-white/80 text-[16px] leading-[1.7] max-w-md">
                    Every product ensures 100% fair trade and direct-to-farmer profit sharing. We honour the hands that feed us.
                  </p>
                </div>
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/20 relative z-10 backdrop-blur-md">
                  <img src={imgEthicalIcon} alt="" className="w-10 h-10 object-contain" />
                </div>
              </div>
              
              {/* Stats Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8">
                 <div className="bg-secondary-container rounded-[2rem] p-8 md:p-10 flex flex-col justify-center shadow-sm border border-secondary-container drop-shadow-sm hover:-translate-y-1 transition-transform">
                    <p className="font-headline font-bold text-secondary text-[11px] tracking-[0.2em] uppercase mb-2">Artisanal Quality</p>
                    <p className="font-brand text-primary text-5xl">100%</p>
                 </div>
                 <div className="bg-surface-container-lowest rounded-[2rem] p-8 md:p-10 flex flex-col justify-center shadow-sm border border-outline-variant/20 hover:-translate-y-1 transition-transform">
                    <p className="font-headline font-bold text-on-surface-variant/60 text-[11px] tracking-[0.2em] uppercase mb-2">Preserved Skills</p>
                    <p className="font-brand text-primary text-5xl">Heritage</p>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          THE ESSENCE — PRODUCTS
      ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 px-6 md:px-12 xl:px-20 bg-surface-bright">
        <div className="max-w-screen-2xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 lg:mb-16 gap-6 border-b border-outline-variant/20 pb-8">
            <div className="max-w-2xl animate-fade-up">
              <p className="font-headline font-bold text-secondary tracking-[0.2em] uppercase text-xs mb-4">Curated Selection</p>
              <h2 className="font-brand text-primary text-[clamp(2.2rem,4vw,3.5rem)] leading-tight">The Essence of <br className="hidden md:block"/> North East India</h2>
            </div>
            <Link to="/products" className="shrink-0 animate-fade-up delay-100 hidden md:flex items-center gap-2 px-8 py-3.5 rounded-full border border-primary text-primary font-headline font-bold text-sm hover:bg-primary hover:text-white transition-all duration-300">
              View Entire Catalog
              <span className="material-symbols-outlined text-[18px]">east</span>
            </Link>
          </div>
          
          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 xl:gap-8 mb-10">
            {products.map((p, i) => (
              <div key={p.id} className="group relative bg-surface-container-lowest rounded-[1.5rem] p-5 shadow-sm hover:shadow-[0_20px_40px_rgba(0,74,43,0.08)] transition-all duration-500 border border-outline-variant/20 animate-fade-up flex flex-col" style={{ animationDelay: `${i * 100}ms` }}>
                
                {/* Image Area */}
                <div className="relative w-full aspect-[4/5] bg-surface-container-low rounded-xl mb-6 flex items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-primary/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0 text-center flex flex-col items-center justify-center pt-2">
                    {/* Add to cart hover overlay feature */}
                  </div>
                  
                  <img src={imgProductBottle} alt={p.name} className="h-[82%] object-contain relative z-10 group-hover:scale-105 group-hover:-translate-y-2 transition-all duration-700 drop-shadow-sm" />
                  
                  {/* Absolute positioned Label */}
                  <img src={p.label} alt="Label" className="absolute w-[68px] object-contain z-20 drop-shadow-md group-hover:scale-110 transition-transform duration-500" style={{ top: '55%', left: '50%', transform: 'translate(-50%, -50%)' }} />
                  
                  {/* Add to Cart Floating Button */}
                  <div className="absolute bottom-5 w-full px-5 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 z-30">
                    <button className="w-full py-3.5 bg-secondary-container text-on-secondary-container font-headline font-bold text-sm rounded-xl shadow-lg active:scale-95 flex items-center justify-center gap-2">
                       <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
                       Buy Now
                    </button>
                  </div>
                </div>
                
                {/* Product Details */}
                <div className="flex flex-col flex-1 px-1">
                  <p className="font-body text-on-surface-variant/80 text-[13px] mb-1.5 uppercase tracking-wide">{p.subtitle}</p>
                  <h3 className="font-brand text-primary text-xl mb-3 leading-tight">{p.name}</h3>
                  <div className="flex items-center gap-3 mt-auto">
                    <span className="font-headline font-bold text-secondary text-lg">{p.price}</span>
                    <span className="font-body text-outline text-sm line-through decoration-outline/40">{p.original}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="md:hidden flex justify-center mt-10">
            <Link to="/products" className="flex items-center justify-center gap-2 px-8 py-4 w-full sm:w-auto rounded-full border-2 border-primary text-primary font-headline font-bold text-[15px] hover:bg-primary hover:text-white transition-all duration-300">
              View Entire Catalog
              <span className="material-symbols-outlined text-[18px]">east</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════
          CTA SECTION: BRING THE WISDOM HOME
      ════════════════════════════════════════════ */}
      <section className="py-24 lg:py-32 px-6 md:px-12 xl:px-20 bg-primary relative overflow-hidden">
        {/* Abstract Background Imagery */}
        <div className="absolute inset-0 z-0">
           <img src={imgEssence} alt="Essence of North East" className="w-full h-full object-cover mix-blend-overlay opacity-30 object-center grayscale-[30%]" />
           <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/40"></div>
        </div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10 text-white animate-fade-up">
           <div className="w-16 h-[2px] bg-secondary-container mx-auto mb-8 md:mb-12 rounded-full"></div>
           <h2 className="font-brand text-4xl md:text-5xl lg:text-[4.5rem] leading-[1.1] mb-6 drop-shadow-lg">Bring the wisdom <br className="hidden md:block"/> of the hills home.</h2>
           <p className="font-body text-white/80 text-[17px] md:text-xl leading-relaxed mb-12 max-w-2xl mx-auto font-light">
             Experience the authentic flavours and artisanal purity of North East India delivered directly to your doorstep.
           </p>
           
           <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
              <Link to="/products" className="w-full sm:w-auto px-10 py-4 rounded-full bg-secondary-container text-on-secondary-container font-headline font-bold text-[15px] hover:bg-secondary-fixed transition-all duration-300 shadow-[0_10px_30px_rgba(0,0,0,0.3)] hover:shadow-[0_10px_40px_rgba(0,0,0,0.5)] group flex items-center justify-center gap-3">
                 Shop the Collection
                 <span className="material-symbols-outlined text-[20px] transition-transform group-hover:translate-x-1">trending_flat</span>
              </Link>
              <Link to="/about" className="w-full sm:w-auto px-10 py-4 rounded-full border border-white/20 hover:border-white/40 text-white hover:bg-white/5 font-headline font-bold text-[15px] transition-all duration-300 flex items-center justify-center backdrop-blur-sm">
                 View Heritage
              </Link>
           </div>
        </div>
      </section>
      
      {/* 
        Note: The duplicate local Footer has been completely removed.
        App.jsx correctly wraps <Home /> in the global <Layout /> which renders <Footer /> automatically. 
      */}
    </div>
  );
}
