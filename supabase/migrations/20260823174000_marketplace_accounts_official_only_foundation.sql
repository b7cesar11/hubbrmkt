create table if not exists public.marketplace_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  platform_id uuid not null references public.platforms(id) on delete restrict,
  name text not null,
  document_type text,
  external_account_id text,
  profile_config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_accounts_document_type_chk check (document_type is null or document_type in ('cpf','cnpj')),
  constraint marketplace_accounts_name_chk check (length(trim(name)) > 0)
);

create unique index if not exists marketplace_accounts_company_platform_name_uidx
  on public.marketplace_accounts (company_id, platform_id, lower(name));
create unique index if not exists marketplace_accounts_default_uidx
  on public.marketplace_accounts (company_id, platform_id)
  where is_default and active;
create index if not exists marketplace_accounts_company_idx on public.marketplace_accounts(company_id);
create index if not exists marketplace_accounts_platform_idx on public.marketplace_accounts(platform_id);

alter table public.marketplace_accounts enable row level security;
drop policy if exists tenant_isolation_marketplace_accounts on public.marketplace_accounts;
create policy tenant_isolation_marketplace_accounts on public.marketplace_accounts
  for all to authenticated
  using (company_id = (select public.fn_current_company_id()))
  with check (company_id = (select public.fn_current_company_id()));

revoke all on public.marketplace_accounts from anon;
grant select, insert, update, delete on public.marketplace_accounts to authenticated;

alter table public.platform_fee_rules
  add column if not exists account_type text;
alter table public.platform_fee_rules
  drop constraint if exists platform_fee_rules_account_type_chk;
alter table public.platform_fee_rules
  add constraint platform_fee_rules_account_type_chk
  check (account_type is null or account_type in ('cpf','cnpj'));
create index if not exists platform_fee_rules_account_type_idx
  on public.platform_fee_rules(platform_id, account_type, valid_from);

alter table public.platform_fee_rules drop constraint if exists no_overlapping_fee_rules;
alter table public.platform_fee_rules
  add constraint no_overlapping_fee_rules
  exclude using gist (
    platform_id with =,
    coalesce(category, ''::text) with =,
    coalesce(listing_type, ''::text) with =,
    coalesce(reputation_level, ''::text) with =,
    coalesce(account_type, ''::text) with =,
    numrange(price_min, price_max) with &&,
    daterange(valid_from, valid_to, '[]'::text) with &&
  );

alter table public.product_listings
  add column if not exists marketplace_account_id uuid references public.marketplace_accounts(id) on delete restrict;

insert into public.marketplace_accounts (company_id, platform_id, name, is_default, profile_config)
select distinct p.company_id, pl.platform_id, 'Conta padrão', true, '{}'::jsonb
from public.product_listings pl
join public.products p on p.id = pl.product_id
where pl.marketplace_account_id is null
on conflict do nothing;

update public.product_listings pl
set marketplace_account_id = ma.id
from public.products p,
     public.marketplace_accounts ma
where p.id = pl.product_id
  and pl.marketplace_account_id is null
  and ma.company_id = p.company_id
  and ma.platform_id = pl.platform_id
  and ma.is_default = true
  and ma.active = true;

alter table public.product_listings
  alter column marketplace_account_id set not null;

drop index if exists public.product_listings_product_platform_uidx;
create unique index if not exists product_listings_product_account_uidx
  on public.product_listings(product_id, marketplace_account_id);
create index if not exists product_listings_marketplace_account_idx
  on public.product_listings(marketplace_account_id);

-- As regras Shopee confirmadas existentes correspondem à política oficial CNPJ.
update public.platform_fee_rules r
set account_type = 'cnpj'
from public.platforms p
where p.id = r.platform_id
  and p.name = 'Shopee'
  and r.source_kind = 'official'
  and r.confidence_status = 'confirmed'
  and r.valid_to is null
  and r.account_type is null;

-- Variante CPF: mesmas faixas percentuais/fixas, com adicional de R$3 apenas
-- quando a conta ultrapassa 450 pedidos em 90 dias. Abaixo de R$12 a fonte
-- pública consultada informa regra regressiva e exemplos, mas não a fórmula
-- completa; por isso o motor bloqueia a faixa em vez de inferir.
insert into public.platform_fee_rules (
  platform_id, category, price_min, price_max, commission_pct, fixed_fee,
  valid_from, valid_to, source_url, created_by, listing_type, reputation_level,
  source_kind, confidence_status, calculation_config, account_type
)
select
  r.platform_id, r.category, r.price_min, r.price_max, r.commission_pct, r.fixed_fee,
  r.valid_from, r.valid_to,
  'Shopee Seller Education — política oficial CPF 2026; +R$3 por item somente acima de 450 pedidos em 90 dias. Para itens abaixo de R$12 a fonte pública traz regra regressiva e exemplos, sem fórmula completa; o MargemHub não infere a fórmula.',
  r.created_by, r.listing_type, r.reputation_level,
  'official', 'confirmed',
  jsonb_set(
    jsonb_set(
      coalesce(r.calculation_config, '{}'::jsonb),
      '{additional_charges}',
      coalesce(r.calculation_config->'additional_charges', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'code','shopee_cpf_high_volume_fee',
          'name','Adicional vendedor CPF acima de 450 pedidos/90 dias',
          'calc_type','fixed',
          'value',3,
          'condition',jsonb_build_object('program_key','shopee_cpf_order_band','equals','over_450'),
          'unknown_policy','skip'
        )
      ),
      true
    ),
    '{required_profile_fields}',
    jsonb_build_array(
      jsonb_build_object(
        'key','shopee_cpf_order_band',
        'allowed',jsonb_build_array('under_450','over_450'),
        'message','Informe se esta conta CPF teve mais de 450 pedidos nos últimos 90 dias.'
      )
    ),
    true
  ) || jsonb_build_object(
    'unsupported_below_price', jsonb_build_object(
      'threshold',12,
      'message','A política oficial CPF informa taxa por item regressiva abaixo de R$12, mas a fonte pública consultada não expõe a fórmula completa. O MargemHub não calcula essa faixa sem fórmula oficial completa.'
    ),
    'unsupported_exact_prices', jsonb_build_array(80,100,200,500),
    'unsupported_exact_prices_message','A redação oficial usa “acima de” nos limites de R$80, R$100, R$200 e R$500; confirme o enquadramento do valor exato antes de precificar.'
  ),
  'cpf'
from public.platform_fee_rules r
join public.platforms p on p.id = r.platform_id and p.name = 'Shopee'
where r.account_type = 'cnpj'
  and r.source_kind = 'official'
  and r.confidence_status = 'confirmed'
  and r.valid_to is null
  and not exists (
    select 1 from public.platform_fee_rules x
    where x.platform_id = r.platform_id
      and x.account_type = 'cpf'
      and coalesce(x.category,'') = coalesce(r.category,'')
      and coalesce(x.listing_type,'') = coalesce(r.listing_type,'')
      and x.price_min = r.price_min
      and x.price_max is not distinct from r.price_max
      and x.valid_to is null
  );

-- Pix é subsídio da plataforma e não custo do seller.
update public.platform_fee_rules r
set calculation_config = coalesce(r.calculation_config, '{}'::jsonb) || jsonb_build_object(
  'unsupported_exact_prices', jsonb_build_array(80,100,200,500),
  'unsupported_exact_prices_message','A redação oficial usa “acima de” nos limites de R$80, R$100, R$200 e R$500; confirme o enquadramento do valor exato antes de precificar.',
  'policy_notes', jsonb_build_array('Subsídio Pix não é somado como custo do vendedor.')
)
from public.platforms p
where p.id = r.platform_id
  and p.name = 'Shopee'
  and r.account_type = 'cnpj'
  and r.source_kind = 'official'
  and r.confidence_status = 'confirmed'
  and r.valid_to is null;

-- O programa TikTok é característica da conta, não do SKU.
update public.platform_fee_rules r
set calculation_config = jsonb_set(
  coalesce(r.calculation_config, '{}'::jsonb),
  '{required_profile_fields}',
  jsonb_build_array(
    jsonb_build_object(
      'key','tiktok_shipping_fee_program',
      'allowed',jsonb_build_array('enrolled','opted_out'),
      'message','Informe no cadastro da conta se ela participa do Programa de Taxas de Envio do TikTok.'
    )
  ),
  true
)
from public.platforms p
where p.id = r.platform_id
  and p.name = 'TikTok Shop'
  and r.source_kind = 'official'
  and r.confidence_status = 'confirmed'
  and r.valid_to is null;

create or replace function public.fn_upsert_marketplace_account(
  p_account_id uuid,
  p_platform_id uuid,
  p_name text,
  p_document_type text,
  p_profile_config jsonb,
  p_is_default boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_account_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select u.company_id into v_company_id from public.users u where u.id = auth.uid();
  if v_company_id is null then raise exception 'Usuário sem empresa vinculada'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Nome da conta é obrigatório'; end if;
  if p_document_type is not null and p_document_type not in ('cpf','cnpj') then raise exception 'Tipo de documento inválido'; end if;
  if not exists (select 1 from public.platforms where id = p_platform_id) then raise exception 'Marketplace inválido'; end if;

  if p_is_default then
    update public.marketplace_accounts
    set is_default = false, updated_at = now()
    where company_id = v_company_id and platform_id = p_platform_id and active;
  end if;

  if p_account_id is null then
    insert into public.marketplace_accounts (
      company_id, platform_id, name, document_type, profile_config, is_default, active
    ) values (
      v_company_id, p_platform_id, trim(p_name), p_document_type,
      coalesce(p_profile_config,'{}'::jsonb), coalesce(p_is_default,false), true
    ) returning id into v_account_id;
  else
    update public.marketplace_accounts
    set platform_id = p_platform_id,
        name = trim(p_name),
        document_type = p_document_type,
        profile_config = coalesce(p_profile_config,'{}'::jsonb),
        is_default = coalesce(p_is_default,false),
        updated_at = now()
    where id = p_account_id and company_id = v_company_id
    returning id into v_account_id;
    if v_account_id is null then raise exception 'Conta não encontrada para esta empresa'; end if;
  end if;

  return v_account_id;
end;
$$;
revoke all on function public.fn_upsert_marketplace_account(uuid,uuid,text,text,jsonb,boolean) from public, anon;
grant execute on function public.fn_upsert_marketplace_account(uuid,uuid,text,text,jsonb,boolean) to authenticated;

create or replace function public.fn_save_product_with_listings(
  p_product_id uuid,
  p_product jsonb,
  p_listings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_product_id uuid;
  v_listing jsonb;
  v_listing_id uuid;
  v_platform_id uuid;
  v_account_id uuid;
  v_enabled boolean;
  v_sale_price numeric;
begin
  if v_user_id is null then raise exception 'Não autenticado'; end if;
  select u.company_id into v_company_id from public.users u where u.id = v_user_id;
  if v_company_id is null then raise exception 'Usuário sem empresa vinculada'; end if;

  if nullif(trim(p_product->>'sku'), '') is null
     or nullif(trim(p_product->>'name'), '') is null
     or nullif(trim(p_product->>'category'), '') is null
     or nullif(p_product->>'cost_price', '') is null then
    raise exception 'SKU, nome, categoria e custo são obrigatórios';
  end if;

  if p_product_id is null then
    insert into public.products (company_id, sku, name, category, cost_price, weight_kg, active)
    values (
      v_company_id, trim(p_product->>'sku'), trim(p_product->>'name'),
      trim(p_product->>'category'), (p_product->>'cost_price')::numeric,
      nullif(p_product->>'weight_kg', '')::numeric, true
    ) returning id into v_product_id;
  else
    update public.products
    set sku = trim(p_product->>'sku'), name = trim(p_product->>'name'),
        category = trim(p_product->>'category'), cost_price = (p_product->>'cost_price')::numeric,
        weight_kg = nullif(p_product->>'weight_kg', '')::numeric
    where id = p_product_id and company_id = v_company_id
    returning id into v_product_id;
    if v_product_id is null then raise exception 'Produto não encontrado para esta empresa'; end if;
  end if;

  for v_listing in select value from jsonb_array_elements(coalesce(p_listings, '[]'::jsonb))
  loop
    begin
      v_platform_id := (v_listing->>'platform_id')::uuid;
      v_account_id := (v_listing->>'marketplace_account_id')::uuid;
    exception when others then
      raise exception 'Marketplace/conta inválidos no anúncio';
    end;

    if not exists (
      select 1 from public.marketplace_accounts a
      where a.id = v_account_id
        and a.company_id = v_company_id
        and a.platform_id = v_platform_id
        and a.active
    ) then
      raise exception 'A conta selecionada não pertence à empresa ou ao marketplace informado';
    end if;

    v_enabled := coalesce((v_listing->>'enabled')::boolean, false);
    v_sale_price := nullif(v_listing->>'sale_price', '')::numeric;

    if v_enabled and coalesce(v_sale_price, 0) > 0 then
      insert into public.product_listings (
        product_id, platform_id, marketplace_account_id, sale_price, listing_type,
        platform_category_id, logistic_type, shipping_mode, billable_weight_kg,
        length_cm, width_cm, height_cm, program_config, active
      ) values (
        v_product_id, v_platform_id, v_account_id, v_sale_price,
        nullif(v_listing->>'listing_type', ''),
        nullif(trim(v_listing->>'platform_category_id'), ''),
        nullif(trim(v_listing->>'logistic_type'), ''),
        nullif(trim(v_listing->>'shipping_mode'), ''),
        nullif(v_listing->>'billable_weight_kg', '')::numeric,
        nullif(v_listing->>'length_cm', '')::numeric,
        nullif(v_listing->>'width_cm', '')::numeric,
        nullif(v_listing->>'height_cm', '')::numeric,
        coalesce(v_listing->'program_config', '{}'::jsonb), true
      )
      on conflict (product_id, marketplace_account_id) do update
      set platform_id = excluded.platform_id,
          sale_price = excluded.sale_price,
          listing_type = excluded.listing_type,
          platform_category_id = excluded.platform_category_id,
          logistic_type = excluded.logistic_type,
          shipping_mode = excluded.shipping_mode,
          billable_weight_kg = excluded.billable_weight_kg,
          length_cm = excluded.length_cm,
          width_cm = excluded.width_cm,
          height_cm = excluded.height_cm,
          program_config = excluded.program_config,
          active = true
      returning id into v_listing_id;

      delete from public.listing_cost_components lcc
      where lcc.product_listing_id = v_listing_id
        and not exists (
          select 1 from jsonb_array_elements_text(coalesce(v_listing->'selectedCosts', '[]'::jsonb)) selected(cost_id)
          where selected.cost_id::uuid = lcc.cost_component_id
        );

      insert into public.listing_cost_components (product_listing_id, cost_component_id)
      select v_listing_id, cc.id
      from jsonb_array_elements_text(coalesce(v_listing->'selectedCosts', '[]'::jsonb)) selected(cost_id)
      join public.cost_components cc on cc.id = selected.cost_id::uuid and cc.company_id = v_company_id
      on conflict (product_listing_id, cost_component_id) do nothing;
    else
      delete from public.product_listings
      where product_id = v_product_id and marketplace_account_id = v_account_id;
    end if;
  end loop;

  return v_product_id;
end;
$$;
revoke all on function public.fn_save_product_with_listings(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.fn_save_product_with_listings(uuid,jsonb,jsonb) to authenticated;

comment on table public.marketplace_accounts is 'Pré-cadastro das contas de seller por empresa e marketplace. O motor de margem usa este perfil para escolher somente a regra oficial aplicável.';
comment on column public.marketplace_accounts.profile_config is 'Configurações oficiais que alteram tarifas, ex.: faixa de pedidos CPF Shopee e participação no Shipping Fee Program TikTok.';
comment on column public.platform_fee_rules.account_type is 'Perfil de conta ao qual a regra oficial se aplica, ex.: cpf/cnpj na Shopee.';
