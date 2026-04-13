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

function mapOrderStatus(status: string | null | undefined): string {
  switch ((status || '').toLowerCase()) {
    case 'pending':
      return 'ORDER_CREATED';
    case 'processing':
      return 'READY_FOR_PAYMENT';
    case 'shipped':
      return 'IN_TRANSIT';
    case 'delivered':
      return 'DELIVERED';
    case 'cancelled':
      return 'CANCELLED';
    default:
      return 'ORDER_CREATED';
  }
}

function isRazorpayMethod(method: string | null | undefined): boolean {
  const normalized = String(method || '').toLowerCase();
  return normalized === 'razorpay' || normalized === 'razorpay_upi' || normalized === 'razorpay_cards';
}

type CustomerSyncAddress = {
  id?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  is_default?: boolean;
};

async function buildCustomerSyncPayload(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const [{ data: profile }, { data: addresses }] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, first_name, last_name, email, phone')
      .eq('id', userId)
      .maybeSingle(),
    adminClient
      .from('addresses')
      .select('id, address_line1, city, state, postal_code, country, is_default, created_at')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  if (!profile) {
    throw new Error(`Customer profile not found for ${userId}`);
  }

  const normalizedAddresses: CustomerSyncAddress[] = (addresses ?? []).map((address: any) => ({
    id: address.id,
    street: address.address_line1,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country,
    is_default: Boolean(address.is_default),
  }));

  const defaultAddress = normalizedAddresses.find((address) => address.is_default) || normalizedAddresses[0] || null;

  return {
    external_customer_id: profile.id,
    first_name: profile.first_name || '',
    last_name: profile.last_name || '',
    email: profile.email || null,
    phone: profile.phone || null,
    default_address: defaultAddress,
    all_addresses: normalizedAddresses,
  };
}

async function syncMissingCustomerToInsider(adminClient: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: triggerSecret, error: secretError } = await adminClient.rpc('get_private_integration_config', {
    p_key: 'customer_sync_trigger_secret',
  });

  if (secretError || !triggerSecret) {
    throw new Error('Unable to load customer sync trigger secret');
  }

  const customerSyncPayload = await buildCustomerSyncPayload(adminClient, userId);
  const insiderCustomerSyncUrl = `${requireEnv('SUPABASE_URL')}/functions/v1/sync-customer-to-insider`;

  const response = await fetch(insiderCustomerSyncUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-customer-sync-secret': String(triggerSecret),
    },
    body: JSON.stringify(customerSyncPayload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Customer sync retry failed with status ${response.status}: ${errorBody}`);
  }
}

async function forwardOrderToInsiderOnce(
  insiderIngestUrl: string,
  insiderIngestSecret: string,
  insiderPayload: Record<string, unknown>,
) {
  return fetch(insiderIngestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-customer-site-ingest-secret': insiderIngestSecret,
    },
    body: JSON.stringify(insiderPayload),
  });
}

async function parseInsiderResponse(response: Response): Promise<{
  httpOk: boolean;
  status: number;
  textBody: string;
  jsonBody: any | null;
  appOk: boolean;
}> {
  const textBody = await response.text().catch(() => '');
  let jsonBody: any | null = null;

  if (textBody) {
    try {
      jsonBody = JSON.parse(textBody);
    } catch {
      jsonBody = null;
    }
  }

  const appOk = jsonBody && typeof jsonBody === 'object' && 'ok' in jsonBody
    ? Boolean(jsonBody.ok)
    : true;

  return {
    httpOk: response.ok,
    status: response.status,
    textBody,
    jsonBody,
    appOk,
  };
}

Deno.serve(async (req: Request) => {
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

  let payload: { order_id?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!payload.order_id) {
    return new Response(JSON.stringify({ error: 'order_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const insiderIngestUrl = requireEnv('INSIDER_INGEST_URL');
  const insiderIngestSecret = requireEnv('INSIDER_INGEST_SECRET');

  const adminClient = createAdminClient();

  const logFailure = async (details: {
    externalOrderId?: string;
    externalCustomerId?: string;
    version?: number;
    errorMessage: string;
    payload?: unknown;
  }) => {
    await adminClient.from('insider_sync_failures').insert({
      source: 'customer_to_insider_ingest',
      external_order_id: details.externalOrderId ?? null,
      external_customer_id: details.externalCustomerId ?? null,
      version: details.version ?? null,
      error_message: details.errorMessage,
      payload: details.payload ?? null,
    });
  };

  try {
    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .select('id, user_id, external_order_id, external_customer_id, created_at, status, total_amount, insider_order_status, shipping_address, billing_breakdown, payment_method, payment_status, payment_gateway, razorpay_order_id, razorpay_payment_id, payment_attempted_at, paid_at, payment_metadata')
      .eq('id', payload.order_id)
      .maybeSingle();

    if (orderError || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: items, error: itemsError } = await adminClient
      .from('order_items')
      .select('quantity, price, product_id, lot_name, lot_snapshot, products(external_product_id, key, category, name, seller_id)')
      .eq('order_id', payload.order_id);

    if (itemsError) {
      throw itemsError;
    }

    // Get seller profile names for items
    const sellerIds = new Set<string>();
    (items ?? []).forEach((item: any) => {
      if (item.products?.seller_id) {
        sellerIds.add(item.products.seller_id);
      }
      // Also get seller IDs from lot_snapshot items
      if (Array.isArray(item.lot_snapshot)) {
        item.lot_snapshot.forEach((snapshot: any) => {
          if (snapshot.seller_id) {
            sellerIds.add(snapshot.seller_id);
          }
        });
      }
    });

    const sellerProfiles: Record<string, any> = {};
    if (sellerIds.size > 0) {
      const { data: sellers } = await adminClient
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', Array.from(sellerIds));

      if (sellers) {
        sellers.forEach((seller: any) => {
          sellerProfiles[seller.id] = `${seller.first_name || ''} ${seller.last_name || ''}`.trim();
        });
      }
    }

    const { data: customerProfile } = await adminClient
      .from('profiles')
      .select('first_name, last_name, email, phone')
      .eq('id', order.user_id)
      .maybeSingle();

    const externalOrderId = order.external_order_id ?? String(order.id);
    const externalCustomerId = order.external_customer_id ?? String(order.user_id);
    const orderDate = String(order.created_at);
    const orderStatus = mapOrderStatus(order.insider_order_status ?? order.status);
    const paymentStatus = String(order.payment_status || 'pending').toLowerCase();
    const shippingAddress = order.shipping_address && typeof order.shipping_address === 'object'
      ? order.shipping_address as Record<string, unknown>
      : {};
    const paymentMethod = String(order.payment_method || shippingAddress.payment_method || 'cod');
    const shippingFirstName = String(shippingAddress.first_name || customerProfile?.first_name || '').trim();
    const shippingLastName = String(shippingAddress.last_name || customerProfile?.last_name || '').trim();
    const shippingPhone = String(shippingAddress.phone || customerProfile?.phone || '').trim();
    const shippingName = [shippingFirstName, shippingLastName].filter(Boolean).join(' ').trim();
    const customerName = [customerProfile?.first_name, customerProfile?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    const normalizedTotalAmount = Number(order.total_amount ?? 0);
    const billingBreakdown = order.billing_breakdown && typeof order.billing_breakdown === 'object'
      ? order.billing_breakdown as Record<string, unknown>
      : null;
    const paymentMetadata = order.payment_metadata && typeof order.payment_metadata === 'object'
      ? order.payment_metadata as Record<string, unknown>
      : null;
    const couponCode = billingBreakdown ? String(billingBreakdown.coupon_code || '').trim() : '';
    const couponId = billingBreakdown ? String(billingBreakdown.coupon_id || '').trim() : '';
    const couponType = billingBreakdown ? String(billingBreakdown.coupon_type || '').trim() : '';
    const couponDisplayName = billingBreakdown ? String(billingBreakdown.coupon_display_name || '').trim() : '';
    const couponDiscount = billingBreakdown ? Number(billingBreakdown.coupon_discount ?? 0) : 0;
    const otherDiscount = billingBreakdown ? Number(billingBreakdown.discount ?? 0) : 0;
    const totalDiscountAmount = Math.max(0, couponDiscount + otherDiscount);

    const isOnlineRazorpay = isRazorpayMethod(paymentMethod);
    if (isOnlineRazorpay && paymentStatus !== 'paid') {
      return new Response(JSON.stringify({
        error: 'Online payment is not completed. Order cannot be forwarded yet.',
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentDetails = {
      payment_method: paymentMethod,
      payment_status: paymentStatus,
      payment_gateway: order.payment_gateway || null,
      razorpay_order_id: order.razorpay_order_id || null,
      razorpay_payment_id: order.razorpay_payment_id || null,
      payment_attempted_at: order.payment_attempted_at || null,
      paid_at: order.paid_at || null,
      payment_metadata: paymentMetadata,
    };

    // Build a map of product_key → seller_name by fetching all products in the order
    const allProductKeys = new Set<string>();
    (items ?? []).forEach((item: any) => {
      if (item.products?.key) allProductKeys.add(item.products.key);
      if (Array.isArray(item.lot_snapshot)) {
        item.lot_snapshot.forEach((s: any) => { if (s.product_key) allProductKeys.add(s.product_key); });
      }
    });
    const productKeyToSellerName: Record<string, string> = {};
    if (allProductKeys.size > 0) {
      const { data: productRows } = await adminClient
        .from('products')
        .select('key, seller_id, profiles!products_seller_id_fkey(first_name, last_name)')
        .in('key', Array.from(allProductKeys));
      (productRows || []).forEach((p: any) => {
        if (p.key && p.profiles) {
          const name = `${p.profiles.first_name || ''} ${p.profiles.last_name || ''}`.trim();
          if (name) productKeyToSellerName[p.key] = name;
        }
      });
    }

    const insiderItems = (items ?? []).flatMap((item: any) => {
      const lotSnapshotItems = Array.isArray(item.lot_snapshot) ? item.lot_snapshot : [];
      // Seller name: use actual seller profile name. Only fall back to 'Hatvoni Heritage'
      // if the product genuinely has no seller_id (i.e. it's a Hatvoni-owned product).
      const fallbackSellerName = item.products?.seller_id
        ? (sellerProfiles[item.products.seller_id] || productKeyToSellerName[item.products?.key] || item.products.seller_id)
        : 'Hatvoni Heritage';

      if (lotSnapshotItems.length > 0) {
        return lotSnapshotItems.map((snapshotItem: any) => {
          const snapshotSellerName = snapshotItem.seller_id
            ? (sellerProfiles[snapshotItem.seller_id] || productKeyToSellerName[snapshotItem.product_key] || snapshotItem.seller_id)
            : (productKeyToSellerName[snapshotItem.product_key] || 'Hatvoni Heritage');
          // Multiply snapshot item quantity by how many lots the customer ordered
          const lotQty = Number(item.quantity ?? 1);
          const itemQty = Number(snapshotItem.quantity ?? 1);
          return {
            external_product_id: String(snapshotItem.product_key || item.products?.key || item.product_id || '0'),
            product_name: snapshotItem.product_name || item.lot_name || item.products?.name || 'Unknown Product',
            lot_name: item.lot_name || null,
            seller_name: snapshotSellerName,
            quantity: itemQty * lotQty,
            unit_price: Number(snapshotItem.unit_price ?? item.price ?? 0),
            unit: snapshotItem.unit || 'unit',
          };
        });
      }

      return [{
        external_product_id: String(item.products?.key || item.products?.external_product_id || item.product_id || '0'),
        product_key: String(item.products?.key || item.products?.external_product_id || item.product_id || '0'),
        product_name: item.products?.name || item.lot_name || 'Unknown Product',
        lot_name: item.lot_name || null,
        seller_name: fallbackSellerName,
        quantity: Number(item.quantity ?? 1),
        unit_price: Number(item.price ?? 0),
        unit: 'unit',
      }];
    });

    const insiderPayload = {
      contract_version: 1,
      external_order_id: externalOrderId,
      external_customer_id: externalCustomerId,
      version: 1,
      order_status: orderStatus,
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      payment_details: paymentDetails,
      razorpay: isOnlineRazorpay ? paymentDetails : null,
      order_date: orderDate,
      placed_at: orderDate,
      order_number: `HAT-${String(order.id).slice(0, 8).toUpperCase()}`,
      total_amount: normalizedTotalAmount,
      discount_amount: totalDiscountAmount,
      billing_breakdown: billingBreakdown ?? {
        subtotal: normalizedTotalAmount,
        shipping_fee: 0,
        cod_fee: 0,
        discount: 0,
        coupon_discount: 0,
        total: normalizedTotalAmount,
        free_shipping_applied: false,
      },
      coupon: {
        applied: Boolean(couponCode),
        code: couponCode || null,
        id: couponId || null,
        type: couponType || null,
        display_name: couponDisplayName || null,
        discount_amount: couponDiscount,
      },
      shipping: {
        free_shipping_applied: billingBreakdown ? Boolean(billingBreakdown.free_shipping_applied) : false,
        free_shipping_discount: billingBreakdown ? Number(billingBreakdown.free_shipping_discount ?? 0) : 0,
        shipping_fee: billingBreakdown ? Number(billingBreakdown.shipping_fee ?? 0) : 0,
      },
      customer: {
        name: customerName || null,
        email: customerProfile?.email ?? null,
        phone: (customerProfile?.phone ?? shippingPhone) || null,
      },
      shipping_address: {
        name: shippingName || customerName || null,
        phone: (shippingPhone || customerProfile?.phone) || null,
        address_line1: shippingAddress.address_line1 || null,
        address_line2: shippingAddress.address_line2 || null,
        city: shippingAddress.city || null,
        state: shippingAddress.state || null,
        postal_code: shippingAddress.postal_code || null,
        country: shippingAddress.country || null,
      },
      notes: null,
      items: insiderItems,
      // Always use lot-based ingest path so product_key → produced_goods_tags mapping works
      // for both individual products and lots. lot_flattened=true triggers the tag path.
      lot_flattened: true,
    };

    let insiderResponse = await forwardOrderToInsiderOnce(insiderIngestUrl, insiderIngestSecret, insiderPayload);
    let insiderResult = await parseInsiderResponse(insiderResponse);

    if (
      !insiderResult.httpOk
      && insiderResult.status === 400
      && insiderResult.textBody.includes('Unknown external_customer_id')
    ) {
      try {
        await syncMissingCustomerToInsider(adminClient, order.user_id);
        insiderResponse = await forwardOrderToInsiderOnce(insiderIngestUrl, insiderIngestSecret, insiderPayload);
        insiderResult = await parseInsiderResponse(insiderResponse);
      } catch (syncError) {
        await logFailure({
          externalOrderId,
          externalCustomerId,
          version: 1,
          errorMessage: `Customer sync retry failed: ${String(syncError)}`,
          payload: {
            external_order_id: externalOrderId,
            external_customer_id: externalCustomerId,
            sent_payload: insiderPayload,
          },
        });

        return new Response(JSON.stringify({
          error: 'Failed to sync customer before forwarding order',
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!insiderResult.httpOk || !insiderResult.appOk) {
      await logFailure({
        externalOrderId,
        externalCustomerId,
        version: 1,
        errorMessage: !insiderResult.httpOk
          ? `Insider ingest failed with status ${insiderResult.status}`
          : 'Insider ingest returned ok:false',
        payload: {
          insider_status: insiderResult.status,
          insider_body: insiderResult.textBody,
          insider_json: insiderResult.jsonBody,
          external_order_id: externalOrderId,
          sent_payload: insiderPayload,
        },
      });

      return new Response(JSON.stringify({
        error: 'Failed to sync order with insider',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await adminClient
      .from('orders')
      .update({
        last_synced_at: new Date().toISOString(),
        insider_order_status: order.insider_order_status ?? 'placed',
      })
      .eq('id', order.id);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('forward-order-to-insider error:', error);

    await logFailure({
      errorMessage: 'Unexpected error while forwarding order',
      payload: { order_id: payload.order_id ?? null },
    });

    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
