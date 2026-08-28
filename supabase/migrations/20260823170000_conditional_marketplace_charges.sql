alter table public.product_listings
  add column if not exists program_config jsonb not null default '{}'::jsonb;

comment on column public.product_listings.program_config is
  'Estado de programas/condições por anúncio, ex.: {"tiktok_shipping_fee_program":"enrolled"}. Valores desconhecidos não devem ser cobrados automaticamente.';

update public.platform_fee_rules r
set calculation_config = coalesce(r.calculation_config, '{}'::jsonb) || jsonb_build_object(
  'additional_charges', jsonb_build_array(
    jsonb_build_object(
      'code', 'tiktok_shipping_fee_program',
      'name', 'Programa de Taxas de Envio TikTok',
      'calc_type', 'percentage',
      'value', 6,
      'basis', 'sale_price',
      'cap_amount', 50,
      'condition', jsonb_build_object(
        'program_key', 'tiktok_shipping_fee_program',
        'equals', 'enrolled'
      ),
      'unknown_message', 'Confirme se a conta/anúncio participa do Programa de Taxas de Envio do TikTok. O custo de 6% com teto de R$50 não foi aplicado enquanto o status estiver desconhecido.'
    )
  )
)
where r.platform_id = (select id from public.platforms where name = 'TikTok Shop')
  and r.valid_to is null;

update public.platform_fee_rules r
set calculation_config = coalesce(r.calculation_config, '{}'::jsonb) || jsonb_build_object(
  'fixed_fee_override', jsonb_build_object(
    'type', 'percentage_of_sale_price_below',
    'threshold', 8,
    'percentage', 50,
    'name', 'Adicional por item Shopee abaixo de R$8'
  )
)
where r.platform_id = (select id from public.platforms where name = 'Shopee')
  and r.valid_to is null;
