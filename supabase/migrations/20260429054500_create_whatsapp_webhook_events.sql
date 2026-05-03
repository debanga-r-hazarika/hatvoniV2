create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  message_id text null,
  request_id text null,
  phone_number_id text null,
  sender_id text null,
  recipient_id text null,
  status text null,
  message_type text null,
  body text null,
  event_timestamp timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_webhook_events_created_at_idx
  on public.whatsapp_webhook_events (created_at desc);
create index if not exists whatsapp_webhook_events_message_id_idx
  on public.whatsapp_webhook_events (message_id);
create index if not exists whatsapp_webhook_events_request_id_idx
  on public.whatsapp_webhook_events (request_id);
alter table public.whatsapp_webhook_events enable row level security;
