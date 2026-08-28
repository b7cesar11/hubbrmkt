create table public.monthly_operation_costs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  monthly_amount numeric not null default 0,
  applies_to_all_products boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_operation_costs_name_not_blank check (length(trim(name)) > 0),
  constraint monthly_operation_costs_amount_nonnegative check (monthly_amount >= 0),
  constraint monthly_operation_costs_category_valid check (
    category in ('rent', 'energy', 'internet', 'paid_traffic', 'software', 'accounting', 'other')
  )
);

create index monthly_operation_costs_company_active_idx
  on public.monthly_operation_costs(company_id, active);

create table public.product_monthly_operation_costs (
  product_id uuid not null references public.products(id) on delete cascade,
  monthly_cost_id uuid not null references public.monthly_operation_costs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, monthly_cost_id)
);

create index product_monthly_operation_costs_cost_idx
  on public.product_monthly_operation_costs(monthly_cost_id, product_id);

comment on table public.monthly_operation_costs is
  'Obrigações mensais usadas pelo motor de previsibilidade. O sistema rateia automaticamente por SKU aplicável; paid_traffic representa orçamento mensal em reais.';

alter table public.monthly_operation_costs enable row level security;
alter table public.product_monthly_operation_costs enable row level security;

create policy monthly_operation_costs_select_company
  on public.monthly_operation_costs for select to authenticated
  using (company_id = (select public.fn_current_company_id()));

create policy monthly_operation_costs_insert_admin
  on public.monthly_operation_costs for insert to authenticated
  with check (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin', 'super_admin')
  );

create policy monthly_operation_costs_update_admin
  on public.monthly_operation_costs for update to authenticated
  using (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin', 'super_admin')
  )
  with check (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin', 'super_admin')
  );

create policy product_monthly_operation_costs_select_company
  on public.product_monthly_operation_costs for select to authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_monthly_operation_costs.product_id
        and p.company_id = (select public.fn_current_company_id())
    )
  );

create policy product_monthly_operation_costs_insert_admin
  on public.product_monthly_operation_costs for insert to authenticated
  with check (
    (select public.fn_current_role()) in ('company_admin', 'super_admin')
    and exists (
      select 1 from public.products p
      where p.id = product_monthly_operation_costs.product_id
        and p.company_id = (select public.fn_current_company_id())
    )
    and exists (
      select 1 from public.monthly_operation_costs c
      where c.id = product_monthly_operation_costs.monthly_cost_id
        and c.company_id = (select public.fn_current_company_id())
    )
  );

create policy product_monthly_operation_costs_delete_admin
  on public.product_monthly_operation_costs for delete to authenticated
  using (
    (select public.fn_current_role()) in ('company_admin', 'super_admin')
    and exists (
      select 1 from public.products p
      where p.id = product_monthly_operation_costs.product_id
        and p.company_id = (select public.fn_current_company_id())
    )
  );

revoke all on public.monthly_operation_costs from anon;
revoke all on public.product_monthly_operation_costs from anon;
revoke all on public.product_monthly_operation_costs from authenticated;
grant select, insert, update on public.monthly_operation_costs to authenticated;
grant select, insert, delete on public.product_monthly_operation_costs to authenticated;

create or replace function public.fn_upsert_monthly_operation_cost(
  p_cost_id uuid,
  p_name text,
  p_category text,
  p_monthly_amount numeric,
  p_applies_to_all_products boolean default true,
  p_active boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_role text;
  v_cost_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select u.company_id, u.role into v_company_id, v_role
  from public.users u where u.id = auth.uid();

  if v_company_id is null then raise exception 'Usuário sem empresa vinculada'; end if;
  if v_role not in ('company_admin', 'super_admin') then
    raise exception 'Somente administradores podem gerenciar custos mensais';
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'Informe o nome do custo'; end if;
  if coalesce(p_monthly_amount, 0) < 0 then raise exception 'O valor mensal não pode ser negativo'; end if;
  if coalesce(p_category, 'other') not in ('rent', 'energy', 'internet', 'paid_traffic', 'software', 'accounting', 'other') then
    raise exception 'Categoria de custo inválida';
  end if;

  if p_cost_id is null then
    insert into public.monthly_operation_costs (
      company_id, name, category, monthly_amount, applies_to_all_products, active
    ) values (
      v_company_id, trim(p_name), coalesce(p_category, 'other'),
      coalesce(p_monthly_amount, 0), coalesce(p_applies_to_all_products, true),
      coalesce(p_active, true)
    ) returning id into v_cost_id;
  else
    update public.monthly_operation_costs
    set name = trim(p_name), category = coalesce(p_category, 'other'),
        monthly_amount = coalesce(p_monthly_amount, 0),
        applies_to_all_products = coalesce(p_applies_to_all_products, true),
        active = coalesce(p_active, true), updated_at = now()
    where id = p_cost_id and company_id = v_company_id
    returning id into v_cost_id;
    if v_cost_id is null then raise exception 'Custo mensal não encontrado'; end if;
  end if;

  return v_cost_id;
end;
$$;

revoke execute on function public.fn_upsert_monthly_operation_cost(uuid, text, text, numeric, boolean, boolean) from public;
revoke execute on function public.fn_upsert_monthly_operation_cost(uuid, text, text, numeric, boolean, boolean) from anon;
grant execute on function public.fn_upsert_monthly_operation_cost(uuid, text, text, numeric, boolean, boolean) to authenticated;

create or replace function public.fn_set_monthly_operation_cost_products(
  p_cost_id uuid,
  p_product_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_role text;
  v_global boolean;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select u.company_id, u.role into v_company_id, v_role
  from public.users u where u.id = auth.uid();

  if v_company_id is null then raise exception 'Usuário sem empresa vinculada'; end if;
  if v_role not in ('company_admin', 'super_admin') then
    raise exception 'Somente administradores podem alterar vínculos de custos mensais';
  end if;

  select c.applies_to_all_products into v_global
  from public.monthly_operation_costs c
  where c.id = p_cost_id and c.company_id = v_company_id;
  if v_global is null then raise exception 'Custo mensal não encontrado'; end if;

  if exists (
    select 1
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) requested(product_id)
    left join public.products p
      on p.id = requested.product_id and p.company_id = v_company_id and p.active
    where p.id is null
  ) then raise exception 'Um dos produtos selecionados é inválido'; end if;

  delete from public.product_monthly_operation_costs where monthly_cost_id = p_cost_id;

  if not v_global then
    insert into public.product_monthly_operation_costs(product_id, monthly_cost_id)
    select distinct requested.product_id, p_cost_id
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) requested(product_id)
    join public.products p
      on p.id = requested.product_id and p.company_id = v_company_id and p.active
    on conflict (product_id, monthly_cost_id) do nothing;
  end if;
end;
$$;

revoke execute on function public.fn_set_monthly_operation_cost_products(uuid, uuid[]) from public;
revoke execute on function public.fn_set_monthly_operation_cost_products(uuid, uuid[]) from anon;
grant execute on function public.fn_set_monthly_operation_cost_products(uuid, uuid[]) to authenticated;
