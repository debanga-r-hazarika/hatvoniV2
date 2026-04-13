import { useEffect, useMemo, useState } from 'react';
import { recipeService } from '../services/recipeService';

const DEFAULT_PAGE = {
  hero_title: 'Culinary Tapestry: Heirlooms from our Kitchen to Yours',
  hero_subtitle: 'Traditional North Eastern recipes passed down through generations, celebrating the soulful alchemy of indigenous ingredients.',
  featured_badge: 'Featured Heirloom',
  featured_cta_text: 'Watch Recipe',
  story_title: 'The Alchemy of Khar',
  story_body: 'Khar is an indigenous liquid strained from the ashes of sun-dried banana peels. It is the soul of North Eastern digestive health.',
  pantry_title: 'Pantry Essentials',
  seasonal_heading: 'Seasonal Collections',
  newsletter_title: 'Join our Kitchen Circle',
  newsletter_body: 'Subscribe to receive monthly heirloom recipes, stories from North Eastern farmers, and exclusive access to limited-batch harvests.',
  newsletter_input_placeholder: 'Your email address',
  newsletter_button_text: 'Subscribe Now',
  default_pantry_essentials: ['Kola Khar', 'Matimah Khar', 'Khardwi Khar'],
};

const DEFAULT_RECIPES = [
  {
    id: 'fallback-1',
    tag: 'Matimah Khar',
    prep_time: '45 mins',
    title: 'Black Lentils with Indigenous Ash',
    short_description: 'A rich, smoky dal prepared with Matimah Khar, traditionally served with a drizzle of raw mustard oil.',
    tags: ['Vegan', 'Digestive Aid'],
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAuakGL4x9J_EQSzOiQaQ9VsoZEcUXnrUXgujFXOvvSuVjfuAuUSeWH7dszDKxPVAds1yUEy0Qx5Sl_jFUCxHuzSUjFTCSHIIKQLyqO8nWN-1P2mvUL-EJPQq8lbgeeW0UiyGYUuJ2NyqV_rnVwYuhBoDUXVtTiQ4DC8vEVA0RDWq1xDgn-mu5XczpWxiTmYJ1Qgu1zc1DiWhR7se-Ajdh6TV8lh_SIJEpt2BCRBAUp7Gwg85nxLvNKW6NQlPkmxgnW0ezmYrq3DsB9',
    pantry_essentials: ['Matimah Khar', 'Raw Mustard Oil'],
    method_steps: ['Wash and soak lentils for 30 minutes.', 'Cook lentils until soft, then stir in Matimah Khar.', 'Finish with mustard oil and serve warm.'],
    youtube_url: '',
    is_featured: false,
  },
  {
    id: 'fallback-2',
    tag: 'Khardwi Khar',
    prep_time: '30 mins',
    title: 'Bitter Gourd and Silkwood Melange',
    short_description: 'An exquisite balance of bitterness and earthiness, enhanced by the clarifying properties of Khardwi Khar.',
    tags: ['Seasonal', 'Organic'],
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBcwJ25xEu-FwMwMnk6yOHlp15b2AmdUFdS2NTL_rWYAFrCHHoLD5MzykMY7DyaaE6XUmYCVnIxWPFT08oE0-UrPmIY4BWKgoboN5qa1C7vhlji7sEWLg1gQY5WkYbbFBKWmhz8YHaATnk0AkOkQrzZ24t3vlAbKOMKtGRd5eVsf0kD-auzu9dGc_QPhmOS3mqLqJr4OemvKUrP90K0EbWm8NMZRtTbsE-bbpJ-zqHNU4fmTmXIoTmZsOsGPyWwFTUDqIYwUuYC12mJ',
    pantry_essentials: ['Khardwi Khar', 'Bitter Gourd'],
    method_steps: ['Slice vegetables evenly.', 'Saute on medium heat with aromatics.', 'Add Khardwi Khar and simmer briefly.'],
    youtube_url: '',
    is_featured: true,
  },
  {
    id: 'fallback-3',
    tag: 'Heritage Special',
    prep_time: '60 mins',
    title: 'Smoked Fish with Bamboo Shoot',
    short_description: 'A complex aromatic journey utilizing fermented bamboo shoots and our premium Kola Khar extract.',
    tags: ['Traditional', 'Protein-Rich'],
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA85bFfzbh9fdhqz5tiOAj4N5GrJ1X5Cndp-o_gH50SgNyM3St-wAVMLI6wjVPPFW_Q8f1WZxOsQ-N87ZlPqihYROM2JLYzzRIUX42dnhFihF4_yGntzssTg4PqpHD707T7m9uY1M4eyGvl10X2pPJZ4gXevOT1y3XQ1WVDZO-M13Uuh1NsG6WPlxmwKCEM5QzD5C9IT-wbkXOCQ6YEKUpXpTTEMyw_MqBzhE4mwgbo091nKQdN4VBPiIMMN6ArgDRVBAp44xqpAKtb',
    pantry_essentials: ['Kola Khar', 'Fermented Bamboo Shoot'],
    method_steps: ['Prepare smoked fish and bamboo shoot paste.', 'Cook on low flame until flavors combine.', 'Serve with warm rice and herbs.'],
    youtube_url: '',
    is_featured: false,
  },
];

function toYoutubeEmbed(url) {
  if (!url) return '';

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes('youtu.be')) {
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
    }

    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/embed/')) return url;
      const videoId = parsed.searchParams.get('v');
      return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
    }

    return '';
  } catch {
    return '';
  }
}

export default function Recipes() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageConfig, setPageConfig] = useState(DEFAULT_PAGE);
  const [recipes, setRecipes] = useState(DEFAULT_RECIPES);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');

  useEffect(() => {
    const loadRecipes = async () => {
      setLoading(true);
      setError('');

      try {
        const { pageConfig: remoteConfig, recipes: remoteRecipes } = await recipeService.getRecipePageData();

        const mergedConfig = { ...DEFAULT_PAGE, ...(remoteConfig || {}) };
        const mergedRecipes = (remoteRecipes || []).length > 0 ? remoteRecipes : DEFAULT_RECIPES;

        setPageConfig(mergedConfig);
        setRecipes(mergedRecipes);

        const featuredId = mergedConfig.featured_recipe_id;
        const featured = mergedRecipes.find((r) => r.id === featuredId)
          || mergedRecipes.find((r) => r.is_featured)
          || mergedRecipes[0];

        setSelectedRecipeId(featured?.id || '');
      } catch (loadError) {
        console.error('Error loading recipes page:', loadError);
        setError('Unable to load live recipes. Showing curated fallback content.');
        setSelectedRecipeId(DEFAULT_RECIPES.find((r) => r.is_featured)?.id || DEFAULT_RECIPES[0].id);
      } finally {
        setLoading(false);
      }
    };

    loadRecipes();
  }, []);

  const featuredRecipe = useMemo(() => {
    if (!recipes.length) return null;

    return recipes.find((r) => r.id === pageConfig.featured_recipe_id)
      || recipes.find((r) => r.is_featured)
      || recipes[0];
  }, [recipes, pageConfig.featured_recipe_id]);

  const selectedRecipe = useMemo(() => {
    if (!recipes.length) return null;
    return recipes.find((r) => r.id === selectedRecipeId) || featuredRecipe || recipes[0];
  }, [recipes, selectedRecipeId, featuredRecipe]);

  const pantryList = (featuredRecipe?.pantry_essentials && featuredRecipe.pantry_essentials.length > 0)
    ? featuredRecipe.pantry_essentials
    : pageConfig.default_pantry_essentials;

  return (
    <main className="pt-32 pb-20 px-6 md:px-12 max-w-screen-2xl mx-auto">
      {error && (
        <div className="mb-8 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-amber-800 text-sm font-headline">
          {error}
        </div>
      )}

      <header className="mb-24 text-center">
        <h1 className="font-brand text-4xl md:text-7xl text-primary leading-tight mb-6 tracking-tighter">
          {pageConfig.hero_title}
        </h1>
        <p className="text-xl md:text-2xl text-on-surface-variant max-w-3xl mx-auto font-light">
          {pageConfig.hero_subtitle}
        </p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-24">
        <div className="lg:col-span-8 bg-surface-container-low rounded-xl overflow-hidden relative group">
          <img
            src={featuredRecipe?.image_url || DEFAULT_RECIPES[0].image_url}
            alt={featuredRecipe?.title || 'Featured recipe'}
            className="w-full h-[600px] object-cover group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent flex flex-col justify-end p-12">
            <span className="inline-block bg-secondary-container text-on-secondary-container px-4 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-4 w-fit">
              {pageConfig.featured_badge}
            </span>
            <h2 className="font-brand text-4xl text-surface mb-4">{featuredRecipe?.title || 'Featured recipe'}</h2>
            <p className="text-surface/90 text-lg max-w-xl mb-6">{featuredRecipe?.short_description}</p>
            <a
              href={toYoutubeEmbed(featuredRecipe?.youtube_url) ? featuredRecipe.youtube_url : '#recipe-details'}
              target={toYoutubeEmbed(featuredRecipe?.youtube_url) ? '_blank' : undefined}
              rel={toYoutubeEmbed(featuredRecipe?.youtube_url) ? 'noreferrer' : undefined}
              className="bg-surface-container-lowest text-primary px-8 py-4 rounded-xl font-bold flex items-center gap-3 w-fit hover:bg-secondary-container hover:text-on-secondary-container transition-all"
            >
              {pageConfig.featured_cta_text} <span className="material-symbols-outlined">arrow_forward</span>
            </a>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-8">
          <div className="bg-surface-container-highest p-8 rounded-xl flex-1 flex flex-col justify-center">
            <span className="material-symbols-outlined text-secondary text-4xl mb-4">temp_preferences_eco</span>
            <h3 className="font-headline text-2xl font-bold text-primary mb-2">{pageConfig.story_title}</h3>
            <p className="text-on-surface-variant">{pageConfig.story_body}</p>
          </div>
          <div className="bg-primary text-on-primary p-8 rounded-xl flex-1 flex flex-col justify-center">
            <span className="material-symbols-outlined text-secondary-container text-4xl mb-4">inventory_2</span>
            <h3 className="font-headline text-2xl font-bold mb-2">{pageConfig.pantry_title}</h3>
            <ul className="space-y-2 text-on-primary/80">
              {(pantryList || []).map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary-container" />{item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-24" id="seasonal-recipes">
        <div className="flex justify-between items-end mb-12">
          <h3 className="font-brand text-3xl text-primary tracking-tight">{pageConfig.seasonal_heading}</h3>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`recipe-skeleton-${index}`} className="animate-pulse">
                <div className="aspect-[4/5] rounded-xl bg-surface-container-low mb-6" />
                <div className="h-4 bg-surface-container-high rounded mb-3" />
                <div className="h-7 bg-surface-container-high rounded mb-3" />
                <div className="h-4 bg-surface-container-high rounded" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
            {recipes.map((recipe) => (
              <article key={recipe.id} className="flex flex-col gap-6 group">
                <div className="aspect-[4/5] overflow-hidden rounded-xl bg-surface-container-low">
                  <img
                    src={recipe.image_url || DEFAULT_RECIPES[0].image_url}
                    alt={recipe.title}
                    className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-500 group-hover:scale-110"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-secondary font-bold text-sm tracking-widest uppercase">{recipe.tag || 'Recipe'}</span>
                    {recipe.prep_time && (
                      <div className="flex items-center gap-1 text-on-surface-variant text-sm">
                        <span className="material-symbols-outlined text-xs">schedule</span> {recipe.prep_time}
                      </div>
                    )}
                  </div>
                  <h4 className="font-headline text-2xl font-bold text-primary mb-3">{recipe.title}</h4>
                  <p className="text-on-surface-variant line-clamp-2 mb-4">{recipe.short_description}</p>
                  <div className="flex gap-2 mb-6 flex-wrap">
                    {(recipe.tags || []).map((tag) => (
                      <span key={`${recipe.id}-${tag}`} className="px-3 py-1 bg-surface-container-highest text-on-surface-variant text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRecipeId(recipe.id);
                      document.getElementById('recipe-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="font-bold text-primary border-b border-primary/20 pb-1 hover:border-primary transition-all inline-flex items-center gap-2"
                  >
                    Read Methodology <span className="material-symbols-outlined text-sm">north_east</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedRecipe && (
        <section id="recipe-details" className="mb-24 bg-surface-container-low rounded-3xl p-6 md:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <div>
              <p className="text-secondary font-bold text-xs tracking-widest uppercase mb-3">Methodology</p>
              <h3 className="font-brand text-3xl md:text-4xl text-primary mb-4">{selectedRecipe.title}</h3>
              <p className="text-on-surface-variant mb-8 text-lg">{selectedRecipe.short_description}</p>

              <div className="space-y-4">
                {(selectedRecipe.method_steps || []).map((step, index) => (
                  <div key={`${selectedRecipe.id}-step-${index}`} className="flex items-start gap-4">
                    <span className="w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <p className="text-on-surface leading-relaxed">{step}</p>
                  </div>
                ))}
                {(!selectedRecipe.method_steps || selectedRecipe.method_steps.length === 0) && (
                  <p className="text-on-surface-variant">Methodology details will be published soon.</p>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {toYoutubeEmbed(selectedRecipe.youtube_url) ? (
                <div className="aspect-video rounded-2xl overflow-hidden shadow-lg bg-black">
                  <iframe
                    src={toYoutubeEmbed(selectedRecipe.youtube_url)}
                    title={`${selectedRecipe.title} video`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-2xl overflow-hidden bg-surface-container-highest flex items-center justify-center">
                  <p className="text-on-surface-variant">Video not available yet for this recipe.</p>
                </div>
              )}

              <div className="rounded-2xl border border-outline-variant/30 p-5 bg-surface">
                <h4 className="font-headline text-lg font-bold text-primary mb-3">Pantry Essentials</h4>
                <ul className="space-y-2 text-on-surface-variant">
                  {(selectedRecipe.pantry_essentials || []).map((item) => (
                    <li key={`${selectedRecipe.id}-pantry-${item}`} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="bg-secondary-container rounded-3xl p-12 md:p-20 flex flex-col md:flex-row items-center gap-12 overflow-hidden relative">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-secondary-fixed-dim/20 rounded-full blur-3xl" />
        <div className="md:w-1/2 z-10">
          <h2 className="font-brand text-4xl text-on-secondary-container mb-6">{pageConfig.newsletter_title}</h2>
          <p className="text-on-secondary-container/80 text-lg mb-8 leading-relaxed">{pageConfig.newsletter_body}</p>
          <div className="flex flex-col sm:flex-row gap-4">
            <input
              type="email"
              placeholder={pageConfig.newsletter_input_placeholder}
              className="flex-1 bg-surface/50 border-none rounded-xl focus:ring-2 focus:ring-primary placeholder:text-on-secondary-container/50 py-4 px-6 outline-none"
            />
            <button className="bg-primary text-white px-8 py-4 rounded-xl font-bold hover:bg-primary-container transition-colors whitespace-nowrap">
              {pageConfig.newsletter_button_text}
            </button>
          </div>
        </div>
        <div className="md:w-1/2 relative">
          <div className="aspect-square bg-surface/40 backdrop-blur-md rounded-2xl p-4 rotate-3 border border-surface/20 shadow-2xl">
            <img
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuAyEiLbUBKh-Zhptjokl5_picNvEyZ2vg-SNYQuyiHX4C57lPXP3YpZWAj3Z5Ziz_ij3TmZy_s-GahcBEnFdvfb9bNDqv39N7rZMlA3UcuEuH6-omVwQZXPlUGzxGAkxC-LkS4yq0fipNYObJ_818M6k2lar619WlRh9TRWSgiHGhBXk14l_mjeJ554SRsqR-CQkHfUFetHTxZvd2bVuNglJiKW7IkmlV37M0KHr88Ye7Z4x0iiv4u0hxMktnMB_J9MflKW-c_JPLUw"
              alt="Family cookbook"
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
        </div>
      </section>
    </main>
  );
}
