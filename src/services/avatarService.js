import { supabase } from '../lib/supabase';
import { uploadFileToR2 } from './r2UploadService';

export const avatarService = {
  async uploadAvatar(userId, file) {
    const uploaded = await uploadFileToR2(file, {
      folder: `avatars/${userId}`,
      filename: `avatar-${Date.now()}-${file.name}`,
    });
    const avatarUrl = uploaded.url ? `${uploaded.url}?t=${Date.now()}` : null;
    if (!avatarUrl) throw new Error('Avatar uploaded but no public URL is available');

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) throw updateError;

    return avatarUrl;
  },

  async removeAvatar(userId) {
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;
  }
};
