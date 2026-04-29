import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { deleteR2Object, getR2PublicUrl, listR2Objects, uploadBytesToR2 } from '../_shared/r2.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function createAdminClient() {
  return createClient(
    getEnv('SUPABASE_URL'),
    getEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9/_-]/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function sanitizeFilename(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensureAuth(admin: ReturnType<typeof createAdminClient>, req: Request, requireAuth: boolean) {
  const token = getBearerToken(req);
  if (requireAuth) {
    if (!token) throw new Error('Unauthorized');
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) throw new Error('Invalid token');
    return user.id;
  }
  if (token) {
    const { data: { user } } = await admin.auth.getUser(token);
    return user?.id ?? null;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const admin = createAdminClient();
    const requireAuth = String(Deno.env.get('R2_UPLOAD_REQUIRE_AUTH') || 'true').toLowerCase() !== 'false';
    let userId: string | null = null;
    try {
      userId = await ensureAuth(admin, req, requireAuth);
    } catch (authError) {
      const message = (authError as Error).message;
      if (message === 'Unauthorized') return json({ error: 'Unauthorized' }, 401);
      if (message === 'Invalid token') return json({ error: 'Invalid token' }, 401);
      throw authError;
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      const action = String(body?.action || '').trim().toLowerCase();

      if (action === 'list') {
        const prefix = String(body?.prefix || '');
        const maxKeys = Number(body?.max_keys || 50);
        const listed = await listR2Objects(prefix, maxKeys);
        return json({ ok: true, ...listed });
      }

      if (action === 'delete') {
        const key = String(body?.key || '').trim();
        if (!key) return json({ error: 'key is required for delete action' }, 400);
        const deleted = await deleteR2Object(key);
        return json({ ok: true, ...deleted });
      }

      return json({ error: 'Unsupported action. Use multipart upload or action=list|delete.' }, 400);
    }

    const form = await req.formData();
    const fileField = form.get('file');
    if (!(fileField instanceof File)) {
      return json({ error: 'file is required in multipart/form-data' }, 400);
    }

    const folderInput = String(form.get('folder') || 'uploads');
    const filenameInput = String(form.get('filename') || fileField.name || 'file');
    const folder = sanitizeSegment(folderInput) || 'uploads';
    const safeFilename = sanitizeFilename(filenameInput) || 'file';

    const maxBytes = Number(Deno.env.get('R2_UPLOAD_MAX_BYTES') || 25 * 1024 * 1024);
    if (fileField.size > maxBytes) {
      return json({ error: `File too large. Max allowed bytes: ${maxBytes}` }, 413);
    }

    const datePrefix = new Date().toISOString().slice(0, 10);
    const objectKey = `${folder}/${datePrefix}/${crypto.randomUUID()}-${safeFilename}`;
    const uploaded = await uploadBytesToR2(
      objectKey,
      await fileField.arrayBuffer(),
      fileField.type || 'application/octet-stream',
      {
        source: 'upload-to-r2',
        uploaded_by: userId ?? 'anonymous',
        original_filename: safeFilename,
      },
    );

    return json({
      ok: true,
      key: uploaded.key,
      bucket: uploaded.bucket,
      content_type: fileField.type || 'application/octet-stream',
      size: fileField.size,
      public_url: uploaded.publicUrl,
      // Kept for clients that only need a resolvable URL field.
      url: uploaded.publicUrl || getR2PublicUrl(uploaded.key),
    });
  } catch (error) {
    console.error('upload-to-r2 error:', error);
    return json({ ok: false, error: (error as Error).message || 'Unexpected error' }, 500);
  }
});
