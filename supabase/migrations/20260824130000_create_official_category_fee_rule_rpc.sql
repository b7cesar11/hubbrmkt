create or replace function public.fn_create_official_fee_rule(
  p_platform_id uuid,
  p_marketplace_category_id uuid default null,
  p_category_scope text default 'exact',
  p_account_type text default null,
  p_listing_type text default null,
  p_price_min numeric default 0,
  p_price_max numeric default null,
  p_commission_pct numeric default 0,
  p_fixed_fee numeric default 0,
  p_source_url text default null,
  p_calculation_config jsonb default '{}'::jsonb
)
returns public.platform_fee_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule public.platform_fee_rules%rowtype;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if public.fn_current_role() <> 'super_admin' then
    raise exception 'Apenas super_admin pode criar regras oficiais';
  end if;
  if not exists (select 1 from public.platforms p where p.id = p_platform_id) then
    raise exception 'Marketplace inválido';
  end if;
  if p_marketplace_category_id is not null and not exists (
    select 1 from public.marketplace_categories c
    where c.id = p_marketplace_category_id
      and c.platform_id = p_platform_id
      and c.active
      and c.confidence_status = 'confirmed'
  ) then
    raise exception 'Categoria oficial inválida para este marketplace';
  end if;
  if p_category_scope not in ('exact','descendants') then raise exception 'Escopo de categoria inválido'; end if;
  if p_account_type is not null and p_account_type not in ('cpf','cnpj') then raise exception 'Tipo de conta inválido'; end if;
  if coalesce(p_price_min, 0) < 0 then raise exception 'Preço mínimo inválido'; end if;
  if p_price_max is not null and p_price_max <= coalesce(p_price_min, 0) then raise exception 'Preço máximo deve ser maior que o mínimo'; end if;
  if p_commission_pct is null or p_commission_pct < 0 or p_commission_pct > 100 then raise exception 'Comissão inválida'; end if;
  if coalesce(p_fixed_fee, 0) < 0 then raise exception 'Taxa fixa inválida'; end if;
  if nullif(btrim(p_source_url), '') is null then raise exception 'Fonte oficial é obrigatória'; end if;

  insert into public.platform_fee_rules (
    platform_id,
    category,
    marketplace_category_id,
    category_scope,
    price_min,
    price_max,
    commission_pct,
    fixed_fee,
    valid_from,
    valid_to,
    source_url,
    created_by,
    listing_type,
    reputation_level,
    source_kind,
    confidence_status,
    calculation_config,
    account_type
  ) values (
    p_platform_id,
    null,
    p_marketplace_category_id,
    p_category_scope,
    coalesce(p_price_min, 0),
    p_price_max,
    p_commission_pct,
    coalesce(p_fixed_fee, 0),
    current_date,
    null,
    btrim(p_source_url),
    auth.uid(),
    nullif(btrim(p_listing_type), ''),
    'padrao',
    'official',
    'confirmed',
    coalesce(p_calculation_config, '{}'::jsonb),
    nullif(btrim(p_account_type), '')
  ) returning * into v_rule;

  return v_rule;
end;
$$;

revoke all on function public.fn_create_official_fee_rule(uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,text,jsonb) from public;
grant execute on function public.fn_create_official_fee_rule(uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;

comment on function public.fn_create_official_fee_rule(uuid,uuid,text,text,text,numeric,numeric,numeric,numeric,text,jsonb)
is 'Cria apenas regras confirmadas por fonte oficial, opcionalmente vinculadas à taxonomia hierárquica.';
