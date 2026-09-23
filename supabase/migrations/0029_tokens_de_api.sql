-- ============================================================
-- CRM JID Mídia — 0029: Tokens de API (REST /api/v1 e MCP)
--
-- Credencial server-to-server por empresa, para n8n, sistemas externos e
-- clientes MCP. O valor só aparece UMA vez, na criação; o banco guarda o
-- SHA-256 e um prefixo para a tela reconhecer o token.
--
-- A organização do chamador sai SEMPRE do token — nunca do corpo da
-- requisição. As rotas usam service_role e filtram organization_id por ele.
--
-- Aditiva e idempotente.
-- ============================================================

create table if not exists public.api_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  token_hash      text not null unique,
  token_prefix    text not null,
  scopes          text[] not null default array['api', 'mcp']::text[],
  last_used_at    timestamptz,
  expires_at      timestamptz,
  revoked_at      timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists api_tokens_org_idx on public.api_tokens (organization_id, created_at desc);

alter table public.api_tokens enable row level security;

drop policy if exists "api_tokens: org_admin lê" on public.api_tokens;
create policy "api_tokens: org_admin lê"
  on public.api_tokens for select
  using (public.is_org_admin(organization_id));

drop policy if exists "api_tokens: org_admin cria" on public.api_tokens;
create policy "api_tokens: org_admin cria"
  on public.api_tokens for insert
  with check (public.is_org_admin(organization_id));

-- Revogar é um update de `revoked_at`; não há delete para preservar a trilha.
drop policy if exists "api_tokens: org_admin revoga" on public.api_tokens;
create policy "api_tokens: org_admin revoga"
  on public.api_tokens for update
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

revoke delete on public.api_tokens from authenticated;
revoke all on public.api_tokens from anon;
grant select, insert, update on public.api_tokens to authenticated;
grant all on public.api_tokens to service_role;
