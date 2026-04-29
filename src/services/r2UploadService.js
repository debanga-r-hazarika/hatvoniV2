import { supabase } from '../lib/supabase';

const UPLOAD_FUNCTION = import.meta.env.VITE_R2_UPLOAD_FUNCTION || 'upload-to-r2';

export async function uploadFileToR2(file, options = {}) {
  if (!(file instanceof File)) {
    throw new Error('uploadFileToR2 requires a File object');
  }

  const folder = typeof options.folder === 'string' && options.folder.trim()
    ? options.folder.trim()
    : 'uploads';
  const filename = typeof options.filename === 'string' && options.filename.trim()
    ? options.filename.trim()
    : file.name;

  const form = new FormData();
  form.append('file', file);
  form.append('folder', folder);
  form.append('filename', filename);

  const { data, error } = await supabase.functions.invoke(UPLOAD_FUNCTION, {
    body: form,
  });

  if (error) {
    throw new Error(error.message || 'Failed to upload file to R2');
  }

  if (!data?.ok || !data?.key) {
    throw new Error(data?.error || 'R2 upload failed');
  }

  return {
    key: data.key,
    url: data.url || data.public_url || null,
    publicUrl: data.public_url || null,
    bucket: data.bucket || null,
    size: data.size || file.size,
    contentType: data.content_type || file.type || 'application/octet-stream',
  };
}

export async function listR2Objects(prefix = 'uploads', maxKeys = 100) {
  const { data, error } = await supabase.functions.invoke(UPLOAD_FUNCTION, {
    body: {
      action: 'list',
      prefix,
      max_keys: maxKeys,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to list files from R2');
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'R2 list failed');
  }

  return data.objects || [];
}

export async function deleteR2ObjectByKey(key) {
  const { data, error } = await supabase.functions.invoke(UPLOAD_FUNCTION, {
    body: {
      action: 'delete',
      key,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to delete file from R2');
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'R2 delete failed');
  }

  return data;
}

export function getR2PublicUrlFromKey(key) {
  const baseUrl = import.meta.env.VITE_R2_PUBLIC_BASE_URL;
  if (!baseUrl || !key) return null;
  return `${String(baseUrl).replace(/\/$/, '')}/${String(key).replace(/^\/+/, '')}`;
}
