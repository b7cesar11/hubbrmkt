update public.platform_fee_rules
set source_url = 'ESTIMATIVA — ' || source_url
where confidence_status = 'estimate'
  and source_url is not null
  and upper(source_url) not like '%ESTIMATIVA%';

comment on column public.platform_fee_rules.confidence_status is
  'Fonte canônica para confiança da regra. UIs devem usar este campo; prefixos em source_url existem apenas para compatibilidade com componentes legados.';
