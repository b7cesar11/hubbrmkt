revoke insert, update, delete, truncate, references, trigger on public.marketplace_categories from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.company_category_preferences from authenticated;
grant select on public.marketplace_categories to authenticated;
grant select on public.company_category_preferences to authenticated;

comment on table public.marketplace_categories is 'Taxonomia hierárquica por marketplace. authenticated possui somente SELECT; mutações são feitas por RPC super_admin validado.';
comment on table public.company_category_preferences is 'Memória de classificação da empresa. authenticated possui somente SELECT; atualizações ocorrem dentro do RPC transacional de produto.';
