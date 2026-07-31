# Contexto do Banco Real — MargemHub

**Este arquivo é a fonte de verdade.** Qualquer ferramenta de geração de frontend (Qwen Coder, etc.) deve **ler** este arquivo antes de escrever código que acessa o banco — e **não deve gerar migrations, schema.sql, ou alterar tabelas**. Mudanças de schema só acontecem via chat com Claude conectado ao MCP do Supabase.

Última verificação: 31/07/2026, direto no projeto via `list_tables`.

## Conexão

```
Project URL: https://nyclgbtrkkegcdkrxaeq.supabase.co
Anon/Publishable Key: sb_publishable_5d4b7Ra3NfqCacJIVkR73w_iNRyxGrD
```

⚠️ **Alerta de segurança ativo:** as tabelas `platforms`, `platform_fee_rules` e `platform_promotions` estão com RLS **desabilitado** — totalmente expostas a leitura E escrita via essa chave pública. Isso ainda não foi corrigido (pendente de definição de políticas). Não trate essa chave como segura para expor um app em produção real até isso ser resolvido.

## Tabelas existentes (schema real, 31/07/2026)

- **companies** — tenants. `id, name, created_at`
- **users** — `id, company_id, email, role (super_admin|company_admin|operator|viewer), created_at`
- **platforms** — global, 5 linhas fixas: Mercado Livre, Shopee, Amazon, Magalu, TikTok Shop
- **products** — por tenant. `id, company_id, sku, name, category, cost_price, weight_kg, active, created_at`
- **product_cost_history** — histórico de custo, populado por trigger
- **platform_fee_rules** — regras versionadas. `id, platform_id, category, listing_type (classico|premium|null), price_min, price_max, commission_pct, fixed_fee, valid_from, valid_to, source_url, reputation_level, created_by, created_at`
  - Hoje: 32 regras (TikTok Shop: 2, Shopee: 4, Mercado Livre: 24, Amazon: 1, Magalu: 1)
  - Constraint EXCLUDE impede sobreposição de vigência/faixa/categoria
- **platform_promotions** — incentivos temporários (ainda vazia, 0 linhas)
- **product_listings** — vínculo produto × plataforma × preço de venda
- **category_coverage_gaps** — preenchida automaticamente por trigger quando um produto entra numa categoria sem regra cadastrada. Hoje: 1 linha (Brinquedos / Mercado Livre, pendente de validação)
- **audit_log** — log genérico via trigger, todas as mudanças em products, platform_fee_rules, platform_promotions, product_listings

## O que o frontend precisa fazer

1. Conectar via `@supabase/supabase-js` usando a URL e chave acima
2. Nunca assumir campos que não estão listados aqui — se precisar de um campo novo, isso é uma mudança de schema e deve ser pedida via chat, não inventada no código
3. RLS/Auth ainda não está configurado — o app hoje funciona sem login real; isso é uma etapa pendente, não um bug do frontend

## Pendências conhecidas (não são responsabilidade do frontend resolver)

- RLS sem política nas 3 tabelas citadas acima
- Categorias sem regra de taxa: Brinquedos (ML) confirmado; possivelmente outras ao cadastrar produtos reais
- Amazon e Magalu só têm regra geral (não por categoria)
