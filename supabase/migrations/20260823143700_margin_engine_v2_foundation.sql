-- MargemHub margin engine v2 foundation

alter table public.product_listings
  add column if not exists platform_category_id text,
  add column if not exists logistic_type text,
  add column if not exists shipping_mode text,
  add column if not exists billable_weight_kg numeric(10,3),
  add column if not exists length_cm numeric(10,2),
  add column if not exists width_cm numeric(10,2),
  add column if not exists height_cm numeric(10,2);

alter table public.cost_components
  add column if not exists calculation_basis text not null default 'sale_price',
  add column if not exists cap_amount numeric(12,4),
  add column if not exists min_amount numeric(12,4),
  add column if not exists calculation_config jsonb not null default '{}'::jsonb;

alter table public.cost_components
  drop constraint if exists cost_components_calculation_basis_check;
alter table public.cost_components
  add constraint cost_components_calculation_basis_check check (
    calculation_basis in ('sale_price','seller_discount_price','actual_paid','affiliate_base','order_total','shipping_amount')
  );

alter table public.cost_components
  drop constraint if exists cost_components_cap_min_check;
alter table public.cost_components
  add constraint cost_components_cap_min_check check (
    (cap_amount is null or cap_amount >= 0) and
    (min_amount is null or min_amount >= 0) and
    (cap_amount is null or min_amount is null or cap_amount >= min_amount)
  );

alter table public.platform_fee_rules
  add column if not exists source_kind text not null default 'static',
  add column if not exists confidence_status text not null default 'estimate',
  add column if not exists calculation_config jsonb not null default '{}'::jsonb;

alter table public.platform_fee_rules
  drop constraint if exists platform_fee_rules_source_kind_check;
alter table public.platform_fee_rules
  add constraint platform_fee_rules_source_kind_check check (source_kind in ('official','api','seller_panel','static','manual'));

alter table public.platform_fee_rules
  drop constraint if exists platform_fee_rules_confidence_status_check;
alter table public.platform_fee_rules
  add constraint platform_fee_rules_confidence_status_check check (confidence_status in ('confirmed','estimate','account_specific','deprecated'));

alter table public.live_fee_cache
  add column if not exists logistic_type text,
  add column if not exists shipping_mode text,
  add column if not exists billable_weight_kg numeric(10,3);

drop index if exists public.live_fee_cache_lookup_uidx;
create unique index live_fee_cache_lookup_uidx
  on public.live_fee_cache (
    company_id, platform_id, category_id, listing_type, price,
    logistic_type, shipping_mode, billable_weight_kg
  ) nulls not distinct;

create index if not exists idx_live_fee_cache_platform on public.live_fee_cache(platform_id);
create index if not exists idx_product_listings_platform on public.product_listings(platform_id);
create index if not exists idx_users_company on public.users(company_id);
create index if not exists idx_product_cost_history_product on public.product_cost_history(product_id);
create index if not exists idx_listing_cost_components_component on public.listing_cost_components(cost_component_id);
create index if not exists idx_category_gaps_resolved_rule on public.category_coverage_gaps(resolved_rule_id);
create index if not exists idx_audit_log_changed_by on public.audit_log(changed_by);
create index if not exists idx_platform_connections_platform on public.platform_connections(platform_id);
create index if not exists idx_fee_rules_created_by on public.platform_fee_rules(created_by);

revoke execute on function public.fn_create_own_company(text) from public, anon;
revoke execute on function public.fn_join_company(uuid) from public, anon;
revoke execute on function public.fn_update_user_role(uuid, text) from public, anon;
revoke execute on function public.get_platform_connections() from public, anon;
grant execute on function public.fn_create_own_company(text) to authenticated;
grant execute on function public.fn_join_company(uuid) to authenticated;
grant execute on function public.fn_update_user_role(uuid, text) to authenticated;
grant execute on function public.get_platform_connections() to authenticated;

comment on column public.cost_components.calculation_basis is 'Base monetaria usada no componente percentual; sale_price e o fallback de projecao.';
comment on column public.cost_components.cap_amount is 'Teto monetario do custo calculado, quando aplicavel.';
comment on column public.cost_components.min_amount is 'Piso monetario do custo calculado, quando aplicavel.';
comment on column public.product_listings.platform_category_id is 'ID de categoria nativo do marketplace (ex.: MLB...).';
