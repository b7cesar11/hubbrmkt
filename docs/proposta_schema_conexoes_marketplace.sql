-- =============================================================================
-- PROPOSTA DE SCHEMA — Conexões de Marketplace (OAuth) + Cache de Taxas ao vivo
-- =============================================================================
--
-- ⚠️ ISTO NÃO É UMA MIGRATION. NÃO EXECUTE ESTE ARQUIVO A PARTIR DO REPO.
--
-- Conforme REAL_DB_CONTEXT.md, o banco REAL do MargemHub é a fonte de verdade e
-- mudanças de schema só acontecem via chat com o Claude conectado ao MCP do
-- Supabase. Este arquivo é uma PROPOSTA revisável: o Claude com MCP deve ler,
-- validar contra o estado real (list_tables) e então aplicar via MCP.
--
-- Objetivo desta proposta (pedido do usuário):
--   1. Guardar o token de conexão OAuth de cada marketplace por empresa (tenant)
--      com o token protegido a NÍVEL DE COLUNA — não apenas de linha.
--   2. Guardar um cache do resultado de taxas consultado ao vivo na API.
--
-- Correção conceitual importante (já alinhada com o usuário):
--   RLS no Postgres/Supabase filtra LINHAS, não COLUNAS. Uma policy de RLS não
--   "esconde uma coluna". A forma correta de fazer o token ser legível SOMENTE
--   pela Edge Function (backend) e NUNCA pelo cliente é:
--     (a) Habilitar RLS na tabela de conexões e NÃO criar nenhuma policy para os
--         papéis anon/authenticated. Sem policy = nenhuma linha visível para o
--         cliente. A Edge Function usa a service_role key, que faz BYPASS de RLS.
--         => O token nunca trafega para o navegador.
--     (b) Expor o STATUS da conexão (sem segredos) ao cliente através de uma
--         função RPC SECURITY DEFINER que retorna apenas colunas não-sensíveis.
--         Isso é, na prática, o "nível de coluna" pedido: o cliente só enxerga
--         as colunas que a função devolve; jamais o access_token/refresh_token.
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Tabela: marketplace_connections
--    Uma linha por (empresa × plataforma). Guarda os tokens OAuth.
--    Segredos (access_token, refresh_token) NUNCA são expostos ao cliente.
-- -----------------------------------------------------------------------------
create table if not exists public.marketplace_connections (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  -- 'mercado_livre' | 'amazon' | 'shopee' | 'magalu' | 'tiktok_shop'
  platform          text not null,
  -- id do vendedor/usuário no marketplace (ex.: user_id do Mercado Livre)
  external_user_id  text,
  -- SEGREDOS — só a Edge Function (service_role) lê/escreve
  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  -- 'connected' | 'disconnected' | 'error'
  status            text not null default 'disconnected',
  last_error        text,
  connected_at      timestamptz,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  constraint marketplace_connections_unique unique (company_id, platform)
);

comment on table public.marketplace_connections is
  'Conexões OAuth por empresa×plataforma. access_token/refresh_token são segredos: '
  'RLS habilitado SEM policies para anon/authenticated, então só a Edge Function '
  '(service_role) enxerga estas linhas. O cliente lê status via RPC (ver abaixo).';

-- Habilita RLS. IMPORTANTE: NÃO criamos nenhuma policy para anon/authenticated.
-- Resultado: nenhum SELECT/INSERT/UPDATE/DELETE do cliente vê estas linhas.
-- A Edge Function usa service_role e faz BYPASS de RLS.
alter table public.marketplace_connections enable row level security;

-- (Opcional, mas recomendado) força RLS até para o owner da tabela, garantindo
-- que só service_role/bypass consiga ler os segredos.
alter table public.marketplace_connections force row level security;

create index if not exists idx_marketplace_connections_company
  on public.marketplace_connections (company_id);


-- -----------------------------------------------------------------------------
-- 2) RPC de STATUS (SECURITY DEFINER) — a "visão de coluna" segura p/ o cliente
--    Retorna SOMENTE colunas não-sensíveis, filtradas pela empresa do usuário
--    logado. Nunca retorna access_token / refresh_token.
-- -----------------------------------------------------------------------------
--
-- Observação: este RPC assume que existe uma forma de descobrir a empresa do
-- usuário autenticado. Enquanto o Auth/RLS real não está configurado
-- (ver REAL_DB_CONTEXT.md — pendência conhecida), o Claude com MCP deve ajustar
-- a resolução de company_id conforme o modelo de auth adotado. Duas variantes:
--
--   (A) Modelo com Supabase Auth: mapear auth.uid() -> public.users.company_id.
--   (B) Modelo atual (sem login real): receber company_id como argumento.
--
-- Abaixo a variante (B) — explícita e sem depender de auth.uid(), compatível com
-- o estado atual do app. Trocar para (A) quando o Auth estiver configurado.

create or replace function public.get_marketplace_connections(p_company_id uuid)
returns table (
  platform          text,
  external_user_id  text,
  status            text,
  connected_at      timestamptz,
  token_expires_at  timestamptz,
  last_error        text,
  updated_at        timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    platform,
    external_user_id,
    status,
    connected_at,
    token_expires_at,
    last_error,
    updated_at
  from public.marketplace_connections
  where company_id = p_company_id;
$$;

comment on function public.get_marketplace_connections(uuid) is
  'Retorna o STATUS das conexões de marketplace de uma empresa, SEM os tokens. '
  'É a interface segura que o frontend usa — os segredos jamais saem do backend.';

-- Permite que o cliente (anon/authenticated) chame apenas esta função.
grant execute on function public.get_marketplace_connections(uuid) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3) Tabela: marketplace_fee_cache
--    Cache do resultado de taxa consultado ao vivo (ex.: ML listing_prices).
--    Não contém segredos — o cliente pode ler o cache da própria empresa.
-- -----------------------------------------------------------------------------
create table if not exists public.marketplace_fee_cache (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  platform          text not null,
  -- chave da consulta
  category_id       text,               -- category_id do marketplace (ex.: MLB1234)
  listing_type      text,               -- 'classico' | 'premium' (nosso vocabulário)
  price             numeric(12,2) not null,
  -- resultado normalizado (mesmo formato que lib/margin.js espera consumir)
  commission_pct    numeric(6,3),       -- % de comissão (ex.: 12.5)
  fixed_fee         numeric(12,2),      -- taxa fixa em R$
  -- resposta bruta da API para auditoria/depuração
  raw               jsonb,
  fetched_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  constraint marketplace_fee_cache_unique
    unique (company_id, platform, category_id, listing_type, price)
);

comment on table public.marketplace_fee_cache is
  'Cache de taxas consultadas ao vivo na API do marketplace. Sem segredos. '
  'A Edge Function grava (service_role); o cliente pode ler o cache da sua empresa.';

alter table public.marketplace_fee_cache enable row level security;

create index if not exists idx_marketplace_fee_cache_lookup
  on public.marketplace_fee_cache (company_id, platform, category_id, listing_type, price);

create index if not exists idx_marketplace_fee_cache_expires
  on public.marketplace_fee_cache (expires_at);

-- Policy de LEITURA para o cliente: cache não tem segredos, então é seguro
-- deixar a empresa ler o próprio cache. (Escrita continua só via service_role.)
--
-- Variante (A) com Supabase Auth — recomendada quando o Auth estiver ativo:
--
--   create policy "empresa lê seu próprio cache"
--     on public.marketplace_fee_cache for select to authenticated
--     using (
--       company_id = (select company_id from public.users where id = auth.uid())
--     );
--
-- Enquanto o Auth não está configurado, o frontend consulta as taxas via a Edge
-- Function (que usa service_role), então NÃO é obrigatório criar policy de SELECT
-- agora. Deixe sem policy (nenhum acesso direto do cliente) OU habilite a policy
-- acima quando o Auth existir. NÃO crie policy permissiva (using true) — isso
-- exporia o cache de todas as empresas.


-- -----------------------------------------------------------------------------
-- 4) (Opcional) Limpeza de cache expirado
--    Pode ser chamado por um cron (pg_cron) ou pela própria Edge Function.
-- -----------------------------------------------------------------------------
create or replace function public.purge_expired_fee_cache()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted integer;
begin
  delete from public.marketplace_fee_cache where expires_at < now();
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;

comment on function public.purge_expired_fee_cache() is
  'Remove entradas de cache de taxa já expiradas. Chamar via pg_cron se desejado.';

-- =============================================================================
-- FIM DA PROPOSTA. Revisar e aplicar via MCP do Supabase (Claude), não pelo repo.
-- =============================================================================
