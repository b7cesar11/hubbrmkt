# Guia de Implementação - MargemHub MVP

## Status: Schema Pronto ✅

O schema multi-tenant versionado está completo e pronto para deploy no Supabase.

---

## Passo a Passo - Setup Inicial (30 minutos)

### 1. Criar Projeto Supabase (5 min)

1. Acesse https://supabase.com
2. **New Project**
   - Name: `margemhub-prod` (ou `margemhub-dev` para testes)
   - Database Password: _gerar e salvar no password manager_
   - Region: `us-east-1` (N. Virginia) ou `sa-east-1` (São Paulo)
   - Pricing: Free tier é suficiente para MVP

3. Aguardar provisionamento (~2-3 min)

### 2. Executar Schema (5 min)

1. No dashboard do projeto → **SQL Editor**
2. **New Query**
3. Copiar conteúdo de `/workspace/schema.sql`
4. Colar no editor
5. **Run** (Ctrl+Enter)
6. Verificar mensagem de sucesso (todas as tabelas criadas)

### 3. Configurar Autenticação (5 min)

1. **Authentication** → **Providers**
2. **Email**: já habilitado por padrão
3. **Google** (opcional):
   - Habilitar se quiser SSO
   - Seguir wizard de configuração do Google Cloud
4. **Policies** → Confirmar que RLS está ativo nas tabelas

### 4. Testar com Dados de Exemplo (10 min)

Criar empresa e usuário de teste:

```sql
-- 1. Criar empresa demo
INSERT INTO companies (name, cnpj, plan_type, max_skus)
VALUES ('Empresa Demo LTDA', '00.000.000/0001-00', 'starter', 100)
RETURNING id;

-- 2. Criar usuário admin (substitua {{COMPANY_ID}} pelo UUID retornado acima)
-- NOTA: auth_id deve vir do Supabase Auth após login real
-- Para teste, crie um usuário via Authentication → Add User primeiro
-- Depois vincule:

INSERT INTO users (auth_id, company_id, email, full_name, role)
VALUES (
    '{{AUTH_ID_DO_USUARIO}}'::UUID, -- Pegar do Supabase Auth
    '{{COMPANY_ID}}'::UUID,
    'admin@empresademo.com.br',
    'Admin Demo',
    'company_admin'
);

-- 3. Inserir regras base (copiar do arquivo 002_seed_regras_base.sql)
-- Descomentar e ajustar o company_id antes de executar
```

### 5. Testar Cálculo de Margem (5 min)

```sql
-- Criar produto de exemplo
INSERT INTO products (company_id, sku_internal, name, category, cost_price)
VALUES (
    '{{COMPANY_ID}}'::UUID,
    'TESTE-001',
    'Produto Teste',
    'eletronicos',
    50.00
) RETURNING id;

-- Criar listing em múltiplas plataformas
INSERT INTO product_listings (product_id, company_id, platform, platform_listing_id, sale_price, ad_type)
VALUES
    ('{{PRODUCT_ID}}'::UUID, '{{COMPANY_ID}}'::UUID, 'mercadolivre', 'MLB-123456', 99.90, 'classico'),
    ('{{PRODUCT_ID}}'::UUID, '{{COMPANY_ID}}'::UUID, 'shopee', 'SP-789012', 99.90, 'padrao'),
    ('{{PRODUCT_ID}}'::UUID, '{{COMPANY_ID}}'::UUID, 'tiktokshop', 'TT-345678', 99.90, 'padrao');

-- Recalcular margens
SELECT recalculate_margins_for_company('{{COMPANY_ID}}'::UUID);

-- Ver resultados
SELECT 
    pl.platform,
    pl.sale_price,
    mc.gross_margin,
    mc.gross_margin_percent,
    mc.total_fees
FROM margin_calculations mc
JOIN product_listings pl ON pl.id = mc.listing_id
WHERE mc.company_id = '{{COMPANY_ID}}'::UUID;
```

---

## Estrutura de Diretórios

```
/workspace
├── schema.sql                          # Schema completo (copia em supabase/migrations/)
├── README.md                           # Este guia
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql      # Schema principal
│   │   └── 002_seed_regras_base.sql    # Dados iniciais de exemplo
│   └── functions/                      # Edge Functions (vazio por enquanto)
├── apps/
│   ├── web/                            # Frontend React (a criar)
│   └── api/                            # Backend NestJS (opcional, pode usar Supabase direto)
└── docs/                               # Documentação adicional
```

---

## Decisões de Arquitetura Documentadas

### Multi-tenant desde o Dia 1
✅ **Decisão:** `company_id` em todas as tabelas sensíveis + RLS  
**Motivo:** Retrofitar isso depois é caro e arriscado  
**Custo:** Quase zero no início, economiza semanas de refatoração depois

### Versionamento de Regras
✅ **Decisão:** `valid_from`, `valid_to`, `is_current` + constraint EXCLUDE  
**Motivo:** Taxas mudam frequentemente, precisa de histórico e simulação  
**Diferencial:** É o core competitivo do produto

### MVP Escopo Reduzido
✅ **Inclui:**
- Cadastro de produtos + motor de regras
- Dashboard simples com filtro por plataforma
- Login com isolamento por tenant (1 papel apenas)

⏳ **Deixa para Fase 2:**
- Promoções/incentivos temporários
- Simulador de comissionamento
- Dashboards avançados
- Importação em massa
- RBAC completo

---

## Próximos Passos Imediatos

### Semana 1: Setup + Validação
- [x] Schema criado
- [ ] Supabase configurado com dados reais do cliente
- [ ] Validação dos cálculos com 10-20 SKUs reais

### Semana 2-3: Frontend MVP
- [ ] Setup React + Tailwind + Supabase JS client
- [ ] Tela de login
- [ ] CRUD de produtos (manual, sem importação em massa)
- [ ] CRUD de listings por plataforma
- [ ] Dashboard básico (tabela com filtros)

### Semana 4: Validação com Cliente
- [ ] Cliente cadastra produtos reais
- [ ] Conferência de margens calculadas vs. realidade
- [ ] Ajustes finos no motor de regras

---

## Links Úteis

- **Supabase Docs:** https://supabase.com/docs
- **RLS Guide:** https://supabase.com/docs/guides/auth/row-level-security
- **PostgreSQL EXCLUDE constraints:** https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-EXCLUDE

---

**Versão:** 1.0 — Julho/2026  
**Próxima revisão:** Após validação com dados reais do cliente
