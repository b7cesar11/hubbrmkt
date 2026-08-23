-- Fee corrections validated against the Aug/2026 research pack.

update public.platform_fee_rules r
set commission_pct = 10.00,
    fixed_fee = 4.00,
    source_kind = 'official',
    confidence_status = 'confirmed',
    source_url = 'TikTok Shop Seller Center / Seller University — comissão Brasil vigente desde 15/07/2026 (verificado em 18/08/2026)'
where r.platform_id = (select id from public.platforms where name = 'TikTok Shop')
  and r.price_min = 0 and r.price_max = 50 and r.valid_to is null;

update public.platform_fee_rules r
set commission_pct = 6.00,
    fixed_fee = 6.00,
    source_kind = 'official',
    confidence_status = 'confirmed',
    source_url = 'TikTok Shop Seller Center / Seller University — comissão Brasil vigente desde 15/07/2026 (verificado em 18/08/2026)'
where r.platform_id = (select id from public.platforms where name = 'TikTok Shop')
  and r.price_min = 50 and r.price_max is null and r.valid_to is null;

update public.platform_fee_rules r
set source_kind = 'official',
    confidence_status = 'confirmed',
    source_url = 'Shopee Seller Education — tabela oficial de comissão CNPJ verificada em 18/08/2026'
where r.platform_id = (select id from public.platforms where name = 'Shopee')
  and r.valid_to is null;

update public.platform_fee_rules r
set category = null,
    source_kind = 'static',
    confidence_status = 'estimate'
where r.platform_id = (select id from public.platforms where name = 'Amazon')
  and r.category = 'Geral (estimativa)' and r.valid_to is null;

update public.platform_fee_rules r
set category = null,
    source_kind = 'static',
    confidence_status = 'estimate'
where r.platform_id = (select id from public.platforms where name = 'Magalu')
  and r.category = 'Geral (estimativa)' and r.valid_to is null;
