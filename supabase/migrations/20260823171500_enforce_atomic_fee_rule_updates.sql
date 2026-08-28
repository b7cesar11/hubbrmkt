revoke update on table public.platform_fee_rules from authenticated;

grant select, insert on table public.platform_fee_rules to authenticated;

comment on function public.fn_version_fee_rule(uuid,numeric,numeric,text,text,text,jsonb) is
  'Único caminho suportado para editar/versionar regras existentes. UPDATE direto da tabela é revogado do frontend.';
