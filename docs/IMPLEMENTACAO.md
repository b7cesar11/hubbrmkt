# Guia de Implementação - MargemHub MVP

## Status: Schema Pronto ✅

O schema multi-tenant versionado está completo e pronto para deploy no Supabase.

---

## Resumo Executivo

**Status:** Schema multi-tenant versionado pronto + seed de regras base documentado ✅

### O que está entregue:

| Arquivo | Descrição | Status |
|---------|-----------|--------|
| `/workspace/schema.sql` | Schema completo (497 linhas) | ✅ Pronto |
| `/workspace/supabase/migrations/001_initial_schema.sql` | Copia do schema para migração | ✅ Pronto |
| `/workspace/supabase/migrations/002_seed_regras_base.sql` | Seed com 26 regras + status + lacunas | ✅ Pronto |
| `/workspace/docs/IMPLEMENTACAO.md` | Guia passo a passo | ✅ Atualizado |
| `/workspace/README.md` | Visão geral do projeto | ✅ Atualizado |

### Regras de Taxa Cadastradas:

| Plataforma | Total | Confirmadas | Estimadas | Lacunas |
|------------|-------|-------------|-----------|---------|
| TikTok Shop | 2 | ✅ 2 | 0 | 0 |
| Shopee | 4 | ✅ 4 | 0 | 0 |
| Mercado Livre | 18 | 0 | ⚠️ 18 | Brinquedos (core) |
| Amazon | 1 | 0 | ⚠️ 1 | Todas categorias específicas |
| Magalu | 1 | 0 | ⚠️ 1 | Todas categorias específicas |
| **TOTAL** | **26** | **6** | **20** | **Ver acima** |

### Lacunas Conhecidas (prioridade para validação):

1. **Brinquedos no Mercado Livre** — Categoria core do cliente, needs validation urgente
2. **Categorias específicas da Amazon** — Hoje só regra geral (12%), Seller Central tem detalhamento por categoria
3. **Categorias específicas da Magalu** — Hoje só regra geral (16% + R$4), painel tem detalhamento
4. **reputation_level** — Estrutura pronta mas não populada (hoje tudo "padrão")

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

### 4. Inserir Regras Base (5 min)

**IMPORTANTE:** O seed de regras agora tem status documentado e lacunas conhecidas.

```sql
-- 1. Criar empresa (se ainda não criou)
INSERT INTO companies (name, cnpj, plan_type, max_skus)
VALUES ('Empresa Demo LTDA', '00.000.000/0001-00', 'starter', 100)
RETURNING id;
-- >>> ANOTE O UUID RETORNADO <<<

-- 2. Copiar o conteúdo de 002_seed_regras_base.sql
-- 3. Substituir {{COMPANY_ID}} pelo UUID da empresa
-- 4. Executar no SQL Editor
-- 5. Verificar output: deve mostrar 26 regras criadas + alertas das lacunas
```

**O que o script faz:**
- ✅ TikTok Shop: 2 regras (confirmadas Julho/2026)
- ✅ Shopee: 4 regras (confirmadas Março/2026)
- ⚠️ Mercado Livre: 18 regras (estimadas, Brinquedos precisa validação)
- ⚠️ Amazon: 1 regra geral (precisa validação por categoria)
- ⚠️ Magalu: 1 regra geral (precisa validação por categoria)
- ✅ E-commerce próprio: 1 regra (gateway)

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
- [x] Seed de regras base atualizado com status das taxas e lacunas conhecidas
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
- [ ] Preencher lacunas: Brinquedos (ML), categorias Amazon/Magalu

---

## Links Úteis

- **Supabase Docs:** https://supabase.com/docs
- **RLS Guide:** https://supabase.com/docs/guides/auth/row-level-security
- **PostgreSQL EXCLUDE constraints:** https://www.postgresql.org/docs/current/sql-createtable.html#SQL-CREATETABLE-EXCLUDE

---

**Versão:** 1.0 — Julho/2026  
**Próxima revisão:** Após validação com dados reais do cliente
