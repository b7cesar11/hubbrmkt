create index if not exists idx_marketplace_categories_parent_platform
  on public.marketplace_categories(parent_id, platform_id);

create index if not exists idx_company_category_preferences_platform
  on public.company_category_preferences(platform_id);

create index if not exists idx_company_category_preferences_category_platform
  on public.company_category_preferences(marketplace_category_id, platform_id);

create index if not exists idx_platform_fee_rules_category_platform
  on public.platform_fee_rules(marketplace_category_id, platform_id)
  where marketplace_category_id is not null;

create index if not exists idx_product_listings_category_platform
  on public.product_listings(marketplace_category_ref_id, platform_id)
  where marketplace_category_ref_id is not null;
