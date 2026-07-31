-- MargemHub - Seed de Regras Base 2026
-- Dados iniciais de exemplo para as principais plataformas
-- ATENÇÃO: Estas são taxas estimadas baseadas em Julho/2026
-- Devem ser validadas e atualizadas pela equipe Super Admin

-- Para usar, execute após o schema inicial:
-- 1. Crie uma empresa de teste primeiro
-- 2. Substitua {{COMPANY_ID}} pelo UUID real da empresa

-- ============================================
-- EXEMPLO DE INSERÇÃO (substitua o company_id)
-- ============================================

-- Mercado Livre - Eletrônicos > R$ 79
-- INSERT INTO platform_rules (
--     company_id, platform, category, ad_type,
--     price_range_from, price_range_to,
--     commission_percent, fixed_fee,
--     valid_from, source_url, notes
-- ) VALUES (
--     '{{COMPANY_ID}}'::UUID,
--     'mercadolivre',
--     'eletronicos',
--     'classico',
--     79.00, NULL,
--     16.00, 6.00,
--     '2026-03-01',
--     'https://www.mercadolivre.com.br/ajuda/custos-venda',
--     'Taxa vigente desde Março/2026 - Clássico acima de R$79'
-- );

-- ============================================
-- TABELA DE REFERÊNCIA RÁPIDA - TAXAS MÉDIAS 2026
-- ============================================

/*
MERCADO LIVRE (atualizado Março/2026):
- Clássico: 12% até R$79 + R$6 fixo | 16% acima de R$79 + R$6 fixo
- Premium: 18% + R$6 fixo (todas as faixas)
- Full: 24% + R$6 fixo (todas as faixas)

SHOPEE (atualizado Março/2026):
- Padrão: 14% + R$3 fixo (produtos < R$50)
- Padrão: 12% + R$3 fixo (produtos >= R$50)
- Impulsionado: +4% sobre a taxa padrão
- Conta nova: isenção 3 meses (cadastrar como promoção separada)

AMAZON (atualizado Janeiro/2026):
- Categoria geral: 8-15% dependendo da categoria
- Produtos < R$50: taxa reduzida em algumas categorias
- Fulfillment by Amazon (FBA): taxas adicionais de armazenamento/logística

MAGALU (atualizado Fevereiro/2026):
- Marketplace padrão: 12-20% dependendo da categoria
- Taxa fixa: R$2-5 por venda
- Magalu Entregador: taxa adicional variável

TIKTOK SHOP (atualizado Julho/2026):
- Comissão base: 5-10% dependendo da categoria
- Taxa de transação: 2% + R$1 fixo
- Campanhas promocionais frequentes (isenção temporária comum)

E-COMMERCE PRÓPRIO:
- Sem comissão de plataforma
- Taxas de gateway de pagamento: ~2-4% + fixo
- Considerar custos de marketing separadamente
*/

-- ============================================
-- SCRIPT COMPLETO DE EXEMPLO
-- ============================================
-- Descomente e ajuste o company_id antes de executar

-- WITH seed_company AS (
--     SELECT id FROM companies WHERE name = 'Empresa Demo' LIMIT 1
-- )
-- INSERT INTO platform_rules (
--     company_id, platform, category, ad_type,
--     price_range_from, price_range_to,
--     commission_percent, fixed_fee,
--     valid_from, source_url, notes
-- )
-- SELECT 
--     sc.id,
--     v.platform,
--     v.category,
--     v.ad_type,
--     v.price_range_from,
--     v.price_range_to,
--     v.commission_percent,
--     v.fixed_fee,
--     v.valid_from,
--     v.source_url,
--     v.notes
-- FROM seed_company sc
-- CROSS JOIN (
--     VALUES
--         -- Mercado Livre - Clássico
--         ('mercadolivre', 'eletronicos', 'classico', 0, 79, 12.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico até R$79'),
--         ('mercadolivre', 'eletronicos', 'classico', 79, NULL, 16.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico acima de R$79'),
--         ('mercadolivre', 'eletronicos', 'premium', 0, NULL, 18.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Premium'),
--         ('mercadolivre', 'eletronicos', 'full', 0, NULL, 24.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Full'),
--         
--         -- Shopee - Padrão
--         ('shopee', 'geral', 'padrao', 0, 50, 14.00, 3.00, '2026-03-01', 'https://seller.shopee.com.br/educacao/artigo/taxas', 'Shopee Padrão < R$50'),
--         ('shopee', 'geral', 'padrao', 50, NULL, 12.00, 3.00, '2026-03-01', 'https://seller.shopee.com.br/educacao/artigo/taxas', 'Shopee Padrão >= R$50'),
--         ('shopee', 'geral', 'impulsionado', 0, 50, 18.00, 3.00, '2026-03-01', 'https://seller.shopee.com.br/educacao/artigo/taxas', 'Shopee Impulsionado < R$50'),
--         ('shopee', 'geral', 'impulsionado', 50, NULL, 16.00, 3.00, '2026-03-01', 'https://seller.shopee.com.br/educacao/artigo/taxas', 'Shopee Impulsionado >= R$50'),
--         
--         -- TikTok Shop
--         ('tiktokshop', 'geral', 'padrao', 0, NULL, 8.00, 1.00, '2026-07-01', 'https://www.tiktok.com/seller', 'TikTok Shop base + taxa transação'),
--         
--         -- Amazon (categoria eletrônicos exemplo)
--         ('amazon', 'eletronicos', 'padrao', 0, NULL, 12.00, 0.00, '2026-01-01', 'https://sell.amazon.com.br/precos', 'Amazon Eletrônicos'),
--         ('amazon', 'casa', 'padrao', 0, NULL, 15.00, 0.00, '2026-01-01', 'https://sell.amazon.com.br/precos', 'Amazon Casa e Decoração'),
--         
--         -- Magalu
--         ('magalu', 'geral', 'padrao', 0, NULL, 16.00, 4.00, '2026-02-01', 'https://www.magazineluiza.com.br/venda-aqui', 'Magalu Marketplace'),
--         
--         -- E-commerce próprio (apenas gateway)
--         ('ecommerce_proprio', 'geral', 'padrao', 0, NULL, 3.50, 1.50, '2026-01-01', NULL, 'Gateway de pagamento médio')
-- ) AS v(platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes);

-- ============================================
-- VERIFICAÇÃO PÓS-INSERT
-- ============================================
-- SELECT 
--     platform,
--     category,
--     ad_type,
--     COUNT(*) as total_regras,
--     SUM(CASE WHEN is_current THEN 1 ELSE 0 END) as regras_ativas
-- FROM platform_rules
-- GROUP BY platform, category, ad_type
-- ORDER BY platform, category;
