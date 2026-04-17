import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { parseActionRequest, validatePayloadForAction, type VelocityAction } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-velocity-webhook-secret',
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

async function requireAdmin(
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

  if (!profile?.is_admin) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Admin access required' }), {
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
    assign_courier: endpoint('/custom/api/v1/forward-order-shipment', 'VELOCITY_ENDPOINT_FORWARD_ORDER_SHIPMENT'),
    cancel_order: endpoint('/custom/api/v1/cancel-order', 'VELOCITY_ENDPOINT_CANCEL_ORDER'),
    track_order: endpoint('/custom/api/v1/order-tracking', 'VELOCITY_ENDPOINT_ORDER_TRACKING'),
    get_reports: endpoint('/custom/api/v1/reports', 'VELOCITY_ENDPOINT_REPORTS'),
    list_shipments: endpoint('/custom/api/v1/shipments', 'VELOCITY_ENDPOINT_SHIPMENTS'),
    list_returns: endpoint('/custom/api/v1/returns', 'VELOCITY_ENDPOINT_RETURNS'),
    initiate_return: endpoint('/custom/api/v1/reverse-order', 'VELOCITY_ENDPOINT_REVERSE_ORDER'),
    assign_return_courier: endpoint('/custom/api/v1/reverse-order-shipment', 'VELOCITY_ENDPOINT_REVERSE_ORDER_SHIPMENT'),
    webhook_update: endpoint('/custom/api/v1/order-tracking', 'VELOCITY_ENDPOINT_ORDER_TRACKING'),
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
    const token = typeof parsed?.token === 'string' ? parsed.token : null;
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

async function callVelocityApi(
  action: VelocityAction,
  endpoint: string,
  token: string,
  payload: unknown,
): Promise<VelocityApiResult> {
  const result = await withRetry(async () => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify(payload ?? {}),
    });

    const raw = await res.text();
    const data = safeJsonParse(raw);
    return { res, data };
  });

  const ok = result.res.ok;
  return {
    ok,
    status: result.res.status,
    data: result.data,
    endpoint,
  };
}

function pickOrderTrackingFromResponse(data: unknown): { shipmentStatus?: string; awb?: string } {
  if (!data || typeof data !== 'object') return {};
  const source = data as Record<string, unknown>;
  const payload = (source.payload && typeof source.payload === 'object')
    ? source.payload as Record<string, unknown>
    : source;

  const shipmentStatus = typeof payload.current_status === 'string'
    ? payload.current_status
    : (typeof payload.shipment_status === 'string' ? payload.shipment_status : undefined);

  const awb = typeof payload.awb_code === 'string'
    ? payload.awb_code
    : (typeof payload.awb === 'string' ? payload.awb : undefined);

  return { shipmentStatus, awb };
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
    .select('id,status,payment_method,total_amount,shipping_address,created_at,velocity_shipment_id')
    .eq('id', orderId)
    .maybeSingle();

  if (orderErr || !order) throw new Error('Order not found');

  const { data: orderItems, error: orderItemsErr } = await adminClient
    .from('order_items')
    .select('id,quantity,price,lot_name,lot_snapshot,products(id,key,name,seller_id)')
    .eq('order_id', orderId);

  if (orderItemsErr) throw new Error('Unable to load order items');

  const addr = (order.shipping_address || {}) as Record<string, unknown>;
  const customerPincode = String(addr.postal_code || '').replace(/\s/g, '');
  if (!customerPincode || customerPincode.length !== 6) {
    throw new Error('Invalid customer pincode');
  }

  return { order: order as Record<string, unknown>, orderItems: (orderItems || []) as Array<Record<string, unknown>>, customerPincode };
}

async function handleCheckServiceability(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const orderId = typeof payload.order_id === 'string' ? payload.order_id : null;
  let requestPayload: Json = { ...payload };
  let sellerId: string | null = null;

  if (orderId) {
    const fallbackPickupPincode = getEnv('VELOCITY_WAREHOUSE_PINCODE');
    const fallbackPickupLocation = getEnvOptional('VELOCITY_PICKUP_LOCATION') || 'Main Warehouse';
    const { order, orderItems, customerPincode } = await loadOrderContext(adminClient, orderId);
    const pickup = await resolvePickupForOrder(adminClient, orderItems, fallbackPickupLocation, fallbackPickupPincode);
    sellerId = pickup.sellerId;

    const method = String(order.payment_method || '').toLowerCase();
    const paymentMode = ['razorpay', 'razorpay_upi', 'razorpay_cards', 'online'].includes(method) ? 'prepaid' : 'cod';
    requestPayload = {
      from: pickup.pickupPincode,
      to: customerPincode,
      payment_mode: paymentMode,
      shipment_type: 'forward',
    };

    const apiResult = await callVelocityApi('check_serviceability', endpoint, token, requestPayload);
    const dataObj = (apiResult.data || {}) as Record<string, unknown>;
    const resultObj = (dataObj.result || {}) as Record<string, unknown>;
    const carriers = Array.isArray(resultObj.serviceability_results) ? resultObj.serviceability_results : [];

    const transformedData = {
      serviceable: carriers.length > 0,
      carriers,
      zone: resultObj.zone || null,
      payment_mode: paymentMode,
      customer_pincode: customerPincode,
      pickup_location: pickup.pickupLocation,
      pickup_source: pickup.source,
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

  if (requestedPickupLocationId) {
    const { data: selectedPickup } = await adminClient
      .from('seller_pickup_locations')
      .select('id, warehouse_name, pincode, velocity_warehouse_id')
      .eq('id', requestedPickupLocationId)
      .maybeSingle();

    if (!selectedPickup) {
      throw new Error('Selected pickup location was not found.');
    }
    if (!selectedPickup.velocity_warehouse_id) {
      throw new Error('Selected pickup location is not synced with Velocity warehouse yet.');
    }

    warehouseId = String(selectedPickup.velocity_warehouse_id);
    pickupLocationName = String(selectedPickup.warehouse_name || pickupLocationName);
    pickupPincode = String(selectedPickup.pincode || pickupPincode);
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

  const addr = (order.shipping_address || {}) as Record<string, unknown>;
  const method = String(order.payment_method || '').toLowerCase();
  const paymentMethod = ['razorpay', 'razorpay_upi', 'razorpay_cards', 'online'].includes(method) ? 'PREPAID' : 'COD';
  const subTotal = Number(order.total_amount || 0);

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

  const requestPayload: Json = {
    order_id: `HAT-${orderId.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
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
    order_items: items.length ? items : [{ name: 'Order', sku: 'ORDER', units: 1, selling_price: subTotal, discount: 0, tax: 0 }],
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
      velocity_label_url: outPayload.label_url || null,
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
    sellerId: pickup.sellerId,
  });

  return apiResult;
}

async function handleTrackOrder(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const orderId = typeof payload.order_id === 'string' ? payload.order_id : null;
  const apiResult = await callVelocityApi('track_order', endpoint, token, payload);

  if (apiResult.ok && orderId) {
    const { shipmentStatus, awb } = pickOrderTrackingFromResponse(apiResult.data);
    const patch: Record<string, unknown> = { updated_at: nowIso() };
    if (shipmentStatus) patch.shipment_status = shipmentStatus;
    if (awb) patch.velocity_awb = awb;

    await adminClient
      .from('orders')
      .update(patch)
      .eq('id', orderId)
      .then(() => {}, () => {});
  }

  await logVelocityCall(adminClient, {
    action: 'track_order',
    requestPayload: payload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Track order failed',
    orderId,
  });

  return apiResult;
}

async function handleCancelOrder(
  adminClient: ReturnType<typeof createAdminClient>,
  endpoint: string,
  token: string,
  payload: Json,
) {
  const orderId = typeof payload.order_id === 'string' ? payload.order_id : null;
  const apiResult = await callVelocityApi('cancel_order', endpoint, token, payload);

  if (apiResult.ok && orderId) {
    await adminClient
      .from('orders')
      .update({
        status: 'cancelled',
        shipment_status: 'cancelled',
        updated_at: nowIso(),
      })
      .eq('id', orderId)
      .then(() => {}, () => {});
  }

  await logVelocityCall(adminClient, {
    action: 'cancel_order',
    requestPayload: payload,
    responsePayload: apiResult.data,
    statusCode: apiResult.status,
    success: apiResult.ok,
    errorMessage: apiResult.ok ? undefined : 'Cancel order failed',
    orderId,
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

async function handleWebhookUpdate(
  req: Request,
  adminClient: ReturnType<typeof createAdminClient>,
  payload: Json,
) {
  const configuredSecret = getEnvOptional('VELOCITY_WEBHOOK_SECRET');
  if (!configuredSecret) {
    return new Response(JSON.stringify({ error: 'Missing VELOCITY_WEBHOOK_SECRET configuration' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const incomingSecret = req.headers.get('x-velocity-webhook-secret') || '';
  if (incomingSecret !== configuredSecret) {
    return new Response(JSON.stringify({ error: 'Invalid webhook secret' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const orderId = typeof payload.order_id === 'string' ? payload.order_id : null;
  const shipmentStatus = typeof payload.shipment_status === 'string' ? payload.shipment_status : null;
  const awb = typeof payload.awb_code === 'string' ? payload.awb_code : null;

  if (orderId && shipmentStatus) {
    const patch: Record<string, unknown> = {
      shipment_status: shipmentStatus,
      updated_at: nowIso(),
    };
    if (awb) patch.velocity_awb = awb;

    await adminClient.from('orders').update(patch).eq('id', orderId).then(() => {}, () => {});
  }

  await logVelocityCall(adminClient, {
    action: 'webhook_update',
    requestPayload: payload,
    responsePayload: { applied: Boolean(orderId && shipmentStatus) },
    statusCode: 200,
    success: true,
    orderId,
  });

  return new Response(JSON.stringify({ ok: true }), {
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

  let body: { action: VelocityAction; payload?: Json };
  try {
    body = parseActionRequest(await req.json());
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

  const auth = await requireAdmin(req, adminClient);
  if (!auth.ok) {
    return auth.response;
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
    const token = await fetchVelocityToken(adminClient, velocityBaseUrl, velocityUsername, velocityPassword);

    let result: VelocityApiResult;
    switch (action) {
      case 'create_warehouse':
        result = await handleCreateWarehouse(adminClient, endpoint, token, payload);
        break;
      case 'track_order':
        result = await handleTrackOrder(adminClient, endpoint, token, payload);
        break;
      case 'cancel_order':
        result = await handleCancelOrder(adminClient, endpoint, token, payload);
        break;
      case 'check_serviceability':
        result = await handleCheckServiceability(adminClient, endpoint, token, payload);
        break;
      case 'create_order':
        result = await handleCreateOrder(adminClient, endpoint, token, payload);
        break;
      case 'get_reports':
      case 'list_shipments':
      case 'list_returns':
        result = await handleLogisticsListingAction(adminClient, action, endpoint, token, payload);
        break;
      default:
        result = await handleGenericAction(adminClient, action, endpoint, token, payload);
        break;
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
