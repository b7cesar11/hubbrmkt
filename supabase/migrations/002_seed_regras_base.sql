-- MargemHub - Seed de Regras Base 2026
-- Dados iniciais de exemplo para as principais plataformas
-- ATENÇÃO: Estas são taxas estimadas baseadas em Julho/2026
-- Devem ser validadas e atualizadas pela equipe Super Admin
--
-- STATUS DAS TAXAS:
-- ✅ TikTok Shop: Dados reais confirmados (Julho/2026)
-- ✅ Shopee: Dados reais confirmados (Março/2026)
-- ⚠️ Mercado Livre: Estimativa baseada em fontes públicas (Março/2026)
-- ⚠️ Amazon: Estimativa geral (varia por categoria específica)
-- ⚠️ Magalu: Estimativa geral (varia por categoria específica)
--
-- LACUNAS CONHECIDAS:
-- - Brinquedos no Mercado Livre (categoria core do cliente - needs validation)
-- - Categorias específicas da Amazon (eletrônicos, casa, etc.)
-- - reputation_level não populado (hoje tudo "padrão")
--
-- PARA USAR:
-- 1. Crie uma empresa no Supabase Auth ou via SQL
-- 2. Substitua {{COMPANY_ID}} pelo UUID real da empresa
-- 3. Execute este script no SQL Editor

-- ============================================
-- BLOCO PRINCIPAL DE INSERÇÃO
-- ============================================
-- Descomente e ajuste o company_id antes de executar

DO $$
DECLARE
    v_company_id UUID := '{{COMPANY_ID}}'::UUID; -- <<< SUBSTITUA AQUI
BEGIN
    -- ============================================
    -- MERCADO LIVRE (18 regras - 6 categorias × 3 tipos)
    -- Fonte: https://www.mercadolivre.com.br/ajuda/custos-venda
    -- Status: ⚠️ Estimativa Março/2026
    -- ============================================
    
    -- Categoria: Eletrônicos
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'mercadolivre', 'eletronicos', 'classico', 0, 79, 12.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico até R$79'),
        (v_company_id, 'mercadolivre', 'eletronicos', 'classico', 79, NULL, 16.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico acima de R$79'),
        (v_company_id, 'mercadolivre', 'eletronicos', 'premium', 0, NULL, 18.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Premium');
    
    -- Categoria: Casa e Decoração
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'mercadolivre', 'casa', 'classico', 0, 79, 12.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico até R$79'),
        (v_company_id, 'mercadolivre', 'casa', 'classico', 79, NULL, 16.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico acima de R$79'),
        (v_company_id, 'mercadolivre', 'casa', 'premium', 0, NULL, 18.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Premium');
    
    -- Categoria: Moda
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'mercadolivre', 'moda', 'classico', 0, 79, 12.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico até R$79'),
        (v_company_id, 'mercadolivre', 'moda', 'classico', 79, NULL, 16.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico acima de R$79'),
        (v_company_id, 'mercadolivre', 'moda', 'premium', 0, NULL, 18.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Premium');
    
    -- Categoria: Esportes
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'mercadolivre', 'esportes', 'classico', 0, 79, 12.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico até R$79'),
        (v_company_id, 'mercadolivre', 'esportes', 'classico', 79, NULL, 16.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico acima de R$79'),
        (v_company_id, 'mercadolivre', 'esportes', 'premium', 0, NULL, 18.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Premium');
    
    -- Categoria: Bebês
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'mercadolivre', 'bebes', 'classico', 0, 79, 12.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico até R$79'),
        (v_company_id, 'mercadolivre', 'bebes', 'classico', 79, NULL, 16.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Clássico acima de R$79'),
        (v_company_id, 'mercadolivre', 'bebes', 'premium', 0, NULL, 18.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', 'ML Premium');
    
    -- Categoria: Brinquedos (⚠️ LACUNA - needs validation com dados reais)
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'mercadolivre', 'brinquedos', 'classico', 0, 79, 12.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', '⚠️ LACUNA: Validar com ML - Clássico até R$79'),
        (v_company_id, 'mercadolivre', 'brinquedos', 'classico', 79, NULL, 16.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', '⚠️ LACUNA: Validar com ML - Clássico acima de R$79'),
        (v_company_id, 'mercadolivre', 'brinquedos', 'premium', 0, NULL, 18.00, 6.00, '2026-03-01', 'https://www.mercadolivre.com.br/ajuda/custos-venda', '⚠️ LACUNA: Validar com ML - Premium');
    
    -- ============================================
    -- SHOPEE (4 regras - 2 faixas × 2 tipos)
    -- Fonte: https://seller.shopee.com.br/educacao/artigo/taxas
    -- Status: ✅ Dados reais confirmados Março/2026
    -- ============================================
    
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'shopee', 'geral', 'padrao', 0, 50, 14.00, 3.00, '2026-03-01', 'https://seller.shopee.com.br/educacao/artigo/taxas', 'Shopee Padrão < R$50'),
        (v_company_id, 'shopee', 'geral', 'padrao', 50, NULL, 12.00, 3.00, '2026-03-01', 'https://seller.shopee.com.br/educacao/artigo/taxas', 'Shopee Padrão >= R$50'),
        (v_company_id, 'shopee', 'geral', 'impulsionado', 0, 50, 18.00, 3.00, '2026-03-01', 'https://seller.shopee.com.br/educacao/artigo/taxas', 'Shopee Impulsionado < R$50 (+4%)'),
        (v_company_id, 'shopee', 'geral', 'impulsionado', 50, NULL, 16.00, 3.00, '2026-03-01', 'https://seller.shopee.com.br/educacao/artigo/taxas', 'Shopee Impulsionado >= R$50 (+4%)');
    
    -- ============================================
    -- TIKTOK SHOP (2 regras)
    -- Fonte: https://www.tiktok.com/seller
    -- Status: ✅ Dados reais confirmados Julho/2026
    -- ============================================
    
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'tiktokshop', 'geral', 'padrao', 0, NULL, 8.00, 1.00, '2026-07-01', 'https://www.tiktok.com/seller', 'TikTok Shop base + taxa transação'),
        (v_company_id, 'tiktokshop', 'geral', 'impulsionado', 0, NULL, 12.00, 1.00, '2026-07-01', 'https://www.tiktok.com/seller', 'TikTok Shop impulsionado +4%');
    
    -- ============================================
    -- AMAZON (1 regra geral)
    -- Fonte: https://sell.amazon.com.br/precos
    -- Status: ⚠️ Estimativa geral (varia por categoria específica)
    -- ============================================
    
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'amazon', 'geral', 'padrao', 0, NULL, 12.00, 0.00, '2026-01-01', 'https://sell.amazon.com.br/precos', '⚠️ Estimativa geral - validar categoria específica no Seller Central');
    
    -- ============================================
    -- MAGALU (1 regra geral)
    -- Fonte: https://www.magazineluiza.com.br/venda-aqui
    -- Status: ⚠️ Estimativa geral (varia por categoria específica)
    -- ============================================
    
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'magalu', 'geral', 'padrao', 0, NULL, 16.00, 4.00, '2026-02-01', 'https://www.magazineluiza.com.br/venda-aqui', '⚠️ Estimativa geral - validar categoria específica no painel');
    
    -- ============================================
    -- E-COMMERCE PRÓPRIO (1 regra - gateway)
    -- Status: ✅ Média de mercado
    -- ============================================
    
    INSERT INTO platform_rules (company_id, platform, category, ad_type, price_range_from, price_range_to, commission_percent, fixed_fee, valid_from, source_url, notes)
    VALUES 
        (v_company_id, 'ecommerce_proprio', 'geral', 'padrao', 0, NULL, 3.50, 1.50, '2026-01-01', NULL, 'Gateway de pagamento médio (sem comissão de plataforma)');
END $$;

-- ============================================
-- VERIFICAÇÃO PÓS-INSERT
-- ============================================
-- Executar após o insert para confirmar quantas regras foram criadas

SELECT 
    platform,
    category,
    ad_type,
    COUNT(*) as total_regras,
    SUM(CASE WHEN is_current THEN 1 ELSE 0 END) as regras_ativas,
    STRING_AGG(
        CASE WHEN notes LIKE '%⚠️%' OR notes LIKE '%LACUNA%' THEN notes END, 
        '; '
    ) as lacunas_alertas
FROM platform_rules
WHERE company_id = '{{COMPANY_ID}}'::UUID
GROUP BY platform, category, ad_type
ORDER BY platform, category;

-- ============================================
-- RESUMO EXECUTIVO
-- ============================================
-- Total esperado: 26 regras
-- ✅ TikTok Shop: 2 (confirmadas)
-- ✅ Shopee: 4 (confirmadas)
-- ⚠️ Mercado Livre: 18 (6 categorias × 3 tipos, sendo brinquedos com lacuna)
-- ⚠️ Amazon: 1 (geral, needs category-specific validation)
-- ⚠️ Magalu: 1 (geral, needs category-specific validation)
-- ✅ E-commerce próprio: 1

SELECT 
    'RESUMO GERAL' as relatorio,
    COUNT(*) as total_regras,
    COUNT(DISTINCT platform) as plataformas,
    COUNT(DISTINCT category) as categorias,
    SUM(CASE WHEN notes LIKE '%⚠️%' OR notes LIKE '%LACUNA%' THEN 1 ELSE 0 END) as regras_com_alerta
FROM platform_rules
WHERE company_id = '{{COMPANY_ID}}'::UUID;
