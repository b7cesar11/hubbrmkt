create table if not exists public.marketplace_categories (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references public.platforms(id) on delete cascade,
  parent_id uuid null,
  canonical_key text not null,
  external_category_id text null,
  name text not null,
  level smallint not null default 0 check (level >= 0),
  full_path text not null default '',
  path_ids uuid[] not null default '{}'::uuid[],
  is_leaf boolean not null default false,
  active boolean not null default true,
  source_kind text not null default 'official' check (source_kind in ('official','seller_panel','manual','legacy_research')),
  confidence_status text not null default 'confirmed' check (confidence_status in ('confirmed','unverified','deprecated')),
  source_url text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_categories_key_uniq unique (platform_id, canonical_key),
  constraint marketplace_categories_id_platform_uniq unique (id, platform_id),
  constraint marketplace_categories_parent_not_self check (parent_id is null or parent_id <> id)
);

alter table public.marketplace_categories
  add constraint marketplace_categories_parent_platform_fkey
  foreign key (parent_id, platform_id)
  references public.marketplace_categories(id, platform_id)
  on delete restrict;

create index if not exists idx_marketplace_categories_platform_active
  on public.marketplace_categories(platform_id, active, level);
create index if not exists idx_marketplace_categories_parent
  on public.marketplace_categories(parent_id);
create index if not exists idx_marketplace_categories_external
  on public.marketplace_categories(platform_id, external_category_id)
  where external_category_id is not null;
create index if not exists idx_marketplace_categories_name_lower
  on public.marketplace_categories(platform_id, lower(name));

create or replace function public.fn_fill_marketplace_category_path()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_parent public.marketplace_categories%rowtype;
begin
  new.name := btrim(new.name);
  new.canonical_key := btrim(new.canonical_key);
  new.updated_at := now();

  if new.name = '' or new.canonical_key = '' then
    raise exception 'Nome e chave canônica da categoria são obrigatórios';
  end if;

  if new.parent_id is null then
    new.level := 0;
    new.full_path := new.name;
    new.path_ids := array[new.id]::uuid[];
  else
    select * into v_parent
    from public.marketplace_categories
    where id = new.parent_id and platform_id = new.platform_id;

    if not found then
      raise exception 'Categoria pai inválida para este marketplace';
    end if;

    if new.id = any(v_parent.path_ids) then
      raise exception 'A hierarquia de categorias não pode conter ciclos';
    end if;

    new.level := v_parent.level + 1;
    new.full_path := v_parent.full_path || ' › ' || new.name;
    new.path_ids := v_parent.path_ids || new.id;
  end if;

  return new;
end;
$$;

create trigger trg_fill_marketplace_category_path
before insert or update of platform_id, parent_id, name, canonical_key
on public.marketplace_categories
for each row execute function public.fn_fill_marketplace_category_path();

alter table public.product_listings
  add column if not exists marketplace_category_ref_id uuid null,
  add column if not exists marketplace_category_name text null,
  add column if not exists marketplace_category_path text null,
  add column if not exists marketplace_category_path_ids uuid[] not null default '{}'::uuid[];

alter table public.product_listings
  add constraint product_listings_marketplace_category_platform_fkey
  foreign key (marketplace_category_ref_id, platform_id)
  references public.marketplace_categories(id, platform_id)
  on delete restrict;

create index if not exists idx_product_listings_marketplace_category_ref
  on public.product_listings(marketplace_category_ref_id)
  where marketplace_category_ref_id is not null;

create or replace function public.fn_sync_listing_category_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_category public.marketplace_categories%rowtype;
begin
  if new.marketplace_category_ref_id is null then
    new.marketplace_category_name := null;
    new.marketplace_category_path := null;
    new.marketplace_category_path_ids := '{}'::uuid[];
    return new;
  end if;

  select * into v_category
  from public.marketplace_categories
  where id = new.marketplace_category_ref_id
    and platform_id = new.platform_id
    and active
    and confidence_status = 'confirmed';

  if not found then
    raise exception 'Categoria oficial inválida, inativa ou não confirmada para este marketplace';
  end if;

  new.marketplace_category_name := v_category.name;
  new.marketplace_category_path := v_category.full_path;
  new.marketplace_category_path_ids := v_category.path_ids;
  if v_category.external_category_id is not null then
    new.platform_category_id := v_category.external_category_id;
  end if;
  return new;
end;
$$;

create trigger trg_sync_listing_category_snapshot
before insert or update of marketplace_category_ref_id, platform_id
on public.product_listings
for each row execute function public.fn_sync_listing_category_snapshot();

create or replace function public.fn_refresh_marketplace_category_descendants()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  for v_id in
    with recursive descendants as (
      select c.id, c.level
      from public.marketplace_categories c
      where c.parent_id = new.id
      union all
      select c.id, c.level
      from public.marketplace_categories c
      join descendants d on c.parent_id = d.id
    )
    select id from descendants order by level, id
  loop
    update public.marketplace_categories
    set parent_id = parent_id
    where id = v_id;
  end loop;

  update public.product_listings pl
  set marketplace_category_name = c.name,
      marketplace_category_path = c.full_path,
      marketplace_category_path_ids = c.path_ids,
      platform_category_id = coalesce(c.external_category_id, pl.platform_category_id)
  from public.marketplace_categories c
  where pl.marketplace_category_ref_id = c.id
    and new.id = any(c.path_ids);

  return new;
end;
$$;

create trigger trg_refresh_marketplace_category_descendants
after update of platform_id, parent_id, name
on public.marketplace_categories
for each row execute function public.fn_refresh_marketplace_category_descendants();

alter table public.platform_fee_rules
  add column if not exists marketplace_category_id uuid null,
  add column if not exists category_scope text not null default 'exact';

alter table public.platform_fee_rules
  add constraint platform_fee_rules_marketplace_category_platform_fkey
  foreign key (marketplace_category_id, platform_id)
  references public.marketplace_categories(id, platform_id)
  on delete restrict,
  add constraint platform_fee_rules_category_scope_check
  check (category_scope in ('exact','descendants'));

create index if not exists idx_platform_fee_rules_marketplace_category
  on public.platform_fee_rules(platform_id, marketplace_category_id)
  where marketplace_category_id is not null;

alter table public.platform_fee_rules drop constraint if exists no_overlapping_fee_rules;
alter table public.platform_fee_rules
  add constraint no_overlapping_fee_rules
  exclude using gist (
    platform_id with =,
    coalesce(marketplace_category_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(category, ''::text) with =,
    coalesce(listing_type, ''::text) with =,
    coalesce(reputation_level, ''::text) with =,
    coalesce(account_type, ''::text) with =,
    numrange(price_min, price_max) with &&,
    daterange(valid_from, valid_to, '[]'::text) with &&
  );

create table if not exists public.company_category_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  platform_id uuid not null references public.platforms(id) on delete cascade,
  internal_category text not null,
  internal_category_key text generated always as (lower(btrim(internal_category))) stored,
  marketplace_category_id uuid not null,
  usage_count integer not null default 1 check (usage_count > 0),
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint company_category_preferences_category_platform_fkey
    foreign key (marketplace_category_id, platform_id)
    references public.marketplace_categories(id, platform_id)
    on delete cascade,
  constraint company_category_preferences_unique
    unique (company_id, platform_id, internal_category_key, marketplace_category_id)
);

create index if not exists idx_company_category_preferences_rank
  on public.company_category_preferences(company_id, platform_id, internal_category_key, usage_count desc, last_used_at desc);

alter table public.marketplace_categories enable row level security;
alter table public.company_category_preferences enable row level security;

drop policy if exists marketplace_categories_read on public.marketplace_categories;
create policy marketplace_categories_read
on public.marketplace_categories for select
to authenticated
using (
  (active and confidence_status = 'confirmed')
  or (select public.fn_current_role()) = 'super_admin'
);

drop policy if exists company_category_preferences_read on public.company_category_preferences;
create policy company_category_preferences_read
on public.company_category_preferences for select
to authenticated
using (company_id = (select public.fn_current_company_id()));

grant select on public.marketplace_categories to authenticated;
grant select on public.company_category_preferences to authenticated;

create or replace function public.fn_search_marketplace_categories(
  p_platform_id uuid,
  p_query text default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  platform_id uuid,
  parent_id uuid,
  name text,
  full_path text,
  path_ids uuid[],
  level smallint,
  is_leaf boolean,
  external_category_id text,
  source_url text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.id, c.platform_id, c.parent_id, c.name, c.full_path, c.path_ids,
    c.level, c.is_leaf, c.external_category_id, c.source_url
  from public.marketplace_categories c
  where c.platform_id = p_platform_id
    and c.active
    and c.confidence_status = 'confirmed'
    and (
      nullif(btrim(p_query), '') is null
      or c.name ilike '%' || btrim(p_query) || '%'
      or c.full_path ilike '%' || btrim(p_query) || '%'
      or c.external_category_id ilike '%' || btrim(p_query) || '%'
    )
  order by
    case
      when nullif(btrim(p_query), '') is null then 3
      when lower(c.name) = lower(btrim(p_query)) then 0
      when lower(c.name) like lower(btrim(p_query)) || '%' then 1
      else 2
    end,
    c.is_leaf desc,
    c.level desc,
    c.full_path
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.fn_search_marketplace_categories(uuid,text,integer) from public;
grant execute on function public.fn_search_marketplace_categories(uuid,text,integer) to authenticated;

create or replace function public.fn_upsert_marketplace_category(
  p_category_id uuid,
  p_platform_id uuid,
  p_parent_id uuid,
  p_canonical_key text,
  p_external_category_id text,
  p_name text,
  p_is_leaf boolean,
  p_source_url text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if public.fn_current_role() <> 'super_admin' then
    raise exception 'Apenas super_admin pode administrar a taxonomia oficial';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_canonical_key), '') is null then
    raise exception 'Nome e chave canônica são obrigatórios';
  end if;
  if nullif(btrim(p_source_url), '') is null then
    raise exception 'Uma fonte oficial é obrigatória para confirmar a categoria';
  end if;

  if p_category_id is null then
    insert into public.marketplace_categories (
      platform_id, parent_id, canonical_key, external_category_id, name,
      is_leaf, source_kind, confidence_status, source_url, metadata
    ) values (
      p_platform_id, p_parent_id, btrim(p_canonical_key), nullif(btrim(p_external_category_id), ''), btrim(p_name),
      coalesce(p_is_leaf, false), 'official', 'confirmed', btrim(p_source_url), coalesce(p_metadata, '{}'::jsonb)
    ) returning id into v_id;
  else
    update public.marketplace_categories
    set platform_id = p_platform_id,
        parent_id = p_parent_id,
        canonical_key = btrim(p_canonical_key),
        external_category_id = nullif(btrim(p_external_category_id), ''),
        name = btrim(p_name),
        is_leaf = coalesce(p_is_leaf, false),
        source_kind = 'official',
        confidence_status = 'confirmed',
        source_url = btrim(p_source_url),
        metadata = coalesce(p_metadata, '{}'::jsonb),
        active = true
    where id = p_category_id
    returning id into v_id;
    if v_id is null then raise exception 'Categoria não encontrada'; end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.fn_upsert_marketplace_category(uuid,uuid,uuid,text,text,text,boolean,text,jsonb) from public;
grant execute on function public.fn_upsert_marketplace_category(uuid,uuid,uuid,text,text,text,boolean,text,jsonb) to authenticated;

create or replace function public.fn_save_product_with_listings(p_product_id uuid, p_product jsonb, p_listings jsonb)
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
  v_category_id uuid;
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
      v_category_id := nullif(v_listing->>'marketplace_category_ref_id', '')::uuid;
    exception when others then
      raise exception 'Marketplace, conta ou categoria inválidos no anúncio';
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

    if v_category_id is not null and not exists (
      select 1 from public.marketplace_categories c
      where c.id = v_category_id
        and c.platform_id = v_platform_id
        and c.active
        and c.confidence_status = 'confirmed'
    ) then
      raise exception 'A categoria selecionada não é uma categoria oficial ativa deste marketplace';
    end if;

    v_enabled := coalesce((v_listing->>'enabled')::boolean, false);
    v_sale_price := nullif(v_listing->>'sale_price', '')::numeric;

    if v_enabled and coalesce(v_sale_price, 0) > 0 then
      insert into public.product_listings (
        product_id, platform_id, marketplace_account_id, sale_price, listing_type,
        platform_category_id, marketplace_category_ref_id, logistic_type, shipping_mode,
        billable_weight_kg, length_cm, width_cm, height_cm, program_config, active
      ) values (
        v_product_id, v_platform_id, v_account_id, v_sale_price,
        nullif(v_listing->>'listing_type', ''),
        nullif(trim(v_listing->>'platform_category_id'), ''),
        v_category_id,
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
          marketplace_category_ref_id = excluded.marketplace_category_ref_id,
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

      if v_category_id is not null then
        insert into public.company_category_preferences (
          company_id, platform_id, internal_category, marketplace_category_id, usage_count, last_used_at
        ) values (
          v_company_id, v_platform_id, trim(p_product->>'category'), v_category_id, 1, now()
        )
        on conflict (company_id, platform_id, internal_category_key, marketplace_category_id)
        do update set
          usage_count = public.company_category_preferences.usage_count + 1,
          last_used_at = now(),
          internal_category = excluded.internal_category;
      end if;
    else
      delete from public.product_listings
      where product_id = v_product_id and marketplace_account_id = v_account_id;
    end if;
  end loop;

  return v_product_id;
end;
$$;

create or replace function public.fn_version_fee_rule(p_rule_id uuid, p_commission_pct numeric, p_fixed_fee numeric, p_source_url text, p_source_kind text default null, p_confidence_status text default null, p_calculation_config jsonb default null)
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
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select public.fn_current_role() into v_role;
  if v_role <> 'super_admin' then raise exception 'Apenas super_admin pode versionar regras de taxa'; end if;
  if p_commission_pct is null or p_commission_pct < 0 or p_commission_pct > 100 then raise exception 'Comissão inválida'; end if;
  if p_fixed_fee is null or p_fixed_fee < 0 then raise exception 'Taxa fixa inválida'; end if;
  if nullif(trim(p_source_url), '') is null then raise exception 'Fonte é obrigatória'; end if;

  select * into v_old from public.platform_fee_rules where id = p_rule_id for update;
  if not found then raise exception 'Regra não encontrada'; end if;
  if v_old.valid_to < current_date then raise exception 'Não é possível versionar uma regra já encerrada'; end if;

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

  update public.platform_fee_rules set valid_to = current_date - 1 where id = v_old.id;

  insert into public.platform_fee_rules (
    platform_id, category, marketplace_category_id, category_scope,
    price_min, price_max, commission_pct, fixed_fee,
    valid_from, valid_to, source_url, created_by, listing_type, reputation_level,
    source_kind, confidence_status, calculation_config, account_type
  ) values (
    v_old.platform_id, v_old.category, v_old.marketplace_category_id, v_old.category_scope,
    v_old.price_min, v_old.price_max, p_commission_pct, p_fixed_fee,
    current_date, null, trim(p_source_url), auth.uid(), v_old.listing_type, v_old.reputation_level,
    coalesce(p_source_kind, v_old.source_kind),
    coalesce(p_confidence_status, v_old.confidence_status),
    coalesce(p_calculation_config, v_old.calculation_config),
    v_old.account_type
  ) returning * into v_new;
  return v_new;
end;
$$;

comment on table public.marketplace_categories is 'Taxonomia hierárquica por marketplace. Somente categorias confirmadas oficialmente são usadas no cadastro operacional.';
comment on column public.platform_fee_rules.marketplace_category_id is 'Categoria oficial normalizada da regra. NULL significa regra global/legada.';
comment on column public.platform_fee_rules.category_scope is 'exact = somente o nó; descendants = nó e descendentes quando a fonte oficial permite herança.';
comment on column public.product_listings.marketplace_category_ref_id is 'Categoria oficial selecionada no cadastro do anúncio.';
comment on table public.company_category_preferences is 'Memória de classificação da empresa para sugerir categorias já utilizadas sem inventar tarifas.';
