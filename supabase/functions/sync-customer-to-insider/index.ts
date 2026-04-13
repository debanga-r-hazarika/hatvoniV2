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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

interface CustomerSyncPayload {
  external_customer_id: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  phone?: string;
  address?: string;
  default_address?: {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    is_default?: boolean;
  };
  all_addresses?: Array<{
    id?: string;
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    is_default?: boolean;
  }>;
  email?: string;
  customer_type?: string;
  order_history?: Array<{
    id: string;
    order_number: string;
    total_amount: number;
    order_status: string;
    order_date: string;
    items_count: number;
  }>;
  total_orders: number;
  total_spent: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const adminClient = createAdminClient();

  const { data: triggerSecret, error: secretError } = await adminClient.rpc('get_private_integration_config', {
    p_key: 'customer_sync_trigger_secret',
  });

  if (secretError || !triggerSecret) {
    console.error('Unable to load customer sync trigger secret:', secretError);
    return new Response(JSON.stringify({ error: 'Sync secret not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const inboundSecret = req.headers.get('x-customer-sync-secret') || '';

  if (!inboundSecret || !timingSafeEqual(inboundSecret, triggerSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let payload: CustomerSyncPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!payload.external_customer_id) {
    return new Response(JSON.stringify({ error: 'external_customer_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const insiderCustomerSyncUrl = requireEnv('INSIDER_CUSTOMER_SYNC_URL');
  const insiderCustomerSyncSecret = requireEnv('INSIDER_CUSTOMER_SYNC_SECRET');

  const logFailure = async (details: {
    externalCustomerId: string;
    errorMessage: string;
    payload?: unknown;
  }) => {
    try {
      await adminClient.from('customer_sync_failures').insert({
        source: 'customer_to_insider_sync',
        external_customer_id: details.externalCustomerId,
        error_message: details.errorMessage,
        payload: details.payload ?? null,
      });
    } catch (err) {
      console.error('Failed to log sync failure:', err);
    }
  };

  try {
    // Build name if not provided
    const name = payload.name || `${payload.first_name || ''} ${payload.last_name || ''}`.trim();

    // Fetch customer's orders and order items
    const { data: orders, error: ordersError } = await adminClient
      .from('orders')
      .select('id, order_number, total_amount, order_status, created_at, order_items(count)')
      .eq('user_id', payload.external_customer_id)
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
    }

    // Calculate order statistics
    let totalOrders = 0;
    let totalSpent = 0;
    const orderHistory: Array<any> = [];

    if (orders && orders.length > 0) {
      totalOrders = orders.length;
      totalSpent = orders.reduce((sum: number, order: any) => sum + (Number(order.total_amount) || 0), 0);
      
      // Format order history for Insider
      orderHistory.push(...orders.map((order: any) => ({
        id: order.id,
        order_number: order.order_number || `ORD-${order.id.slice(0, 8).toUpperCase()}`,
        total_amount: Number(order.total_amount) || 0,
        order_status: order.order_status || 'pending',
        order_date: order.created_at,
        items_count: order.order_items?.length || 0,
      })));
    }

    const syncPayload = {
      external_customer_id: payload.external_customer_id,
      name,
      phone: payload.phone || null,
      address: payload.address || null,
      default_address: payload.default_address || null,
      all_addresses: payload.all_addresses || null,
      email: payload.email || null,
      customer_type: payload.customer_type || 'online',
      order_history: orderHistory,
      total_orders: totalOrders,
      total_spent: totalSpent,
    };

    // Transform payload to Insider format
    const insiderPayload = {
      external_customer_id: syncPayload.external_customer_id,
      name: syncPayload.name,
      email: syncPayload.email,
      phone_number: syncPayload.phone ? {
        country_code: 'US',
        value: syncPayload.phone,
      } : null,
      addresses: (syncPayload.all_addresses || [syncPayload.default_address]).filter(Boolean),
      custom_attributes: {
        customer_type: syncPayload.customer_type,
        total_orders: syncPayload.total_orders,
        total_spent: syncPayload.total_spent,
        order_history: JSON.stringify(syncPayload.order_history),
      },
    };

    const insiderResponse = await fetch(insiderCustomerSyncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${insiderCustomerSyncSecret}`,
      },
      body: JSON.stringify(insiderPayload),
    });

    if (!insiderResponse.ok) {
      const insiderErrorBody = await insiderResponse.text();
      await logFailure({
        externalCustomerId: payload.external_customer_id,
        errorMessage: `Insider customer sync failed with status ${insiderResponse.status}`,
        payload: {
          insider_status: insiderResponse.status,
          insider_body: insiderErrorBody,
          external_customer_id: payload.external_customer_id,
        },
      });

      return new Response(JSON.stringify({
        error: 'Failed to sync customer with insider',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error syncing customer:', error);
    await logFailure({
      externalCustomerId: payload.external_customer_id,
      errorMessage: String(error),
    });

    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
