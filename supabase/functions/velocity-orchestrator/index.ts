import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { parseActionRequest, validatePayloadForAction, type VelocityAction } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-velocity-webhook-secret, x-api-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Json = Record<string, unknown>;

interface VelocityApiResult {
  ok: boolean;
  status: number;
  data: unknown;
  endpoint: string;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

let memoryTokenCache: CachedToken | null = null;

function getEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getEnvOptional(name: string): string | null {
  return Deno.env.get(name) || null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Safe to return to admins in health probes — strips JWTs and common secret fields. */
function redactVelocityText(input: string, maxLen = 400): string {
  let s = String(input).slice(0, maxLen);
  s = s.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}/g, '[jwt_redacted]');
  s = s.replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[redacted]"');
  s = s.replace(/"token"\s*:\s*"[^"]*"/gi, '"token":"[redacted]"');
  s = s.replace(/"access_token"\s*:\s*"[^"]*"/gi, '"access_token":"[redacted]"');
  s = s.replace(/"accessToken"\s*:\s*"[^"]*"/gi, '"accessToken":"[redacted]"');
  return s;
}

/**
 * Live checks against Velocity from the edge runtime (same network path as real calls).
 * Helps tell: wrong base URL / outage, bad auth credentials, vs. downstream API quirks.
 */
async function buildVelocityUpstreamProbe(
  baseUrlTrimmed: string,
  username: string,
  password: string,
): Promise<Record<string, unknown>> {
  const endpoints = getEndpointMap(baseUrlTrimmed);
  const report: Record<string, unknown> = {
    base_url: baseUrlTrimmed,
    checked_at: nowIso(),
  };

  const pingStart = Date.now();
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 12000);
    const r = await fetch(baseUrlTrimmed, { method: 'GET', redirect: 'follow', signal: ac.signal });
    clearTimeout(timer);
    report.base_http = {
      ok: r.status > 0 && r.status < 600,
      status: r.status,
      ms: Date.now() - pingStart,
    };
  } catch (e) {
    report.base_http = {
      ok: false,
      error: String((e as Error)?.name === 'AbortError' ? 'timeout' : (e as Error)?.message || e),
      ms: Date.now() - pingStart,
    };
  }

  const authUrl = `${baseUrlTrimmed}/custom/api/v1/auth-token`;
  const authStart = Date.now();
  try {
    const acAuth = new AbortController();
    const authTimer = setTimeout(() => acAuth.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: acAuth.signal,
      });
    } finally {
      clearTimeout(authTimer);
    }
    const raw = await res.text();
    const parsed = safeJsonParse(raw);
    const token = extractVelocityAuthToken(parsed);
    const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? Object.keys(parsed as Record<string, unknown>).slice(0, 28)
      : [];

    report.auth_token = {
      endpoint: authUrl,
      http_status: res.status,
      ms: Date.now() - authStart,
      token_received: Boolean(token),
      response_top_level_keys: keys,
      body_preview: redactVelocityText(raw),
    };

    if (!token) {
      report.summary =
        (report.base_http as { ok?: boolean } | undefined)?.ok === false
          ? 'Velocity base URL is not reachable from the shipping service (network, DNS, TLS, or wrong host). That can look like “API problems” on their side or a typo in VELOCITY_BASE_URL.'
          : 'The auth-token endpoint responded but no token field was found — usually wrong VELOCITY_USERNAME / VELOCITY_PASSWORD for this environment, wrong VELOCITY_BASE_URL (staging vs prod), or Velocity changed the auth JSON shape.';
      return report;
    }

    const smokeStart = Date.now();
    const smokePayload = {
      from: '110001',
      to: '560001',
      payment_mode: 'prepaid',
      shipment_type: 'forward',
    };
    const svc = await callVelocityApi(
      'check_serviceability',
      endpoints.check_serviceability,
      token,
      smokePayload,
    );
    const inv = hasVelocityInvalidCredentials(svc.data);
    report.serviceability_smoke = {
      endpoint: endpoints.check_serviceability,
      http_status: svc.status,
      ok: svc.ok,
      invalid_credentials: inv,
      ms: Date.now() - smokeStart,
      response_preview: redactVelocityText(JSON.stringify(svc.data)),
    };

    if (inv) {
      report.summary =
        'Auth-token returned a token, but serviceability responded with INVALID_CREDENTIALS. That often means the Authorization header format does not match what this Velocity tenant expects (try VELOCITY_AUTHORIZATION_HEADER), a bad cached token (clear velocity_token_cache), or an upstream Velocity inconsistency — worth opening a ticket with Velocity including `checked_at`.';
    } else if (!svc.ok) {
      report.summary =
        'Auth works; the smoke serviceability call did not succeed. This points away from “wrong password” and toward payload rules, account permissions, or a partial Velocity outage on that route.';
    } else {
      report.summary =
        'Auth-token and a minimal serviceability call both succeeded from this deployment. Velocity’s API is responding; remaining failures are likely order/pincode-specific or a different endpoint.';
    }
  } catch (e) {
    report.auth_token = {
      endpoint: authUrl,
      ok: false,
      error: String((e as Error)?.message || e),
      ms: Date.now() - authStart,
    };
    report.summary = 'Probe failed before or during auth — network error, TLS issue, or unexpected response body.';
  }

  return report;
}

function looksLikeHttpUrl(s: string): boolean {
  const t = s.trim();
  return t.length > 10 && /^https?:\/\//i.test(t);
}

/**
 * Velocity/Shipfast responses vary: `label_url`, `shipping_label_url`, nested under `payload`, etc.
 * Used when persisting `orders.velocity_label_url` after assign courier / tracking / webhooks.
 */
function extractVelocityLabelUrl(source: Record<string, unknown>, depth = 0): string | null {
  if (depth > 6) return null;
  const keys = [
    'label_url',
    'shipping_label_url',
    'label_pdf_url',
    'courier_label_url',
    'awb_label_url',
    'label_print_url',
    'manifest_url',
    'pdf_url',
    'shipping_label',
  ];
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'string' && looksLikeHttpUrl(v)) return v.trim();
  }
  const nestedKeys = ['data', 'payload', 'result', 'shipment', 'tracking_data'];
  for (const nk of nestedKeys) {
    const n = source[nk];
    if (n && typeof n === 'object' && !Array.isArray(n)) {
      const inner = extractVelocityLabelUrl(n as Record<string, unknown>, depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

function parseExpiryToMs(raw: unknown): number {
  if (!raw) return Date.now() + 23 * 60 * 60 * 1000;
  if (typeof raw === 'number') return raw > 1e12 ? raw : raw * 1000;
  if (typeof raw === 'string') {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now() + 23 * 60 * 60 * 1000;
}

function createAdminClient() {
  return createClient(getEnv('SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const parts = h.split(' ');
  return parts.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : null;
}

/**
 * Matches Admin Orders route: `isAdmin || hasModule('orders')`.
 * Full admins always allowed; staff need active employees row + `orders` in employee_modules.
 */
async function requireOrdersStaffOrAdmin(
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const token = getBearerToken(req);
  if (!token) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.is_admin) {
    return { ok: true, userId: user.id };
  }

  const { data: empRow } = await adminClient
    .from('employees')
    .select('id')
    .eq('profile_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!empRow?.id) {
    return {
      ok: false,
      response: new Response(JSON.stringify({
        error: 'Admin or staff with Orders module access required',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const { data: modRows } = await adminClient
    .from('employee_modules')
    .select('module')
    .eq('employee_id', empRow.id);

  const hasOrders = (modRows || []).some((r) =>
    String(r.module || '').trim().toLowerCase() === 'orders'
  );

  if (!hasOrders) {
    return {
      ok: false,
      response: new Response(JSON.stringify({
        error: 'Orders module access required for Velocity actions',
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  return { ok: true, userId: user.id };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getEndpointMap(baseUrl: string): Record<VelocityAction, string> {
  const endpoint = (defaultPath: string, envName?: string) => {
    const envPath = envName ? getEnvOptional(envName) : null;
    return `${baseUrl}${envPath || defaultPath}`;
  };

  return {
    create_warehouse: endpoint('/custom/api/v1/warehouse', 'VELOCITY_ENDPOINT_WAREHOUSE'),
    check_serviceability: endpoint('/custom/api/v1/serviceability', 'VELOCITY_ENDPOINT_SERVICEABILITY'),
    calculate_rates: endpoint('/custom/api/v1/rates', 'VELOCITY_ENDPOINT_RATES'),
    create_order: endpoint('/custom/api/v1/forward-order-orchestration', 'VELOCITY_ENDPOINT_FORWARD_ORDER'),
    create_forward_order: endpoint('/custom/api/v1/forward-order', 'VELOCITY_ENDPOINT_FORWARD_ORDER_CREATE'),
    assign_courier: endpoint('/custom/api/v1/forward-order-shipment', 'VELOCITY_ENDPOINT_FORWARD_ORDER_SHIPMENT'),
    cancel_order: endpoint('/custom/api/v1/cancel-order', 'VELOCITY_ENDPOINT_CANCEL_ORDER'),
    cancel_velocity_draft: endpoint('/custom/api/v1/cancel-order', 'VELOCITY_ENDPOINT_CANCEL_ORDER'),
    track_order: endpoint('/custom/api/v1/order-tracking', 'VELOCITY_ENDPOINT_ORDER_TRACKING'),
    get_reports: endpoint('/custom/api/v1/reports', 'VELOCITY_ENDPOINT_REPORTS'),
    list_shipments: endpoint('/custom/api/v1/shipments', 'VELOCITY_ENDPOINT_SHIPMENTS'),
    list_returns: endpoint('/custom/api/v1/returns', 'VELOCITY_ENDPOINT_RETURNS'),
    initiate_return: endpoint('/custom/api/v1/reverse-order', 'VELOCITY_ENDPOINT_REVERSE_ORDER'),
    assign_return_courier: endpoint('/custom/api/v1/reverse-order-shipment', 'VELOCITY_ENDPOINT_REVERSE_ORDER_SHIPMENT'),
    /** Internal admin workflow resume route; handled before Velocity token flow. */
    resume_existing_shipping: `${baseUrl}/`,
    /** Internal admin workflow reset route; handled before Velocity token flow. */
    reinitiate_shipping: `${baseUrl}/`,
    webhook_update: endpoint('/custom/api/v1/order-tracking', 'VELOCITY_ENDPOINT_ORDER_TRACKING'),
    /** Not a Velocity HTTP route — satisfied for typing; handled before endpoint resolution. */
    webhook_health: `${baseUrl}/`,
  };
}

function safeErrorMessage(input: unknown, fallback: string): string {
  const raw = String((input as Error)?.message || input || '').trim();
  if (!raw) return fallback;
  if (/missing required env var|server misconfiguration/i.test(raw)) return 'Shipping service is not configured correctly. Please contact support.';
  if (/unauthorized|invalid or expired token|no auth token/i.test(raw)) return 'Your session expired. Please sign in again.';
  if (/order not found/i.test(raw)) return 'Order details could not be found.';
  if (/serviceable/i.test(raw)) return 'This pincode is currently not serviceable for shipping.';
  if (/http\s*\d{3}/i.test(raw)) return fallback;
  return raw;
}

async function withRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxAttempts) break;
      await sleep(250 * Math.pow(2, attempt - 1));
    }
  }

  throw lastError;
}

async function logVelocityCall(
  adminClient: ReturnType<typeof createAdminClient>,
  args: {
    action: VelocityAction;
    requestPayload?: unknown;
    responsePayload?: unknown;
    statusCode?: number;
    success: boolean;
    errorMessage?: string;
    orderId?: string | null;
    sellerId?: string | null;
  },
) {
  await adminClient.from('velocity_api_logs').insert({
    action: args.action,
    request_payload: args.requestPayload ?? null,
    response_payload: args.responsePayload ?? null,
    status_code: args.statusCode ?? null,
    success: args.success,
    error_message: args.errorMessage ?? null,
    order_id: args.orderId ?? null,
    seller_id: args.sellerId ?? null,
  }).then(() => {}, () => {});
}

async function fetchVelocityToken(
  adminClient: ReturnType<typeof createAdminClient>,
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const now = Date.now();

  if (memoryTokenCache && memoryTokenCache.expiresAtMs - 5 * 60 * 1000 > now) {
    return memoryTokenCache.token;
  }

  const { data: dbToken } = await adminClient
    .from('velocity_token_cache')
    .select('token, expires_at')
    .eq('cache_key', 'default')
    .maybeSingle();

  if (dbToken?.token && dbToken?.expires_at) {
    const dbExpiryMs = Date.parse(dbToken.expires_at);
    if (!Number.isNaN(dbExpiryMs) && dbExpiryMs - 5 * 60 * 1000 > now) {
      memoryTokenCache = { token: dbToken.token, expiresAtMs: dbExpiryMs };
      return dbToken.token;
    }
  }

  const authResponse = await withRetry(async () => {
    const res = await fetch(`${baseUrl}/custom/api/v1/auth-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const raw = await res.text();
    const parsed = safeJsonParse(raw) as Json;
    const token = extractVelocityAuthToken(parsed);
    if (!res.ok || !token) {
      throw new Error(`Velocity auth failed (${res.status}): ${raw.slice(0, 300)}`);
    }

    const expiresAtMs = parseExpiryToMs(parsed?.expires_at);
    return { token, expiresAtMs };
  });

  memoryTokenCache = authResponse;

  await adminClient.from('velocity_token_cache').upsert({
    cache_key: 'default',
    token: authResponse.token,
    expires_at: new Date(authResponse.expiresAtMs).toISOString(),
    updated_at: nowIso(),
  }, { onConflict: 'cache_key' }).then(() => {}, () => {});

  return authResponse.token;
}

/** Velocity auth-token JSON varies by host: `token`, `access_token`, nested `data`, etc. */
function extractVelocityAuthToken(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const candidates: unknown[] = [
    o.token,
    o.access_token,
    o.accessToken,
    o.jwt,
    o.auth_token,
    o.data,
  ];
  const data = o.data && typeof o.data === 'object' && !Array.isArray(o.data) ? o.data as Record<string, unknown> : null;
  if (data) {
    candidates.push(data.token, data.access_token, data.accessToken, data.jwt);
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

async function callVelocityApi(
  action: VelocityAction,
  endpoint: string,
  token: string,
  payload: unknown,
): Promise<VelocityApiResult> {
  const trimmed = String(token || '').trim();
  /**
   * Velocity Custom API V1 (PDF): §1 says `Authorization: {{token}}` — raw token, no "Bearer" prefix.
   * All sample curls (warehouse, serviceability, cancel, tracking) use the raw token directly.
   * §9 Get Rates examples use `Authorization: Bearer …`.
   * We always try raw token first (as the doc specifies), then Bearer as a fallback.
   */
  const bearerFirstForRates = action === 'calculate_rates';
  const authVariants: string[] = [];
  const push = (h: string) => {
    const t = h.trim();
    if (t && !authVariants.includes(t)) authVariants.push(t);
  };

  const extra = getEnvOptional('VELOCITY_AUTHORIZATION_HEADER');
  if (extra) push(extra.replace(/\{token\}/gi, trimmed));

  const pushRawThenBearer = () => {
    // Raw token first — matches Velocity API doc §1 Authorization: {{token}}
    push(trimmed);
    if (!/^bearer\s+/i.test(trimmed)) push(`Bearer ${trimmed}`);
    if (!/^token\s+/i.test(trimmed)) push(`Token ${trimmed}`);
  };

  const pushBearerThenRaw = () => {
    if (!/^bearer\s+/i.test(trimmed)) push(`Bearer ${trimmed}`);
    push(trimmed);
    if (!/^token\s+/i.test(trimmed)) push(`Token ${trimmed}`);
  };

  if (bearerFirstForRates) {
    // Rates API doc uses Bearer prefix
    pushBearerThenRaw();
  } else {
    // All other endpoints (serviceability, warehouse, tracking, cancel, etc.) use raw token per doc
    pushRawThenBearer();
  }

  let result: { res: Response; data: unknown } | null = null;
  for (const authHeader of authVariants) {
    result = await withRetry(async () => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(payload ?? {}),
      });

      const raw = await res.text();
      const data = safeJsonParse(raw);
      return { res, data };
    });
    // Try next auth variant only on 401 — wrong Authorization scheme per Velocity API doc.
    // If we get a non-401 (even 422 or 400), the header format was accepted; stop trying variants.
    if (result.res.status !== 401) break;
  }

  if (!result) {
    throw new Error('Velocity request failed before response was received.');
  }

  const ok = result.res.ok;
  return {
    ok,
    status: result.res.status,
    data: result.data,
    endpoint,
  };
}

function hasVelocityInvalidCredentials(data: unknown): boolean {
  const hit = (s: unknown) => String(s || '').toUpperCase().includes('INVALID_CREDENTIALS');

  const checkObject = (o: Record<string, unknown>): boolean => {
    if (hit(o.error)) return true;
    const meta = o.meta && typeof o.meta === 'object' && !Array.isArray(o.meta) ? o.meta as Record<string, unknown> : null;
    if (meta && hit(meta.message)) return true;

    const nestedKeys = ['raw', 'payload', 'data', 'response', 'result', 'body'] as const;
    for (const k of nestedKeys) {
      const child = o[k];
      if (!child || typeof child !== 'object' || Array.isArray(child)) continue;
      const c = child as Record<string, unknown>;
      if (hit(c.error)) return true;
      const cmeta = c.meta && typeof c.meta === 'object' && !Array.isArray(c.meta) ? c.meta as Record<string, unknown> : null;
      if (cmeta && hit(cmeta.message)) return true;
    }
    return false;
  };

  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return checkObject(data as Record<string, unknown>);
}

async function clearVelocityTokenCache(adminClient: ReturnType<typeof createAdminClient>): Promise<void> {
  memoryTokenCache = null;
  await adminClient
    .from('velocity_token_cache')
    .delete()
    .eq('cache_key', 'default')
    .then(() => {}, () => {});
}

/** Parsed from Velocity POST /custom/api/v1/order-tracking (awbs[]) — see API doc §7. */
interface TrackingPick {
  shipmentStatus?: string;
  awb?: string;
  trackUrl?: string;
  labelUrl?: string;
  snapshot?: Record<string, unknown>;
}

interface TrackingActivityEvent {
  activity: string | null;
  location: string | null;
  carrierRemark: string | null;
  eventTime: string | null;
  rawPayload: Record<string, unknown>;
}

function pickOrderTrackingFromResponse(data: unknown): TrackingPick {
  const out: TrackingPick = {};
  if (!data || typeof data !== 'object') return out;
  const root = data as Record<string, unknown>;

  const unwrapPayload = (): Record<string, unknown> => {
    const payload = root.payload && typeof root.payload === 'object'
      ? root.payload as Record<string, unknown>
      : root;
    return payload;
  };

  const payload = unwrapPayload();
  const result = payload.result && typeof payload.result === 'object'
    ? payload.result as Record<string, unknown>
    : null;

  if (result && Object.keys(result).length > 0) {
    const firstAwb = Object.keys(result)[0];
    out.awb = firstAwb;
    const node = result[firstAwb];
    if (node && typeof node === 'object') {
      const nodeRec = node as Record<string, unknown>;
      const luNode = extractVelocityLabelUrl(nodeRec);
      if (luNode) out.labelUrl = luNode;
      const td = nodeRec.tracking_data as Record<string, unknown> | undefined;
      if (td && typeof td === 'object') {
        if (typeof td.shipment_status === 'string') out.shipmentStatus = td.shipment_status;
        if (typeof td.track_url === 'string') out.trackUrl = td.track_url;
        const luTd = extractVelocityLabelUrl(td);
        if (luTd) out.labelUrl = out.labelUrl || luTd;
        const activities = td.shipment_track_activities;
        const tracks = td.shipment_track;
        out.snapshot = {
          fetched_at: nowIso(),
          shipment_status: td.shipment_status,
          track_url: td.track_url,
          shipment_track_activities: Array.isArray(activities) ? activities : [],
          shipment_track: Array.isArray(tracks) ? tracks : [],
        };
        const firstTrack = Array.isArray(tracks) && tracks[0] && typeof tracks[0] === 'object'
          ? tracks[0] as Record<string, unknown>
          : null;
        if (firstTrack && typeof firstTrack.current_status === 'string') {
          out.shipmentStatus = out.shipmentStatus || firstTrack.current_status;
        }
      }
    }
    return out;
  }

  const shipmentStatus = typeof payload.current_status === 'string'
    ? payload.current_status
    : (typeof payload.shipment_status === 'string' ? payload.shipment_status : undefined);

  const awb = typeof payload.awb_code === 'string'
    ? payload.awb_code
    : (typeof payload.awb === 'string' ? payload.awb : undefined);

  const labelUrl = extractVelocityLabelUrl(payload);
  return { shipmentStatus, awb, labelUrl: labelUrl || undefined };
}

function pickTrackingActivitiesFromResponse(data: unknown): TrackingActivityEvent[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const payload = root.payload && typeof root.payload === 'object'
    ? root.payload as Record<string, unknown>
    : root;
  const result = payload.result && typeof payload.result === 'object'
    ? payload.result as Record<string, unknown>
    : null;
  if (!result || Object.keys(result).length === 0) return [];

  const firstAwb = Object.keys(result)[0];
  const node = result[firstAwb];
  if (!node || typeof node !== 'object') return [];
  const nodeRec = node as Record<string, unknown>;
  const td = nodeRec.tracking_data && typeof nodeRec.tracking_data === 'object'
    ? nodeRec.tracking_data as Record<string, unknown>
    : null;
  if (!td) return [];

  const acts = Array.isArray(td.shipment_track_activities) ? td.shipment_track_activities : [];
  if (acts.length > 0) {
    return acts
      .filter((ev) => ev && typeof ev === 'object')
      .slice(0, 80)
      .map((ev) => {
        const r = ev as Record<string, unknown>;
        return {
          activity: typeof r.activity === 'string'
            ? r.activity
            : (typeof r.description === 'string' ? r.description : null),
          location: typeof r.location === 'string' ? r.location : null,
          carrierRemark: typeof r.remark === 'string'
            ? r.remark
            : (typeof r.remarks === 'string' ? r.remarks : null),
          eventTime: typeof r.date === 'string'
            ? r.date
            : (typeof r.event_date_time === 'string' ? r.event_date_time : null),
          rawPayload: r,
        };
      });
  }

  const tracks = Array.isArray(td.shipment_track) ? td.shipment_track : [];
  if (tracks.length > 0) {
    return tracks
      .filter((ev) => ev && typeof ev === 'object')
      .slice(0, 80)
      .map((ev) => {
        const r = ev as Record<string, unknown>;
        return {
          activity: typeof r.current_status === 'string'
            ? r.current_status
            : (typeof r.status === 'string' ? r.status : null),
          location: typeof r.destination === 'string'
            ? r.destination
            : (typeof r.location === 'string' ? r.location : null),
          carrierRemark: typeof r.courier_agent_details === 'string'
            ? r.courier_agent_details
            : (typeof r.remarks === 'string' ? r.remarks : null),
          eventTime: typeof r.delivered_date === 'string'
            ? r.delivered_date
            : (typeof r.pickup_date === 'string' ? r.pickup_date : null),
          rawPayload: r,
        };
      });
  }

  return [];
}

/**
 * Maps Velocity/Shipfast shipment_status → storefront `orders.status` / `customer_status`.
 * See Shipfast guide status list + Velocity API §7 tracking statuses.
 */
function mergeOrderPatchFromShipmentStatus(
  patch: Record<string, unknown>,
  shipmentStatus: string | undefined,
  currentOrderStatus: string | undefined,
  opts?: { carrierReason?: string },
): void {
  const s = String(shipmentStatus || '').toLowerCase();
  const cur = String(currentOrderStatus || '').toLowerCase();
  if (!s) return;

  if (cur === 'cancelled' || cur === 'rejected') return;

  if (cur === 'delivered' && s !== 'delivered') {
    return;
  }

  const inProgress = new Set([
    'pending',
    'processing',
    'ready_for_pickup',
    'pickup_scheduled',
    'not_picked',
    'in_transit',
    'out_for_delivery',
    'reattempt_delivery',
    'externally_fulfilled',
    'need_attention',
    'ndr_raised',
    'rto_initiated',
    'rto_in_transit',
    'rto_need_attention',
    'rto_cancelled',
  ]);

  const terminalFail = new Set(['cancelled', 'rejected', 'lost']);

  const rtoClosed = new Set(['rto_delivered']);

  if (s === 'delivered') {
    patch.status = 'delivered';
    patch.customer_status = 'delivered';
    patch.processed_at = patch.processed_at ?? nowIso();
    return;
  }

  if (inProgress.has(s)) {
    if (cur === 'placed' || cur === 'processing') {
      patch.status = 'shipped';
      patch.customer_status = 'shipped';
      patch.shipped_at = patch.shipped_at ?? nowIso();
    }
    return;
  }

  if (terminalFail.has(s)) {
    if (cur !== 'delivered') {
      patch.status = 'cancelled';
      patch.customer_status = 'cancelled';
      const reason = opts?.carrierReason?.trim()
        ? String(opts.carrierReason)
        : `Shipment ${s.replace(/_/g, ' ')} (Velocity)`;
      patch.cancellation_reason = patch.cancellation_reason ?? reason;
    }
    return;
  }

  if (rtoClosed.has(s)) {
    if (cur !== 'delivered') {
      patch.status = 'cancelled';
      patch.customer_status = 'cancelled';
      patch.cancellation_reason = patch.cancellation_reason ??
        'Return to origin completed — shipment closed (Velocity)';
    }
  }
}

function verifyVelocityWebhookSecret(req: Request): boolean {
  const configured = getEnvOptional('VELOCITY_WEBHOOK_SECRET');
  if (!configured) return false;
  const h1 = req.headers.get('x-velocity-webhook-secret') || '';
  const h2 = req.headers.get('x-api-key') || '';
  const bearer = getBearerToken(req) || '';
  return configured === h1 || configured === h2 || configured === bearer;
}

type VelocityWebhookRouting =
  | { kind: 'shipment'; shipmentId: string; orderId: string }
  | { kind: 'order'; orderId: string };

async function resolveVelocityWebhookRouting(
  adminClient: ReturnType<typeof createAdminClient>,
  externalId: string,
): Promise<VelocityWebhookRouting | null> {
  const t = externalId.trim();
  if (!t) return null;

  const { data: ship } = await adminClient
    .from('order_shipments')
    .select('id, order_id')
    .eq('velocity_external_code', t)
    .maybeSingle();
  if (ship?.id && ship.order_id) {
    return { kind: 'shipment', shipmentId: ship.id, orderId: ship.order_id };
  }

  const { data: byUuid } = await adminClient.from('orders').select('id').eq('id', t).maybeSingle();
  if (byUuid?.id) return { kind: 'order', orderId: byUuid.id };

  const { data: oid } = await adminClient.rpc('resolve_order_from_velocity_external_id', {
    p_ext: t,
  });
  if (typeof oid === 'string' && oid) {
    return { kind: 'order', orderId: oid };
  }

  return null;
}

async function recomputeFulfillmentAggregate(
  adminClient: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<void> {
  await adminClient.rpc('recompute_order_fulfillment_aggregate', { p_order_id: orderId });
}

async function reserveVelocityWebhookEventId(
  adminClient: ReturnType<typeof createAdminClient>,
  eventId: string,
  eventType: string,
  externalId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  const t = eventId.trim();
  if (!t) return true;
  const { data, error } = await adminClient.rpc('reserve_velocity_webhook_event', {
    p_event_id: t,
    p_event_type: eventType || null,
    p_external_id: externalId || null,
    p_payload: payload as Json,
  });
  if (error) {
    console.error('reserve_velocity_webhook_event rpc error', error);
    return false;
  }
  return data === true;
}

async function ensureSingleShipmentLot(
  adminClient: ReturnType<typeof createAdminClient>,
  orderId: string,
  externalId: string,
): Promise<string | null> {
  const { data: existing } = await adminClient
    .from('order_shipments')
    .select('id, velocity_external_code')
    .eq('order_id', orderId)
    .eq('lot_index', 1)
    .maybeSingle();

  if (existing?.id) {
    if (!existing.velocity_external_code || String(existing.velocity_external_code).trim() !== externalId) {
      await adminClient
        .from('order_shipments')
        .update({ velocity_external_code: externalId, updated_at: nowIso() })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: inserted, error: insertErr } = await adminClient
    .from('order_shipments')
    .insert({
      order_id: orderId,
      lot_index: 1,
      label: 'Shipment 1',
      velocity_external_code: externalId,
    })
    .select('id')
    .maybeSingle();

  if (insertErr) {
    console.error('ensureSingleShipmentLot insert failed', insertErr);
    const { data: fallback } = await adminClient
      .from('order_shipments')
      .select('id')
      .eq('order_id', orderId)
      .eq('lot_index', 1)
      .maybeSingle();
    return fallback?.id ?? null;
  }

  return inserted?.id ?? null;
}

function buildShipmentLotPatchFromWebhook(
  data: Record<string, unknown>,
  velocityStatus: string,
  event: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    carrier_shipment_status: velocityStatus || null,
    updated_at: nowIso(),
  };

  const tn = typeof data.tracking_number === 'string' ? data.tracking_number.trim() : '';
  if (tn) {
    patch.tracking_number = tn;
    patch.velocity_awb = tn;
  }

  const tu = typeof data.tracking_url === 'string' ? data.tracking_url.trim() : '';
  if (tu) patch.velocity_tracking_url = tu;

  const cn = typeof data.carrier_name === 'string' ? data.carrier_name.trim() : '';
  if (cn) patch.velocity_carrier_name = cn;

  const labelFromWebhook = extractVelocityLabelUrl(data);
  if (labelFromWebhook) patch.velocity_label_url = labelFromWebhook;

  if (event === 'tracking_addition' && data.new_tracking && typeof data.new_tracking === 'object') {
    patch.velocity_tracking_snapshot = {
      webhook_at: nowIso(),
      event,
      last_event: data.new_tracking,
    };
  }

  return patch;
}

async function appendInboundWebhookShipmentEvent(
  adminClient: ReturnType<typeof createAdminClient>,
  shipmentId: string,
  data: Record<string, unknown>,
  velocityStatus: string,
  event: string,
): Promise<void> {
  if (event !== 'tracking_addition') {
    return;
  }

  const nt = data.new_tracking && typeof data.new_tracking === 'object'
    ? data.new_tracking as Record<string, unknown>
    : null;
  const acts = nt && Array.isArray(nt.shipment_track_activities)
    ? nt.shipment_track_activities as unknown[]
    : [];

  if (acts.length > 0) {
    const rows = acts.slice(0, 80).map((ev) => {
      const r = typeof ev === 'object' && ev !== null ? ev as Record<string, unknown> : {};
      return {
        order_shipment_id: shipmentId,
        source: 'webhook',
        raw_payload: r as Json,
        activity: typeof r.activity === 'string'
          ? r.activity
          : typeof r.description === 'string'
          ? r.description
          : null,
        location: typeof r.location === 'string' ? r.location : null,
        carrier_remark: typeof r.remark === 'string' ? r.remark : null,
        event_time: typeof r.date === 'string' ? r.date : null,
      };
    });
    await adminClient.from('order_shipment_tracking_events').insert(rows);
    return;
  }

  if (nt) {
    await adminClient.from('order_shipment_tracking_events').insert({
      order_shipment_id: shipmentId,
      source: 'webhook',
      raw_payload: nt as Json,
      activity: typeof nt.remarks === 'string' && nt.remarks.trim()
        ? nt.remarks.trim()
        : velocityStatus || null,
      location: typeof nt.location === 'string' ? nt.location : null,
      carrier_remark: typeof nt.remarks === 'string' ? nt.remarks : null,
      event_time: typeof nt.event_date_time === 'string' ? nt.event_date_time : nowIso(),
    });
    return;
  }

  await adminClient.from('order_shipment_tracking_events').insert({
    order_shipment_id: shipmentId,
    source: 'webhook',
    raw_payload: data as Json,
    activity: velocityStatus || null,
    location: typeof data.location === 'string' ? String(data.location) : null,
    carrier_remark: typeof data.ndr_reason === 'string' ? String(data.ndr_reason) : null,
    event_time: nowIso(),
  });
}

/**
 * Inbound webhook as sent by Velocity/Shipfast portal (not wrapped in { action, payload }).
 * Docs: Shipfast Webhook Guide — event + data.order_external_id + data.status + data.tracking_url
 */
async function handleShipfastInboundWebhook(
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
  body: Record<string, unknown>,
): Promise<Response> {
  if (!getEnvOptional('VELOCITY_WEBHOOK_SECRET')) {
    return new Response(JSON.stringify({ error: 'Missing VELOCITY_WEBHOOK_SECRET — configure secrets for inbound webhooks' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!verifyVelocityWebhookSecret(req)) {
    return new Response(JSON.stringify({ error: 'Invalid webhook authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const event = typeof body.event === 'string' ? body.event : '';
  const eventId = typeof body.event_id === 'string' ? body.event_id.trim() : '';
  const data = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : null;
  if (!data) {
    return new Response(JSON.stringify({ error: 'Missing data object' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const externalId = typeof data.order_external_id === 'string' ? data.order_external_id.trim() : '';
  const velocityStatus = typeof data.status === 'string' ? data.status.trim() : '';
  const shipmentType = typeof data.shipment_type === 'string' ? data.shipment_type.toLowerCase() : 'forward';
  const allowedEvents = new Set(['status_change', 'tracking_addition']);

  if (!externalId) {
    await logVelocityCall(adminClient, {
      action: 'webhook_update',
      requestPayload: body,
      responsePayload: { applied: false, reason: 'no_order_external_id' },
      statusCode: 200,
      success: true,
      orderId: null,
    });
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (shipmentType === 'return' || shipmentType === 'reverse') {
    await logVelocityCall(adminClient, {
      action: 'webhook_update',
      requestPayload: body,
      responsePayload: { applied: false, reason: 'return_shipment_skipped' },
      statusCode: 200,
      success: true,
      orderId: externalId,
    });
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'return_shipment' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!allowedEvents.has(event)) {
    await logVelocityCall(adminClient, {
      action: 'webhook_update',
      requestPayload: body,
      responsePayload: { applied: false, reason: 'event_not_supported', event },
      statusCode: 200,
      success: true,
      orderId: null,
    });
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'unsupported_event' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (eventId) {
    const reserved = await reserveVelocityWebhookEventId(adminClient, eventId, event, externalId, body);
    if (!reserved) {
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'duplicate_event_id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const routing = await resolveVelocityWebhookRouting(adminClient, externalId);
  if (!routing) {
    await logVelocityCall(adminClient, {
      action: 'webhook_update',
      requestPayload: body,
      responsePayload: { applied: false, reason: 'unknown_external_reference', external_id: externalId },
      statusCode: 200,
      success: true,
      orderId: null,
    });
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /* ── Shipment-lot webhook: update lot only; aggregate order status separately ── */
  if (routing.kind === 'shipment') {
    const lotPatch = buildShipmentLotPatchFromWebhook(data, velocityStatus, event);
    const { error: lotErr } = await adminClient.from('order_shipments').update(lotPatch).eq('id', routing.shipmentId);
    if (lotErr) console.error('webhook shipment lot update', lotErr);

    await appendInboundWebhookShipmentEvent(adminClient, routing.shipmentId, data, velocityStatus, event);
    await recomputeFulfillmentAggregate(adminClient, routing.orderId);

    await logVelocityCall(adminClient, {
      action: 'webhook_update',
      requestPayload: body,
      responsePayload: {
        applied: !lotErr,
        route: 'shipment_lot',
        order_id: routing.orderId,
        shipment_id: routing.shipmentId,
        event,
      },
      statusCode: 200,
      success: true,
      orderId: routing.orderId,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: orderMeta } = await adminClient
    .from('orders')
    .select('id, status, fulfillment_mode')
    .eq('id', routing.orderId)
    .maybeSingle();

  if (orderMeta?.fulfillment_mode === 'multi_shipment') {
    await logVelocityCall(adminClient, {
      action: 'webhook_update',
      requestPayload: body,
      responsePayload: {
        applied: false,
        reason: 'multi_shipment_use_lot_external_id',
        order_id: routing.orderId,
        hint: 'Velocity must send order_external_id matching order_shipments.velocity_external_code per lot.',
      },
      statusCode: 200,
      success: true,
      orderId: routing.orderId,
    });
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'multi_shipment_order_level' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const singleLotId = await ensureSingleShipmentLot(adminClient, routing.orderId, externalId);
  let singleLotErr: unknown = null;
  if (singleLotId) {
    const lotPatch = buildShipmentLotPatchFromWebhook(data, velocityStatus, event);
    const { error: lotErr } = await adminClient.from('order_shipments').update(lotPatch).eq('id', singleLotId);
    singleLotErr = lotErr;
    if (lotErr) console.error('webhook single-lot update', lotErr);
    await appendInboundWebhookShipmentEvent(adminClient, singleLotId, data, velocityStatus, event);
    await recomputeFulfillmentAggregate(adminClient, routing.orderId);
  }

  await logVelocityCall(adminClient, {
    action: 'webhook_update',
    requestPayload: body,
    responsePayload: {
      applied: singleLotId ? !singleLotErr : false,
      order_id: routing.orderId,
      shipment_id: singleLotId,
      event,
      route: 'shipment_lot_single',
    },
    statusCode: 200,
    success: true,
    orderId: routing.orderId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleCreateWarehouse(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const sellerId = typeof payload.seller_id === 'string' ? payload.seller_id : null;
  const pickupLocationId = typeof payload.pickup_location_id === 'string' ? payload.pickup_location_id : null;
  const forceResync = payload.force_resync === true;
  const firstString = (...values: unknown[]): string => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };

  const addressAttrsInput = (payload.address_attributes && typeof payload.address_attributes === 'object')
    ? payload.address_attributes as Record<string, unknown>
    : {};

  // Velocity warehouse API requires this exact shape.
  const normalizedPayload: Json = {
    name: firstString(payload.name, payload.warehouse_name, payload.pickup_location),
    phone_number: firstString(payload.phone_number, payload.warehouse_contact_number, payload.contact_number, payload.phone, payload.mobile),
    gst_no: firstString(payload.gst_no),
    email: firstString(payload.email, payload.warehouse_email_id, payload.email_id),
    contact_person: firstString(payload.contact_person, payload.warehouse_contact_person, payload.person_name),
    address_attributes: {
      street_address: firstString(
        addressAttrsInput.street_address,
        payload.street_address,
        payload.address_1,
        payload.address1,
        payload.address_line1,
        payload.address_line_1,
        payload.address,
      ),
      zip: firstString(addressAttrsInput.zip, payload.zip, payload.zip_code, payload.postal_code, payload.pincode, payload.pin_code, payload.pin),
      city: firstString(addressAttrsInput.city, payload.city, payload.city_name),
      state: firstString(addressAttrsInput.state, payload.state, payload.state_name),
      country: firstString(addressAttrsInput.country, payload.country) || 'India',
    },
  };

  if (sellerId && pickupLocationId && !forceResync) {
    const { data: existingLocation } = await adminClient
      .from('seller_pickup_locations')
      .select('velocity_warehouse_id, velocity_warehouse_synced_at, updated_at')
      .eq('id', pickupLocationId)
      .eq('seller_id', sellerId)
      .maybeSingle();

    const existingWarehouseId = typeof existingLocation?.velocity_warehouse_id === 'string'
      ? existingLocation.velocity_warehouse_id
      : null;
    const syncedAtMs = existingLocation?.velocity_warehouse_synced_at
      ? Date.parse(existingLocation.velocity_warehouse_synced_at)
      : NaN;
    const updatedAtMs = existingLocation?.updated_at
      ? Date.parse(existingLocation.updated_at)
      : NaN;
    const unchangedSinceSync =
      existingWarehouseId &&
      !Number.isNaN(syncedAtMs) &&
      !Number.isNaN(updatedAtMs) &&
      updatedAtMs <= syncedAtMs;

    if (unchangedSinceSync) {
      const skippedResponse = {
        status: 'SKIPPED',
        message: 'Warehouse is already synced and unchanged.',
        skipped: true,
        existing_warehouse_id: existingWarehouseId,
        payload: { warehouse_id: existingWarehouseId },
      };

      await logVelocityCall(adminClient, {
        action: 'create_warehouse',
        requestPayload: normalizedPayload,
        responsePayload: skippedResponse,
        statusCode: 200,
        success: true,
        sellerId,
      });

      return {
        ok: true,
        status: 200,
        data: skippedResponse,
        endpoint,
      };
    }
  }

  const apiResult = await callVelocityApi('create_warehouse', endpoint, token, normalizedPayload);
  const responseData = apiResult.data as Record<string, unknown>;
  const warehouseId = typeof responseData?.warehouse_id === 'string'
    ? responseData.warehouse_id
    : (typeof (responseData?.payload as Record<string, unknown> | undefined)?.warehouse_id === 'string'
      ? (responseData.payload as Record<string, unknown>).warehouse_id as string
      : null);

  if (apiResult.ok && sellerId && pickupLocationId && warehouseId) {
    await adminClient
      .from('seller_pickup_locations')
      .update({
        velocity_warehouse_id: warehouseId,
        velocity_warehouse_raw: {
          request: normalizedPayload,
          response: apiResult.data,
        },
        velocity_warehouse_synced_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', pickupLocationId)
      .eq('seller_id', sellerId);
  }

  await logVelocityCall(adminClient, {
    action: 'create_warehouse',
    requestPayload: normalizedPayload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Warehouse creation failed',
    sellerId,
  });

  return apiResult;
}

function extractDistinctSellerIds(orderItems: Array<Record<string, unknown>>): string[] {
  const ids = new Set<string>();
  for (const item of orderItems) {
    const product = item.products as Record<string, unknown> | null;
    if (product && typeof product.seller_id === 'string') ids.add(product.seller_id);
    const lotSnapshot = Array.isArray(item.lot_snapshot) ? item.lot_snapshot : [];
    for (const snap of lotSnapshot) {
      if (snap && typeof snap === 'object' && typeof (snap as Record<string, unknown>).seller_id === 'string') {
        ids.add((snap as Record<string, unknown>).seller_id as string);
      }
    }
  }
  return [...ids];
}

async function resolvePickupForOrder(
  adminClient: ReturnType<typeof createAdminClient>,
  orderItems: Array<Record<string, unknown>>,
  fallbackPickupName: string,
  fallbackPickupPincode: string,
): Promise<{ pickupLocation: string; pickupPincode: string; sellerId: string | null; source: 'seller_default' | 'fallback' }> {
  const sellerIds = extractDistinctSellerIds(orderItems);
  if (sellerIds.length !== 1) {
    return { pickupLocation: fallbackPickupName, pickupPincode: fallbackPickupPincode, sellerId: null, source: 'fallback' };
  }

  const sellerId = sellerIds[0];
  const { data: location } = await adminClient
    .from('seller_pickup_locations')
    .select('warehouse_name,pincode')
    .eq('seller_id', sellerId)
    .eq('is_default', true)
    .maybeSingle();

  if (!location) {
    return { pickupLocation: fallbackPickupName, pickupPincode: fallbackPickupPincode, sellerId, source: 'fallback' };
  }

  return {
    pickupLocation: String(location.warehouse_name || fallbackPickupName),
    pickupPincode: String(location.pincode || fallbackPickupPincode),
    sellerId,
    source: 'seller_default',
  };
}

async function loadOrderContext(
  adminClient: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<{
  order: Record<string, unknown>;
  orderItems: Array<Record<string, unknown>>;
  customerPincode: string;
}> {
  const { data: order, error: orderErr } = await adminClient
    .from('orders')
    .select('id,status,payment_method,total_amount,shipping_address,created_at,velocity_shipment_id,velocity_pending_shipment_id,velocity_fulfillment,fulfillment_mode')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) throw new Error('Order not found');

  const { data: orderItems, error: orderItemsErr } = await adminClient
    .from('order_items')
    .select('id,quantity,price,lot_name,lot_snapshot,order_shipment_id,products(id,key,name,seller_id)')
    .eq('order_id', orderId);

  if (orderItemsErr) throw new Error('Unable to load order items');

  const addr = (order.shipping_address || {}) as Record<string, unknown>;
  const customerPincode = String(addr.postal_code || '').replace(/\s/g, '');
  if (!customerPincode || customerPincode.length !== 6) {
    throw new Error('Invalid customer pincode');
  }

  return { order: order as Record<string, unknown>, orderItems: (orderItems || []) as Array<Record<string, unknown>>, customerPincode };
}

function buildForwardOrderLineItems(
  orderItems: Array<Record<string, unknown>>,
  subTotal: number,
): Json[] {
  const items = orderItems.flatMap((item) => {
    const lotSnapshot = Array.isArray(item.lot_snapshot) ? item.lot_snapshot : [];
    if (lotSnapshot.length > 0) {
      return lotSnapshot.map((snap) => {
        const s = snap as Record<string, unknown>;
        return {
          name: String(s.product_name || s.product_key || 'Product'),
          sku: String(s.product_key || 'SKU'),
          units: Math.max(1, Math.round(Number(s.quantity || 1) * Number(item.quantity || 1))),
          selling_price: Number(s.unit_price || 0),
          discount: 0,
          tax: 0,
        };
      });
    }
    const product = (item.products || {}) as Record<string, unknown>;
    return [{
      name: String(product.name || item.lot_name || 'Product'),
      sku: String(product.key || 'SKU'),
      units: Number(item.quantity || 1),
      selling_price: Number(item.price || 0),
      discount: 0,
      tax: 0,
    }];
  });
  return items.length ? items : [{ name: 'Order', sku: 'ORDER', units: 1, selling_price: subTotal, discount: 0, tax: 0 }];
}

async function fetchPickupLocationById(
  adminClient: ReturnType<typeof createAdminClient>,
  pickupLocationId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await adminClient
    .from('seller_pickup_locations')
    .select(
      'id, seller_id, warehouse_name, pincode, street_address, city, state, warehouse_contact_person, warehouse_contact_number, warehouse_email_id, velocity_warehouse_id',
    )
    .eq('id', pickupLocationId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function fetchWarehouseById(
  adminClient: ReturnType<typeof createAdminClient>,
  warehouseId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await adminClient
    .from('warehouses')
    .select('id, warehouse_name, pincode, street_address, city, state, contact_person, contact_number, email, velocity_warehouse_id')
    .eq('id', warehouseId)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

async function fetchVelocityPickupSourceById(
  adminClient: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<Record<string, unknown> | null> {
  const pickup = await fetchPickupLocationById(adminClient, id);
  if (pickup) return { ...pickup, _source: 'seller_pickup' };
  const wh = await fetchWarehouseById(adminClient, id);
  if (wh) return { ...wh, _source: 'warehouse' };
  return null;
}

function readPositiveDimension(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Merge Velocity §3 serviceability carriers with §9 Get Rates quotes (same carrier_id). */
function mergeServiceabilityWithRateQuotes(
  serviceabilityCarriers: Array<Record<string, unknown>>,
  rateCouriers: Array<Record<string, unknown>> | null,
): Array<Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  if (rateCouriers) {
    for (const r of rateCouriers) {
      const id = String(r.carrier_id || '').trim();
      if (id) byId.set(id, r);
    }
  }

  return serviceabilityCarriers.map((c) => {
    const id = String(c.carrier_id || '').trim();
    const q = id ? byId.get(id) : undefined;
    if (!q) {
      return { ...c, rate_quote: null };
    }

    const charges = (q.charges && typeof q.charges === 'object')
      ? q.charges as Record<string, unknown>
      : {};

    const expected_delivery = (q.expected_delivery && typeof q.expected_delivery === 'object')
      ? q.expected_delivery as Record<string, unknown>
      : undefined;

    return {
      ...c,
      rate_quote: {
        charges,
        expected_delivery: expected_delivery ?? null,
        platform_fee: q.platform_fee ?? null,
        service_level: typeof q.service_level === 'string' ? q.service_level : null,
        is_fast: typeof q.is_fast === 'boolean' ? q.is_fast : null,
        is_prime: typeof q.is_prime === 'boolean' ? q.is_prime : null,
      },
    };
  });
}

function vendorDetailsFromPickupRow(row: Record<string, unknown>, pickupLocationName: string): Json {
  return {
    email: String(row.warehouse_email_id || ''),
    phone: String(row.warehouse_contact_number || ''),
    name: String(row.warehouse_contact_person || ''),
    address: String(row.street_address || ''),
    address_2: '',
    city: String(row.city || ''),
    state: String(row.state || ''),
    country: 'India',
    pin_code: String(row.pincode || '').replace(/\s/g, ''),
    pickup_location: pickupLocationName,
  };
}

function vendorDetailsFromWarehouseRow(row: Record<string, unknown>, pickupLocationName: string): Json {
  return {
    email: String(row.email || ''),
    phone: String(row.contact_number || ''),
    name: String(row.contact_person || ''),
    address: String(row.street_address || ''),
    address_2: '',
    city: String(row.city || ''),
    state: String(row.state || ''),
    country: 'India',
    pin_code: String(row.pincode || '').replace(/\s/g, ''),
    pickup_location: pickupLocationName,
  };
}

function baseVelocityOrderCode(orderId: string): string {
  return `HAT-${orderId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}

async function handleCheckServiceability(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  ratesEndpoint: string,
  token: string,
  payload: Json,
) {
  const orderId = typeof payload.order_id === 'string' ? payload.order_id : null;
  let requestPayload: Json = { ...payload };
  let sellerId: string | null = null;

  if (orderId) {
    const { order, orderItems, customerPincode } = await loadOrderContext(adminClient, orderId);
    const pickupLocationId = typeof payload.pickup_location_id === 'string' ? payload.pickup_location_id.trim() : '';

    let itemsForRates = orderItems;
    let codShipmentValue = Number(order.total_amount || 0);
    const shipmentLotForSvc = typeof (payload as Record<string, unknown>).order_shipment_id === 'string'
      ? String((payload as Record<string, unknown>).order_shipment_id).trim()
      : '';

    if (shipmentLotForSvc && String(order.fulfillment_mode || '') === 'multi_shipment') {
      const { data: lotOk } = await adminClient
        .from('order_shipments')
        .select('id')
        .eq('id', shipmentLotForSvc)
        .eq('order_id', orderId)
        .maybeSingle();
      if (!lotOk) throw new Error('order_shipment_id does not match this order for serviceability.');
      itemsForRates = orderItems.filter((i) => String(i.order_shipment_id || '') === shipmentLotForSvc);
      codShipmentValue = itemsForRates.reduce((a, i) => a + Number(i.price || 0) * Number(i.quantity || 0), 0);
      if (itemsForRates.length === 0) {
        throw new Error('No order items linked to this shipment lot.');
      }
    }

    let pickupPincode: string;
    let pickupLocationLabel: string;

    if (pickupLocationId) {
      const row = await fetchVelocityPickupSourceById(adminClient, pickupLocationId);
      if (!row) throw new Error('Pickup location was not found.');
      pickupPincode = String(row.pincode || '').replace(/\s/g, '');
      pickupLocationLabel = String(row.warehouse_name || 'Warehouse');
      sellerId = typeof row.seller_id === 'string' ? row.seller_id : null;
      if (!pickupPincode || pickupPincode.length !== 6) {
        throw new Error('Pickup location pincode must be a 6-digit PIN for serviceability.');
      }
    } else {
      const fallbackPickupPincode = String(getEnvOptional('VELOCITY_WAREHOUSE_PINCODE') || '').replace(/\s/g, '');
      const fallbackPickupLocation = getEnvOptional('VELOCITY_PICKUP_LOCATION') || 'Main Warehouse';
      const pickup = await resolvePickupForOrder(adminClient, itemsForRates, fallbackPickupLocation, fallbackPickupPincode);
      pickupPincode = String(pickup.pickupPincode || '').replace(/\s/g, '');
      pickupLocationLabel = pickup.pickupLocation;
      sellerId = pickup.sellerId;
      if (!pickupPincode || pickupPincode.length !== 6) {
        throw new Error(
          'Could not determine pickup PIN — select a synced pickup location (recommended), configure a seller default pickup with a valid 6-digit PIN, or set VELOCITY_WAREHOUSE_PINCODE.',
        );
      }
    }

    const method = String(order.payment_method || '').toLowerCase();
    const paymentMode = ['razorpay', 'razorpay_upi', 'razorpay_cards', 'phonepe', 'online'].includes(method) ? 'prepaid' : 'cod';
    requestPayload = {
      from: pickupPincode,
      to: customerPincode,
      payment_mode: paymentMode,
      shipment_type: 'forward',
    };

    const apiResult = await callVelocityApi('check_serviceability', endpoint, token, requestPayload);

    // If Velocity returns INVALID_CREDENTIALS on serviceability, the cached token may be stale.
    // Clear it so the next request re-authenticates.
    if (apiResult.status === 401 || hasVelocityInvalidCredentials(apiResult.data)) {
      await clearVelocityTokenCache(adminClient);
    }

    const dataObj = (apiResult.data || {}) as Record<string, unknown>;
    const resultObj = (dataObj.result || {}) as Record<string, unknown>;
    const carriers = Array.isArray(resultObj.serviceability_results) ? resultObj.serviceability_results : [];

    const carrierRows = carriers as Array<Record<string, unknown>>;
    let enrichedCarriers = carrierRows;
    let ratesShipmentDetails: unknown = null;
    let rates_note: string | null = null;

    if (apiResult.ok && carrierRows.length > 0) {
      const L = readPositiveDimension(payload.length);
      const W = readPositiveDimension(payload.breadth);
      const H = readPositiveDimension(payload.height);
      const weightKg = readPositiveDimension(payload.weight);

      if (L && W && H && weightKg) {
        const deadWeightGrams = Math.max(1, Math.round(weightKg * 1000));
        const ratesPayload: Json = {
          journey_type: 'forward',
          origin_pincode: pickupPincode,
          destination_pincode: customerPincode,
          dead_weight: deadWeightGrams,
          length: L,
          width: W,
          height: H,
          payment_method: paymentMode,
        };
        if (paymentMode === 'cod') {
          const sv = codShipmentValue;
          if (sv > 0) ratesPayload.shipment_value = sv;
        }

        try {
          const ratesResult = await callVelocityApi('calculate_rates', ratesEndpoint, token, ratesPayload);
          const rd = (ratesResult.data || {}) as Record<string, unknown>;
          const rs = (rd.result || {}) as Record<string, unknown>;
          const rateList = Array.isArray(rs.serviceable_couriers)
            ? rs.serviceable_couriers as Array<Record<string, unknown>>
            : [];
          ratesShipmentDetails = rs.shipment_details ?? null;

          if (ratesResult.ok && rateList.length > 0) {
            enrichedCarriers = mergeServiceabilityWithRateQuotes(carrierRows, rateList);
          } else {
            enrichedCarriers = mergeServiceabilityWithRateQuotes(carrierRows, null);
            if (!ratesResult.ok) {
              rates_note = 'Could not load rate quotes; showing couriers from serviceability only.';
            } else {
              rates_note = 'Rates API returned no courier quotes for this shipment; showing serviceability list only.';
            }
          }

          await logVelocityCall(adminClient, {
            action: 'calculate_rates',
            requestPayload: ratesPayload,
            responsePayload: ratesResult.data,
            statusCode: ratesResult.status,
            success: ratesResult.ok,
            errorMessage: ratesResult.ok ? undefined : 'Get rates failed',
            orderId,
            sellerId,
          });
        } catch {
          enrichedCarriers = mergeServiceabilityWithRateQuotes(carrierRows, null);
          rates_note = 'Rates request failed; showing couriers from serviceability only.';
        }
      } else {
        enrichedCarriers = mergeServiceabilityWithRateQuotes(carrierRows, null);
        rates_note = 'Add package dimensions and weight to show estimated fees and delivery dates (Velocity Get Rates API).';
      }
    }

    const transformedData = {
      serviceable: enrichedCarriers.length > 0,
      carriers: enrichedCarriers,
      zone: resultObj.zone || null,
      payment_mode: paymentMode,
      customer_pincode: customerPincode,
      pickup_location: pickupLocationLabel,
      pickup_pincode: pickupPincode,
      pickup_source: pickupLocationId ? 'selected_pickup' : 'seller_default_or_fallback',
      rates_shipment_details: ratesShipmentDetails,
      rates_note,
      raw: apiResult.data,
    };

    await logVelocityCall(adminClient, {
      action: 'check_serviceability',
      requestPayload,
      responsePayload: transformedData,
      statusCode: apiResult.status,
      success: apiResult.ok,
      errorMessage: apiResult.ok ? undefined : 'Serviceability check failed',
      orderId,
      sellerId,
    });

    return { ...apiResult, data: transformedData };
  }

  const apiResult = await callVelocityApi('check_serviceability', endpoint, token, requestPayload);

  // Clear stale token cache on INVALID_CREDENTIALS so next call re-authenticates.
  if (apiResult.status === 401 || hasVelocityInvalidCredentials(apiResult.data)) {
    await clearVelocityTokenCache(adminClient);
  }

  await logVelocityCall(adminClient, {
    action: 'check_serviceability',
    requestPayload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Serviceability check failed',
  });
  return apiResult;
}

async function handleCreateOrder(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const orderId = String(payload.order_id || '');
  if (!orderId) throw new Error('create_order requires order_id');

  const fallbackWarehouseId = getEnvOptional('VELOCITY_WAREHOUSE_ID');
  const fallbackPickupPincode = getEnvOptional('VELOCITY_WAREHOUSE_PINCODE') || '000000';
  const fallbackPickupLocation = getEnvOptional('VELOCITY_PICKUP_LOCATION') || 'Main Warehouse';
  const { order, orderItems, customerPincode } = await loadOrderContext(adminClient, orderId);
  const pickup = await resolvePickupForOrder(adminClient, orderItems, fallbackPickupLocation, fallbackPickupPincode);

  const requestedPickupLocationId = typeof payload.pickup_location_id === 'string' ? payload.pickup_location_id : null;
  let warehouseId = fallbackWarehouseId || null;
  let pickupLocationName = pickup.pickupLocation;
  let pickupPincode = pickup.pickupPincode;
  let resolvedSellerId: string | null = pickup.sellerId;

  if (requestedPickupLocationId) {
    const selectedPickup = await fetchVelocityPickupSourceById(adminClient, requestedPickupLocationId);
    if (!selectedPickup) {
      throw new Error('Selected pickup location was not found.');
    }
    if (!selectedPickup.velocity_warehouse_id) {
      throw new Error('Selected pickup location is not synced with Velocity warehouse yet.');
    }

    warehouseId = String(selectedPickup.velocity_warehouse_id);
    pickupLocationName = String(selectedPickup.warehouse_name || pickupLocationName);
    pickupPincode = String(selectedPickup.pincode || pickupPincode);
    resolvedSellerId = typeof selectedPickup.seller_id === 'string' ? selectedPickup.seller_id : null;
  }

  if (!warehouseId) {
    throw new Error('No warehouse is configured. Sync a pickup location or set VELOCITY_WAREHOUSE_ID.');
  }

  if (String(order.status || '') !== 'processing') {
    throw new Error("Order must be in 'processing' state to create shipment.");
  }
  if (order.velocity_shipment_id) {
    throw new Error('Shipment already exists for this order.');
  }
  {
    const vf = order.velocity_fulfillment && typeof order.velocity_fulfillment === 'object'
      ? order.velocity_fulfillment as Record<string, unknown>
      : null;
    const history = Array.isArray(vf?.historical_velocity_orders) ? vf?.historical_velocity_orders : [];
    if (history.length > 0) {
      throw new Error('A Velocity shipment order already exists for this order. Resume the existing shipment order instead of creating a new one.');
    }
  }

  const addr = (order.shipping_address || {}) as Record<string, unknown>;
  const method = String(order.payment_method || '').toLowerCase();
  const paymentMethod = ['razorpay', 'razorpay_upi', 'razorpay_cards', 'phonepe', 'online'].includes(method) ? 'PREPAID' : 'COD';
  const subTotal = Number(order.total_amount || 0);

  const items = buildForwardOrderLineItems(orderItems, subTotal);

  const requestPayload: Json = {
    order_id: baseVelocityOrderCode(orderId),
    order_date: new Date(String(order.created_at || nowIso())).toISOString().replace('T', ' ').slice(0, 16),
    carrier_id: typeof payload.carrier_id === 'string' ? payload.carrier_id : '',
    billing_customer_name: String(addr.first_name || addr.name || 'Customer'),
    billing_last_name: String(addr.last_name || ''),
    billing_address: [addr.address_line1, addr.address_line2].filter(Boolean).join(', '),
    billing_city: String(addr.city || ''),
    billing_pincode: customerPincode,
    billing_state: String(addr.state || ''),
    billing_country: 'India',
    billing_email: String(addr.email || ''),
    billing_phone: String(addr.phone || ''),
    shipping_is_billing: true,
    print_label: true,
    order_items: items,
    payment_method: paymentMethod,
    sub_total: subTotal,
    cod_collectible: paymentMethod === 'COD' ? subTotal : 0,
    length: Number(payload.length || 15),
    breadth: Number(payload.breadth || 15),
    height: Number(payload.height || 10),
    weight: Number(payload.weight || 0.5),
    pickup_location: pickupLocationName,
    warehouse_id: warehouseId,
  };

  const apiResult = await callVelocityApi('create_order', endpoint, token, requestPayload);
  const dataObj = (apiResult.data || {}) as Record<string, unknown>;
  const outPayload = (dataObj.payload || dataObj) as Record<string, unknown>;

  if (apiResult.ok) {
    await adminClient.from('orders').update({
      status: 'shipped',
      shipment_status: 'in_transit',
      shipment_provider: String(outPayload.courier_name || 'Velocity'),
      tracking_number: String(outPayload.awb_code || ''),
      velocity_shipment_id: String(outPayload.shipment_id || ''),
      velocity_awb: String(outPayload.awb_code || ''),
      velocity_label_url: extractVelocityLabelUrl(outPayload),
      velocity_carrier_name: String(outPayload.courier_name || ''),
      shipped_at: nowIso(),
      updated_at: nowIso(),
      admin_updated_at: nowIso(),
    }).eq('id', orderId).then(() => {}, () => {});
  }

  await logVelocityCall(adminClient, {
    action: 'create_order',
    requestPayload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Order creation failed on Velocity',
    orderId,
    sellerId: resolvedSellerId,
  });

  return apiResult;
}

async function handleCreateForwardOrder(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const orderId = String(payload.order_id || '');
  if (!orderId) throw new Error('create_forward_order requires order_id');

  const pickupLocationId = String(payload.pickup_location_id || '').trim();
  if (!pickupLocationId) throw new Error('create_forward_order requires pickup_location_id');

  const length = Number(payload.length);
  const breadth = Number(payload.breadth);
  const height = Number(payload.height);
  const weight = Number(payload.weight);

  const { order, orderItems, customerPincode } = await loadOrderContext(adminClient, orderId);

  const orderShipmentId = typeof (payload as Record<string, unknown>).order_shipment_id === 'string'
    ? String((payload as Record<string, unknown>).order_shipment_id).trim()
    : '';

  let shipmentLot: Record<string, unknown> | null = null;
  let velocityOrderRef = baseVelocityOrderCode(orderId);

  if (orderShipmentId) {
    const { data: lotRow, error: lotErr } = await adminClient
      .from('order_shipments')
      .select(
        'id, order_id, warehouse_id, velocity_external_code, velocity_pending_shipment_id, velocity_shipment_id, tracking_number',
      )
      .eq('id', orderShipmentId)
      .eq('order_id', orderId)
      .maybeSingle();
    if (lotErr || !lotRow) throw new Error('order_shipment_id does not match this order.');
    shipmentLot = lotRow as Record<string, unknown>;
    velocityOrderRef = String(shipmentLot.velocity_external_code || velocityOrderRef);
    if (String(order.fulfillment_mode || '') !== 'multi_shipment') {
      throw new Error('order_shipment_id can only be used when the order uses multi_shipment fulfillment.');
    }
    const pend = String(shipmentLot.velocity_pending_shipment_id || '').trim();
    const sidExisting = String(shipmentLot.velocity_shipment_id || '').trim();
    const tnLot = String(shipmentLot.tracking_number || '').trim();
    if (pend || sidExisting || tnLot) {
      throw new Error('This shipment lot already has a Velocity draft or AWB. Cancel it before creating another.');
    }
  } else if (String(order.fulfillment_mode || '') === 'multi_shipment') {
    throw new Error(
      'Multi-shipment orders require payload.order_shipment_id (select which shipment lot to book on Velocity).',
    );
  }

  if (String(order.status || '') !== 'processing') {
    throw new Error("Order must be in 'processing' state to create shipment.");
  }

  if (!orderShipmentId) {
    if (order.velocity_shipment_id) {
      throw new Error('Shipment already exists for this order.');
    }
    const existingDraft = typeof order.velocity_pending_shipment_id === 'string'
      ? order.velocity_pending_shipment_id.trim()
      : '';
    if (existingDraft) {
      throw new Error(
        'A Velocity shipment draft already exists for this order. Assign a courier to generate the AWB, or cancel the draft before creating another.',
      );
    }
    {
      const vf = order.velocity_fulfillment && typeof order.velocity_fulfillment === 'object'
        ? order.velocity_fulfillment as Record<string, unknown>
        : null;
      const history = Array.isArray(vf?.historical_velocity_orders) ? vf?.historical_velocity_orders : [];
      if (history.length > 0) {
        throw new Error(
          'A Velocity shipment order already exists for this order. Resume the existing shipment order instead of creating a new one.',
        );
      }
    }
  }

  const pickupRow = await fetchVelocityPickupSourceById(adminClient, pickupLocationId);
  if (!pickupRow) throw new Error('Pickup location was not found.');
  const warehouseId = typeof pickupRow.velocity_warehouse_id === 'string' ? pickupRow.velocity_warehouse_id.trim() : '';
  if (!warehouseId) {
    throw new Error('Pickup location is not synced with Velocity (missing warehouse_id).');
  }

  const pickupLocationName = String(pickupRow.warehouse_name || 'Warehouse');
  const sellerId = typeof pickupRow.seller_id === 'string' ? pickupRow.seller_id : null;

  if (shipmentLot?.warehouse_id) {
    const { data: whRow } = await adminClient
      .from('warehouses')
      .select('velocity_warehouse_id')
      .eq('id', shipmentLot.warehouse_id as string)
      .maybeSingle();
    const expectVel = String(whRow?.velocity_warehouse_id || '').trim();
    const pickVel = String(pickupRow.velocity_warehouse_id || '').trim();
    if (expectVel && pickVel && expectVel !== pickVel) {
      throw new Error('Pickup location Velocity warehouse does not match this shipment lot warehouse.');
    }
  }

  let scopedItems = orderItems;
  let financeSubTotal = Number(order.total_amount || 0);
  if (orderShipmentId && shipmentLot) {
    scopedItems = orderItems.filter((i) => String(i.order_shipment_id || '') === orderShipmentId);
    if (scopedItems.length === 0) {
      throw new Error('No order line items linked to this shipment lot.');
    }
    financeSubTotal = scopedItems.reduce((a, i) => a + Number(i.price || 0) * Number(i.quantity || 0), 0);
  }

  const addr = (order.shipping_address || {}) as Record<string, unknown>;
  const method = String(order.payment_method || '').toLowerCase();
  const paymentMethod = ['razorpay', 'razorpay_upi', 'razorpay_cards', 'phonepe', 'online'].includes(method) ? 'PREPAID' : 'COD';

  const items = buildForwardOrderLineItems(scopedItems, financeSubTotal);

  const channelId = getEnvOptional('VELOCITY_CHANNEL_ID');

  const requestPayload: Json = {
    order_id: velocityOrderRef,
    order_date: new Date(String(order.created_at || nowIso())).toISOString().replace('T', ' ').slice(0, 16),
    billing_customer_name: String(addr.first_name || addr.name || 'Customer'),
    billing_last_name: String(addr.last_name || ''),
    billing_address: [addr.address_line1, addr.address_line2].filter(Boolean).join(', '),
    billing_city: String(addr.city || ''),
    billing_pincode: customerPincode,
    billing_state: String(addr.state || ''),
    billing_country: 'India',
    billing_email: String(addr.email || ''),
    billing_phone: String(addr.phone || ''),
    shipping_is_billing: true,
    print_label: true,
    order_items: items,
    payment_method: paymentMethod,
    sub_total: financeSubTotal,
    cod_collectible: paymentMethod === 'COD' ? financeSubTotal : 0,
    length,
    breadth,
    height,
    weight,
    pickup_location: pickupLocationName,
    warehouse_id: warehouseId,
    vendor_details: String(pickupRow._source || '') === 'warehouse'
      ? vendorDetailsFromWarehouseRow(pickupRow, pickupLocationName)
      : vendorDetailsFromPickupRow(pickupRow, pickupLocationName),
  };

  if (channelId) requestPayload.channel_id = channelId;

  const apiResult = await callVelocityApi('create_forward_order', endpoint, token, requestPayload);
  const createDataObj = (apiResult.data || {}) as Record<string, unknown>;
  const createOut = (createDataObj.payload || createDataObj) as Record<string, unknown>;

  if (apiResult.ok) {
    const sid = String(createOut.shipment_id || '').trim();
    if (!sid) {
      throw new Error('Velocity forward-order succeeded but shipment_id was missing — not saving draft.');
    }

    const snap = payload.serviceability_snapshot;
    const provisionalAwb = String(createOut.awb_code || createOut.shipment_awb || createOut.waybill || '').trim();

    const fulfillmentMeta: Record<string, unknown> = {
      pickup_location_id: pickupLocationId,
      length,
      breadth,
      height,
      weight,
      saved_at: nowIso(),
    };
    if (provisionalAwb) {
      fulfillmentMeta.velocity_precancel_awb = provisionalAwb;
    }
    if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
      const s = snap as Record<string, unknown>;
      fulfillmentMeta.serviceability = {
        serviceable: s.serviceable ?? null,
        carriers: s.carriers ?? null,
        zone: s.zone ?? null,
        payment_mode: s.payment_mode ?? null,
        customer_pincode: s.customer_pincode ?? null,
        pickup_pincode: s.pickup_pincode ?? null,
        pickup_location: s.pickup_location ?? null,
        rates_note: s.rates_note ?? null,
      };
    }

    if (orderShipmentId && shipmentLot) {
      await adminClient.from('order_shipments').update({
        velocity_pending_shipment_id: sid,
        velocity_fulfillment: fulfillmentMeta,
        updated_at: nowIso(),
      }).eq('id', orderShipmentId).then(() => {}, () => {});
    } else {
      await adminClient.from('orders').update({
        velocity_pending_shipment_id: sid,
        velocity_fulfillment: fulfillmentMeta,
        updated_at: nowIso(),
        admin_updated_at: nowIso(),
      }).eq('id', orderId).then(() => {}, () => {});
    }
  }

  await logVelocityCall(adminClient, {
    action: 'create_forward_order',
    requestPayload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Forward order creation failed on Velocity',
    orderId,
    sellerId,
  });

  return apiResult;
}

async function handleAssignCourier(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const internalOrderId = String(payload.order_id || '').trim();
  if (!internalOrderId) throw new Error('assign_courier requires order_id');

  const shipmentLotId = typeof (payload as Record<string, unknown>).order_shipment_id === 'string'
    ? String((payload as Record<string, unknown>).order_shipment_id).trim()
    : '';

  if (shipmentLotId) {
    const { data: lot } = await adminClient
      .from('order_shipments')
      .select('id, order_id, velocity_pending_shipment_id, tracking_number')
      .eq('id', shipmentLotId)
      .eq('order_id', internalOrderId)
      .maybeSingle();
    if (!lot) throw new Error('order_shipment_id not found for this order.');
    if (String(lot.tracking_number || '').trim()) {
      throw new Error('AWB already exists for this shipment lot.');
    }

    let shipmentId = String(payload.shipment_id || '').trim();
    if (!shipmentId) {
      shipmentId = String(lot.velocity_pending_shipment_id || '').trim();
    }
    if (!shipmentId) {
      throw new Error('assign_courier requires shipment_id or velocity_pending_shipment_id on the shipment lot.');
    }

    const carrierId = typeof payload.carrier_id === 'string' ? payload.carrier_id : '';
    const requestPayload: Json = { shipment_id: shipmentId, carrier_id: carrierId, print_label: true };

    const apiResult = await callVelocityApi('assign_courier', endpoint, token, requestPayload);
    const dataObj = (apiResult.data || {}) as Record<string, unknown>;
    const outPayload = (dataObj.payload || dataObj) as Record<string, unknown>;
    const assignedStatusRaw = String(outPayload.shipment_status || outPayload.current_status || '').trim().toLowerCase();
    const assignedStatus = assignedStatusRaw || 'ready_for_pickup';

    if (apiResult.ok) {
      await adminClient.from('order_shipments').update({
        tracking_number: String(outPayload.awb_code || ''),
        velocity_awb: String(outPayload.awb_code || ''),
        velocity_shipment_id: String(outPayload.shipment_id || shipmentId),
        velocity_pending_shipment_id: null,
        velocity_carrier_name: String(outPayload.courier_name || ''),
        velocity_label_url: extractVelocityLabelUrl(outPayload),
        // Keep lot cancellable until pickup actually starts.
        carrier_shipment_status: assignedStatus,
        updated_at: nowIso(),
      }).eq('id', shipmentLotId).then(() => {}, () => {});
      await recomputeFulfillmentAggregate(adminClient, internalOrderId);
    }

    await logVelocityCall(adminClient, {
      action: 'assign_courier',
      requestPayload,
      responsePayload: apiResult.data,
      statusCode: apiResult.status,
      success: apiResult.ok,
      errorMessage: apiResult.ok ? undefined : 'Assign courier failed',
      orderId: internalOrderId,
      sellerId: null,
    });

    return apiResult;
  }

  const { data: orderRow, error: orderErr } = await adminClient
    .from('orders')
    .select('id, status, tracking_number, velocity_pending_shipment_id')
    .eq('id', internalOrderId)
    .maybeSingle();

  if (orderErr || !orderRow) throw new Error('Order not found');
  if (String(orderRow.status || '') !== 'processing') {
    throw new Error("Order must be in 'processing' state to assign courier.");
  }
  if (String(orderRow.tracking_number || '').trim()) {
    throw new Error('AWB already exists for this order.');
  }

  let shipmentId = String(payload.shipment_id || '').trim();
  if (!shipmentId) {
    shipmentId = String(orderRow.velocity_pending_shipment_id || '').trim();
  }
  if (!shipmentId) throw new Error('assign_courier requires shipment_id or a saved Velocity draft on the order');

  const carrierId = typeof payload.carrier_id === 'string' ? payload.carrier_id : '';
  /** Match forward-order (`print_label: true`) so the shipment API returns a printable label URL when supported. */
  const requestPayload: Json = { shipment_id: shipmentId, carrier_id: carrierId, print_label: true };

  const apiResult = await callVelocityApi('assign_courier', endpoint, token, requestPayload);
  const dataObj = (apiResult.data || {}) as Record<string, unknown>;
  const outPayload = (dataObj.payload || dataObj) as Record<string, unknown>;

  if (apiResult.ok) {
    await adminClient.from('orders').update({
      status: 'shipped',
      shipment_status: 'in_transit',
      shipment_provider: String(outPayload.courier_name || 'Velocity'),
      tracking_number: String(outPayload.awb_code || ''),
      velocity_shipment_id: String(outPayload.shipment_id || shipmentId),
      velocity_awb: String(outPayload.awb_code || ''),
      velocity_label_url: extractVelocityLabelUrl(outPayload),
      velocity_carrier_name: String(outPayload.courier_name || ''),
      velocity_pending_shipment_id: null,
      velocity_fulfillment: null,
      shipped_at: nowIso(),
      updated_at: nowIso(),
      admin_updated_at: nowIso(),
    }).eq('id', internalOrderId).then(() => {}, () => {});
  }

  await logVelocityCall(adminClient, {
    action: 'assign_courier',
    requestPayload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Assign courier failed',
    orderId: internalOrderId,
    sellerId: null,
  });

  return apiResult;
}

async function handleTrackOrder(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const orderId = typeof payload.order_id === 'string' ? payload.order_id.trim() : null;
  const orderShipmentId = typeof (payload as Record<string, unknown>).order_shipment_id === 'string'
    ? String((payload as Record<string, unknown>).order_shipment_id).trim()
    : '';
  const p = payload as Record<string, unknown>;
  const awbDirect = typeof p.awb === 'string' ? p.awb.trim() : '';
  const trackNum = typeof p.tracking_number === 'string' ? p.tracking_number.trim() : '';
  const hasAwbs = Array.isArray(p.awbs) && p.awbs.length > 0;

  let velocityRequest: Json | null = null;

  if (hasAwbs) {
    velocityRequest = { awbs: p.awbs as unknown[] };
  } else if (awbDirect || trackNum) {
    velocityRequest = { awbs: [awbDirect || trackNum] };
  } else if (orderShipmentId) {
    const { data: lotRow } = await adminClient
      .from('order_shipments')
      .select('order_id, tracking_number, velocity_awb, carrier_shipment_status')
      .eq('id', orderShipmentId)
      .maybeSingle();
    const awb = String(lotRow?.tracking_number || lotRow?.velocity_awb || '').trim();
    if (!awb) {
      return {
        ok: false,
        status: 400,
        data: { error: 'No AWB on this shipment lot yet. Generate AWB first, then refresh tracking.' },
        endpoint,
      };
    }
    velocityRequest = { awbs: [awb] };
  } else if (orderId) {
    const { data: row } = await adminClient
      .from('orders')
      .select('tracking_number, velocity_awb, status, velocity_shipment_id, velocity_pending_shipment_id, fulfillment_mode')
      .eq('id', orderId)
      .maybeSingle();
    let awb = String(row?.tracking_number || row?.velocity_awb || '').trim();
    if (!awb && String(row?.fulfillment_mode || '') === 'multi_shipment') {
      const { data: lots } = await adminClient
        .from('order_shipments')
        .select('tracking_number, velocity_awb')
        .eq('order_id', orderId);
      awb = (lots || [])
        .map((l) => String(l.tracking_number || l.velocity_awb || '').trim())
        .find((t) => t.length > 0) || '';
    }
    if (awb) {
      velocityRequest = { awbs: [awb] };
    } else {
      return {
        ok: false,
        status: 400,
        data: {
          error: 'No AWB on this order yet. Assign a courier in Velocity to generate the waybill, then refresh tracking.',
        },
        endpoint,
      };
    }
  } else {
    const sid = typeof p.shipment_id === 'string' ? p.shipment_id.trim() : '';
    if (sid) {
      const { data: row } = await adminClient
        .from('orders')
        .select('tracking_number, velocity_awb')
        .or(`velocity_shipment_id.eq.${sid},velocity_pending_shipment_id.eq.${sid}`)
        .maybeSingle();
      const awb = String(row?.tracking_number || row?.velocity_awb || '').trim();
      if (awb) {
        velocityRequest = { awbs: [awb] };
      } else {
        return {
          ok: false,
          status: 400,
          data: {
            error:
              'Tracking uses AWB (order-tracking API requires awbs[]). Complete courier assignment first so the order has a waybill.',
          },
          endpoint,
        };
      }
    } else {
      return {
        ok: false,
        status: 400,
        data: { error: 'track_order requires order_id, awbs[], awb, tracking_number, or shipment_id + saved AWB' },
        endpoint,
      };
    }
  }

  const apiResult = await callVelocityApi('track_order', endpoint, token, velocityRequest as Json);

  if (apiResult.ok) {
    const picked = pickOrderTrackingFromResponse(apiResult.data);
    const activityEvents = pickTrackingActivitiesFromResponse(apiResult.data);

    if (orderShipmentId) {
      const { data: lotMeta } = await adminClient
        .from('order_shipments')
        .select('id, order_id')
        .eq('id', orderShipmentId)
        .maybeSingle();
      if (lotMeta?.id) {
        const lotPatch: Record<string, unknown> = { updated_at: nowIso() };
        if (picked.shipmentStatus) lotPatch.carrier_shipment_status = picked.shipmentStatus;
        if (picked.awb) {
          lotPatch.velocity_awb = picked.awb;
          lotPatch.tracking_number = picked.awb;
        }
        if (picked.trackUrl) lotPatch.velocity_tracking_url = picked.trackUrl;
        if (picked.snapshot) lotPatch.velocity_tracking_snapshot = picked.snapshot;
        if (picked.labelUrl) lotPatch.velocity_label_url = picked.labelUrl;
        await adminClient.from('order_shipments').update(lotPatch).eq('id', orderShipmentId).then(() => {}, () => {});

        if (activityEvents.length > 0) {
          const rows = activityEvents.map((ev) => ({
            order_shipment_id: orderShipmentId,
            source: 'track_api',
            raw_payload: ev.rawPayload as Json,
            activity: ev.activity,
            location: ev.location,
            carrier_remark: ev.carrierRemark,
            event_time: ev.eventTime || nowIso(),
          }));
          await adminClient.from('order_shipment_tracking_events').insert(rows).then(() => {}, () => {});
        }

        // Do not alter whole-order status from manual track refresh.
      }
    }

    let targetOrderId = orderId;
    if (!orderShipmentId && !targetOrderId && picked.awb) {
      const { data: byAwb } = await adminClient
        .from('orders')
        .select('id, status')
        .or(`tracking_number.eq.${picked.awb},velocity_awb.eq.${picked.awb}`)
        .maybeSingle();
      targetOrderId = typeof byAwb?.id === 'string' ? byAwb.id : null;
    }

    // IMPORTANT: when tracking is requested for a specific shipment lot,
    // keep updates shipment-scoped and do not mutate whole-order lifecycle fields.
    if (!orderShipmentId && targetOrderId) {
      const { data: orderRow } = await adminClient
        .from('orders')
        .select('status')
        .eq('id', targetOrderId)
        .maybeSingle();

      const patch: Record<string, unknown> = { updated_at: nowIso() };
      if (picked.shipmentStatus) patch.shipment_status = picked.shipmentStatus;
      if (picked.awb) {
        patch.velocity_awb = picked.awb;
        patch.tracking_number = picked.awb;
      }
      if (picked.trackUrl) patch.velocity_tracking_url = picked.trackUrl;
      if (picked.snapshot) patch.velocity_tracking_snapshot = picked.snapshot;
      if (picked.labelUrl) patch.velocity_label_url = picked.labelUrl;

      mergeOrderPatchFromShipmentStatus(patch, picked.shipmentStatus, orderRow?.status as string | undefined);

      await adminClient.from('orders').update(patch).eq('id', targetOrderId).then(() => {}, () => {});
    }
  }

  await logVelocityCall(adminClient, {
    action: 'track_order',
    requestPayload: { ...payload, resolved: velocityRequest },
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Track order failed',
    orderId,
  });

  return apiResult;
}

/**
 * Forward-order stage may have no carrier AWB yet, but many Velocity hosts still require
 * `shipment_awb` on POST /cancel-order (e.g. "shipment_awb is mandatory").
 * Prefer provisional AWB from forward-order response (stored on velocity_fulfillment); else use shipment_id for both.
 */
function buildCancelOrderPayloadForPendingShipment(
  pendingShipmentId: string,
  shipmentAwbHint?: string | null,
): Json {
  const sid = String(pendingShipmentId || '').trim();
  const awb = String(shipmentAwbHint || '').trim() || sid;
  return {
    shipment_id: sid,
    shipment_awb: awb,
  };
}

function readVelocityPrecancelAwbFromFulfillment(fulfillment: unknown): string | null {
  if (!fulfillment || typeof fulfillment !== 'object' || Array.isArray(fulfillment)) return null;
  const v = (fulfillment as Record<string, unknown>).velocity_precancel_awb;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function handleCancelVelocityDraft(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const internalOrderId = String(payload.order_id || '').trim();
  if (!internalOrderId) throw new Error('cancel_velocity_draft requires order_id');

  const { data: orderRow, error: orderErr } = await adminClient
    .from('orders')
    .select('id, velocity_pending_shipment_id, tracking_number, velocity_fulfillment')
    .eq('id', internalOrderId)
    .maybeSingle();

  if (orderErr || !orderRow) throw new Error('Order not found');

  const pending = String(payload.shipment_id || orderRow.velocity_pending_shipment_id || '').trim();
  if (!pending) {
    throw new Error('No pending Velocity shipment draft to cancel.');
  }
  if (String(orderRow.tracking_number || '').trim()) {
    throw new Error('This order already has an AWB; cancelling the draft is not applicable.');
  }

  const precancelAwb = readVelocityPrecancelAwbFromFulfillment(orderRow.velocity_fulfillment);
  const requestPayload: Json = buildCancelOrderPayloadForPendingShipment(pending, precancelAwb);
  const apiResult = await callVelocityApi('cancel_velocity_draft', endpoint, token, requestPayload);

  if (apiResult.ok) {
    await adminClient.from('orders').update({
      velocity_pending_shipment_id: null,
      velocity_fulfillment: null,
      updated_at: nowIso(),
      admin_updated_at: nowIso(),
    }).eq('id', internalOrderId).then(() => {}, () => {});
  }

  await logVelocityCall(adminClient, {
    action: 'cancel_velocity_draft',
    requestPayload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Cancel Velocity draft failed',
    orderId: internalOrderId,
  });

  return apiResult;
}

/**
 * Velocity POST /cancel-order — docs: body `{ "awbs": ["..."] }` (max 50).
 * With AWB: `awbs[]`. Pre-AWB forward order: `shipment_id` + `shipment_awb` (same ref on many tenants).
 */
async function handleCancelOrder(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const internalOrderId = String(payload.order_id || '').trim();
  if (!internalOrderId) throw new Error('cancel_order requires payload.order_id');
  const orderShipmentId = typeof (payload as Record<string, unknown>).order_shipment_id === 'string'
    ? String((payload as Record<string, unknown>).order_shipment_id).trim()
    : '';

  if (orderShipmentId) {
    const { data: lotRow, error: lotErr } = await adminClient
      .from('order_shipments')
      .select('id, order_id, tracking_number, velocity_awb, velocity_pending_shipment_id, carrier_shipment_status')
      .eq('id', orderShipmentId)
      .eq('order_id', internalOrderId)
      .maybeSingle();
    if (lotErr || !lotRow) throw new Error('Shipment lot not found for this order.');

    const lotStatus = String(lotRow.carrier_shipment_status || '').toLowerCase();
    const pickedUpOrBeyond = new Set([
      'picked_up',
      'picked',
      'picked up',
      'manifested',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'ndr_raised',
      'need_attention',
      'reattempt_delivery',
      'rto_initiated',
      'rto_in_transit',
      'rto_delivered',
      'lost',
      'cancelled',
    ]);
    if (pickedUpOrBeyond.has(lotStatus)) {
      throw new Error('Courier cancellation is allowed only before pickup for this shipment lot.');
    }

    const awb = String(lotRow.tracking_number || lotRow.velocity_awb || '').trim();
    const pending = String(payload.shipment_id || lotRow.velocity_pending_shipment_id || '').trim();
    let requestPayload: Json;
    if (awb) {
      requestPayload = { awbs: [awb] };
    } else if (pending) {
      requestPayload = buildCancelOrderPayloadForPendingShipment(pending, null);
    } else {
      throw new Error('No AWB or pending Velocity shipment id on this lot.');
    }

    const apiResult = await callVelocityApi('cancel_order', endpoint, token, requestPayload);
    if (apiResult.ok) {
      await adminClient.from('order_shipments').update({
        tracking_number: null,
        velocity_awb: null,
        velocity_shipment_id: null,
        velocity_pending_shipment_id: null,
        velocity_carrier_name: null,
        velocity_label_url: null,
        velocity_tracking_url: null,
        velocity_tracking_snapshot: null,
        // Cancel only this lot pickup and keep the lot/order open for re-booking.
        carrier_shipment_status: 'pending',
        updated_at: nowIso(),
      }).eq('id', orderShipmentId).then(() => {}, () => {});

      await adminClient.from('order_shipment_tracking_events').insert({
        order_shipment_id: orderShipmentId,
        source: 'cancel_api',
        activity: 'CANCELLED',
        carrier_remark: 'Cancelled from admin panel before pickup',
        raw_payload: apiResult.data as Json,
        event_time: nowIso(),
      }).then(() => {}, () => {});

      // Shipment-level cancel should not change full customer order status.
    }

    await logVelocityCall(adminClient, {
      action: 'cancel_order',
      requestPayload: { ...payload, resolved: requestPayload },
      responsePayload: apiResult.data,
      statusCode: apiResult.status,
      success: apiResult.ok,
      errorMessage: apiResult.ok ? undefined : 'Cancel order failed',
      orderId: internalOrderId,
    });

    return apiResult;
  }

  const { data: row, error: rowErr } = await adminClient
    .from('orders')
    .select('id, status, fulfillment_mode, tracking_number, velocity_awb, velocity_pending_shipment_id, velocity_shipment_id, velocity_fulfillment')
    .eq('id', internalOrderId)
    .maybeSingle();

  if (rowErr || !row) throw new Error('Order not found');
  if (String(row.fulfillment_mode || '').toLowerCase() === 'multi_shipment') {
    throw new Error('For multi-shipment orders, cancel courier using payload.order_shipment_id for a specific lot.');
  }

  const orderStatus = String(row.status || '').toLowerCase();
  if (orderStatus === 'delivered') {
    throw new Error('Cannot cancel shipment after delivery.');
  }

  const awb = String(row.tracking_number || row.velocity_awb || '').trim();
  const pending = String(payload.shipment_id || row.velocity_pending_shipment_id || '').trim();

  let requestPayload: Json;
  if (awb) {
    requestPayload = { awbs: [awb] };
  } else if (pending) {
    const precancelAwb = readVelocityPrecancelAwbFromFulfillment(row.velocity_fulfillment);
    requestPayload = buildCancelOrderPayloadForPendingShipment(pending, precancelAwb);
  } else {
    const skipped: VelocityApiResult = {
      ok: true,
      status: 200,
      data: { skipped: true, message: 'No Velocity AWB or draft shipment on this order' },
      endpoint,
    };
    await logVelocityCall(adminClient, {
      action: 'cancel_order',
      requestPayload: payload,
      responsePayload: skipped.data,
      statusCode: 200,
      success: true,
      errorMessage: undefined,
      orderId: internalOrderId,
    });
    return skipped;
  }

  const apiResult = await callVelocityApi('cancel_order', endpoint, token, requestPayload);

  if (apiResult.ok) {
    const patch: Record<string, unknown> = {
      updated_at: nowIso(),
      admin_updated_at: nowIso(),
    };
    if (awb) {
      /**
       * Velocity POST /cancel-order with `awbs[]` cancels the forward shipment (pickup / manifest).
       * Revert storefront order so staff can book a new shipment (Velocity Custom API cancel-order).
       */
      patch.shipment_status = 'cancelled';
      patch.status = 'processing';
      patch.customer_status = 'processing';
      patch.tracking_number = null;
      patch.velocity_awb = null;
      patch.velocity_shipment_id = null;
      patch.velocity_label_url = null;
      patch.velocity_carrier_name = null;
      patch.velocity_tracking_url = null;
      patch.velocity_tracking_snapshot = null;
      patch.shipment_provider = null;
      patch.shipped_at = null;
    }
    if (row.velocity_pending_shipment_id) {
      patch.velocity_pending_shipment_id = null;
      patch.velocity_fulfillment = null;
    }
    await adminClient.from('orders').update(patch).eq('id', internalOrderId).then(() => {}, () => {});
  }

  await logVelocityCall(adminClient, {
    action: 'cancel_order',
    requestPayload: { ...payload, resolved: requestPayload },
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Cancel order failed',
    orderId: internalOrderId,
  });

  return apiResult;
}

async function handleGenericAction(
  adminClient: ReturnType<typeof createAdminClient>,
  action: VelocityAction,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const apiResult = await callVelocityApi(action, endpoint, token, payload);
  const orderId = typeof payload.order_id === 'string' ? payload.order_id : null;
  const sellerId = typeof payload.seller_id === 'string' ? payload.seller_id : null;

  await logVelocityCall(adminClient, {
    action,
    requestPayload: payload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : `${action} failed`,
    orderId,
    sellerId,
  });

  return apiResult;
}

async function handleLogisticsListingAction(
  adminClient: ReturnType<typeof createAdminClient>,
  action: 'get_reports' | 'list_shipments' | 'list_returns',
  endpoint: string,
  token: string,
  payload: Json,
) {
  const readString = (v: unknown): string | null => {
    if (typeof v !== 'string') return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  };
  const readInt = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  };

  const defaultShipmentType = action === 'list_returns' ? 'reverse' : 'forward';
  const shipmentType = readString(payload.shipment_type) || defaultShipmentType;

  const pageInput = (payload.page && typeof payload.page === 'object')
    ? payload.page as Record<string, unknown>
    : {};
  const pageNumber = readInt(pageInput.number ?? payload.page, 1);
  const pageSize = readInt(pageInput.size ?? payload.per_page, 20);

  const filters = {
    status: readString(payload.status),
    courier: readString(payload.courier),
    payment_mode: readString(payload.payment_mode),
    from_date: readString(payload.from_date),
    to_date: readString(payload.to_date),
  };

  const normalizedPayload: Json = {
    shipment_type: shipmentType,
    page: {
      number: pageNumber,
      size: pageSize,
    },
    // keep flat fields too for compatibility with Velocity variants
    status: filters.status || undefined,
    courier: filters.courier || undefined,
    payment_mode: filters.payment_mode || undefined,
    from_date: filters.from_date || undefined,
    to_date: filters.to_date || undefined,
    filters,
  };

  const apiResult = await callVelocityApi(action, endpoint, token, normalizedPayload);
  await logVelocityCall(adminClient, {
    action,
    requestPayload: normalizedPayload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : `${action} failed`,
  });

  return apiResult;
}

/** Wrapped webhook: `{ action: "webhook_update", payload: { ... } }` — same fields as inbound or legacy flat keys. */
async function handleWebhookUpdate(
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
  payload: Json,
) {
  if (!getEnvOptional('VELOCITY_WEBHOOK_SECRET')) {
    return new Response(JSON.stringify({ error: 'Missing VELOCITY_WEBHOOK_SECRET configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!verifyVelocityWebhookSecret(req)) {
    return new Response(JSON.stringify({ error: 'Invalid webhook authorization' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const top = payload as Record<string, unknown>;
  const eventType = typeof top.event === 'string' ? top.event.trim() : '';
  const eventId = typeof top.event_id === 'string' ? top.event_id.trim() : '';
  const data = (top.data && typeof top.data === 'object') ? top.data as Record<string, unknown> : top;

  const externalId =
    (typeof data.order_external_id === 'string' ? data.order_external_id.trim() : '') ||
    (typeof data.order_id === 'string' ? data.order_id.trim() : '');

  const shipmentStatus =
    (typeof data.status === 'string' ? data.status.trim() : '') ||
    (typeof data.shipment_status === 'string' ? data.shipment_status.trim() : '');

  const awb =
    (typeof data.tracking_number === 'string' ? data.tracking_number.trim() : '') ||
    (typeof data.awb_code === 'string' ? data.awb_code.trim() : '') ||
    (typeof data.awb === 'string' ? data.awb.trim() : '');

  const allowedEvents = new Set(['', 'status_change', 'tracking_addition']);
  if (!allowedEvents.has(eventType)) {
    return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'unsupported_event' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (eventId) {
    const reserved = await reserveVelocityWebhookEventId(adminClient, eventId, eventType, externalId, top);
    if (!reserved) {
      return new Response(JSON.stringify({ ok: true, ignored: true, reason: 'duplicate_event_id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let applied = false;
  let resolvedOrderId: string | null = null;

  if (externalId && (shipmentStatus || awb)) {
    const routing = await resolveVelocityWebhookRouting(adminClient, externalId);

    if (routing?.kind === 'shipment') {
      const lotPatch = buildShipmentLotPatchFromWebhook(data, shipmentStatus, eventType);
      if (awb) {
        lotPatch.velocity_awb = awb;
        lotPatch.tracking_number = awb;
      }
      const tu = typeof data.tracking_url === 'string' ? data.tracking_url.trim() : '';
      if (tu) lotPatch.velocity_tracking_url = tu;
      const labelUrl = extractVelocityLabelUrl(data);
      if (labelUrl) lotPatch.velocity_label_url = labelUrl;

      const { error: lotErr } = await adminClient.from('order_shipments').update(lotPatch).eq('id', routing.shipmentId);
      await appendInboundWebhookShipmentEvent(adminClient, routing.shipmentId, data, shipmentStatus, eventType);
      await recomputeFulfillmentAggregate(adminClient, routing.orderId);
      applied = !lotErr;
      resolvedOrderId = routing.orderId;
    } else if (routing?.kind === 'order') {
      const { data: orderRow } = await adminClient
        .from('orders')
        .select('status, fulfillment_mode')
        .eq('id', routing.orderId)
        .maybeSingle();

      if (orderRow?.fulfillment_mode === 'multi_shipment') {
        applied = false;
        resolvedOrderId = routing.orderId;
      } else {
        const singleLotId = await ensureSingleShipmentLot(adminClient, routing.orderId, externalId);
        let lotErr: unknown = null;
        if (singleLotId) {
          const lotPatch = buildShipmentLotPatchFromWebhook(data, shipmentStatus, eventType);
          if (awb) {
            lotPatch.velocity_awb = awb;
            lotPatch.tracking_number = awb;
          }
          const lotUpdate = await adminClient.from('order_shipments').update(lotPatch).eq('id', singleLotId);
          lotErr = lotUpdate.error;
          if (!lotUpdate.error) {
            await appendInboundWebhookShipmentEvent(adminClient, singleLotId, data, shipmentStatus, eventType);
            await recomputeFulfillmentAggregate(adminClient, routing.orderId);
          }
        }
        applied = singleLotId ? !lotErr : false;
        resolvedOrderId = routing.orderId;
      }
    }
  }

  await logVelocityCall(adminClient, {
    action: 'webhook_update',
    requestPayload: payload,
    responsePayload: { applied, order_id: resolvedOrderId || externalId || null },
    statusCode: 200,
    success: true,
    orderId: resolvedOrderId || externalId || null,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Internal admin-only action: reset Velocity workflow to step 1 while preserving history. */
async function handleReinitiateShipping(
  adminClient: ReturnType<typeof createAdminClient>,
  payload: Json,
) {
  const orderId = typeof payload.order_id === 'string' ? payload.order_id.trim() : '';
  if (!orderId) {
    return new Response(JSON.stringify({ error: 'reinitiate_shipping requires payload.order_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: orderRow, error: orderErr } = await adminClient
    .from('orders')
    .select('id, velocity_pending_shipment_id, velocity_fulfillment')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!orderRow) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sid = typeof payload.shipment_id === 'string' && payload.shipment_id.trim()
    ? payload.shipment_id.trim()
    : String(orderRow.velocity_pending_shipment_id || '').trim();
  const mode = typeof payload.mode === 'string' ? payload.mode.trim().toLowerCase() : '';
  const isResumeExisting = mode === 'resume_existing';
  const vf = orderRow.velocity_fulfillment && typeof orderRow.velocity_fulfillment === 'object'
    ? orderRow.velocity_fulfillment as Record<string, unknown>
    : {};
  const history = Array.isArray(vf.historical_velocity_orders) ? [...vf.historical_velocity_orders] : [];
  if (!isResumeExisting && sid && !history.some((h) => String((h as Record<string, unknown>)?.shipment_id || '') === sid)) {
    history.push({
      shipment_id: sid,
      source: 'reinitiate_shipping',
      saved_at: nowIso(),
    });
  }

  const nextFulfillment = {
    ...vf,
    historical_velocity_orders: history,
    workflow_stage: isResumeExisting ? 'order_created' : 'selection',
    method_locked_after_order: isResumeExisting,
    latest_velocity_shipment_id: isResumeExisting ? sid || null : null,
  };

  const { error: updateErr } = await adminClient
    .from('orders')
    .update({
      velocity_fulfillment: nextFulfillment,
      velocity_pending_shipment_id: isResumeExisting ? (sid || null) : null,
      updated_at: nowIso(),
      admin_updated_at: nowIso(),
    })
    .eq('id', orderId);
  if (updateErr) throw updateErr;

  await logVelocityCall(adminClient, {
    action: 'reinitiate_shipping',
    requestPayload: payload,
    responsePayload: { ok: true, order_id: orderId, shipment_id: sid || null },
    statusCode: 200,
    success: true,
    orderId,
  });

  return new Response(JSON.stringify({
    ok: true,
    action: 'reinitiate_shipping',
    endpoint: '',
    status: 200,
    data: {
      order_id: orderId,
      shipment_id: sid || null,
      workflow_stage: isResumeExisting ? 'order_created' : 'selection',
      method_locked_after_order: isResumeExisting,
      pending_shipment_cleared: !isResumeExisting,
      pending_shipment_id: isResumeExisting ? sid || null : null,
    },
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Internal admin-only action: resume workflow from an existing historical Velocity shipment id. */
async function handleResumeExistingShipping(
  adminClient: ReturnType<typeof createAdminClient>,
  payload: Json,
) {
  const orderId = typeof payload.order_id === 'string' ? payload.order_id.trim() : '';
  const shipmentId = typeof payload.shipment_id === 'string' ? payload.shipment_id.trim() : '';
  if (!orderId || !shipmentId) {
    return new Response(JSON.stringify({ error: 'resume_existing_shipping requires payload.order_id and payload.shipment_id' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: orderRow, error: orderErr } = await adminClient
    .from('orders')
    .select('id, velocity_fulfillment')
    .eq('id', orderId)
    .maybeSingle();
  if (orderErr) throw orderErr;
  if (!orderRow) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const vf = orderRow.velocity_fulfillment && typeof orderRow.velocity_fulfillment === 'object'
    ? orderRow.velocity_fulfillment as Record<string, unknown>
    : {};
  const nextFulfillment = {
    ...vf,
    workflow_stage: 'order_created',
    method_locked_after_order: true,
    latest_velocity_shipment_id: shipmentId,
  };

  const { error: updateErr } = await adminClient
    .from('orders')
    .update({
      velocity_fulfillment: nextFulfillment,
      velocity_pending_shipment_id: shipmentId,
      updated_at: nowIso(),
      admin_updated_at: nowIso(),
    })
    .eq('id', orderId);
  if (updateErr) throw updateErr;

  await logVelocityCall(adminClient, {
    action: 'resume_existing_shipping',
    requestPayload: payload,
    responsePayload: { ok: true, order_id: orderId, shipment_id: shipmentId },
    statusCode: 200,
    success: true,
    orderId,
  });

  return new Response(JSON.stringify({
    ok: true,
    action: 'resume_existing_shipping',
    endpoint: '',
    status: 200,
    data: {
      order_id: orderId,
      shipment_id: shipmentId,
      workflow_stage: 'order_created',
      method_locked_after_order: true,
      pending_shipment_id: shipmentId,
    },
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rawBody = await req.text();
  let parsedRoot: unknown;
  try {
    parsedRoot = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /** Velocity/Shipfast portal webhooks POST `{ event, event_id, data }` — not wrapped in `action`. */
  if (
    parsedRoot &&
    typeof parsedRoot === 'object' &&
    !Array.isArray(parsedRoot) &&
    typeof (parsedRoot as Record<string, unknown>).event === 'string' &&
    'data' in (parsedRoot as Record<string, unknown>)
  ) {
    const adminClient = createAdminClient();
    return await handleShipfastInboundWebhook(req, adminClient, parsedRoot as Record<string, unknown>);
  }

  let body: { action: VelocityAction; payload?: Json };
  try {
    body = parseActionRequest(parsedRoot);
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: safeErrorMessage(error, 'Invalid request body.') }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const action = body.action;
  const payload = (body.payload || {}) as Json;
  const payloadValidationError = validatePayloadForAction(action, payload);
  if (payloadValidationError) {
    return new Response(JSON.stringify({ error: payloadValidationError }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createAdminClient();

  if (action === 'webhook_update') {
    return await handleWebhookUpdate(req, adminClient, payload);
  }

  const auth = await requireOrdersStaffOrAdmin(req, adminClient);
  if (!auth.ok) {
    return auth.response;
  }

  if (action === 'reinitiate_shipping') {
    return await handleReinitiateShipping(adminClient, payload);
  }
  if (action === 'resume_existing_shipping') {
    return await handleResumeExistingShipping(adminClient, payload);
  }

  if (action === 'webhook_health') {
    const velocity_api_credentials_configured = Boolean(
      getEnvOptional('VELOCITY_BASE_URL') &&
        getEnvOptional('VELOCITY_USERNAME') &&
        getEnvOptional('VELOCITY_PASSWORD'),
    );

    let velocity_probe: Record<string, unknown> | null = null;
    if (velocity_api_credentials_configured) {
      try {
        const bu = String(getEnvOptional('VELOCITY_BASE_URL') || '').replace(/\/$/, '');
        const u = String(getEnvOptional('VELOCITY_USERNAME') || '');
        const p = String(getEnvOptional('VELOCITY_PASSWORD') || '');
        velocity_probe = await buildVelocityUpstreamProbe(bu, u, p);
      } catch (e) {
        velocity_probe = { probe_error: String((e as Error)?.message || e) };
      }
    } else {
      velocity_probe = {
        skipped: true,
        reason: 'Set VELOCITY_BASE_URL, VELOCITY_USERNAME, and VELOCITY_PASSWORD to run live upstream checks.',
      };
    }

    const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const isWebhookLog = (actionName: unknown) =>
      typeof actionName === 'string' && actionName.trim().toLowerCase() === 'webhook_update';
    const logReason = (row: Record<string, unknown>) => {
      const rp = row.response_payload && typeof row.response_payload === 'object'
        ? row.response_payload as Record<string, unknown>
        : {};
      return typeof rp.reason === 'string' ? rp.reason : '';
    };
    const logApplied = (row: Record<string, unknown>) => {
      const rp = row.response_payload && typeof row.response_payload === 'object'
        ? row.response_payload as Record<string, unknown>
        : {};
      return rp.applied === true;
    };

    const { data: webhookLogsRaw } = await adminClient
      .from('velocity_api_logs')
      .select('id, action, response_payload, request_payload, created_at')
      .eq('action', 'webhook_update')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500);

    const webhookLogs = Array.isArray(webhookLogsRaw) ? webhookLogsRaw as Record<string, unknown>[] : [];
    const webhookOnly = webhookLogs.filter(isWebhookLog);
    const duplicateCount = webhookOnly.filter((r) => logReason(r) === 'duplicate_event_id').length;
    const unknownExternalCount = webhookOnly.filter((r) => logReason(r) === 'unknown_external_reference').length;
    const skippedReasons = new Set([
      'no_order_external_id',
      'return_shipment_skipped',
      'event_not_supported',
      'multi_shipment_order_level',
      'duplicate_event_id',
    ]);
    const skippedCount = webhookOnly.filter((r) => !logApplied(r) || skippedReasons.has(logReason(r))).length;

    const recentSkipped = webhookOnly
      .filter((r) => !logApplied(r) || skippedReasons.has(logReason(r)))
      .slice(0, 15)
      .map((r) => {
        const rp = r.response_payload && typeof r.response_payload === 'object'
          ? r.response_payload as Record<string, unknown>
          : {};
        const req = r.request_payload && typeof r.request_payload === 'object'
          ? r.request_payload as Record<string, unknown>
          : {};
        const data = req.data && typeof req.data === 'object'
          ? req.data as Record<string, unknown>
          : {};
        return {
          created_at: r.created_at,
          reason: typeof rp.reason === 'string' ? rp.reason : '',
          event: typeof req.event === 'string' ? req.event : '',
          event_id: typeof req.event_id === 'string' ? req.event_id : '',
          order_external_id: typeof data.order_external_id === 'string' ? data.order_external_id : '',
        };
      });

    const { data: recentDedupeRaw } = await adminClient
      .from('velocity_webhook_event_dedupe')
      .select('event_id, event_type, external_id, created_at')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(20);

    const recentDedupe = Array.isArray(recentDedupeRaw) ? recentDedupeRaw : [];

    return new Response(JSON.stringify({
      ok: true,
      action: 'webhook_health',
      endpoint: '',
      status: 200,
      data: {
        velocity_webhook_secret_configured: Boolean(getEnvOptional('VELOCITY_WEBHOOK_SECRET')),
        velocity_api_credentials_configured,
        velocity_probe,
        webhook_monitoring: {
          window: '24h',
          total_webhook_logs: webhookOnly.length,
          duplicate_event_id_count: duplicateCount,
          unknown_external_reference_count: unknownExternalCount,
          skipped_webhook_count: skippedCount,
          recent_skipped: recentSkipped,
          recent_dedupe_events: recentDedupe,
        },
      },
      actor_id: auth.userId,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let velocityBaseUrl: string;
  let velocityUsername: string;
  let velocityPassword: string;
  try {
    velocityBaseUrl = getEnv('VELOCITY_BASE_URL').replace(/\/$/, '');
    velocityUsername = getEnv('VELOCITY_USERNAME');
    velocityPassword = getEnv('VELOCITY_PASSWORD');
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const endpoints = getEndpointMap(velocityBaseUrl);
  const endpoint = endpoints[action];
  if (!endpoint) {
    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const runActionWithToken = async (token: string): Promise<VelocityApiResult> => {
      switch (action) {
        case 'create_warehouse':
          return await handleCreateWarehouse(adminClient, endpoint, token, payload);
        case 'track_order':
          return await handleTrackOrder(adminClient, endpoint, token, payload);
        case 'cancel_order':
          return await handleCancelOrder(adminClient, endpoint, token, payload);
        case 'cancel_velocity_draft':
          return await handleCancelVelocityDraft(adminClient, endpoint, token, payload);
        case 'check_serviceability':
          return await handleCheckServiceability(adminClient, endpoint, endpoints.calculate_rates, token, payload);
        case 'create_order':
          return await handleCreateOrder(adminClient, endpoint, token, payload);
        case 'create_forward_order':
          return await handleCreateForwardOrder(adminClient, endpoint, token, payload);
        case 'assign_courier':
          return await handleAssignCourier(adminClient, endpoint, token, payload);
        case 'get_reports':
        case 'list_shipments':
        case 'list_returns':
          return await handleLogisticsListingAction(adminClient, action, endpoint, token, payload);
        default:
          return await handleGenericAction(adminClient, action, endpoint, token, payload);
      }
    };

    let token = await fetchVelocityToken(adminClient, velocityBaseUrl, velocityUsername, velocityPassword);
    let result = await runActionWithToken(token);

    const shouldRetryAuth =
      hasVelocityInvalidCredentials(result.data) &&
      (result.status === 401 || result.status === 403 || result.ok);
    if (shouldRetryAuth) {
      // Stale cached token, rotated secrets, or tenant returning 200 with embedded auth errors.
      await clearVelocityTokenCache(adminClient);
      token = await fetchVelocityToken(adminClient, velocityBaseUrl, velocityUsername, velocityPassword);
      result = await runActionWithToken(token);
    }

    return new Response(JSON.stringify({
      ok: result.ok,
      action,
      endpoint: result.endpoint,
      status: result.status,
      data: result.data,
      actor_id: auth.userId,
    }), {
      status: result.ok ? 200 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    await logVelocityCall(adminClient, {
      action,
      requestPayload: payload,
      responsePayload: null,
      statusCode: 500,
      success: false,
      errorMessage: (error as Error).message,
      orderId: typeof payload.order_id === 'string' ? payload.order_id : null,
      sellerId: typeof payload.seller_id === 'string' ? payload.seller_id : null,
    });

    return new Response(JSON.stringify({ error: safeErrorMessage(error, 'Shipping operation failed. Please try again.') }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
