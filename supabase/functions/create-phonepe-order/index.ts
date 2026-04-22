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
  const supabaseUrl = normalizeBaseUrl(requireEnv('SUPABASE_URL'));
  const phonePeApiBase = normalizeBaseUrl(Deno.env.get('PHONEPE_API_BASE_URL') || getPhonePeApiBase(phonePeEnv));

  const token = getBearerToken(req);
  const {
    data: { user },
  } = token ? await adminClient.auth.getUser(token) : { data: { user: null } };

  let body: { order_id?: string; payment_method?: string; redirect_url?: string };
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
    .select('id, user_id, total_amount, payment_method, payment_status, payment_metadata')
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
    return new Response(JSON.stringify({ error: 'Order is not marked for PhonePe payment' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (body.payment_method && String(body.payment_method).toLowerCase() !== 'phonepe') {
    return new Response(JSON.stringify({ error: 'Payment method mismatch with order' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (String(order.payment_status || '').toLowerCase() === 'paid') {
    return new Response(JSON.stringify({ error: 'Order is already paid' }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const appBaseUrl = normalizeBaseUrl(
    Deno.env.get('APP_BASE_URL') || req.headers.get('origin') || 'https://hatvoni.in',
  );
  const redirectUrl = body.redirect_url || `${appBaseUrl}/payment-processing/${order.id}?attempt=return&gateway=phonepe`;
  const defaultWebhookCallbackUrl = `${supabaseUrl}/functions/v1/phonepe-webhook`;
  const callbackUrl = Deno.env.get('PHONEPE_CALLBACK_URL') || defaultWebhookCallbackUrl;
  const expireAfter = Number(Deno.env.get('PHONEPE_EXPIRE_AFTER') || 1200);

  const amountPaise = Math.max(1, Math.round(Number(order.total_amount || 0) * 100));
  const merchantOrderId = order.id;

  const accessToken = await getPhonePeAuthToken(
    phonePeClientId,
    phonePeClientVersion,
    phonePeClientSecret,
    phonePeEnv,
  );

  const phonePePayload = {
    merchantOrderId,
    amount: amountPaise,
    expireAfter,
    paymentFlow: {
      type: 'PG_CHECKOUT',
      merchantUrls: {
        redirectUrl,
      },
      disablePaymentRetry: false,
    },
    metaInfo: {
      udf1: String(order.id),
      udf2: String(order.user_id || ''),
      udf3: callbackUrl,
    },
  };

  const phonePeResponse = await fetch(`${phonePeApiBase}/checkout/v2/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `O-Bearer ${accessToken}`,
    },
    body: JSON.stringify(phonePePayload),
  });

  const phonePeRaw = await phonePeResponse.text();
  let phonePeData: any = null;
  try {
    phonePeData = JSON.parse(phonePeRaw);
  } catch {
    phonePeData = null;
  }

  const redirectInfoUrl = phonePeData?.redirectUrl;
  if (!phonePeResponse.ok || !redirectInfoUrl) {
    return new Response(JSON.stringify({
      error: 'Failed to create PhonePe order',
      details: phonePeData?.message || phonePeRaw,
    }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const paymentMetadata = {
    ...(order.payment_metadata || {}),
    checkout_payment_method: 'phonepe',
    phonepe: {
      merchant_order_id: merchantOrderId,
      create_response: phonePeData,
      last_gateway_sync_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await adminClient
    .from('orders')
    .update({
      payment_gateway: 'phonepe',
      payment_status: 'initiated',
      payment_attempted_at: new Date().toISOString(),
      payment_metadata: paymentMetadata,
    })
    .eq('id', order.id);

  if (updateError) {
    return new Response(JSON.stringify({ error: 'Failed to update local order for PhonePe', details: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    order_id: order.id,
    payment_method: 'phonepe',
    amount: amountPaise,
    merchant_order_id: merchantOrderId,
    redirect_url: redirectInfoUrl,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
