-- ============================================================
-- Wavemov CRM — 0002: Formulários de captura e WhatsApp/UAZAPI
-- ============================================================

-- ------------------------------------------------------------
-- FORMULÁRIOS
-- ------------------------------------------------------------
create table public.forms (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations (id) on delete cascade,
  name                   text not null,
  slug                   text not null unique,
  description            text,
  pipeline_id            uuid references public.pipelines (id) on delete set null,
  stage_id               uuid references public.pipeline_stages (id) on delete set null,
  default_responsible_id uuid references public.profiles (id) on delete set null,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now()
);

create index forms_org_idx on public.forms (organization_id);
create index forms_slug_idx on public.forms (slug);

create table public.form_fields (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms (id) on delete cascade,
  label       text not null,
  field_key   text not null,
  field_type  text not null default 'text'
                check (field_type in ('text', 'email', 'phone', 'number', 'textarea', 'select')),
  is_required boolean not null default false,
  options     jsonb not null default '[]'::jsonb,
  order_index integer not null default 0
);

create index form_fields_form_idx on public.form_fields (form_id, order_index);

create table public.form_submissions (
  id         uuid primary key default gen_random_uuid(),
  form_id    uuid not null references public.forms (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  deal_id    uuid references public.deals (id) on delete set null,
  raw_data   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index form_submissions_form_idx on public.form_submissions (form_id, created_at desc);

-- ------------------------------------------------------------
-- WHATSAPP / UAZAPI
-- ------------------------------------------------------------
create table public.whatsapp_instances (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  name              text not null default 'Principal',
  provider          text not null default 'uazapi',
  base_url          text,
  instance_id       text,
  -- token guardado no banco (acessível apenas via RLS/server); nunca enviado ao cliente
  token_encrypted   text,
  status            text not null default 'disconnected'
                      check (status in ('disconnected', 'connecting', 'qr', 'connected', 'error')),
  qr_code           text,
  last_connected_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index whatsapp_instances_org_idx on public.whatsapp_instances (organization_id);

create trigger whatsapp_instances_updated_at
  before update on public.whatsapp_instances
  for each row execute function public.set_updated_at();

create table public.whatsapp_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  instance_id     uuid references public.whatsapp_instances (id) on delete set null,
  contact_id      uuid references public.contacts (id) on delete set null,
  deal_id         uuid references public.deals (id) on delete set null,
  assigned_to     uuid references public.profiles (id) on delete set null,
  phone           text not null,
  name            text,
  status          text not null default 'open'
                    check (status in ('open', 'pending', 'resolved', 'archived')),
  unread_count    integer not null default 0,
  last_message    text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, phone)
);

create index whatsapp_conversations_org_idx
  on public.whatsapp_conversations (organization_id, last_message_at desc);

create trigger whatsapp_conversations_updated_at
  before update on public.whatsapp_conversations
  for each row execute function public.set_updated_at();

create table public.whatsapp_messages (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  conversation_id     uuid not null references public.whatsapp_conversations (id) on delete cascade,
  provider_message_id text,
  direction           text not null check (direction in ('inbound', 'outbound')),
  message_type        text not null default 'text'
                        check (message_type in ('text', 'image', 'audio', 'video', 'document', 'system')),
  content             text,
  media_url           text,
  sender_phone        text,
  receiver_phone      text,
  raw_payload         jsonb not null default '{}'::jsonb,
  sent_by             uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

create index whatsapp_messages_conversation_idx
  on public.whatsapp_messages (conversation_id, created_at);
create unique index whatsapp_messages_provider_idx
  on public.whatsapp_messages (conversation_id, provider_message_id)
  where provider_message_id is not null;

create table public.quick_replies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title           text not null,
  content         text not null,
  created_at      timestamptz not null default now()
);

create index quick_replies_org_idx on public.quick_replies (organization_id);
