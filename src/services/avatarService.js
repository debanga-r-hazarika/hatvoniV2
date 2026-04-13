import { supabase } from '../lib/supabase';

export const avatarService = {
  async uploadAvatar(userId, file) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/avatar.${fileExt}`;

    const { error: removeError } = await supabase.storage
      .from('avatars')
      .remove([filePath]);

    if (removeError) {
      console.warn('Could not remove old avatar:', removeError.message);
    }

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) throw updateError;

    return avatarUrl;
  },

  async removeAvatar(userId) {
    const { data: files } = await supabase.storage
      .from('avatars')
      .list(userId);

    if (files && files.length > 0) {
      const filePaths = files.map(f => `${userId}/${f.name}`);
      await supabase.storage.from('avatars').remove(filePaths);
    }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  }
};
