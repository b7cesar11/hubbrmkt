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
  v_enabled boolean;
  v_sale_price numeric;
begin
  if v_user_id is null then
    raise exception 'Não autenticado';
  end if;

  select u.company_id into v_company_id
  from public.users u
  where u.id = v_user_id;

  if v_company_id is null then
    raise exception 'Usuário sem empresa vinculada';
  end if;

  if nullif(trim(p_product->>'sku'), '') is null
     or nullif(trim(p_product->>'name'), '') is null
     or nullif(trim(p_product->>'category'), '') is null
     or nullif(p_product->>'cost_price', '') is null then
    raise exception 'SKU, nome, categoria e custo são obrigatórios';
  end if;

  if p_product_id is null then
    insert into public.products (
      company_id, sku, name, category, cost_price, weight_kg, active
    ) values (
      v_company_id,
      trim(p_product->>'sku'),
      trim(p_product->>'name'),
      trim(p_product->>'category'),
      (p_product->>'cost_price')::numeric,
      nullif(p_product->>'weight_kg', '')::numeric,
      true
    )
    returning id into v_product_id;
  else
    update public.products
    set sku = trim(p_product->>'sku'),
        name = trim(p_product->>'name'),
        category = trim(p_product->>'category'),
        cost_price = (p_product->>'cost_price')::numeric,
        weight_kg = nullif(p_product->>'weight_kg', '')::numeric
    where id = p_product_id
      and company_id = v_company_id
    returning id into v_product_id;

    if v_product_id is null then
      raise exception 'Produto não encontrado para esta empresa';
    end if;
  end if;

  for v_listing in
    select value from jsonb_array_elements(coalesce(p_listings, '[]'::jsonb))
  loop
    begin
      v_platform_id := (v_listing->>'platform_id')::uuid;
    exception when others then
      raise exception 'platform_id inválido no anúncio';
    end;

    if not exists (select 1 from public.platforms p where p.id = v_platform_id) then
      raise exception 'Plataforma não encontrada: %', v_platform_id;
    end if;

    v_enabled := coalesce((v_listing->>'enabled')::boolean, false);
    v_sale_price := nullif(v_listing->>'sale_price', '')::numeric;

    if v_enabled and coalesce(v_sale_price, 0) > 0 then
      insert into public.product_listings (
        product_id,
        platform_id,
        sale_price,
        listing_type,
        platform_category_id,
        logistic_type,
        shipping_mode,
        billable_weight_kg,
        length_cm,
        width_cm,
        height_cm,
        active
      ) values (
        v_product_id,
        v_platform_id,
        v_sale_price,
        nullif(v_listing->>'listing_type', ''),
        nullif(trim(v_listing->>'platform_category_id'), ''),
        nullif(trim(v_listing->>'logistic_type'), ''),
        nullif(trim(v_listing->>'shipping_mode'), ''),
        nullif(v_listing->>'billable_weight_kg', '')::numeric,
        nullif(v_listing->>'length_cm', '')::numeric,
        nullif(v_listing->>'width_cm', '')::numeric,
        nullif(v_listing->>'height_cm', '')::numeric,
        true
      )
      on conflict (product_id, platform_id) do update
      set sale_price = excluded.sale_price,
          listing_type = excluded.listing_type,
          platform_category_id = excluded.platform_category_id,
          logistic_type = excluded.logistic_type,
          shipping_mode = excluded.shipping_mode,
          billable_weight_kg = excluded.billable_weight_kg,
          length_cm = excluded.length_cm,
          width_cm = excluded.width_cm,
          height_cm = excluded.height_cm,
          active = true
      returning id into v_listing_id;

      delete from public.listing_cost_components lcc
      where lcc.product_listing_id = v_listing_id
        and not exists (
          select 1
          from jsonb_array_elements_text(coalesce(v_listing->'selectedCosts', '[]'::jsonb)) as selected(cost_id)
          where selected.cost_id::uuid = lcc.cost_component_id
        );

      insert into public.listing_cost_components (product_listing_id, cost_component_id)
      select v_listing_id, cc.id
      from jsonb_array_elements_text(coalesce(v_listing->'selectedCosts', '[]'::jsonb)) as selected(cost_id)
      join public.cost_components cc
        on cc.id = selected.cost_id::uuid
       and cc.company_id = v_company_id
      on conflict (product_listing_id, cost_component_id) do nothing;
    else
      delete from public.product_listings
      where product_id = v_product_id
        and platform_id = v_platform_id;
    end if;
  end loop;

  return v_product_id;
end;
$$;

revoke all on function public.fn_save_product_with_listings(uuid, jsonb, jsonb) from public;
revoke all on function public.fn_save_product_with_listings(uuid, jsonb, jsonb) from anon;
grant execute on function public.fn_save_product_with_listings(uuid, jsonb, jsonb) to authenticated;
