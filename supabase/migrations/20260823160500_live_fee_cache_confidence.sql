alter table public.live_fee_cache
  add column if not exists is_exact boolean not null default false,
  add column if not exists confidence_status text,
  add column if not exists warning text;

comment on column public.live_fee_cache.is_exact is
  'True quando a consulta recebeu os parâmetros necessários para representar a cobrança da conta/contexto.';
comment on column public.live_fee_cache.confidence_status is
  'Nível de confiança retornado pela integração (ex.: account_specific, partial_logistics).';
comment on column public.live_fee_cache.warning is
  'Aviso de limitação da consulta, quando houver.';
