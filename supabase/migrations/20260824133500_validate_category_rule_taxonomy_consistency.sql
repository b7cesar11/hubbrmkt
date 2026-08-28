alter table public.platform_fee_rules
  add constraint platform_fee_rules_category_mode_check
  check (
    marketplace_category_id is null
    or category is null
  );

comment on constraint platform_fee_rules_category_mode_check on public.platform_fee_rules
is 'Regras normalizadas por marketplace_category_id não podem simultaneamente depender do texto legado category.';
