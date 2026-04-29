import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FAST2SMS_BASE = 'https://www.fast2sms.com';
const DEFAULT_VERSION = 'v24.0';
const DEFAULT_BUSINESS_PROFILE_FIELDS = 'about,address,description,email,profile_picture_url,websites,vertical';
const DEFAULT_PHONE_DETAILS_FIELDS = 'status,is_official_business_account,id,name_status,code_verification_status,display_phone_number,platform_type,messaging_limit_tier,throughput';

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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function requiredString(value: unknown, field: string): string {
  const str = typeof value === 'string' ? value.trim() : '';
  if (!str) throw new Error(`${field} is required`);
  return str;
}

type MediaUrlValidationResult = {
  ok: boolean;
  url: string;
  status?: number;
  content_type?: string;
  content_length?: string;
  method?: 'HEAD' | 'GET';
  error?: string;
};

async function validateMediaUrl(rawUrl: string): Promise<MediaUrlValidationResult> {
  const url = String(rawUrl || '').trim();
  if (!url) {
    return { ok: false, url, error: 'media_url is empty' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, url, error: 'media_url is not a valid URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, url, error: 'media_url must start with http:// or https://' };
  }

  // Meta/Fast2SMS cannot fetch localhost/private resources.
  if (
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '0.0.0.0'
  ) {
    return { ok: false, url, error: 'media_url must be publicly accessible (localhost is not allowed)' };
  }

  const fetchWithTimeout = async (method: 'HEAD' | 'GET') => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(parsed.toString(), {
        method,
        redirect: 'follow',
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timeout);
    }
  };

  let response: Response;
  let method: 'HEAD' | 'GET' = 'HEAD';
  try {
    response = await fetchWithTimeout('HEAD');
    if (response.status === 405 || response.status === 403) {
      // Some CDNs block HEAD. Retry with GET for validation.
      method = 'GET';
      response = await fetchWithTimeout('GET');
    }
  } catch (error) {
    return {
      ok: false,
      url,
      error: `media_url is not reachable: ${(error as Error).message || 'network error'}`,
    };
  }

  const contentType = response.headers.get('content-type') || '';
  const contentLength = response.headers.get('content-length') || '';
  if (!response.ok) {
    return {
      ok: false,
      url,
      status: response.status,
      content_type: contentType || undefined,
      content_length: contentLength || undefined,
      method,
      error: `media_url returned HTTP ${response.status}`,
    };
  }

  // Media header supports image/document/video. If server hides content-type, allow but warn via metadata.
  const lowered = contentType.toLowerCase();
  const hasAllowedType =
    !lowered ||
    lowered.startsWith('image/') ||
    lowered.startsWith('video/') ||
    lowered.startsWith('application/pdf');
  if (!hasAllowedType) {
    return {
      ok: false,
      url,
      status: response.status,
      content_type: contentType || undefined,
      content_length: contentLength || undefined,
      method,
      error: `media_url content-type is not supported: ${contentType}`,
    };
  }

  return {
    ok: true,
    url,
    status: response.status,
    content_type: contentType || undefined,
    content_length: contentLength || undefined,
    method,
  };
}

type WabaAction =
  | 'get_waba_and_templates'
  | 'get_business_profile'
  | 'get_display_name_status'
  | 'get_waba_health_status'
  | 'get_phone_numbers'
  | 'get_single_phone_number_details'
  | 'get_webhook_whatsapp'
  | 'set_webhook_whatsapp'
  | 'get_whatsapp_logs'
  | 'get_whatsapp_summary'
  | 'get_wallet_balance'
  | 'get_webhook_events'
  | 'get_all_templates'
  | 'get_template_by_id'
  | 'get_media_url'
  | 'send_template_message'
  | 'get_template_media_assignments'
  | 'set_template_media_assignment';

type WabaRequest = {
  action?: WabaAction;
  version?: string;
  type?: 'number' | 'template';
  waba_id?: string;
  phone_number_id?: string;
  authorization?: string;
  webhook_url?: string;
  webhook_status?: 'enable' | 'disable';
  from?: string;
  to?: string;
  limit?: number;
  template_id?: string;
  media_id?: string;
  message_id?: string;
  numbers?: string;
  variables_values?: string;
  media_url?: string;
  document_filename?: string;
  message_ids?: string[];
  template_name?: string;
  template_id?: string;
};

async function callFast2Sms(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
) {
  const method = options.method || 'GET';
  const query = options.query || {};
  const qs = new URLSearchParams(query);
  const url = qs.toString() ? `${FAST2SMS_BASE}${path}?${qs.toString()}` : `${FAST2SMS_BASE}${path}`;

  const result = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: method === 'POST' ? JSON.stringify(options.body || {}) : undefined,
  });
  const text = await result.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }

  if (!result.ok) {
    const message =
      typeof parsed === 'object' && parsed && 'message' in (parsed as Record<string, unknown>)
        ? String((parsed as Record<string, unknown>).message)
        : 'Unknown upstream error';
    return { ok: false, upstream_status: result.status, data: parsed, error: `Fast2SMS request failed (${result.status}): ${message}` };
  }

  return { ok: true, upstream_status: result.status, data: parsed };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const admin = createAdminClient();

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: 'Invalid token' }, 401);

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_admin) return jsonResponse({ error: 'Admin access required' }, 403);

    const body = await req.json().catch(() => ({})) as WabaRequest;
    const action = body.action;
    if (!action) return jsonResponse({ error: 'action is required' }, 400);

    const authorization = (body.authorization || Deno.env.get('FAST2SMS_API_KEY') || '').trim();
    if (!authorization) {
      return jsonResponse({ error: 'Fast2SMS API key is missing. Set FAST2SMS_API_KEY env or send authorization in body.' }, 400);
    }

    const version = (body.version || DEFAULT_VERSION).trim();
    const responseBase = {
      ok: true,
      action,
      version,
      requested_by: user.id,
    };

    if (action === 'get_waba_and_templates') {
      const type = body.type === 'template' ? 'template' : 'number';
      const upstream = await callFast2Sms('/dev/dlt_manager/whatsapp', { query: { authorization, type } });
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, type, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, type, upstream });
    }

    if (action === 'get_business_profile') {
      const phoneNumberId = requiredString(body.phone_number_id, 'phone_number_id');
      const upstream = await callFast2Sms(
        `/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/whatsapp_business_profile`,
        { query: { authorization, fields: DEFAULT_BUSINESS_PROFILE_FIELDS } },
      );
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, phone_number_id: phoneNumberId, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, phone_number_id: phoneNumberId, upstream });
    }

    if (action === 'get_display_name_status') {
      const phoneNumberId = requiredString(body.phone_number_id, 'phone_number_id');
      const upstream = await callFast2Sms(
        `/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}`,
        { query: { authorization, fields: 'name_status' } },
      );
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, phone_number_id: phoneNumberId, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, phone_number_id: phoneNumberId, upstream });
    }

    if (action === 'get_waba_health_status') {
      const wabaId = requiredString(body.waba_id, 'waba_id');
      const upstream = await callFast2Sms(
        `/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(wabaId)}`,
        { query: { authorization, fields: 'health_status' } },
      );
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, waba_id: wabaId, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, waba_id: wabaId, upstream });
    }

    if (action === 'get_phone_numbers') {
      const wabaId = requiredString(body.waba_id, 'waba_id');
      const upstream = await callFast2Sms(
        `/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(wabaId)}/phone_numbers`,
        { query: { authorization } },
      );
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, waba_id: wabaId, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, waba_id: wabaId, upstream });
    }

    if (action === 'get_single_phone_number_details') {
      const phoneNumberId = requiredString(body.phone_number_id, 'phone_number_id');
      const upstream = await callFast2Sms(
        `/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}`,
        { query: { authorization, fields: DEFAULT_PHONE_DETAILS_FIELDS } },
      );
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, phone_number_id: phoneNumberId, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, phone_number_id: phoneNumberId, upstream });
    }

    if (action === 'get_webhook_whatsapp') {
      const upstream = await callFast2Sms('/dev/webhook/whatsapp/get', { query: { authorization } });
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, upstream });
    }

    if (action === 'set_webhook_whatsapp') {
      const webhookStatus = body.webhook_status === 'disable' ? 'disable' : 'enable';
      const webhookUrl = webhookStatus === 'enable'
        ? requiredString(body.webhook_url, 'webhook_url')
        : String(body.webhook_url || '').trim();

      const upstream = await callFast2Sms('/dev/webhook/whatsapp/set', {
        method: 'POST',
        headers: { authorization },
        body: { webhook_url: webhookUrl, webhook_status: webhookStatus },
      });
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, webhook_url: webhookUrl, webhook_status: webhookStatus, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, webhook_url: webhookUrl, webhook_status: webhookStatus, upstream });
    }

    if (action === 'get_whatsapp_logs') {
      const from = requiredString(body.from, 'from');
      const to = requiredString(body.to, 'to');
      const upstream = await callFast2Sms('/dev/whatsapp_logs', {
        query: { authorization, from, to },
      });
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, from, to, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, from, to, upstream });
    }

    if (action === 'get_whatsapp_summary') {
      const from = requiredString(body.from, 'from');
      const to = requiredString(body.to, 'to');
      const upstream = await callFast2Sms('/dev/whatsapp_summary', {
        query: { authorization, from, to },
      });
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, from, to, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, from, to, upstream });
    }

    if (action === 'get_wallet_balance') {
      const upstream = await callFast2Sms('/dev/wallet', { query: { authorization } });
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, upstream });
    }

    if (action === 'get_webhook_events') {
      const limit = Math.max(1, Math.min(100, Number(body.limit || 20)));
      const { data: events, error: eventsError } = await admin
        .from('whatsapp_webhook_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (eventsError) throw eventsError;
      return jsonResponse({ ...responseBase, events: events || [] });
    }

    if (action === 'get_all_templates') {
      const wabaId = requiredString(body.waba_id, 'waba_id');
      const upstream = await callFast2Sms(
        `/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(wabaId)}/message_templates`,
        { query: { authorization } },
      );
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, waba_id: wabaId, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, waba_id: wabaId, upstream });
    }

    if (action === 'get_template_by_id') {
      const templateId = requiredString(body.template_id, 'template_id');
      const upstream = await callFast2Sms(
        `/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(templateId)}`,
        { query: { authorization } },
      );
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, template_id: templateId, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, template_id: templateId, upstream });
    }

    if (action === 'get_media_url') {
      const phoneNumberId = requiredString(body.phone_number_id, 'phone_number_id');
      const mediaId = requiredString(body.media_id, 'media_id');
      const upstream = await callFast2Sms(
        `/dev/whatsapp/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/media/${encodeURIComponent(mediaId)}`,
        { query: { authorization } },
      );
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, phone_number_id: phoneNumberId, media_id: mediaId, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, phone_number_id: phoneNumberId, media_id: mediaId, upstream });
    }

    if (action === 'send_template_message') {
      const messageId = requiredString(body.message_id, 'message_id');
      const phoneNumberId = requiredString(body.phone_number_id, 'phone_number_id');
      const numbers = requiredString(body.numbers, 'numbers');
      const mediaUrl = String(body.media_url || '').trim();
      const query: Record<string, string> = {
        authorization,
        message_id: messageId,
        phone_number_id: phoneNumberId,
        numbers,
      };
      if (body.variables_values) query.variables_values = String(body.variables_values);
      if (mediaUrl) {
        const mediaValidation = await validateMediaUrl(mediaUrl);
        if (!mediaValidation.ok) {
          return jsonResponse({
            ...responseBase,
            ok: false,
            message_id: messageId,
            phone_number_id: phoneNumberId,
            numbers,
            error: mediaValidation.error || 'Invalid media_url',
            media_validation: mediaValidation,
          }, 400);
        }
        query.media_url = mediaUrl;
      }
      if (body.document_filename) query.document_filename = String(body.document_filename);
      const upstream = await callFast2Sms('/dev/whatsapp', { query });
      if (!upstream.ok) return jsonResponse({ ...responseBase, ok: false, message_id: messageId, phone_number_id: phoneNumberId, numbers, error: upstream.error, upstream });
      return jsonResponse({ ...responseBase, message_id: messageId, phone_number_id: phoneNumberId, numbers, upstream });
    }

    if (action === 'get_template_media_assignments') {
      const messageIds = Array.isArray(body.message_ids)
        ? body.message_ids.map((x) => String(x || '').trim()).filter(Boolean)
        : [];

      if (messageIds.length === 0) {
        return jsonResponse({ ...responseBase, assignments: [] });
      }

      const { data, error } = await admin
        .from('whatsapp_template_media_assignments')
        .select('*')
        .in('message_id', messageIds);
      if (error) {
        const code = String((error as { code?: string })?.code || '');
        if (code === '42P01') {
          // Table not deployed yet. Keep template UI functional.
          return jsonResponse({
            ...responseBase,
            assignments: [],
            warning: 'whatsapp_template_media_assignments table not found',
          });
        }
        throw error;
      }

      return jsonResponse({
        ...responseBase,
        assignments: data || [],
      });
    }

    if (action === 'set_template_media_assignment') {
      const messageId = requiredString(body.message_id, 'message_id');
      const phoneNumberId = requiredString(body.phone_number_id, 'phone_number_id');
      const mediaUrl = requiredString(body.media_url, 'media_url');
      const mediaValidation = await validateMediaUrl(mediaUrl);
      if (!mediaValidation.ok) {
        return jsonResponse({
          ...responseBase,
          ok: false,
          message_id: messageId,
          phone_number_id: phoneNumberId,
          error: mediaValidation.error || 'Invalid media_url',
          media_validation: mediaValidation,
        }, 400);
      }

      const payload = {
        message_id: messageId,
        phone_number_id: phoneNumberId,
        template_id: String(body.template_id || '').trim() || null,
        template_name: String(body.template_name || '').trim() || null,
        media_url: mediaUrl,
        media_content_type: mediaValidation.content_type || null,
        media_content_length: mediaValidation.content_length || null,
        updated_by: user.id,
      };

      const { data, error } = await admin
        .from('whatsapp_template_media_assignments')
        .upsert(payload, { onConflict: 'message_id' })
        .select('*')
        .single();
      if (error) {
        const code = String((error as { code?: string })?.code || '');
        if (code === '42P01') {
          return jsonResponse({
            ...responseBase,
            ok: false,
            message_id: messageId,
            phone_number_id: phoneNumberId,
            error: 'Template media mapping table is not deployed yet. Run latest migration first.',
          }, 400);
        }
        throw error;
      }

      return jsonResponse({
        ...responseBase,
        assignment: data,
      });
    }

    return jsonResponse({ error: 'Unsupported action' }, 400);
  } catch (error) {
    console.error('waba-details error:', error);
    return jsonResponse({ ok: false, error: (error as Error).message || 'Unexpected error' }, 500);
  }
});
