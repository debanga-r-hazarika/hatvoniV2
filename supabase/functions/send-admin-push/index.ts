import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-push-dispatch-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function createAdminClient() {
  const url = getEnv('SUPABASE_URL');
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
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

  try {
    const dispatchSecret = getEnv('PUSH_DISPATCH_SECRET');
    const incomingSecret = req.headers.get('x-push-dispatch-secret') || '';
    if (!incomingSecret || incomingSecret !== dispatchSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const notificationId = asString(body?.notification_id).trim();
    if (!notificationId) {
      return new Response(JSON.stringify({ error: 'notification_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createAdminClient();

    const { data: notification, error: notifError } = await admin
      .from('admin_notifications')
      .select('id, recipient_user_id, module, title, message, entity_type, entity_id')
      .eq('id', notificationId)
      .maybeSingle();

    if (notifError) throw notifError;
    if (!notification) {
      return new Response(JSON.stringify({ ok: true, reason: 'notification_not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', notification.recipient_user_id);

    if (subError) throw subError;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, delivered: 0, reason: 'no_subscriptions' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const publicKey = getEnv('WEB_PUSH_VAPID_PUBLIC_KEY');
    const privateKey = getEnv('WEB_PUSH_VAPID_PRIVATE_KEY');
    const contact = getEnv('WEB_PUSH_CONTACT_EMAIL');

    webpush.setVapidDetails(contact, publicKey, privateKey);

    const route = (() => {
      if (notification.entity_type === 'order' && notification.entity_id) return `/admin/orders/${notification.entity_id}`;
      if (notification.entity_type === 'support_ticket') return '/admin/support';
      if (notification.entity_type === 'order_shipment') return '/admin/logistics';
      if (notification.entity_type === 'coupon') return '/admin/coupons';
      if (notification.entity_type === 'inventory') return '/admin/inventory';
      return '/admin';
    })();

    const payload = JSON.stringify({
      title: notification.title || 'Admin Notification',
      body: notification.message || '',
      url: route,
      notification_id: notification.id,
      module: notification.module,
    });

    let delivered = 0;
    const staleSubscriptionIds: string[] = [];

    for (const sub of subs) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };
      try {
        await webpush.sendNotification(subscription, payload);
        delivered += 1;
      } catch (err) {
        const code = Number((err as { statusCode?: number })?.statusCode || 0);
        if (code === 404 || code === 410) {
          staleSubscriptionIds.push(sub.id);
        } else {
          console.error('Push send failed:', err);
        }
      }
    }

    if (staleSubscriptionIds.length > 0) {
      await admin.from('push_subscriptions').delete().in('id', staleSubscriptionIds);
    }

    return new Response(JSON.stringify({ ok: true, delivered, stale_removed: staleSubscriptionIds.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('send-admin-push error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
