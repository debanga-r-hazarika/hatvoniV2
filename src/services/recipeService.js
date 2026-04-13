import { supabase } from '../lib/supabase';

const RECIPE_IMAGE_BUCKET = 'recipe-images';

export const recipeService = {
  async getRecipePageData() {
    const [configRes, recipesRes] = await Promise.all([
      supabase.from('recipe_page_config').select('*').eq('id', 1).maybeSingle(),
      supabase.from('recipes').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: false }),
    ]);

    if (configRes.error) throw configRes.error;
    if (recipesRes.error) throw recipesRes.error;

    return {
      pageConfig: configRes.data || null,
      recipes: recipesRes.data || [],
    };
  },

  async uploadRecipeImage(file) {
    const ext = file.name.split('.').pop() || 'jpg';
    const safeExt = ext.toLowerCase();
    const filePath = `${Date.now()}-${crypto.randomUUID()}.${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from(RECIPE_IMAGE_BUCKET)
      .upload(filePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(RECIPE_IMAGE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
  },
};
