# Integração de API de Marketplaces — Handoff

Este documento descreve a integração de **consulta de taxas ao vivo** via API
oficial dos marketplaces, começando pelo **Mercado Livre** (o mais maduro), com
**Amazon** documentada como esqueleto. Foi escrito para ser aplicado pelo
**Claude conectado ao MCP do Supabase** (que tem `service_role` e permissão para
alterar schema), pois este repositório **não** aplica mudanças de schema (ver
`REAL_DB_CONTEXT.md`).

> **Status honesto:** o código abaixo foi escrito e revisado, mas **não foi
> implantado nem testado ao vivo** neste ambiente. Não tenho acesso ao MCP do
> Supabase, à `service_role` key, ao `client_id`/`client_secret` do app do
> Mercado Livre, nem à conta real do cliente para fazer o OAuth. O teste
> ponta-a-ponta exige a conta real conectada — como o próprio plano previa.

---

## 1. Arquitetura

```
Navegador (React)                Edge Functions (Deno/Supabase)         Banco (Postgres)
─────────────────                ──────────────────────────────         ────────────────
ConexoesTab                      mercadolivre-oauth-callback            marketplace_connections
  └ "Conectar" ───auth ML──▶     (troca code→token, grava tokens) ───▶  (tokens = SEGREDO,
                                                                          RLS sem policy)
lib/marketplaceConnections.js
  └ getMarketplaceConnections ──RPC get_marketplace_connections──▶      (retorna só STATUS,
     (status, sem tokens)                                                sem tokens)
  └ queryMercadoLivreFee ───▶    mercadolivre-fee-query                 marketplace_fee_cache
                                 (cache → refresh token → API ML) ────▶ (resultado de taxa,
                                                                          sem segredos)
```

**Princípio de segurança (correção conceitual importante):** o usuário observou
corretamente que **RLS filtra LINHAS, não COLUNAS** — uma policy de RLS não
"esconde uma coluna" como `access_token`. A proteção a nível de coluna é feita
assim:

- `marketplace_connections` tem **RLS habilitado e NENHUMA policy** para
  `anon`/`authenticated`. Sem policy ⇒ o cliente não enxerga nenhuma linha. Só a
  Edge Function, usando a `service_role` key (que faz **bypass** de RLS), lê os
  tokens. **O token nunca chega ao navegador.**
- O cliente enxerga apenas o **status** da conexão através do RPC
  `get_marketplace_connections` (SECURITY DEFINER), que retorna **somente colunas
  não-sensíveis** (plataforma, status, id do vendedor, datas). Isso é, na
  prática, a "visão de coluna" pedida.

---

## 2. Passo a passo de implantação (Claude com MCP)

### 2.1. Aplicar o schema
Revisar `docs/proposta_schema_conexoes_marketplace.sql` e aplicar via MCP
(`apply_migration` / execução SQL do MCP). Ele cria:
- `marketplace_connections` (RLS on, sem policy, `force row level security`);
- RPC `get_marketplace_connections(uuid)` (SECURITY DEFINER, grant p/ anon+authenticated);
- `marketplace_fee_cache` (RLS on; escrita só via service_role);
- RPC opcional `purge_expired_fee_cache()`.

> Ajustar a resolução de `company_id` no RPC conforme o modelo de Auth. A
> proposta usa a variante explícita (recebe `p_company_id`), compatível com o
> estado atual (sem login real). Quando o Supabase Auth estiver ativo, migrar
> para `auth.uid() → users.company_id`.

### 2.2. Criar o app no Mercado Livre
1. Em <https://developers.mercadolivre.com.br> → "Suas aplicações" → criar app.
2. Anotar **App ID** (= `client_id`) e **Secret Key** (= `client_secret`).
3. Registrar a **Redirect URI** apontando para a Edge Function de callback:
   `https://nyclgbtrkkegcdkrxaeq.supabase.co/functions/v1/mercadolivre-oauth-callback`
   (deve ser **idêntica** à usada no frontend e nas secrets).

### 2.3. Configurar os secrets das Edge Functions
```bash
supabase secrets set \
  ML_CLIENT_ID="<app id do ML>" \
  ML_CLIENT_SECRET="<secret do ML>" \
  ML_REDIRECT_URI="https://nyclgbtrkkegcdkrxaeq.supabase.co/functions/v1/mercadolivre-oauth-callback" \
  APP_POST_CONNECT_URL="https://<dominio-do-app>/?tab=conexoes"
# SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetados pelo runtime.
```

### 2.4. Publicar as Edge Functions
```bash
supabase functions deploy mercadolivre-oauth-callback
supabase functions deploy mercadolivre-fee-query
supabase functions deploy amazon-fee-query   # skeleton (retorna 501)
```
> Se o app não usar Supabase Auth (estado atual), publique com
> `--no-verify-jwt`, senão o callback (GET vindo do ML) e o invoke da consulta
> exigirão JWT válido:
> `supabase functions deploy mercadolivre-oauth-callback --no-verify-jwt`

### 2.5. Configurar o frontend
Definir as variáveis de ambiente do Vite (build) — **apenas valores públicos**:
```
VITE_ML_CLIENT_ID=<app id do ML>
VITE_ML_REDIRECT_URI=https://nyclgbtrkkegcdkrxaeq.supabase.co/functions/v1/mercadolivre-oauth-callback
```
> No deploy atual (GitHub Pages / Netlify), adicionar essas variáveis no ambiente
> de build. O `client_secret` **nunca** vai para o frontend.

---

## 3. Fluxo OAuth (Mercado Livre)

1. Usuário clica **Conectar** na aba Conexões → `buildMercadoLivreAuthUrl()` monta
   a URL de autorização com `scope=offline_access read` (o `offline_access` é o
   que garante o `refresh_token`) e `state = base64url({company_id, nonce})`.
2. ML redireciona de volta para a Edge Function `mercadolivre-oauth-callback` com
   `?code=...&state=...`.
3. A função troca o `code` por tokens em `POST /oauth/token` e faz **upsert** em
   `marketplace_connections` (via service_role). Redireciona para `APP_POST_CONNECT_URL`.

### Detalhes de token (do ML — importantes)
- `access_token` dura ~6h (`expires_in` ≈ 21600s).
- **O `refresh_token` é de USO ÚNICO e ROTACIONA.** A cada refresh, o ML devolve
  um novo `refresh_token` e o antigo é invalidado. A função
  `mercadolivre-fee-query` **salva o novo `refresh_token`** a cada renovação —
  se não salvasse, a próxima renovação falharia com `invalid_grant`.
- O `refresh_token` vale ~6 meses; a conta é invalidada após ~4 meses de inatividade.

---

## 4. Consulta de taxa ao vivo

`mercadolivre-fee-query` recebe `{ company_id, category_id, price, listing_type }`:
1. Verifica `marketplace_fee_cache` (TTL 24h). Se fresco, devolve do cache.
2. Senão, garante `access_token` válido (renova se expirado, salvando o novo
   refresh_token).
3. `GET /sites/MLB/listing_prices?price=&category_id=&listing_type_id=` com
   `Authorization: Bearer`. Mapeamento: `classico → gold_special`,
   `premium → gold_pro`.
4. Parseia `sale_fee_details` → `commission_pct` (`percentage_fee`) e `fixed_fee`.
5. Grava no cache e retorna `{ ok, source, commission_pct, fixed_fee, raw }`.

O formato de saída (`commission_pct` em %, `fixed_fee` em R$) é **o mesmo** que
`apps/web/src/lib/margin.js` já consome, para facilitar a migração das tabelas
estáticas de taxa para a consulta ao vivo.

---

## 5. Amazon (SP-API) — esqueleto

`amazon-fee-query` hoje retorna **501 not_implemented** de propósito. O arquivo
documenta o roteiro completo: app LWA (Login with Amazon), refresh_token de longa
duração → access_token curto (~1h), `POST /products/fees/v0/.../feesEstimate`
(MarketplaceId Brasil = `A2Q3Y263D00KWC`), header `x-amz-access-token`, e reuso do
mesmo schema (`marketplace_connections` / `marketplace_fee_cache` com
`platform='amazon'`). A SP-API é mais complexa que o ML — por isso foi deixada
como esqueleto, conforme o plano.

---

## 6. Limites de teste (honestidade)

- **Não implantado/testado ao vivo aqui.** Requer MCP do Supabase, `service_role`,
  `client_id`/`client_secret` do ML e a conta real do cliente para autorizar o OAuth.
- O `build` do frontend e os 18 testes unitários de `lib/margin.js` continuam
  passando (a integração não altera a lógica de cálculo existente).
- Após implantar, o teste ponta-a-ponta é: conectar a conta real → aba Conexões →
  "Testar consulta de taxa ao vivo" com um `category_id` real (ex.: `MLB1234`).

---

## 7. Pendência em aberto — Shopee (taxa R$3/item por CPF)

Achado real: a Shopee cobra **+R$3 por item** para contas **CPF** com **mais de
450 pedidos em 90 dias** (fonte oficial). Como isso depende do **tipo de conta
(CPF/CNPJ)** e do **volume de pedidos** — e **não** da categoria do produto —
ele **não** é uma Regra de Taxa; pertence a **Custos Adicionais** (mecanismo já
existente na aba Custos).

**Bloqueado / a confirmar com o cliente:**
1. A conta Shopee do cliente é **CPF ou CNPJ**?
2. Ela tem **mais de 450 pedidos nos últimos 90 dias**?
3. A empresa real do cliente já existe no sistema (para cadastrar o custo adicional
   no tenant correto)?

Só com essas respostas o custo adicional de R$3/item pode ser cadastrado
corretamente — por isso está apenas registrado aqui, não implementado.
