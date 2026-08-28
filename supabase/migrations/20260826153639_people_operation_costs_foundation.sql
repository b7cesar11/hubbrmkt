create table public.operation_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  role_title text not null,
  fixed_monthly_cost numeric not null default 0,
  commission_pct numeric not null default 0,
  commission_basis text not null default 'sale_price',
  applies_to_all_products boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_people_name_not_blank check (length(trim(name)) > 0),
  constraint operation_people_role_not_blank check (length(trim(role_title)) > 0),
  constraint operation_people_fixed_cost_nonnegative check (fixed_monthly_cost >= 0),
  constraint operation_people_commission_pct_valid check (commission_pct >= 0 and commission_pct <= 100),
  constraint operation_people_commission_basis_valid check (commission_basis in ('sale_price', 'gross_revenue'))
);

create index operation_people_company_active_idx
  on public.operation_people(company_id, active);

create table public.product_people (
  product_id uuid not null references public.products(id) on delete cascade,
  person_id uuid not null references public.operation_people(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, person_id)
);

create index product_people_person_idx on public.product_people(person_id, product_id);

alter table public.product_listings
  add column monthly_units_forecast numeric not null default 0;

alter table public.product_listings
  add constraint product_listings_monthly_units_forecast_nonnegative
  check (monthly_units_forecast >= 0);

comment on column public.product_listings.monthly_units_forecast is
  'Quantidade mensal projetada nesta conta/anúncio. Usada para ratear custos fixos de pessoas e projeções operacionais; zero significa não informado.';

comment on table public.operation_people is
  'Pessoas/posições da operação. fixed_monthly_cost é o custo mensal informado pela empresa; comissão é variável por venda dos produtos aplicáveis.';

comment on table public.product_people is
  'Vínculo de pessoas com produtos quando applies_to_all_products=false. Pessoas globais não precisam de vínculo explícito.';

alter table public.operation_people enable row level security;
alter table public.product_people enable row level security;

create policy operation_people_select_company
  on public.operation_people
  for select
  to authenticated
  using (company_id = (select public.fn_current_company_id()));

create policy operation_people_insert_admin
  on public.operation_people
  for insert
  to authenticated
  with check (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin', 'super_admin')
  );

create policy operation_people_update_admin
  on public.operation_people
  for update
  to authenticated
  using (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin', 'super_admin')
  )
  with check (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin', 'super_admin')
  );

create policy product_people_select_company
  on public.product_people
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_people.product_id
        and p.company_id = (select public.fn_current_company_id())
    )
  );

revoke all on public.operation_people from anon;
revoke all on public.product_people from anon;
revoke all on public.product_people from authenticated;
grant select, insert, update on public.operation_people to authenticated;
grant select on public.product_people to authenticated;

create or replace function public.fn_upsert_operation_person(
  p_person_id uuid,
  p_name text,
  p_role_title text,
  p_fixed_monthly_cost numeric,
  p_commission_pct numeric,
  p_commission_basis text default 'sale_price',
  p_applies_to_all_products boolean default false,
  p_active boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role text;
  v_person_id uuid;
begin
  if v_user_id is null then
    raise exception 'Não autenticado';
  end if;

  select u.company_id, u.role
    into v_company_id, v_role
  from public.users u
  where u.id = v_user_id;

  if v_company_id is null then
    raise exception 'Usuário sem empresa vinculada';
  end if;

  if v_role not in ('company_admin', 'super_admin') then
    raise exception 'Somente administradores podem gerenciar pessoas da operação';
  end if;

  if nullif(trim(p_name), '') is null or nullif(trim(p_role_title), '') is null then
    raise exception 'Nome e cargo são obrigatórios';
  end if;

  if coalesce(p_fixed_monthly_cost, 0) < 0 then
    raise exception 'O custo fixo mensal não pode ser negativo';
  end if;

  if coalesce(p_commission_pct, 0) < 0 or coalesce(p_commission_pct, 0) > 100 then
    raise exception 'A comissão deve estar entre 0 e 100%%';
  end if;

  if coalesce(p_commission_basis, 'sale_price') not in ('sale_price', 'gross_revenue') then
    raise exception 'Base de comissão inválida';
  end if;

  if p_person_id is null then
    insert into public.operation_people (
      company_id, name, role_title, fixed_monthly_cost, commission_pct,
      commission_basis, applies_to_all_products, active
    ) values (
      v_company_id, trim(p_name), trim(p_role_title), coalesce(p_fixed_monthly_cost, 0),
      coalesce(p_commission_pct, 0), coalesce(p_commission_basis, 'sale_price'),
      coalesce(p_applies_to_all_products, false), coalesce(p_active, true)
    )
    returning id into v_person_id;
  else
    update public.operation_people
    set name = trim(p_name),
        role_title = trim(p_role_title),
        fixed_monthly_cost = coalesce(p_fixed_monthly_cost, 0),
        commission_pct = coalesce(p_commission_pct, 0),
        commission_basis = coalesce(p_commission_basis, 'sale_price'),
        applies_to_all_products = coalesce(p_applies_to_all_products, false),
        active = coalesce(p_active, true),
        updated_at = now()
    where id = p_person_id
      and company_id = v_company_id
    returning id into v_person_id;

    if v_person_id is null then
      raise exception 'Pessoa não encontrada para esta empresa';
    end if;
  end if;

  return v_person_id;
end;
$$;

revoke execute on function public.fn_upsert_operation_person(uuid, text, text, numeric, numeric, text, boolean, boolean) from public;
revoke execute on function public.fn_upsert_operation_person(uuid, text, text, numeric, numeric, text, boolean, boolean) from anon;
grant execute on function public.fn_upsert_operation_person(uuid, text, text, numeric, numeric, text, boolean, boolean) to authenticated;

create or replace function public.fn_save_product_with_listings(p_product_id uuid, p_product jsonb, p_listings jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
  v_monthly_units_forecast numeric;
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

  if p_product ? 'people_ids' then
    begin
      if exists (
        select 1
        from jsonb_array_elements_text(coalesce(p_product->'people_ids', '[]'::jsonb)) selected(person_id)
        left join public.operation_people op
          on op.id = selected.person_id::uuid
         and op.company_id = v_company_id
         and op.active
        where op.id is null
      ) then
        raise exception 'Uma das pessoas selecionadas não pertence à empresa ou está inativa';
      end if;
    exception
      when invalid_text_representation then
        raise exception 'Pessoa inválida no vínculo do produto';
    end;

    delete from public.product_people pp
    where pp.product_id = v_product_id;

    insert into public.product_people (product_id, person_id)
    select v_product_id, op.id
    from jsonb_array_elements_text(coalesce(p_product->'people_ids', '[]'::jsonb)) selected(person_id)
    join public.operation_people op
      on op.id = selected.person_id::uuid
     and op.company_id = v_company_id
     and op.active
     and not op.applies_to_all_products
    on conflict (product_id, person_id) do nothing;
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
    v_monthly_units_forecast := coalesce(nullif(v_listing->>'monthly_units_forecast', '')::numeric, 0);

    if v_monthly_units_forecast < 0 then
      raise exception 'A venda mensal projetada não pode ser negativa';
    end if;

    if v_enabled and coalesce(v_sale_price, 0) > 0 then
      insert into public.product_listings (
        product_id, platform_id, marketplace_account_id, sale_price, shipping_revenue, monthly_units_forecast, listing_type,
        platform_category_id, marketplace_category_ref_id, logistic_type, shipping_mode,
        billable_weight_kg, length_cm, width_cm, height_cm, program_config, active
      ) values (
        v_product_id, v_platform_id, v_account_id, v_sale_price,
        coalesce(nullif(v_listing->>'shipping_revenue', '')::numeric, 0),
        v_monthly_units_forecast,
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
          shipping_revenue = excluded.shipping_revenue,
          monthly_units_forecast = excluded.monthly_units_forecast,
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
$function$;
