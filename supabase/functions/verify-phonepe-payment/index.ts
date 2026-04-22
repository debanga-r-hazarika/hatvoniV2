import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function createAdminClient() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function isPhonePeMethod(method: string | null | undefined): boolean {
  return String(method || '').toLowerCase() === 'phonepe';
}

function getPhonePeEnv(): 'sandbox' | 'production' {
  const configured = String(Deno.env.get('PHONEPE_ENV') || '').toLowerCase();
  if (configured === 'sandbox') return 'sandbox';
  if (configured === 'production') return 'production';
  return 'production';
}

function getPhonePeApiBase(env: 'sandbox' | 'production'): string {
  return env === 'sandbox'
    ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
    : 'https://api.phonepe.com/apis/pg';
}

function getPhonePeAuthBase(env: 'sandbox' | 'production'): string {
  return env === 'sandbox'
    ? 'https://api-preprod.phonepe.com/apis/pg-sandbox'
    : 'https://api.phonepe.com/apis/identity-manager';
}

async function getPhonePeAuthToken(clientId: string, clientVersion: string, clientSecret: string, env: 'sandbox' | 'production'): Promise<string> {
  const authUrl = `${getPhonePeAuthBase(env)}/v1/oauth/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_version: clientVersion,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const authResponse = await fetch(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const authRaw = await authResponse.text();
  let authData: any = null;
  try {
    authData = JSON.parse(authRaw);
  } catch {
    authData = null;
  }

  if (!authResponse.ok || !authData?.access_token) {
    throw new Error(authData?.message || authRaw || 'Failed to generate PhonePe auth token');
  }

  return String(authData.access_token);
}

function derivePaymentStatus(statusPayload: any): 'paid' | 'failed' | 'pending' {
  const code = String(statusPayload?.code || '').toUpperCase();
  const state = String(statusPayload?.state || '').toUpperCase();

  if (
    code === 'PAYMENT_SUCCESS'
    || state === 'COMPLETED'
    || state === 'SUCCESS'
  ) {
    return 'paid';
  }

  if (
    ['PAYMENT_ERROR', 'PAYMENT_FAILED', 'PAYMENT_DECLINED', 'PAYMENT_CANCELLED', 'PAYMENT_EXPIRED'].includes(code)
    || ['FAILED', 'DECLINED', 'CANCELLED', 'EXPIRED'].includes(state)
  ) {
    return 'failed';
  }

  return 'pending';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createAdminClient();

  const phonePeClientId = requireEnv('PHONEPE_CLIENT_ID');
  const phonePeClientSecret = requireEnv('PHONEPE_CLIENT_SECRET');
  const phonePeClientVersion = requireEnv('PHONEPE_CLIENT_VERSION');
  const phonePeEnv = getPhonePeEnv();
  const phonePeApiBase = normalizeBaseUrl(Deno.env.get('PHONEPE_API_BASE_URL') || getPhonePeApiBase(phonePeEnv));

  const token = getBearerToken(req);
  const {
    data: { user },
  } = token ? await adminClient.auth.getUser(token) : { data: { user: null } };

  let body: { order_id?: string; merchant_order_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.order_id) {
    return new Response(JSON.stringify({ error: 'order_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: order, error: orderError } = await adminClient
    .from('orders')
    .select('id, user_id, payment_method, payment_status, payment_gateway, paid_at, payment_metadata')
    .eq('id', body.order_id)
    .maybeSingle();

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (user?.id && order.user_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Order ownership mismatch' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!isPhonePeMethod(order.payment_method)) {
    return new Response(JSON.stringify({ error: 'Order does not use PhonePe' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const merchantOrderId = body.merchant_order_id
    || order.payment_metadata?.phonepe?.merchant_order_id
    || order.id;

  if (!merchantOrderId) {
    return new Response(JSON.stringify({ error: 'merchant_order_id is missing for this order' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const accessToken = await getPhonePeAuthToken(
    phonePeClientId,
    phonePeClientVersion,
    phonePeClientSecret,
    phonePeEnv,
  );

  const phonePeResponse = await fetch(`${phonePeApiBase}/checkout/v2/order/${encodeURIComponent(String(merchantOrderId))}/status?details=false`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `O-Bearer ${accessToken}`,
    },
  });

  const phonePeRaw = await phonePeResponse.text();
  let phonePeData: any = null;
  try {
    phonePeData = JSON.parse(phonePeRaw);
  } catch {
    phonePeData = null;
  }

  if (!phonePeResponse.ok || !phonePeData) {
    return new Response(JSON.stringify({
      error: 'Failed to fetch PhonePe payment status',
      details: phonePeData?.message || phonePeRaw,
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const derivedStatus = derivePaymentStatus(phonePeData);
  const alreadyPaid = String(order.payment_status || '').toLowerCase() === 'paid';

  const phonePeTransactionId = phonePeData?.paymentDetails?.[0]?.transactionId || null;
  const phonePeCode = phonePeData?.code || null;

  const paymentMetadata = {
    ...(order.payment_metadata || {}),
    phonepe: {
      ...(order.payment_metadata?.phonepe || {}),
      merchant_order_id: merchantOrderId,
      transaction_id: phonePeTransactionId,
      status_response: phonePeData,
      last_status_code: phonePeCode,
      last_status_sync_at: new Date().toISOString(),
    },
  };

  const updatePayload: Record<string, unknown> = {
    payment_gateway: 'phonepe',
    payment_metadata: paymentMetadata,
  };

  if (derivedStatus === 'paid') {
    updatePayload.payment_status = 'paid';
    updatePayload.paid_at = order.paid_at || new Date().toISOString();
  } else if (derivedStatus === 'failed' && !alreadyPaid) {
    updatePayload.payment_status = 'failed';
  }

  const { error: updateError } = await adminClient
    .from('orders')
    .update(updatePayload)
    .eq('id', order.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to update PhonePe payment status', details: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const finalStatus = derivedStatus === 'failed' && alreadyPaid ? 'paid' : derivedStatus;

  return new Response(JSON.stringify({
    ok: true,
    order_id: order.id,
    payment_status: finalStatus,
    phonepe_code: phonePeCode,
    merchant_order_id: merchantOrderId,
    transaction_id: phonePeTransactionId,
    already_paid: alreadyPaid,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
