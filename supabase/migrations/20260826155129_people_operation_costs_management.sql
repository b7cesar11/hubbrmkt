create policy product_people_insert_admin
  on public.product_people
  for insert
  to authenticated
  with check (
    (select public.fn_current_role()) in ('company_admin', 'super_admin')
    and exists (
      select 1 from public.products p
      where p.id = product_people.product_id
        and p.company_id = (select public.fn_current_company_id())
    )
    and exists (
      select 1 from public.operation_people op
      where op.id = product_people.person_id
        and op.company_id = (select public.fn_current_company_id())
        and op.active
    )
  );

create policy product_people_delete_admin
  on public.product_people
  for delete
  to authenticated
  using (
    (select public.fn_current_role()) in ('company_admin', 'super_admin')
    and exists (
      select 1 from public.products p
      where p.id = product_people.product_id
        and p.company_id = (select public.fn_current_company_id())
    )
  );

grant insert, delete on public.product_people to authenticated;

create or replace function public.fn_set_operation_person_products(
  p_person_id uuid,
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

  select u.company_id, u.role
    into v_company_id, v_role
  from public.users u
  where u.id = auth.uid();

  if v_company_id is null then raise exception 'Usuário sem empresa vinculada'; end if;
  if v_role not in ('company_admin', 'super_admin') then
    raise exception 'Somente administradores podem alterar vínculos da equipe';
  end if;

  select op.applies_to_all_products
    into v_global
  from public.operation_people op
  where op.id = p_person_id
    and op.company_id = v_company_id;

  if v_global is null then raise exception 'Pessoa não encontrada para esta empresa'; end if;

  if exists (
    select 1
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) requested(product_id)
    left join public.products p
      on p.id = requested.product_id
     and p.company_id = v_company_id
     and p.active
    where p.id is null
  ) then
    raise exception 'Um dos produtos selecionados não pertence à empresa ou está inativo';
  end if;

  delete from public.product_people
  where person_id = p_person_id;

  if not v_global then
    insert into public.product_people(product_id, person_id)
    select distinct requested.product_id, p_person_id
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) requested(product_id)
    join public.products p
      on p.id = requested.product_id
     and p.company_id = v_company_id
     and p.active
    on conflict (product_id, person_id) do nothing;
  end if;
end;
$$;

revoke execute on function public.fn_set_operation_person_products(uuid, uuid[]) from public;
revoke execute on function public.fn_set_operation_person_products(uuid, uuid[]) from anon;
grant execute on function public.fn_set_operation_person_products(uuid, uuid[]) to authenticated;

create or replace function public.fn_update_listing_forecasts(p_forecasts jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_role text;
  v_row jsonb;
  v_listing_id uuid;
  v_units numeric;
  v_updated integer := 0;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;

  select u.company_id, u.role
    into v_company_id, v_role
  from public.users u
  where u.id = auth.uid();

  if v_company_id is null then raise exception 'Usuário sem empresa vinculada'; end if;
  if v_role not in ('company_admin', 'super_admin') then
    raise exception 'Somente administradores podem alterar projeções mensais';
  end if;

  if jsonb_typeof(coalesce(p_forecasts, '[]'::jsonb)) <> 'array' then
    raise exception 'Formato de projeções inválido';
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_forecasts, '[]'::jsonb))
  loop
    begin
      v_listing_id := (v_row->>'listing_id')::uuid;
      v_units := coalesce(nullif(v_row->>'monthly_units_forecast', '')::numeric, 0);
    exception when others then
      raise exception 'Projeção inválida';
    end;

    if v_units < 0 then raise exception 'Vendas projetadas/mês não podem ser negativas'; end if;

    update public.product_listings pl
    set monthly_units_forecast = v_units
    where pl.id = v_listing_id
      and exists (
        select 1 from public.products p
        where p.id = pl.product_id
          and p.company_id = v_company_id
      );

    if not found then raise exception 'Anúncio não encontrado para esta empresa'; end if;
    v_updated := v_updated + 1;
  end loop;

  return v_updated;
end;
$$;

revoke execute on function public.fn_update_listing_forecasts(jsonb) from public;
revoke execute on function public.fn_update_listing_forecasts(jsonb) from anon;
grant execute on function public.fn_update_listing_forecasts(jsonb) to authenticated;
