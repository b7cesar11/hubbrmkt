# MargemHub - Plataforma de Inteligência de Margens Multicanal

## Visão Geral

SaaS multi-tenant que permite negócios com venda em múltiplos marketplaces visualizar, em tempo real, a margem líquida real em cada canal.

## Estrutura do Projeto

```
/workspace
├── schema.sql              # Schema completo do banco (PostgreSQL/Supabase)
├── supabase/               # Configurações do Supabase
│   ├── migrations/         # Migrações versionadas
│   └── functions/          # Edge Functions
├── apps/
│   ├── web/                # Frontend React + Tailwind
│   └── api/                # Backend NestJS
└── docs/                   # Documentação
```

## Schema do Banco - Principais Tabelas

### Core Multi-tenant
- **companies**: Tenants/empresas clientes
- **users**: Usuários vinculados a empresas + Supabase Auth

### Motor de Regras (Diferencial Competitivo)
- **platform_rules**: Taxas versionadas por vigência (o coração do sistema)
  - Suporta histórico completo de mudanças de taxa
  - Impede sobreposição de vigência via constraint EXCLUDE
  - Campo `source_url` para auditoria (link do comunicado oficial)

### Produtos e Listings
- **products**: SKUs internos com custo (CMV)
- **product_cost_history**: Histórico de alteração de custo
- **product_listings**: Vínculo produto ↔ anúncio em cada plataforma

### Cálculos
- **margin_calculations**: Snapshots de margem + indicador `is_outdated`
- **recalculate_margins_for_company()**: Função PL/pgSQL para recálculo em massa

### Auditoria
- **audit_log**: Log completo de alterações
- **Row Level Security (RLS)**: Isolamento total por empresa

## MVP Escopo (Fase 1)

✅ Implementado neste schema:
- [x] Multi-tenant com `company_id` em todas as tabelas
- [x] Motor de regras versionadas
- [x] Cadastro de produtos e listings
- [x] Cálculo de margem com trigger de atualização
- [x] RLS policies (exemplo)
- [x] Histórico de custo

⏳ Deixado para Fase 2+:
- [ ] Módulo de promoções/incentivos temporários
- [ ] Simulador de comissionamento (creator + gestão)
- [ ] Dashboards avançados
- [ ] Importação em massa CSV/XLSX
- [ ] RBAC completo (múltiplos papéis)

## Setup no Supabase

### Passo 1: Criar Projeto
1. Acesse https://supabase.com
2. Novo projeto → Selecionar região próxima (us-east-1 ou sa-east-1)
3. Aguardar provisionamento (~2 min)

### Passo 2: Executar Schema
1. SQL Editor → New Query
2. Copiar conteúdo de `schema.sql`
3. Executar (Run)
4. Verificar se todas as tabelas foram criadas

### Passo 3: Configurar Auth
1. Authentication → Providers → Habilitar Email + Google (opcional)
2. Em User Metadata, adicionar campo `company_id`
3. Ajustar RLS policies conforme necessidade (ver comentários no schema)

### Passo 4: Testar Recálculo
```sql
-- Após inserir dados de exemplo:
SELECT recalculate_margins_for_company("SEU_COMPANY_ID_AQUI");
```

## Próximos Passos

1. **Configurar Supabase** (acima)
2. **Criar seed de dados iniciais** (regras base 2026 por plataforma)
3. **Setup do frontend** (React + Tailwind + Supabase JS client)
4. **Implementar login e isolamento por tenant**
5. **CRUD de produtos e listings**
6. **Dashboard básico com filtros**

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Database | PostgreSQL (Supabase) |
| Auth | Supabase Auth |
| Frontend | React + Tailwind CSS |
| Backend/API | NestJS (ou Supabase Edge Functions) |
| Deploy | Vercel (frontend) + Supabase (backend/DB) |

## Notas Importantes

### Versionamento de Regras
O diferencial competitivo é o motor de atualização de taxas. Todas as regras têm:
- `valid_from` / `valid_to`: Período de vigência
- `is_current`: Indica regra ativa
- `source_url`: Link oficial para auditoria
- Constraint que impede sobreposição de datas

### Isolamento Multi-tenant
- Toda tabela sensível tem `company_id`
- RLS habilitado com policy de isolamento
- Super Admin pode acessar tudo (configurar via claim JWT)

### Trigger de Atualização Automática
Quando o custo de um produto muda:
1. Registro automático em `product_cost_history`
2. Marca cálculos relacionados como `is_outdated = true`
3. Interface pode alertar usuário para recalcular

---

**Versão do documento:** 1.0 — Julho/2026  
**Status:** Schema pronto para deploy no Supabase
