create index if not exists idx_marketplace_orders_account_identity
  on public.marketplace_orders(marketplace_account_id, company_id, platform_id);
create index if not exists idx_marketplace_orders_platform
  on public.marketplace_orders(platform_id);
create index if not exists idx_marketplace_import_runs_account_identity
  on public.marketplace_import_runs(marketplace_account_id, company_id, platform_id);
create index if not exists idx_marketplace_import_runs_company
  on public.marketplace_import_runs(company_id);
create index if not exists idx_marketplace_import_runs_platform
  on public.marketplace_import_runs(platform_id);
create index if not exists idx_marketplace_order_charges_item
  on public.marketplace_order_charges(order_item_id) where order_item_id is not null;
