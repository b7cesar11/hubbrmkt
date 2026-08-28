# Integração de API de Marketplaces — Estado Aplicado

Este documento descreve a integração de **consulta de taxas ao vivo** via API
oficial dos marketplaces, começando pelo **Mercado Livre** (o mais maduro), com
**Amazon** documentada como esqueleto.

> **Status (5/8/2026):** o schema de segurança foi **aplicado ao vivo** via MCP do
> Supabase e as **4 Edge Functions foram implantadas** (status `ACTIVE`) no projeto
> `nyclgbtrkkegcdkrxaeq` (`margemhub-br`). O que **ainda falta** para funcionar
> ponta-a-ponta: (a) criar o app no Mercado Livre e **definir os secrets** no
> dashboard do Supabase; (b) **conectar a conta real do cliente** (hoje só existem
> as empresas de teste "Empresa Teste A/B"). Sem esses dois passos, o fluxo OAuth
> não pode ser testado de verdade — nenhum teste ao vivo foi feito ainda.

---

## 1. Arquitetura

```
Navegador (React)                Edge Functions (Deno/Supabase)          Banco (Postgres)
─────────────────                ──────────────────────────────          ────────────────
ConexoesTab                      mercadolivre-oauth-start (verify_jwt=on) platform_connections
  └ "Conectar" ─invoke─▶         (deriva company_id do JWT, assina state)  (tokens = SEGREDO,
                                   ↓ devolve URL de autorização             sem GRANT p/ authenticated)
  └ redirect p/ ML ──────────▶   mercadolivre-oauth-callback (jwt=off)
                                 (valida state HMAC, troca code→token,  ──▶ upsert via service_role
                                  grava tokens via service_role)
lib/marketplaceConnections.js
  └ getMarketplaceConnections ─RPC get_platform_connections()──▶          (retorna só STATUS,
     (status, sem tokens)          (SECURITY DEFINER, usa auth.uid())        sem tokens)
  └ queryMercadoLivreFee ─invoke▶ mercadolivre-fee-query (verify_jwt=on)  live_fee_cache
                                 (cache → refresh token → API ML) ───────▶ (resultado de taxa,
                                                                            raw_response em jsonb)
```

**Princípio de segurança (a preocupação central do cliente, agora resolvida):**
o cliente observou corretamente que **RLS filtra LINHAS, não COLUNAS** — uma
policy de RLS não "esconde a coluna" `access_token`/`refresh_token`. E de fato a
policy `tenant_isolation_connections` (FOR ALL) deixava um usuário autenticado
fazer `SELECT` na própria linha **incluindo os tokens**. A proteção de coluna foi
feita assim (migração `secure_platform_connection_tokens_and_cache`, aplicada):

- `REVOKE ALL ON platform_connections FROM anon, authenticated`.
- `GRANT SELECT` **apenas** nas colunas não-sensíveis
  (`id, company_id, platform_id, external_seller_id, status, connected_at,
  token_expires_at, last_error, created_at`) para `authenticated`. As colunas
  `access_token`/`refresh_token` **não** estão no GRANT ⇒ o cliente não consegue
  lê-las nem com a RLS permitindo a linha. **O token nunca chega ao navegador.**
- Só as Edge Functions, usando a `service_role` key (que faz **bypass** de RLS),
  leem/gravam os tokens.
- O cliente enxerga apenas o **status** via a RPC `get_platform_connections()`
  (SECURITY DEFINER), que retorna **somente colunas não-sensíveis** e filtra pela
  empresa do usuário logado (`fn_current_company_id()` → `auth.uid()`). É, na
  prática, a "visão de coluna" pedida.

---

## 2. O que já foi aplicado ao vivo (via MCP)

### 2.1. Migração de segurança `secure_platform_connection_tokens_and_cache`
- `REVOKE ALL ON platform_connections FROM anon, authenticated`.
- `GRANT SELECT (<colunas não-sensíveis>) ON platform_connections TO authenticated`.
- RPC `get_platform_connections()` — `SQL`, `STABLE`, `SECURITY DEFINER`,
  `search_path = public, pg_temp`. Retorna `platform_id, platform_name,
  external_seller_id, status, connected_at, token_expires_at, last_error`
  filtrado por `fn_current_company_id()`. `REVOKE` de `public`, `GRANT EXECUTE`
  para `authenticated`.
- Índice único `live_fee_cache_lookup_uidx (company_id, platform_id, category_id,
  listing_type, price) NULLS NOT DISTINCT` — necessário para o `upsert`
  idempotente do cache (o `onConflict` da fee-query depende dele).

> **Importante:** as tabelas `platform_connections`, `live_fee_cache`,
> `cost_components`, `listing_cost_components`, `platforms`, `platform_fee_rules`
> etc. **já existiam** no banco (criadas em iteração anterior). A integração foi
> **alinhada ao schema real** — nada de tabelas duplicadas. A proposta antiga
> (`proposta_schema_conexoes_marketplace.sql`, com nomes
> `marketplace_connections`/`marketplace_fee_cache`) foi **descartada**.

### 2.2. Edge Functions implantadas (status ACTIVE)
| Função | verify_jwt | Papel |
|---|---|---|
| `mercadolivre-oauth-start` | **true** | Deriva `company_id` do JWT, assina o `state` (HMAC) e devolve a URL de autorização do ML. |
| `mercadolivre-oauth-callback` | **false** | Recebe o redirect do ML, valida a assinatura do `state`, troca `code`→token e grava em `platform_connections` via service_role. |
| `mercadolivre-fee-query` | **true** | Consulta a taxa ao vivo (cache 24h + refresh de token rotativo). |
| `amazon-fee-query` | true | Esqueleto documentado — retorna **501 not_implemented**. |

---

## 3. O que FALTA para funcionar (ação do responsável pela conta)

### 3.1. Criar o app no Mercado Livre
1. Em <https://developers.mercadolivre.com.br> → "Suas aplicações" → criar app.
2. Anotar **App ID** (= `client_id`) e **Secret Key** (= `client_secret`).
3. Registrar a **Redirect URI** apontando para a Edge Function de callback:
   `https://nyclgbtrkkegcdkrxaeq.supabase.co/functions/v1/mercadolivre-oauth-callback`
   (deve ser **idêntica** à secret `ML_REDIRECT_URI`).
4. Habilitar o scope `offline_access` (garante o `refresh_token`).

### 3.2. Definir os secrets das Edge Functions
No dashboard do Supabase → **Edge Functions → Secrets** (ou via CLI). **Não existe
ferramenta MCP para definir secrets — este passo é manual.**
```bash
supabase secrets set \
  ML_CLIENT_ID="<app id do ML>" \
  ML_CLIENT_SECRET="<secret do ML>" \
  ML_REDIRECT_URI="https://nyclgbtrkkegcdkrxaeq.supabase.co/functions/v1/mercadolivre-oauth-callback" \
  OAUTH_STATE_SECRET="<string aleatória longa — ex.: openssl rand -hex 32>" \
  APP_POST_CONNECT_URL="https://<dominio-do-app>/?tab=conexoes"
# SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY são injetados
# automaticamente pelo runtime — NÃO precisam ser definidos.
```
> `OAUTH_STATE_SECRET` é usado para assinar/validar o `state` do OAuth (HMAC-SHA256)
> tanto no `oauth-start` quanto no `oauth-callback` — precisa ser **o mesmo valor**
> nas duas (são secrets do mesmo projeto, então basta definir uma vez).

### 3.3. Conectar a conta real do cliente
Hoje só existem as empresas de teste. Para o teste ponta-a-ponta:
1. A empresa real precisa existir e o usuário estar logado nela (Supabase Auth).
2. Aba **Conexões → Conectar** → autorizar no ML → volta conectado.
3. **Testar consulta de taxa ao vivo** com um `category_id` real (ex.: `MLB1055`).

### 3.4. Frontend
Nada de `VITE_ML_*` é mais necessário — a URL de autorização passou a ser gerada
pela Edge Function `mercadolivre-oauth-start` (o `client_id` fica só no backend).

---

## 4. Fluxo OAuth (Mercado Livre) — seguro

1. Usuário clica **Conectar** → `startMercadoLivreConnect()` invoca
   `mercadolivre-oauth-start`. A função **deriva o `company_id` do JWT** (não confia
   no cliente), assina `state = base64url(payload).hmac` com `OAUTH_STATE_SECRET`
   (payload = `{company_id, nonce, ts}`) e devolve a URL de autorização
   (`scope=offline_access read`).
2. O frontend redireciona para o ML; o ML volta para `mercadolivre-oauth-callback`
   com `?code=...&state=...`.
3. O callback **valida a assinatura do state** (protege contra CSRF/forja de
   `company_id`; expira em 10 min), troca o `code` por tokens e faz **upsert** em
   `platform_connections` via service_role (`onConflict company_id,platform_id`).
   Redireciona para `APP_POST_CONNECT_URL`.

### Detalhes de token (do ML — importantes)
- `access_token` dura ~6h (`expires_in` ≈ 21600s).
- **O `refresh_token` é de USO ÚNICO e ROTACIONA.** A cada refresh o ML devolve um
  novo `refresh_token` e invalida o antigo. A `mercadolivre-fee-query` **salva o
  novo `refresh_token`** a cada renovação — se não salvasse, a próxima renovação
  falharia com `invalid_grant` e a conexão iria para `status='expired'`.
- O `refresh_token` vale ~6 meses; a conta é invalidada após ~4 meses de inatividade.

---

## 5. Consulta de taxa ao vivo

`mercadolivre-fee-query` recebe `{ category_id, price, listing_type }` (o
`company_id` **não** é mais enviado pelo cliente — vem do JWT):
1. Verifica `live_fee_cache` (TTL 24h, chave = empresa+plataforma+categoria+tipo+preço).
   Se fresco, devolve do cache (`source: 'cache'`).
2. Senão, garante `access_token` válido (renova se expirado, salvando o novo
   `refresh_token`).
3. `GET /sites/MLB/listing_prices?price=&category_id=&listing_type_id=` com
   `Authorization: Bearer`. Mapeamento: `classico → gold_special`,
   `premium → gold_pro`.
4. Parseia `sale_fee_details` → `commission_pct` (`percentage_fee`) e `fixed_fee`.
5. Faz upsert em `live_fee_cache` (com `raw_response` em jsonb) e retorna
   `{ ok, source, commission_pct, fixed_fee, raw }`.

O formato de saída (`commission_pct` em %, `fixed_fee` em R$) é **o mesmo** que
`apps/web/src/lib/margin.js` já consome, para facilitar a migração das tabelas
estáticas de taxa para a consulta ao vivo.

---

## 6. Inteligência de taxas — cobertura atual e lacunas

O cálculo de margem usa `platform_fee_rules` (33 regras). Levantamento da cobertura:

| Plataforma | Regras | Fallback geral (categoria nula)? | Risco |
|---|---|---|---|
| Mercado Livre | 25 (7 categorias) | **Não** | Produto fora das 7 categorias fica sem regra. **Resolvido ao vivo** pela `mercadolivre-fee-query`. |
| Shopee | 4 | **Sim** | OK (cai no fallback geral). |
| TikTok Shop | 2 | **Sim** | OK. |
| Amazon | 1 (1 categoria) | **Não** | **Lacuna:** produto fora da categoria coberta fica sem taxa. |
| Magalu | 1 (1 categoria) | **Não** | **Lacuna:** idem. |

**Conclusões / recomendações:**
- **Mercado Livre:** a integração ao vivo é justamente o que fecha a lacuna de
  cobertura — categorias não cadastradas passam a ser resolvidas pela API oficial
  em tempo real (com cache). `category_coverage_gaps` já registra 1 caso
  (Brinquedos/ML); a função `fn_check_fee_coverage` ajuda a detectar buracos.
- **Amazon e Magalu:** falta uma **regra geral (fallback)** ou mais categorias.
  Enquanto não houver integração ao vivo (Amazon é esqueleto; Magalu não tem API
  aqui), o mínimo recomendado é **cadastrar uma `platform_fee_rule` de fallback**
  (categoria nula) com a comissão média praticada, para não haver produto sem taxa.

---

## 7. Amazon (SP-API) — esqueleto

`amazon-fee-query` hoje retorna **501 not_implemented** de propósito. O arquivo
documenta o roteiro completo: app LWA (Login with Amazon), refresh_token de longa
duração → access_token curto (~1h), `POST /products/fees/v0/.../feesEstimate`
(MarketplaceId Brasil = `A2Q3Y263D00KWC`), header `x-amz-access-token`, e reuso do
**mesmo schema** (`platform_connections` / `live_fee_cache` com o `platform_id` da
Amazon). A SP-API é mais complexa que o ML — por isso foi deixada como esqueleto.

---

## 8. Achado Shopee — taxa R$3/item (CONCLUÍDO: NÃO se aplica a este cliente)

Achado real: a Shopee cobra **+R$3 por item** **apenas** para contas **CPF** com
**mais de 450 pedidos em 90 dias** (fonte oficial). É uma cobrança que depende do
**tipo de conta (CPF/CNPJ)** e do **volume**, **não** da categoria do produto.

**Confirmação do cliente:** a conta é **CNPJ** e tem **mais de 450 pedidos/90 dias**.
Como a taxa de R$3/item incide **somente sobre CPF**, e o cliente é **CNPJ**, essa
cobrança **NÃO se aplica** a ele. **Não** deve ser cadastrada como Custo Adicional
— fazê-lo inflaria artificialmente o custo e distorceria a margem.

> Registro de rastreabilidade: se no futuro o cliente operar também com uma conta
> **CPF** de alto volume, aí sim o custo de R$3/item passaria a valer para aquela
> conta, e o mecanismo de **Custos Adicionais** (`cost_components` /
> `listing_cost_components`) é o lugar correto para representá-lo.

---
