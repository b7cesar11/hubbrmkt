alter table public.marketplace_accounts
  drop constraint if exists marketplace_accounts_identity_uniq;
alter table public.marketplace_accounts
  add constraint marketplace_accounts_identity_uniq unique (id, company_id, platform_id);

create table if not exists public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  platform_id uuid not null references public.platforms(id),
  marketplace_account_id uuid not null,
  external_order_id text not null,
  ordered_at timestamptz not null,
  status text,
  currency text not null default 'BRL' check (char_length(currency) = 3),
  item_revenue numeric not null default 0 check (item_revenue >= 0),
  shipping_revenue numeric not null default 0 check (shipping_revenue >= 0),
  seller_discount numeric not null default 0 check (seller_discount >= 0),
  marketplace_discount numeric not null default 0 check (marketplace_discount >= 0),
  buyer_paid_total numeric check (buyer_paid_total is null or buyer_paid_total >= 0),
  source_kind text not null default 'api' check (source_kind in ('api','csv','manual','webhook')),
  source_metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_orders_account_fkey
    foreign key (marketplace_account_id, company_id, platform_id)
    references public.marketplace_accounts(id, company_id, platform_id),
  unique (marketplace_account_id, external_order_id)
);

create table if not exists public.marketplace_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  line_key text not null,
  external_item_id text,
  sku text,
  title text,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  item_revenue numeric not null default 0 check (item_revenue >= 0),
  shipping_revenue numeric not null default 0 check (shipping_revenue >= 0),
  seller_discount numeric not null default 0 check (seller_discount >= 0),
  marketplace_discount numeric not null default 0 check (marketplace_discount >= 0),
  product_id uuid references public.products(id) on delete set null,
  product_listing_id uuid references public.product_listings(id) on delete set null,
  cost_snapshot numeric check (cost_snapshot is null or cost_snapshot >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, line_key)
);

create table if not exists public.marketplace_order_charges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.marketplace_orders(id) on delete cascade,
  order_item_id uuid references public.marketplace_order_items(id) on delete cascade,
  external_charge_id text,
  charge_type text not null check (charge_type in (
    'commission','fixed_fee','shipping_fee','ads','affiliate','tax','refund','chargeback','seller_discount','other'
  )),
  direction text not null default 'debit' check (direction in ('debit','credit')),
  amount numeric not null check (amount >= 0),
  label text,
  occurred_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_import_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  platform_id uuid not null references public.platforms(id),
  marketplace_account_id uuid not null,
  source_kind text not null check (source_kind in ('api','csv','manual','webhook')),
  status text not null default 'running' check (status in ('running','success','partial','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cursor_from text,
  cursor_to text,
  orders_seen integer not null default 0 check (orders_seen >= 0),
  orders_imported integer not null default 0 check (orders_imported >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  constraint marketplace_import_runs_account_fkey
    foreign key (marketplace_account_id, company_id, platform_id)
    references public.marketplace_accounts(id, company_id, platform_id)
);

create index if not exists idx_marketplace_orders_company_ordered
  on public.marketplace_orders(company_id, ordered_at desc);
create index if not exists idx_marketplace_orders_account_ordered
  on public.marketplace_orders(marketplace_account_id, ordered_at desc);
create index if not exists idx_marketplace_order_items_product
  on public.marketplace_order_items(product_id) where product_id is not null;
create index if not exists idx_marketplace_order_items_listing
  on public.marketplace_order_items(product_listing_id) where product_listing_id is not null;
create index if not exists idx_marketplace_order_charges_order_type
  on public.marketplace_order_charges(order_id, charge_type);
create index if not exists idx_marketplace_import_runs_account_started
  on public.marketplace_import_runs(marketplace_account_id, started_at desc);

alter table public.marketplace_orders enable row level security;
alter table public.marketplace_order_items enable row level security;
alter table public.marketplace_order_charges enable row level security;
alter table public.marketplace_import_runs enable row level security;

revoke all on public.marketplace_orders from anon, authenticated;
revoke all on public.marketplace_order_items from anon, authenticated;
revoke all on public.marketplace_order_charges from anon, authenticated;
revoke all on public.marketplace_import_runs from anon, authenticated;
grant select on public.marketplace_orders to authenticated;
grant select on public.marketplace_order_items to authenticated;
grant select on public.marketplace_order_charges to authenticated;
grant select on public.marketplace_import_runs to authenticated;
grant select, insert, update, delete on public.marketplace_orders to service_role;
grant select, insert, update, delete on public.marketplace_order_items to service_role;
grant select, insert, update, delete on public.marketplace_order_charges to service_role;
grant select, insert, update, delete on public.marketplace_import_runs to service_role;

create policy marketplace_orders_company_select
on public.marketplace_orders for select to authenticated
using (company_id = (select public.fn_current_company_id()));

create policy marketplace_order_items_company_select
on public.marketplace_order_items for select to authenticated
using (order_id in (
  select id from public.marketplace_orders
  where company_id = (select public.fn_current_company_id())
));

create policy marketplace_order_charges_company_select
on public.marketplace_order_charges for select to authenticated
using (order_id in (
  select id from public.marketplace_orders
  where company_id = (select public.fn_current_company_id())
));

create policy marketplace_import_runs_company_select
on public.marketplace_import_runs for select to authenticated
using (company_id = (select public.fn_current_company_id()));

create or replace function public.fn_import_marketplace_order(
  p_marketplace_account_id uuid,
  p_order jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_role text;
  v_platform_id uuid;
  v_order_id uuid;
  v_external_order_id text;
  v_ordered_at timestamptz;
  v_source_kind text;
  v_item jsonb;
  v_charge jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_listing_id uuid;
  v_line_key text;
begin
  if v_user_id is null then raise exception 'Não autenticado'; end if;
  select u.company_id, u.role into v_company_id, v_role
  from public.users u where u.id = v_user_id;
  if v_company_id is null then raise exception 'Usuário sem empresa vinculada'; end if;
  if v_role not in ('company_admin','super_admin') then
    raise exception 'Somente administradores podem importar pedidos';
  end if;

  select a.platform_id into v_platform_id
  from public.marketplace_accounts a
  where a.id = p_marketplace_account_id
    and a.company_id = v_company_id
    and a.active;
  if v_platform_id is null then raise exception 'Conta de marketplace inválida'; end if;

  v_external_order_id := nullif(trim(p_order->>'external_order_id'), '');
  v_ordered_at := nullif(p_order->>'ordered_at', '')::timestamptz;
  v_source_kind := coalesce(nullif(p_order->>'source_kind',''), 'manual');
  if v_external_order_id is null or v_ordered_at is null then
    raise exception 'external_order_id e ordered_at são obrigatórios';
  end if;
  if v_source_kind not in ('api','csv','manual','webhook') then
    raise exception 'source_kind inválido';
  end if;

  insert into public.marketplace_orders (
    company_id, platform_id, marketplace_account_id, external_order_id,
    ordered_at, status, currency, item_revenue, shipping_revenue,
    seller_discount, marketplace_discount, buyer_paid_total, source_kind,
    source_metadata, imported_at, updated_at
  ) values (
    v_company_id, v_platform_id, p_marketplace_account_id, v_external_order_id,
    v_ordered_at, nullif(p_order->>'status',''), coalesce(nullif(p_order->>'currency',''),'BRL'),
    coalesce(nullif(p_order->>'item_revenue','')::numeric,0),
    coalesce(nullif(p_order->>'shipping_revenue','')::numeric,0),
    coalesce(nullif(p_order->>'seller_discount','')::numeric,0),
    coalesce(nullif(p_order->>'marketplace_discount','')::numeric,0),
    nullif(p_order->>'buyer_paid_total','')::numeric,
    v_source_kind, coalesce(p_order->'source_metadata','{}'::jsonb), now(), now()
  )
  on conflict (marketplace_account_id, external_order_id) do update set
    ordered_at = excluded.ordered_at,
    status = excluded.status,
    currency = excluded.currency,
    item_revenue = excluded.item_revenue,
    shipping_revenue = excluded.shipping_revenue,
    seller_discount = excluded.seller_discount,
    marketplace_discount = excluded.marketplace_discount,
    buyer_paid_total = excluded.buyer_paid_total,
    source_kind = excluded.source_kind,
    source_metadata = excluded.source_metadata,
    imported_at = now(),
    updated_at = now()
  returning id into v_order_id;

  delete from public.marketplace_order_charges where order_id = v_order_id;
  delete from public.marketplace_order_items where order_id = v_order_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_order->'items','[]'::jsonb))
  loop
    v_line_key := coalesce(
      nullif(trim(v_item->>'line_key'),''),
      nullif(trim(v_item->>'external_item_id'),''),
      nullif(trim(v_item->>'sku'),''),
      gen_random_uuid()::text
    );
    v_product_id := null;
    v_listing_id := null;

    if nullif(trim(v_item->>'sku'),'') is not null then
      select p.id into v_product_id
      from public.products p
      where p.company_id = v_company_id
        and lower(p.sku) = lower(trim(v_item->>'sku'))
      limit 1;
    end if;

    if v_product_id is not null then
      select pl.id into v_listing_id
      from public.product_listings pl
      where pl.product_id = v_product_id
        and pl.marketplace_account_id = p_marketplace_account_id
      limit 1;
    end if;

    insert into public.marketplace_order_items (
      order_id, line_key, external_item_id, sku, title, quantity, unit_price,
      item_revenue, shipping_revenue, seller_discount, marketplace_discount,
      product_id, product_listing_id, cost_snapshot
    )
    select
      v_order_id, v_line_key, nullif(v_item->>'external_item_id',''),
      nullif(trim(v_item->>'sku'),''), nullif(v_item->>'title',''),
      coalesce(nullif(v_item->>'quantity','')::numeric,1),
      coalesce(nullif(v_item->>'unit_price','')::numeric,0),
      coalesce(nullif(v_item->>'item_revenue','')::numeric,0),
      coalesce(nullif(v_item->>'shipping_revenue','')::numeric,0),
      coalesce(nullif(v_item->>'seller_discount','')::numeric,0),
      coalesce(nullif(v_item->>'marketplace_discount','')::numeric,0),
      v_product_id, v_listing_id, p.cost_price
    from (select cost_price from public.products where id = v_product_id) p
    union all
    select
      v_order_id, v_line_key, nullif(v_item->>'external_item_id',''),
      nullif(trim(v_item->>'sku'),''), nullif(v_item->>'title',''),
      coalesce(nullif(v_item->>'quantity','')::numeric,1),
      coalesce(nullif(v_item->>'unit_price','')::numeric,0),
      coalesce(nullif(v_item->>'item_revenue','')::numeric,0),
      coalesce(nullif(v_item->>'shipping_revenue','')::numeric,0),
      coalesce(nullif(v_item->>'seller_discount','')::numeric,0),
      coalesce(nullif(v_item->>'marketplace_discount','')::numeric,0),
      null, null, null
    where v_product_id is null
    returning id into v_item_id;
  end loop;

  for v_charge in select value from jsonb_array_elements(coalesce(p_order->'charges','[]'::jsonb))
  loop
    v_item_id := null;
    if nullif(trim(v_charge->>'line_key'),'') is not null then
      select oi.id into v_item_id
      from public.marketplace_order_items oi
      where oi.order_id = v_order_id and oi.line_key = trim(v_charge->>'line_key')
      limit 1;
    end if;

    insert into public.marketplace_order_charges (
      order_id, order_item_id, external_charge_id, charge_type, direction,
      amount, label, occurred_at, metadata
    ) values (
      v_order_id, v_item_id, nullif(v_charge->>'external_charge_id',''),
      coalesce(nullif(v_charge->>'charge_type',''),'other'),
      coalesce(nullif(v_charge->>'direction',''),'debit'),
      coalesce(nullif(v_charge->>'amount','')::numeric,0),
      nullif(v_charge->>'label',''), nullif(v_charge->>'occurred_at','')::timestamptz,
      coalesce(v_charge->'metadata','{}'::jsonb)
    );
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.fn_import_marketplace_order(uuid,jsonb) from public, anon;
grant execute on function public.fn_import_marketplace_order(uuid,jsonb) to authenticated;
