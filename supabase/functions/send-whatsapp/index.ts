import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { buildR2ObjectKey, isR2Configured, uploadJsonToR2 } from '../_shared/r2.ts';

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

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const reports = Array.isArray(body?.whatsapp_reports) ? body.whatsapp_reports : [];
    let r2Archive: { key: string; publicUrl: string | null } | null = null;

    if (isR2Configured()) {
      try {
        const key = buildR2ObjectKey('whatsapp/webhooks');
        const uploaded = await uploadJsonToR2(key, body, {
          source: 'send-whatsapp',
          type: 'webhook-payload',
        });
        r2Archive = { key: uploaded.key, publicUrl: uploaded.publicUrl };
      } catch (r2Error) {
        // Do not fail webhook processing when archive upload fails.
        console.error('send-whatsapp r2 archive error:', (r2Error as Error).message);
      }
    }

    // Persist each event in a dedicated WhatsApp webhook events table.
    const admin = createAdminClient();
    if (reports.length > 0) {
      const rows = reports.map((report: Record<string, unknown>) => ({
        event_type: String(report?.type || 'unknown'),
        message_id: report?.message_id ? String(report.message_id) : null,
        request_id: report?.request_id ? String(report.request_id) : null,
        phone_number_id: report?.phone_number_id ? String(report.phone_number_id) : null,
        sender_id: report?.from ? String(report.from) : null,
        recipient_id: report?.recipient_id ? String(report.recipient_id) : null,
        status: report?.status ? String(report.status) : null,
        message_type: report?.message_type ? String(report.message_type) : null,
        body: report?.body ? String(report.body) : null,
        event_timestamp: report?.timestamp
          ? new Date(Number(report.timestamp) * 1000).toISOString()
          : null,
        payload: report,
      }));

      const { error } = await admin.from('whatsapp_webhook_events').insert(rows);
      if (error) {
        // Keep webhook endpoint resilient; do not fail provider callback.
        console.error('send-whatsapp insert error:', error.message);
      }
    }

    return jsonResponse({
      ok: true,
      received_reports: reports.length,
      archived_to_r2: Boolean(r2Archive),
      r2_object_key: r2Archive?.key ?? null,
      r2_public_url: r2Archive?.publicUrl ?? null,
      message: 'Webhook received',
    });
  } catch (error) {
    console.error('send-whatsapp error:', error);
    return jsonResponse({ ok: false, error: (error as Error).message || 'Unexpected error' }, 500);
  }
});
