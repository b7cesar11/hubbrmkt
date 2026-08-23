create or replace function public.fn_version_fee_rule(
  p_rule_id uuid,
  p_commission_pct numeric,
  p_fixed_fee numeric,
  p_source_url text,
  p_source_kind text default null,
  p_confidence_status text default null,
  p_calculation_config jsonb default null
)
returns public.platform_fee_rules
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_old public.platform_fee_rules%rowtype;
  v_new public.platform_fee_rules%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  select public.fn_current_role() into v_role;
  if v_role <> 'super_admin' then
    raise exception 'Apenas super_admin pode versionar regras de taxa';
  end if;

  if p_commission_pct is null or p_commission_pct < 0 or p_commission_pct > 100 then
    raise exception 'Comissão inválida';
  end if;
  if p_fixed_fee is null or p_fixed_fee < 0 then
    raise exception 'Taxa fixa inválida';
  end if;
  if nullif(trim(p_source_url), '') is null then
    raise exception 'Fonte é obrigatória';
  end if;

  select * into v_old
  from public.platform_fee_rules
  where id = p_rule_id
  for update;

  if not found then
    raise exception 'Regra não encontrada';
  end if;

  if v_old.valid_to is not null and v_old.valid_to < current_date then
    raise exception 'Não é possível versionar uma regra já encerrada';
  end if;

  if v_old.valid_from = current_date then
    update public.platform_fee_rules
    set commission_pct = p_commission_pct,
        fixed_fee = p_fixed_fee,
        source_url = trim(p_source_url),
        source_kind = coalesce(p_source_kind, v_old.source_kind),
        confidence_status = coalesce(p_confidence_status, v_old.confidence_status),
        calculation_config = coalesce(p_calculation_config, v_old.calculation_config)
    where id = v_old.id
    returning * into v_new;

    return v_new;
  end if;

  update public.platform_fee_rules
  set valid_to = current_date - 1
  where id = v_old.id;

  insert into public.platform_fee_rules (
    platform_id, category, price_min, price_max, commission_pct, fixed_fee,
    valid_from, valid_to, source_url, created_by, listing_type, reputation_level,
    source_kind, confidence_status, calculation_config
  ) values (
    v_old.platform_id, v_old.category, v_old.price_min, v_old.price_max,
    p_commission_pct, p_fixed_fee, current_date, null, trim(p_source_url), auth.uid(),
    v_old.listing_type, v_old.reputation_level,
    coalesce(p_source_kind, v_old.source_kind),
    coalesce(p_confidence_status, v_old.confidence_status),
    coalesce(p_calculation_config, v_old.calculation_config)
  )
  returning * into v_new;

  return v_new;
end;
$$;

revoke all on function public.fn_version_fee_rule(uuid,numeric,numeric,text,text,text,jsonb) from public;
revoke all on function public.fn_version_fee_rule(uuid,numeric,numeric,text,text,text,jsonb) from anon;
grant execute on function public.fn_version_fee_rule(uuid,numeric,numeric,text,text,text,jsonb) to authenticated;

comment on function public.fn_version_fee_rule(uuid,numeric,numeric,text,text,text,jsonb) is
  'Versiona uma regra de taxa de forma atômica. Fecha a versão anterior e cria a nova na mesma transação; apenas super_admin.';
