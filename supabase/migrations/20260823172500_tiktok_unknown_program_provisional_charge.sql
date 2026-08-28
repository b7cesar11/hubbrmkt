update public.platform_fee_rules r
set calculation_config = jsonb_set(
  r.calculation_config,
  '{additional_charges,0}',
  (r.calculation_config #> '{additional_charges,0}') || jsonb_build_object(
    'unknown_policy', 'apply',
    'unknown_message', 'Participação no Programa de Taxas de Envio ainda não confirmada. Como o TikTok inclui vendedores automaticamente por padrão, o custo de 6% (teto R$50) foi provisionado até confirmação ou opt-out.'
  )
)
where r.platform_id = (select id from public.platforms where name='TikTok Shop')
  and r.valid_to is null
  and jsonb_typeof(r.calculation_config->'additional_charges') = 'array'
  and jsonb_array_length(r.calculation_config->'additional_charges') > 0;
