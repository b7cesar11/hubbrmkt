-- MargemHub - Schema Multi-tenant Versionado
-- Versão: 1.0 - Julho/2026
-- Banco: PostgreSQL (Supabase)

-- ============================================
-- EXTENSÕES
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TIPOS ENUMERADOS
-- ============================================
CREATE TYPE platform_type AS ENUM (
    'mercadolivre',
    'shopee',
    'amazon',
    'magalu',
    'tiktokshop',
    'ecommerce_proprio'
);

CREATE TYPE ad_type AS ENUM (
    'classico',
    'premium',
    'full',
    'padrao',
    'impulsionado'
);

CREATE TYPE user_role AS ENUM (
    'super_admin',
    'company_admin',
    'manager',
    'viewer'
);

-- ============================================
-- TABELA DE EMPRESAS (TENANTS)
-- ============================================
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18),
    plan_type VARCHAR(50) DEFAULT 'starter', -- starter, pro, enterprise
    max_skus INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_companies_active ON companies(is_active);

-- ============================================
-- TABELA DE USUÁRIOS (VINCULADA AO SUPABASE AUTH)
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_id UUID UNIQUE NOT NULL, -- Referência ao auth.users do Supabase
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'manager',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    
    CONSTRAINT unique_user_company_email UNIQUE (company_id, email)
);

CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- MOTOR DE REGRAS VERSIONADAS (CORE DO SISTEMA)
-- ============================================
CREATE TABLE platform_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Identificação da regra
    platform platform_type NOT NULL,
    category VARCHAR(100) NOT NULL, -- Categoria do produto no marketplace
    ad_type ad_type NOT NULL,
    
    -- Faixa de preço aplicável
    price_range_from DECIMAL(12,2) DEFAULT 0,
    price_range_to DECIMAL(12,2), -- NULL = sem limite superior
    
    -- Taxas
    commission_percent DECIMAL(5,2) NOT NULL DEFAULT 0, -- Ex: 12.50 = 12.5%
    fixed_fee DECIMAL(10,2) DEFAULT 0, -- Taxa fixa em R$
    
    -- Vigência (CRÍTICO PARA VERSIONAMENTO)
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE, -- NULL = vigente até nova regra
    is_current BOOLEAN DEFAULT true,
    
    -- Metadados
    source_url TEXT, -- Link do comunicado oficial do marketplace
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Garante que não haja sobreposição de vigência para mesma regra
    CONSTRAINT no_overlapping_dates EXCLUDE USING gist (
        platform WITH =,
        category WITH =,
        ad_type WITH =,
        COALESCE(price_range_from, 0) WITH =,
        COALESCE(price_range_to, 999999999) WITH =,
        daterange(valid_from, COALESCE(valid_to, '9999-12-31')) WITH &&
    ) WHERE (is_current = true)
);

CREATE INDEX idx_platform_rules_company ON platform_rules(company_id);
CREATE INDEX idx_platform_rules_platform ON platform_rules(platform);
CREATE INDEX idx_platform_rules_category ON platform_rules(category);
CREATE INDEX idx_platform_rules_current ON platform_rules(is_current);
CREATE INDEX idx_platform_rules_validity ON platform_rules(valid_from, valid_to);

-- ============================================
-- CADASTRO DE PRODUTOS (SKUs)
-- ============================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Identificação
    sku_internal VARCHAR(100) NOT NULL,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    
    -- Custo e dimensões
    cost_price DECIMAL(12,2) NOT NULL, -- CMV (Custo da Mercadoria Vendida)
    weight_kg DECIMAL(8,3) DEFAULT 0,
    length_cm DECIMAL(8,2) DEFAULT 0,
    width_cm DECIMAL(8,2) DEFAULT 0,
    height_cm DECIMAL(8,2) DEFAULT 0,
    
    -- Imagem
    image_url TEXT,
    
    -- Fornecedor
    supplier_name VARCHAR(255),
    supplier_cost DECIMAL(12,2),
    
    -- Controle
    stock_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    
    CONSTRAINT unique_sku_per_company UNIQUE (company_id, sku_internal)
);

CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_sku ON products(company_id, sku_internal);
CREATE INDEX idx_products_category ON products(company_id, category);
CREATE INDEX idx_products_active ON products(company_id, is_active);

-- ============================================
-- HISTÓRICO DE ALTERAÇÃO DE CUSTO
-- ============================================
CREATE TABLE product_cost_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    old_cost DECIMAL(12,2),
    new_cost DECIMAL(12,2) NOT NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    changed_by UUID REFERENCES users(id),
    reason TEXT -- Motivo da alteração (ex: "reajuste fornecedor", "nova cotação")
);

CREATE INDEX idx_cost_history_product ON product_cost_history(product_id);
CREATE INDEX idx_cost_history_company ON product_cost_history(company_id);
CREATE INDEX idx_cost_history_date ON product_cost_history(changed_at);

-- ============================================
-- VÍNCULO DE PRODUTO COM ANÚNCIOS POR PLATAFORMA
-- ============================================
CREATE TABLE product_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    
    platform platform_type NOT NULL,
    platform_listing_id VARCHAR(255) NOT NULL, -- ID do anúncio na plataforma
    listing_name VARCHAR(500), -- Nome do anúncio na plataforma (pode diferir do produto)
    
    -- Preço de venda na plataforma
    sale_price DECIMAL(12,2) NOT NULL,
    
    -- Configurações específicas
    ad_type ad_type DEFAULT 'padrao',
    shipping_cost DECIMAL(10,2) DEFAULT 0, -- Custo de frete por conta do vendedor
    free_shipping_enabled BOOLEAN DEFAULT false,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    last_synced_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_listing_per_platform UNIQUE (product_id, platform, platform_listing_id)
);

CREATE INDEX idx_listings_product ON product_listings(product_id);
CREATE INDEX idx_listings_company ON product_listings(company_id);
CREATE INDEX idx_listings_platform ON product_listings(company_id, platform);
CREATE INDEX idx_listings_active ON product_listings(company_id, is_active);

-- ============================================
-- CÁLCULOS DE MARGEM (SNAPSHOT + CÁLCULO EM TEMPO REAL)
-- ============================================
CREATE TABLE margin_calculations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES product_listings(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES platform_rules(id),
    
    -- Dados do cálculo
    sale_price DECIMAL(12,2) NOT NULL,
    cost_price DECIMAL(12,2) NOT NULL,
    
    -- Taxas aplicadas
    platform_commission_percent DECIMAL(5,2),
    platform_commission_value DECIMAL(10,2),
    platform_fixed_fee DECIMAL(10,2),
    shipping_cost DECIMAL(10,2) DEFAULT 0,
    
    -- Totais
    total_fees DECIMAL(10,2), -- Soma de todas as taxas
    gross_margin DECIMAL(10,2), -- Margem bruta em R$
    gross_margin_percent DECIMAL(5,2), -- Margem bruta em %
    
    -- Timestamp da regra usada
    rule_valid_from DATE,
    
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Para recálculos em massa quando uma regra muda
    is_outdated BOOLEAN DEFAULT false
);

CREATE INDEX idx_margin_calc_company ON margin_calculations(company_id);
CREATE INDEX idx_margin_calc_product ON margin_calculations(product_id);
CREATE INDEX idx_margin_calc_listing ON margin_calculations(listing_id);
CREATE INDEX idx_margin_calc_outdated ON margin_calculations(company_id, is_outdated);
CREATE INDEX idx_margin_calc_date ON margin_calculations(calculated_at);

-- ============================================
-- LOG DE AUDITORIA
-- ============================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, etc.
    table_name VARCHAR(100) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_company ON audit_log(company_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_table ON audit_log(table_name);
CREATE INDEX idx_audit_date ON audit_log(created_at);

-- ============================================
-- TRIGGERS PARA ATUALIZAÇÃO AUTOMÁTICA DE updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_platform_rules_updated_at
    BEFORE UPDATE ON platform_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_product_listings_updated_at
    BEFORE UPDATE ON product_listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TRIGGER PARA HISTÓRICO DE CUSTO
-- ============================================
CREATE OR REPLACE FUNCTION track_cost_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.cost_price IS DISTINCT FROM NEW.cost_price THEN
        INSERT INTO product_cost_history (
            product_id,
            company_id,
            old_cost,
            new_cost,
            changed_by
        ) VALUES (
            NEW.id,
            NEW.company_id,
            OLD.cost_price,
            NEW.cost_price,
            NEW.created_by -- ou pegar do contexto da sessão
        );
        
        -- Marcar cálculos de margem como desatualizados para recálculo
        UPDATE margin_calculations
        SET is_outdated = true
        WHERE product_id = NEW.id AND is_outdated = false;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_cost_change
    AFTER UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION track_cost_changes();

-- ============================================
-- ROW LEVEL SECURITY (RLS) - EXEMPLOS
-- ============================================
-- Habilitar RLS em todas as tabelas sensíveis
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_cost_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE margin_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Política: Usuários só veem dados da própria empresa
-- Nota: Isso assume que o JWT do Supabase Auth tem um claim 'company_id'
-- Ajuste conforme sua configuração de autenticação

CREATE POLICY company_isolation_policy ON products
    FOR ALL
    USING (company_id = current_setting('app.current_company_id', true)::UUID);

CREATE POLICY company_isolation_policy ON product_listings
    FOR ALL
    USING (company_id = current_setting('app.current_company_id', true)::UUID);

CREATE POLICY company_isolation_policy ON platform_rules
    FOR ALL
    USING (company_id = current_setting('app.current_company_id', true)::UUID);

CREATE POLICY company_isolation_policy ON margin_calculations
    FOR ALL
    USING (company_id = current_setting('app.current_company_id', true)::UUID);

CREATE POLICY company_isolation_policy ON users
    FOR ALL
    USING (company_id = current_setting('app.current_company_id', true)::UUID);

-- Super admin pode ver tudo (configurar via role do Postgres ou claim especial)
-- Isso é um exemplo - ajuste conforme necessidade

-- ============================================
-- FUNÇÃO PARA RECÁLCULO EM MASSA DE MARGENS
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_margins_for_company(p_company_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_listing RECORD;
    v_rule platform_rules%ROWTYPE;
    v_product products%ROWTYPE;
    v_commission_value DECIMAL(10,2);
    v_total_fees DECIMAL(10,2);
    v_gross_margin DECIMAL(10,2);
    v_gross_margin_percent DECIMAL(5,2);
BEGIN
    -- Loop por todos os listings ativos da empresa
    FOR v_listing IN 
        SELECT pl.*, p.cost_price 
        FROM product_listings pl
        JOIN products p ON p.id = pl.product_id
        WHERE pl.company_id = p_company_id 
          AND pl.is_active = true
          AND p.is_active = true
    LOOP
        -- Buscar regra vigente para este listing
        SELECT * INTO v_rule
        FROM platform_rules
        WHERE company_id = p_company_id
          AND platform = v_listing.platform
          AND category = (SELECT category FROM products WHERE id = v_listing.product_id)
          AND ad_type = v_listing.ad_type
          AND v_listing.sale_price BETWEEN COALESCE(price_range_from, 0) AND COALESCE(price_range_to, 999999999)
          AND valid_from <= CURRENT_DATE
          AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
          AND is_current = true
        ORDER BY valid_from DESC
        LIMIT 1;
        
        -- Calcular margem
        IF FOUND THEN
            v_commission_value := (v_listing.sale_price * v_rule.commission_percent) / 100;
            v_total_fees := v_commission_value + v_rule.fixed_fee + v_listing.shipping_cost;
            v_gross_margin := v_listing.sale_price - v_listing.cost_price - v_total_fees;
            v_gross_margin_percent := (v_gross_margin / v_listing.sale_price) * 100;
            
            -- Inserir/atualizar cálculo
            INSERT INTO margin_calculations (
                company_id, product_id, listing_id, rule_id,
                sale_price, cost_price,
                platform_commission_percent, platform_commission_value,
                platform_fixed_fee, shipping_cost,
                total_fees, gross_margin, gross_margin_percent,
                rule_valid_from, is_outdated
            ) VALUES (
                p_company_id, v_listing.product_id, v_listing.id, v_rule.id,
                v_listing.sale_price, v_listing.cost_price,
                v_rule.commission_percent, v_commission_value,
                v_rule.fixed_fee, v_listing.shipping_cost,
                v_total_fees, v_gross_margin, v_gross_margin_percent,
                v_rule.valid_from, false
            )
            ON CONFLICT (listing_id) DO UPDATE SET
                sale_price = EXCLUDED.sale_price,
                cost_price = EXCLUDED.cost_price,
                platform_commission_percent = EXCLUDED.platform_commission_percent,
                platform_commission_value = EXCLUDED.platform_commission_value,
                platform_fixed_fee = EXCLUDED.platform_fixed_fee,
                shipping_cost = EXCLUDED.shipping_cost,
                total_fees = EXCLUDED.total_fees,
                gross_margin = EXCLUDED.gross_margin,
                gross_margin_percent = EXCLUDED.gross_margin_percent,
                rule_valid_from = EXCLUDED.rule_valid_from,
                is_outdated = false,
                calculated_at = NOW();
            
            v_count := v_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DADOS INICIAIS DE EXEMPLO (REGRAS BASE 2026)
-- ============================================
-- Estes são exemplos baseados nas taxas médias de mercado em Julho/2026
-- Devem ser atualizados pela equipe Super Admin conforme mudanças oficiais

-- NOTA: Inserir regras requer company_id válido
-- Este bloco é apenas ilustrativo da estrutura

COMMENT ON TABLE platform_rules IS 'Regras de taxas versionadas por plataforma - CORE do sistema';
COMMENT ON COLUMN platform_rules.valid_from IS 'Data de início da vigência desta regra';
COMMENT ON COLUMN platform_rules.valid_to IS 'Data de fim da vigência (NULL = vigente até substituição)';
COMMENT ON COLUMN platform_rules.is_current IS 'Indica se esta é a regra ativa atual';
COMMENT ON COLUMN platform_rules.source_url IS 'Link do comunicado oficial do marketplace - crítico para auditoria';

COMMENT ON TABLE products IS 'Cadastro de produtos/SKUs internos';
COMMENT ON COLUMN products.cost_price IS 'CMV - Custo da Mercadoria Vendida';

COMMENT ON TABLE product_listings IS 'Vínculo entre produto interno e anúncios em cada plataforma';

COMMENT ON TABLE margin_calculations IS 'Snapshots de cálculos de margem + indicador de desatualização';
