do $$
declare
  v_platform_id uuid;
  v_source_url text := 'https://venda.amazon.com.br/precos';
begin
  select id into v_platform_id from public.platforms where name = 'Amazon' limit 1;
  if v_platform_id is null then
    raise exception 'Marketplace Amazon não encontrado';
  end if;

  insert into public.marketplace_categories (
    platform_id, parent_id, canonical_key, external_category_id, name, is_leaf,
    active, source_kind, confidence_status, source_url, metadata
  )
  select
    v_platform_id, null, v.canonical_key, null, v.name, true,
    true, 'official', 'confirmed', v_source_url,
    jsonb_build_object('amazon_referral_fee_category', true, 'verified_at', '2026-08-24')
  from (values
    ('comidas-e-bebidas','Comidas e bebidas'),
    ('eletrodomesticos-linha-branca','Eletrodomésticos de linha branca'),
    ('saude-cuidados-pessoais','Saúde e cuidados pessoais'),
    ('bebidas-alcoolicas','Bebidas alcoólicas'),
    ('pneus-e-rodas','Pneus e rodas'),
    ('industria-e-ciencia','Indústria e Ciência'),
    ('produtos-para-bebes','Produtos para bebês'),
    ('produtos-para-animais','Produtos para animais de estimação'),
    ('eletroportateis-cuidado-pessoal','Eletroportáteis de cuidado pessoal'),
    ('cozinha','Cozinha'),
    ('jardim-e-piscina','Jardim e Piscina'),
    ('brinquedos-e-jogos','Brinquedos e jogos'),
    ('tv-audio-cinema-casa','TV, áudio e cinema em casa'),
    ('pc','PC'),
    ('eletronicos-portateis','Eletrônicos portáteis'),
    ('pecas-acessorios-automotivos','Peças e acessórios automotivos'),
    ('casa','Casa'),
    ('beleza','Beleza'),
    ('beleza-de-luxo','Beleza de luxo'),
    ('celulares','Celulares'),
    ('camera-e-fotografia','Câmera e fotografia'),
    ('videogames-e-consoles','Videogames e consoles'),
    ('esportes-aventura-lazer','Esportes, aventura e lazer'),
    ('ferramentas-e-construcao','Ferramentas e Construção'),
    ('papelaria-e-escritorio','Papelaria e Escritório'),
    ('bagagem-acessorios-viagem','Bagagem e acessórios de viagem'),
    ('roupas-e-acessorios','Roupas e acessórios'),
    ('calcados-bolsas-oculos','Calçados, bolsas e óculos escuros'),
    ('relogios','Relógios'),
    ('joias','Joias'),
    ('livros','Livros'),
    ('acessorios-eletronicos-pc','Acessórios para eletrônicos e para PC'),
    ('moveis','Móveis'),
    ('video-e-dvd','Vídeo e DVD'),
    ('musica-cds-lps','Música (CDs, LPs etc)'),
    ('instrumentos-musicais-acessorios','Instrumentos musicais e acessórios'),
    ('demais-categorias','Demais categorias')
  ) as v(canonical_key,name)
  on conflict (platform_id, canonical_key) do update
    set name = excluded.name,
        is_leaf = true,
        active = true,
        source_kind = 'official',
        confidence_status = 'confirmed',
        source_url = excluded.source_url,
        metadata = public.marketplace_categories.metadata || excluded.metadata,
        updated_at = now();

  insert into public.platform_fee_rules (
    platform_id, marketplace_category_id, category_scope, category,
    price_min, price_max, commission_pct, fixed_fee,
    valid_from, valid_to, source_url, listing_type, reputation_level,
    source_kind, confidence_status, calculation_config, account_type
  )
  select
    v_platform_id,
    c.id,
    'exact',
    null,
    0,
    null,
    r.commission_pct,
    0,
    date '2025-01-20',
    null,
    v_source_url,
    null,
    'padrao',
    'official',
    'confirmed',
    jsonb_strip_nulls(jsonb_build_object(
      'commission_basis', 'sale_price_plus_shipping_revenue',
      'minimum_commission', r.minimum_commission,
      'progressive_commission', r.progressive_config,
      'required_profile_fields', jsonb_build_array(jsonb_build_object(
        'key','amazon_selling_plan',
        'allowed',jsonb_build_array('individual','professional'),
        'message','Informe se a conta Amazon usa o Plano Individual ou Profissional.'
      )),
      'additional_charges', jsonb_build_array(jsonb_build_object(
        'code','amazon_individual_per_item',
        'name','Plano Individual — tarifa por item',
        'calc_type','fixed',
        'value',2,
        'basis','sale_price',
        'condition',jsonb_build_object('program_key','amazon_selling_plan','equals','individual')
      )),
      'source_note','Comissões oficiais Amazon Brasil. Plano Profissional possui mensalidade e ela não é rateada automaticamente por SKU.'
    )),
    null
  from (values
    ('comidas-e-bebidas',10::numeric,1::numeric,null::jsonb),
    ('eletrodomesticos-linha-branca',11,1,null),
    ('saude-cuidados-pessoais',12,1,null),
    ('bebidas-alcoolicas',11,1,null),
    ('pneus-e-rodas',10,1,null),
    ('industria-e-ciencia',12,1,null),
    ('produtos-para-bebes',12,2,null),
    ('produtos-para-animais',12,2,null),
    ('eletroportateis-cuidado-pessoal',12,2,null),
    ('cozinha',12,2,null),
    ('jardim-e-piscina',12,2,null),
    ('brinquedos-e-jogos',12,2,null),
    ('tv-audio-cinema-casa',10,2,null),
    ('pc',12,2,null),
    ('eletronicos-portateis',13,2,null),
    ('pecas-acessorios-automotivos',12,2,null),
    ('casa',12,2,null),
    ('beleza',13,2,null),
    ('beleza-de-luxo',14,2,null),
    ('celulares',11,2,null),
    ('camera-e-fotografia',11,2,null),
    ('videogames-e-consoles',11,2,null),
    ('esportes-aventura-lazer',12,2,null),
    ('ferramentas-e-construcao',11,2,null),
    ('papelaria-e-escritorio',13,2,null),
    ('bagagem-acessorios-viagem',14,2,null),
    ('roupas-e-acessorios',14,2,null),
    ('calcados-bolsas-oculos',14,2,null),
    ('relogios',13,2,null),
    ('joias',14,2,null),
    ('livros',15,2,null),
    ('acessorios-eletronicos-pc',15,2,'{"threshold":100,"base_pct":15,"excess_pct":10}'::jsonb),
    ('moveis',15,2,'{"threshold":200,"base_pct":15,"excess_pct":10}'::jsonb),
    ('video-e-dvd',15,2,null),
    ('musica-cds-lps',15,2,null),
    ('instrumentos-musicais-acessorios',12,2,null),
    ('demais-categorias',15,2,null)
  ) as r(canonical_key,commission_pct,minimum_commission,progressive_config)
  join public.marketplace_categories c
    on c.platform_id = v_platform_id and c.canonical_key = r.canonical_key
  where not exists (
    select 1 from public.platform_fee_rules existing
    where existing.platform_id = v_platform_id
      and existing.marketplace_category_id = c.id
      and existing.valid_from = date '2025-01-20'
      and existing.source_kind = 'official'
      and existing.confidence_status = 'confirmed'
  );
end $$;
