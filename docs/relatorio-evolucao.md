# Relatório de evolução — Capital Elite

Data: 06/10/2026 · Branch: `evolucao-mvp-confiavel` (sem commits — alterações no working tree)

## Resumo executivo

O Capital Elite saiu de um protótipo que **não compilava** e tinha **falhas críticas de
autorização e de domínio** para um **MVP técnico validado**: lint, typecheck e build
passam; há 213 testes automatizados (API, web e motor); as migrations foram aplicadas em
um PostgreSQL real e um fluxo ponta a ponta com os três serviços passou em 26 de 26 passos.

Principais correções:

- **Geração de recomendação quebrava** para qualquer cliente com suitability aplicada pela
  tela: a API lia o ID da opção do questionário (`"t2"`) como número → `NaN` → o motor
  rejeitava. Agora existe um mapeamento explícito e testado.
- **Não havia autorização por escopo**: qualquer usuário logado (até "somente leitura")
  podia ver, alterar e excluir clientes de qualquer assessor, mexer no catálogo e aprovar
  recomendações. Agora há política por papel e por carteira, com testes.
- **Sessão sem revogação**: logout não invalidava nada no servidor e o refresh token valia
  7 dias. Agora há rotação a cada uso, revogação no logout e detecção de reuso.
- **Auditoria inexistente** (a tabela existia, mas nada gravava). Agora login/logout,
  acesso a dado sensível, CRUD, suitability, geração, aprovação e recusa são auditados,
  com usuário, IP, user agent e `requestId`.
- **Vulnerabilidade crítica do Next.js** e RCE no `@nestjs/common` corrigidas;
  vulnerabilidades em produção caíram de 48 (2 críticas) para 8 (0 críticas).

**Isto não está pronto para produção financeira.** Ver "Riscos para produção".

## Diagnóstico inicial

Comandos executados no estado original (`main` @ `e809aa8`):

| Comando | Resultado |
|---|---|
| `git status` | limpo |
| `npm ci` | ok; `postinstall` do Prisma **não rodou** (npm 11 bloqueia install scripts) |
| `npm audit` | 48 vulnerabilidades (2 críticas, 28 altas, 13 moderadas, 5 baixas) |
| `npm outdated` | Next 16.2.6 (16.3.8 disponível), Nest 10 (12 disponível), Prisma 5 (7 disponível) etc. |
| `npm run lint` | **falhou** — 2 erros (`setState` em `useEffect`), 1 aviso |
| `npm run build` | **falhou** — API (Prisma Client não gerado) e web (`useSearchParams` sem `Suspense` em `/login`) |
| `python -m compileall` | ok |
| `pytest -q` | nenhum teste existia |

Python não estava instalado na máquina; usei um Python 3.12 isolado (via `uv`, no diretório
temporário da sessão) sem alterar o sistema. Docker/Postgres também não existiam; para
validar migrations usei um PostgreSQL portátil (`embedded-postgres`) descartável.

### Problemas encontrados (classificados)

Esforço: P (< 1 dia), M (1–3 dias), G (> 3 dias). "Status" indica o que foi feito nesta rodada.

| # | Sev. | Onde | Problema / impacto | Causa | Correção | Esf. | Status |
|---|---|---|---|---|---|---|---|
| 1 | Crítico | `recomendacoes.service.ts` (buildAiEngineRequest) | Gerar recomendação falha (503) para todo cliente com suitability aplicada pela UI | Leitura de `respostas.tolerancia_perda` como número; o form grava ID de opção | `suitability/parametros.ts` com mapeamento explícito + suporte ao formato legado | P | ✅ |
| 2 | Crítico | todos os controllers | Sem escopo por assessor; READONLY podia excluir clientes e aprovar recomendações | Só `/health` tinha `@Roles` | `auth/escopo.ts`, `@Roles` explícito, default seguro no `RolesGuard` | M | ✅ |
| 3 | Crítico | `next@16.2.6` | Bypass de middleware/proxy e outras | Versão vulnerável | `next@16.3.8` (minor) | P | ✅ |
| 4 | Crítico | `@nestjs/common@10.4.15` | Execução remota de código via `Content-Type` (GHSA, < 10.4.16) | Versão vulnerável no lock | `^10.4.22` (patch) | P | ✅ |
| 5 | Crítico | build | Projeto não compilava | Prisma generate fora do build; `Suspense` ausente | `build: prisma generate && nest build`; `Suspense` no login | P | ✅ |
| 6 | Alto | `auth.service.ts` | Refresh token sem rotação/revogação; logout só limpa cookie | JWT stateless | Tabela `refresh_tokens`, rotação, revogação por família, detecção de reuso | M | ✅ |
| 7 | Alto | `auth` | Sem limite de tentativas de login (força bruta) | — | Limite por e-mail (5) e IP (20) / 15 min, 429 | P | ✅ (em memória) |
| 8 | Alto | `main.ts` / `.env` | API subia com `JWT_SECRET` vazio ou `dev-change-me` | Sem validação de env | `config/env.ts`: boot falha em produção sem segredos fortes | P | ✅ |
| 9 | Alto | `all-exceptions.filter.ts` | `message` de qualquer erro (e stack fora de prod) ia ao cliente; erro Prisma exposto | Filtro de debug | Filtro único, 500 genérico + `requestId`, 503 para banco fora | P | ✅ |
| 10 | Alto | `login/page.tsx` | Open redirect via `?from=https://...` | `router.replace(from)` sem validação | `safeRedirectPath` | P | ✅ |
| 11 | Alto | `ai-engine/main.py` | Motor sem autenticação e com CORS `*`, recebendo nome/patrimônio | — | Token de serviço (`AI_ENGINE_TOKEN`), CORS removido | P | ✅ |
| 12 | Alto | `ai-engine.service.ts` | Chamada ao motor sem timeout; resposta gravada sem validação; log com corpo de erro (dados do cliente) | — | Timeout, schema zod, log só do status | P | ✅ |
| 13 | Alto | `recomendacoes.service.ts` | Aprovar/recusar sem checar estado (reaprovar recusada/expirada); gerar não-transacional | — | Transição condicional, transação serializável, revalidação na aprovação | M | ✅ |
| 14 | Alto | schema | Excluir cliente apagava em cascata suitability e recomendações (registro regulatório) | `onDelete: Cascade` | `Restrict` + exclusão lógica (INATIVO) | P | ✅ |
| 15 | Alto | `clientes.service.ts` | Hash de CPF = SHA-256 puro (revertível por força bruta: ~10⁹ CPFs); sem dígito verificador | — | HMAC com `CPF_HASH_SECRET` + validação de DV | P | ✅ (legado ver pendências) |
| 16 | Alto | sem auditoria | Tabela `auditoria` nunca era escrita | — | `AuditoriaService` + endpoint de consulta | M | ✅ |
| 17 | Alto | `prisma/seed.ts` | Seed apaga todas as tabelas sem trava | — | Bloqueado em `NODE_ENV=production` | P | ✅ |
| 18 | Médio | `suitability` | Pontos de cada opção exibidos durante a aplicação (indução de resposta) | — | Pontuação só no servidor | P | ✅ |
| 19 | Médio | `ai-engine/rules.py` | Título público federal tratado como concentração por emissor | Regra genérica | Tesouro Nacional isento (como na regulação de fundos) | P | ✅ |
| 20 | Médio | API | Recomendação sem suitability válida era gerada com perfil/horizonte "chutados" | Fallback silencioso | 422 sem suitability ou vencida | P | ✅ |
| 21 | Médio | `cliente.schemas.ts` | Perfil do cliente alterável por PATCH, sem suitability | — | Perfil só muda via suitability | P | ✅ |
| 22 | Médio | `lead.schemas.ts` | Estágio alterável por PATCH, sem histórico | — | Só via `mover-estagio` | P | ✅ |
| 23 | Médio | rotas | `:id`, `limit` e `responsavelId` sem validação | — | `IdParamPipe`, zod nas queries | P | ✅ |
| 24 | Médio | web | Dashboard e histórico 100% mock; deltas % inventados; "agenda" fictícia | — | Endpoints reais `/dashboard/resumo` e `/interacoes`; selo "Dados demonstrativos" no que não tem fonte | M | ✅ |
| 25 | Médio | web | Botões sem ação (Filtros, Novo lead, Buscar, Ver detalhes, Nova carteira, sino com ponto vermelho, "Conectado" fixo), tela "Carteira ativada" falsa | — | Ação real ou selo "em breve"/"funcionalidade futura" | P | ✅ |
| 26 | Médio | web | Sem navegação no celular (sidebar oculta e sem menu) | — | Menu lateral mobile | P | ✅ |
| 27 | Médio | web | Select mostrava o ID do cliente após a escolha | Base UI exige `items` | `items` nos selects | P | ✅ |
| 28 | Médio | `ai-engine` | Score de ML sem limite [0,1]; origem do score não chegava à auditoria; yield comparado com produtos inativos | — | `clamp`, `scoreFonte`/`scoreRegras`, só ativos | P | ✅ |
| 29 | Médio | `apps/api/src/recomendacoes/ia/` | Motor TS morto e divergente do Python | Migração incompleta | Removido (justificativa abaixo) | P | ✅ |
| 30 | Médio | CSRF | Só SameSite=Lax | — | Checagem de `Origin` em métodos de escrita | P | ✅ |
| 31 | Médio | deps Nest 10 | 8 vulnerabilidades de produção (multer, body-parser, lodash, @nestjs/core) | Correção só em Nest 11+ | Migrado para Nest 11 (ver Rodada 3) | G | ✅ |
| 32 | Baixo | web | Busca dispara request a cada tecla; lista "pisca" | — | Debounce + `keepPreviousData` | P | ✅ |
| 33 | Baixo | web | Barra de alocação com `Infinity%` quando patrimônio = 0 | — | Base protegida | P | ✅ |
| 34 | Baixo | motor | Textos "1 anos", markdown `**` dentro da frase, "você já tem" | — | Corrigidos | P | ✅ |
| 35 | Baixo | logout web | Falha na API de logout virava rejeição não tratada | `try/finally` sem `catch` | Corrigido (achado pelo teste) | P | ✅ |
| 36 | Baixo | Python | `requirements.txt` sem teto de versão (pandas 3 já instalava) | — | Faixas até a próxima major | P | ✅ |
| 37 | Melhoria | `Lead.clienteId` | Sem FK para `clientes`; coluna `clienteIdUnique` sem uso | — | FK única; a migração aborta se houver órfãos (ver Rodada 2) | P | ✅ |
| 38 | Melhoria | domínio | FGC (R$ 250 mil por CPF/instituição) não é considerado | — | Regra de limite FGC para CDB/LCI/LCA | M | ⏳ |

## Alterações realizadas

Trabalho em grupos, com `lint` + `typecheck` + `build` (e testes, quando existiam) depois de cada um.

### Arquivos alterados

**Raiz**: `README.md`, `.env.example`, `package.json`, `package-lock.json`, `.claude/agents/ai-engine.md`
**Novo**: `docs/relatorio-evolucao.md`

**API (`apps/api`)**
- Alterados: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `prisma/schema.prisma`, `prisma/seed.ts`,
  `src/app.module.ts`, `src/main.ts`, `src/prisma/prisma.service.ts`, `src/health/health.controller.ts`,
  `src/auth/{auth.controller,auth.module,auth.service}.ts`, `src/auth/dto/auth.schemas.ts`,
  `src/auth/guards/{jwt-auth,roles}.guard.ts`, `src/common/filters/all-exceptions.filter.ts`,
  `src/common/pipes/zod-validation.pipe.ts`, `src/clientes/*`, `src/leads/*`, `src/produtos/*`,
  `src/suitability/{suitability.controller,suitability.service}.ts`, `src/suitability/dto/suitability.schemas.ts`,
  `src/recomendacoes/{ai-engine.service,recomendacoes.controller,recomendacoes.module,recomendacoes.service}.ts`,
  `src/recomendacoes/dto/recomendacao.schemas.ts`
- Novos: `prisma/migrations/20261006120000_auth_auditoria_integridade/`, `src/config/env.ts`,
  `src/auditoria/*`, `src/auth/escopo.ts`, `src/auth/login-throttle.service.ts`, `src/clientes/cpf.ts`,
  `src/common/request-context.ts`, `src/common/origin-check.middleware.ts`, `src/common/pipes/id-param.pipe.ts`,
  `src/dashboard/dashboard.module.ts`, `src/interacoes/interacoes.module.ts`, `src/recomendacoes/regras.ts`,
  `src/suitability/parametros.ts`, testes (`src/**/*.spec.ts`, `test/`)
- Removidos: `src/common/filters/prisma-exception.filter.ts` (incorporado ao filtro único),
  `src/recomendacoes/ia/{justificativa,rule-engine,types}.ts` (motor TS morto — ver abaixo)

**Web (`apps/web`)**
- Alterados: `package.json`, `src/app/globals.css`, `src/app/login/page.tsx`, `src/app/(app)/layout.tsx`,
  páginas `dashboard` (+ `_components/dashboard-charts.tsx`), `historico`, `leads`, `pipeline`, `produtos`,
  `recomendacao`, `suitability`, `clientes/[id]`, `clientes/[id]/suitability`, `confirmacao-ativacao`;
  componentes `app-header`, `app-sidebar`, `kpi-card`, `query-states`, `recomendacao-card`,
  `route-placeholder`, `thinking-dialog`; `src/lib/{api,format,queries}.ts`, `src/types/api.ts`
- Renomeado: `src/middleware.ts` → `src/proxy.ts` (convenção do Next 16)
- Novos: `src/components/{demo,nav-links}.tsx`, `src/lib/{dados-demonstrativos,labels,permissoes,safe-redirect,use-debounced-value}.ts`,
  `src/styles/shadcn-tailwind.css`, `vitest.config.mts`, `src/test/*`, testes `*.test.ts(x)`
- Removidos: `src/lib/mock-data.ts`, `src/types/domain.ts` (mocks substituídos por dados reais)

**Motor (`apps/ai-engine`)**
- Alterados: `README.md`, `pyproject.toml`, `requirements.txt`, `src/{main,models,rules,justificativa}.py`
- Novos: `requirements-dev.txt`, `tests/{conftest,test_rules,test_api}.py`

### Remoções e por quê

- **Motor TypeScript (`apps/api/src/recomendacoes/ia/`)**: nenhum arquivo o importava (código
  morto). Já divergia do Python (sem tributação, sem filtro de risco, sem concentração por
  emissor, alocação-alvo diferente para perfil agressivo). Mantê-lo sugeria uma paridade
  inexistente. O Python é a única implementação.
- **Mocks do front**: substituídos por endpoints reais. As duas séries sem fonte no banco
  (evolução de AUM, captação) foram mantidas, isoladas em `dados-demonstrativos.ts` e com
  selo visível.
- **Variação % nos KPIs**: removida — o sistema não guarda histórico, então qualquer delta era inventado.
- **`DELETE` físico de cliente e produto**: virou exclusão lógica (registros vinculados e regulatórios).

## Segurança e dependências

| Dependência | Antes | Depois | Tipo | Motivo |
|---|---|---|---|---|
| next / eslint-config-next | 16.2.6 | 16.3.8 | minor | vulnerabilidade crítica |
| @nestjs/common | 10.4.15 | 10.4.22 | patch | RCE via Content-Type |
| qs (override) | 6.14.2 | 6.16.0 | minor | DoS; fixado pelo express 4 em `~6.14` |
| transitivas (`npm audit fix` sem `--force`) | — | — | patch/minor | proxy-addr (crítica), js-yaml, hono, ip-address, brace-expansion etc. |
| shadcn (CLI) | 4.8.0 | **removido** | — | só fornecia um CSS de 95 linhas (MIT, vendorizado em `src/styles/`); arrastava ts-morph, MCP/hono, msw |
| @nestjs/terminus | 10.3.0 | **removido** | — | substituído por health check próprio (inclui o motor) |
| @types/node (web) | 20 | 22 | dev | exigido pelo Vitest 5; alinhado com a API |
| Novas (dev) | — | jest 30, ts-jest, @nestjs/testing, supertest, vitest 5, jsdom, Testing Library | dev | testes |
| Python | `>=` sem teto | faixas até a próxima major | — | proteger o modelo serializado |

**Vulnerabilidades restantes**: 48 no total, **8 em dependências de produção (3 altas, 4
moderadas, 1 baixa), 0 críticas**. As 8 são do ecossistema NestJS 10 e só se resolvem com Nest 11+:

| Pacote | Exposição real hoje | Mitigação aplicada |
|---|---|---|
| multer, file-type | só com `FileInterceptor`/`ParseFilePipe` — **não usados** | nenhum endpoint de upload |
| body-parser (limite inválido) | limite explícito e válido | `json` 100 kb, `urlencoded` 20 kb |
| lodash (via @nestjs/config) | `_.template` com entrada do usuário — não ocorre | — |
| @nestjs/core (GHSA-36xv-jgw5-4q75) | avaliar na migração | migração Nest 11 |

As outras 40 são de ferramentas de dev/teste (Nest CLI, Jest, eslint-config-next) e não vão
para o runtime. `npm audit fix --force` **não** foi usado. Ele propunha, entre outras coisas,
*rebaixar* `eslint-config-next` para 14.x e subir o Nest em 2 majors.

**Outras medidas**: Helmet mantido; CORS restrito a `WEB_ORIGIN`; checagem de `Origin`
(CSRF); limites de payload; IDs de rota validados; erros sem stack e sem mensagens internas;
logs de acesso em JSON **sem** query string, corpo, cookies ou tokens; Prisma sem log de
queries; o motor não loga corpo.

## Autenticação e autorização

- Access token 15 min, refresh 7 dias, ambos em cookie `httpOnly`, `SameSite=Lax`, `Path=/`,
  `Secure` em produção (ou com `COOKIE_SECURE=true`). `path=/` foi mantido de propósito: o
  proxy do Next precisa ver o `crm_rt` nas rotas de página.
- Refresh: cada token vale uma vez (rotação). Reapresentar um token já rotacionado revoga
  a sessão inteira e gera `REUSO_REFRESH_TOKEN` na auditoria. Duas abas renovando ao mesmo
  tempo (janela de 30 s) não derrubam a sessão; o front repete a requisição.
- Logout revoga a sessão no servidor.
- `HS256` fixado na assinatura e na verificação; tempo de resposta de login igual para
  e-mail existente ou não.
- Autorização: tabela de papéis no README. Testada por endpoint e por escopo.
- **Limitações conhecidas**: o access token continua válido por até 15 min após desativar o
  usuário ou trocar o papel. O rate limit é em memória (vale por instância). Não há MFA
  (os campos existem no schema) nem recuperação de senha.

## API e banco

**Migration criada**: `20261006120000_auth_auditoria_integridade` (gerada por
`prisma migrate diff`, sem acesso a banco):
- tabela `refresh_tokens`; coluna `auditoria.requestId`; 5 novos valores em `AcaoAuditoria`;
- `suitability` e `recomendacoes` → `clientes` passam de `CASCADE` para `RESTRICT`;
- FK `suitability.aplicadoPorId` → `users` (`SET NULL`). Antes da FK, a migration anula
  `aplicadoPorId` que aponte para usuário inexistente — **é a única escrita em dados**, e
  só toca referências que já estavam quebradas;
- índices: `posicoes(produtoId)`, `recomendacoes(produtoId)`; removidos `users_email_idx`
  (duplicava o índice único) e `posicoes_clienteId_idx` (coberto pelo índice único composto);
- CHECKs `NOT VALID` (valem para escritas novas; não travam dados legados): risco 1–5,
  taxas ≥ 0, patrimônio ≥ 0, valor de posição ≥ 0, valor de lead ≥ 0, score 0–1,
  pontuação 0–100. Depois de auditar a base: `ALTER TABLE … VALIDATE CONSTRAINT …`.

**Validada em PostgreSQL real**: as 4 migrations aplicam com `migrate deploy`;
`migrate diff` banco × schema = vazio (sem drift); CHECKs e RESTRICT bloqueiam dados inválidos.

**Valores monetários**: todos em `Decimal` (18,2) no banco; nenhum `float` persistido. Na
API e no motor viram `number` em JSON (seguro até ~R$ 9 quatrilhões; em produção,
considerar string decimal no contrato).

**Endpoints novos**: `GET /dashboard/resumo`, `GET /interacoes`, `GET /auditoria`, `GET /health/ready`.

**Mudanças de contrato** (o front já foi ajustado):
- `DELETE /clientes/:id` → `{ id, inativado }`;
- `DELETE /produtos/:id` → `{ id, desativado }`;
- `POST /recomendacoes/generate` passa a devolver também `totalAnalisados`, `descartados`
  e `engineVersion`, e responde 422 sem suitability válida;
- `GET /suitability/questionario` não traz mais `pontos`;
- `GET /clientes/:id/detalhado` não traz mais as respostas brutas da suitability;
- `PATCH /clientes` não aceita `perfil`; `PATCH /leads` não aceita `estagio`.

## Motor de recomendação

- Regras revisadas e documentadas no `apps/ai-engine/README.md`. Mudanças: Tesouro Nacional
  isento do limite por emissor; rendimento relativo só contra produtos ativos; score do ML
  limitado a [0,1] e com fallback se vier NaN; `scoreFonte`/`scoreRegras` gravados para
  auditoria; textos corrigidos.
- Mapeamento questionário → parâmetros (conservador, documentado em `parametros.ts`):
  horizonte h1/h2/h3/h4 → 1/2/5/10 anos; tolerância t1/t2/t3/t4 → 5/10/25/40%.
  "Não aceito perdas" vira 5% (libera só risco 1) e não 0%, porque com 0% nenhum produto
  passaria no filtro.
- Na aprovação, a API **revalida**: produto ativo, suitability vigente e igual à usada na
  geração, e perfil compatível.
- Todo texto ao usuário apresenta a recomendação como **apoio à decisão**; a aprovação pede
  confirmação explícita, que avisa que nenhuma ordem é enviada.
- O modelo LightGBM (`models/ranker-v1.pkl`) **não carregou neste ambiente** (falta uma DLL
  de runtime do Windows para o `lightgbm`). O motor caiu corretamente para as regras, o que
  está coberto por teste. O modelo foi treinado com **dados sintéticos** (`src/ml/synth.py`)
  e não deve ordenar recomendações reais antes de ser treinado e validado com decisões reais.

## Frontend e experiência

- Sem mocks onde há endpoint. O que é ilustrativo leva selo **"Dados demonstrativos"**, e o
  que não existe leva **"em breve"** / **"Funcionalidade futura"**.
- Ações escondidas conforme o papel (espelho da API, que continua decidindo).
- Acessibilidade: link "pular para o conteúdo", `aria-current` na navegação, `aria-expanded`
  nos painéis, `radiogroup` no questionário, `role="alert"` em erros, rótulos em campos e
  botões de ícone, cores de badge com mais contraste.
- Responsividade: menu mobile; colunas secundárias escondidas em telas pequenas.
- Estados de loading/erro (com "tentar novamente")/vazio em todas as telas de dados;
  paginação em clientes e histórico.
- Datas no fuso de São Paulo; rótulos de perfil, status e categoria centralizados.

## Testes e validações

| Suite | Ferramenta | Testes | Cobre |
|---|---|---|---|
| API unitários | Jest | 86 | suitability → parâmetros, pontuação e faixas, CPF/HMAC, validação de env, filtro de erros (sem vazamento), throttle, `RolesGuard`, escopo, cliente HTTP do motor (timeout, 502, contrato), auditoria |
| API HTTP | Jest + Supertest (Nest real, banco em memória) | 45 | login válido/inválido/inativo/429, refresh e rotação, reuso, corrida entre abas, logout, 401 sem token, CSRF, escopo por assessor (404), READONLY sem escrita, auditoria por papel, CRUD de cliente com auditoria, filtros/paginação, suitability, geração (422, regressão do bug crítico, expiração, catálogo vazio, produto fora do catálogo), aprovação/recusa (409, revalidações, expiração), leads |
| Web | Vitest + Testing Library | 38 | refresh automático e redirecionamento, open redirect, login, logout (inclusive com falha da API), confirmação de aprovação, recusa com motivo, papel READONLY, geração única por abertura, erros de geração, navegação, loading/erro/vazio, dashboard sem mock |
| Motor | pytest | 44 | modelos Pydantic, perfil incompatível, risco > tolerância, concentração (e isenção soberana), sobrealocação, 5 fatores, score, topN, catálogo vazio, patrimônio zero, justificativa pt-BR, token, CORS, fallback ML |
| Ponta a ponta | script com Postgres + motor + API reais | 26 passos | fluxo completo do assessor, escopo entre assessores, auditoria com `requestId`, health, sessão |

Resultado final: `npm run lint` ✅ · `npm run typecheck` ✅ · `npm run build` ✅ · `npm test` ✅ (131 + 38) · `pytest -q` ✅ (44)

**Não testado**: o front rodando contra a API real no navegador (`next start` + proxy); a
UI foi validada por testes de componente e por build. Também não houve teste de carga.

## Rodada 2 — Cadastros pela UI (07/10/2026)

Os endpoints de escrita existiam, mas a UI só tinha botões "em breve". Agora o fluxo comercial
fecha de ponta a ponta na tela: oportunidade → funil → cliente → suitability → recomendação.

**Web**
- Cliente: cadastro (em Leads & Clientes) e edição (na ficha); ADMIN inativa/reativa com
  confirmação. CPF validado no navegador com o mesmo algoritmo da API.
- Pipeline: "Nova oportunidade"; cada card abre a ficha (dados, histórico do funil, mover de
  estágio com nota, editar, excluir, converter em cliente).
- Catálogo (ADMIN): novo produto, edição, desativar (com confirmação) e reativar; filtro
  "Mostrar inativos".
- Formulários: valores em pt-BR ("1.500.000,00"), erros de validação da API levados ao campo
  certo (incluindo CPF duplicado), edição envia só os campos alterados (a auditoria registra
  exatamente o que mudou), ADMIN escolhe o assessor responsável.

**API**
- `POST /leads/:id/converter`: cria o cliente (mesmas regras do cadastro) e fecha o lead
  numa única transação; herda nome, e-mail, telefone, valor e responsável do lead; recusa
  lead já convertido (409), perdido (422) ou sem e-mail (422). Lead convertido não muda de
  estágio nem é excluído (é a origem registrada do cliente).
- `GET /usuarios/assessores` (ADMIN) para a escolha do responsável.
- **Correção de autorização**: assessor conseguia inativar cliente por `PATCH {status:
  "INATIVO"}`, contornando a regra de que só ADMIN inativa. Agora entrar ou sair de INATIVO
  exige ADMIN.
- Migração `20261007120000_lead_cliente_fk`: `leads.clienteId` vira FK única e
  `clienteIdUnique` (nunca usada) sai. **Não corrige dados**: se houver lead órfão, dois
  leads no mesmo cliente ou marcador divergente, aborta com a contagem para revisão humana.
  Validada em PostgreSQL real (encoding UTF8 e WIN1252): aborta com órfão, aplica após a
  correção, e o banco resultante bate com o `schema.prisma`.

**Testes**: API 137 (antes 131), web 67 (antes 38). Lint, typecheck e build passam.

**Limitações conhecidas**: campos opcionais (telefone, cidade, ticker, descrição) não podem ser
*apagados* pela edição, só alterados (a API não aceita `null` neles); o cliente novo nasce
com perfil "Moderado" até a suitability ser aplicada (comportamento anterior, mantido).

## Rodada 3 — NestJS 11 e CI (07/10/2026)

**NestJS 10 → 11.2.7** (`@nestjs/config` 4.0.4, `@nestjs/jwt` 11, CLI 11; Express 4 → 5).
Escolhi a 11 e não a 12: a 11 já traz o `multer` corrigido e o `@nestjs/config` fora da faixa
vulnerável, e pular duas majors não trazia ganho de segurança.

- **Vulnerabilidades em dependências de produção: 8 → 0.** Total com ferramentas de dev:
  48 (início do projeto) → 25, todas em CLI/Jest/ESLint, fora do runtime.
- Nenhuma mudança de código foi necessária para o Express 5: não há rotas curinga e todas
  as queries são planas (o parser novo não muda nada). A instalação deixou duas cópias do
  `@nestjs/common` (10 e 11), o que quebraria a injeção de dependência em runtime; o lock
  foi regenerado para uma cópia só.
- **Bug corrigido (anterior à migração)**: corpo acima do limite de 100 KB respondia **500**
  e era logado como falha do servidor. Os erros 4xx do body-parser agora mantêm o status
  (413, 400, 415) com mensagem em pt-BR. Teste e2e adicionado.
- **Teste de fumaça da API compilada** contra PostgreSQL real (migrações + seed), 31 de 31
  passos: boot recusado em produção com segredo fraco, health, login/cookies, queries
  (inválidas, repetidas, aninhadas), 404, 400, 413, CSRF, X-Request-Id, Helmet, conversão
  de lead com FK real, 422 sem suitability, auditoria sem CPF, logout.

**CI** (`.github/workflows/ci.yml`), em PRs e push na `main`:
- Node 24: `npm ci`, lint, typecheck, testes, build e `npm audit --omit=dev --audit-level=high`.
- PostgreSQL 16 real: migrações do zero, checagem de drift contra o `schema.prisma` e seed.
- Python 3.12: pytest do motor.

O workflow foi reproduzido localmente (instalação limpa, lint, typecheck, testes, build,
audit, migrações e seed em Postgres real), exceto o pytest, porque esta máquina não tem
Python. **Ainda não rodou no GitHub**: isso acontece no primeiro push.

**Testes**: API 138, web 67.

## Rodada 4 — Movimentação e histórico de carteira (08/10/2026)

Antes: não havia como registrar aplicações e resgates, os gráficos de evolução e captação do
dashboard eram fictícios (com selo), e o KPI "AUM" somava o **patrimônio declarado** dos
clientes — não o que está aplicado na casa.

**Modelo**
- Tabela `movimentacoes` (SALDO_INICIAL, APLICACAO, RESGATE). Invariante: **posição = soma das
  movimentações** do par cliente/produto. A posição nunca é editada direto.
- A migração `20261008120000_movimentacoes` cria um SALDO_INICIAL para cada posição existente
  (id determinístico, não duplica) e um CHECK `valor > 0`. Não altera nenhuma posição.
- **Valores a custo**: o sistema não tem cotações, então não há marcação a mercado. As telas
  dizem isso explicitamente.

**Regras (API)**
- Aplicação e resgate atualizam a posição na mesma transação, com auditoria.
- Resgate é condicional e atômico: nunca deixa a posição negativa, mesmo com requisições
  simultâneas. Resgate total encerra a posição.
- Data retroativa permitida, futura não.
- Cliente BLOQUEADO não movimenta; INATIVO só resgata; produto desativado não recebe aplicação.
- **Desenquadramento (CVM 30)**: aplicação sem suitability, com suitability vencida ou em
  produto acima do perfil exige a ciência registrada do cliente; a movimentação fica marcada e
  o motivo vai para a auditoria. *Precisa de validação de compliance* (texto da ciência e se
  deve exigir um termo formal).
- Aplicação vinculada a recomendação **aprovada** a marca como **ATIVA** (uma única vez): fecha o
  ciclo recomendação → execução, e o status ATIVA (que existia e nunca era usado) passa a valer.
- A primeira aplicação de um PROSPECTO o torna ATIVO (auditado).
- `GET /carteira/series`: patrimônio aplicado ao fim de cada mês e captação (aplicações e
  resgates; saldo inicial não conta como captação), no escopo do usuário, meses no fuso de São
  Paulo. Calculado a partir das movimentações — trocar por snapshots mensais quando o volume crescer.
- Dashboard: **AUM = soma das posições**; o patrimônio declarado aparece separado.

**Web**
- Ficha do cliente: "Registrar movimentação" (aplicação/resgate, valor em pt-BR, data, saldo
  disponível no resgate, aviso de desenquadramento com a regra explicada e checkbox de ciência),
  extrato paginado e "Registrar aplicação" direto nas recomendações aprovadas.
- Dashboard: séries reais, tabela com os mesmos números para leitura sem gráfico, e cores de
  aplicações × resgates trocadas (o verde × vermelho anterior falhava para daltonismo deutan; o
  par novo foi validado). Os dados demonstrativos foram removidos do código.
- Seed: histórico de 12 meses que soma exatamente cada posição.

**Validação**: API 146 testes, web 74. Em PostgreSQL real: backfill da migração, CHECK, ausência
de drift, invariante do seed (39 movimentações), AUM e série batendo com o banco, e **6 resgates
simultâneos de 30% do saldo → 3 aceitos, 3 recusados, saldo nunca negativo**, invariante mantida
(13 de 13). Teste de fumaça geral: 31 de 31.

## Rodada 5 — Supabase e testes E2E (14/10/2026)

**Banco no Supabase (preparação)**
- O `schema.prisma` ganhou `directUrl`: a API usa `DATABASE_URL` (no Supabase, o pooler em
  modo transação, porta 6543, `?pgbouncer=true`) e as migrações usam `DIRECT_URL` (conexão de
  sessão, porta 5432). No Postgres local as duas são iguais.
- O Supabase entra **só como PostgreSQL gerenciado**. Supabase Auth, RLS e `supabase-js` não
  foram adotados: substituiriam a autenticação, o escopo por assessor e a auditoria, que já
  estão prontos e testados.
- Passo a passo no README (região São Paulo por causa da LGPD; `migrate deploy`, não
  `migrate dev`). **Falta criar o projeto e validar contra ele**: o pooler não foi testado.

**Testes E2E (Playwright)**
- Novo workspace `e2e/`. Navegador real contra os três serviços reais (web em build de
  produção, API compilada, motor Python) e PostgreSQL, em portas próprias (3100/3433/8100).
- 11 casos: login com redirecionamento de volta, senha errada, logout que encerra a sessão,
  escopo (assessor não acha nem abre pelo link um cliente de outro assessor; admin vê todos),
  resgate acima do saldo barrado e a **jornada completa**: cadastro → suitability (perfil
  arrojado) → recomendação do motor → aprovação → aplicação, que ativa a recomendação e o cliente.
- Antes de rodar, migrações e seed; o script **se recusa a apagar um banco que não seja local**
  (`E2E_PERMITIR_BANCO_REMOTO=true` para forçar).
- Job `e2e` novo na CI, com Postgres e Python; o relatório do Playwright vira artefato quando falha.

**Validação**: E2E 11 de 11 em duas execuções seguidas (Postgres 16 portátil, Python 3.12
isolado). Migrações + checagem de drift + seed com `directUrl`. API 146, web 74, motor 44.

## Rodada 6 — MFA, troca de senha e recuperação de acesso (14/10/2026)

Contexto: o banco foi para o Supabase em uso real (sem dados de demonstração). Para o primeiro
acesso há o script `usuario:admin`.

**MFA (TOTP)**
- Implementado com `node:crypto` (RFC 6238/4226, sem dependência nova), validado contra os
  vetores oficiais das RFCs. Segredo de 160 bits **cifrado** (AES-256-GCM com `MFA_CHAVE`),
  tolerância de ±30 s, e cada passo de 30 s aceito **uma única vez** (atualização condicional,
  também sob concorrência).
- Login em duas etapas: com MFA, a senha certa devolve um desafio JWT de 5 min (que não serve
  como token de acesso) e nenhum cookie; `/auth/mfa/verificar` abre a sessão. 5 erros
  bloqueiam o segundo fator por 15 min. Falhas, uso de código de recuperação, ativação e
  desativação vão para a auditoria (novas ações).
- 10 códigos de recuperação de uso único; só o HMAC é guardado. Regeneráveis.
- Ativar MFA encerra as outras sessões (abertas sem segundo fator). Desativar exige senha + código.
- `MFA_OBRIGATORIO_PARA` torna o MFA obrigatório por perfil, **aplicado pela API** (guard):
  sem MFA, só as rotas de ativação respondem; o resto dá 403 `MFA_OBRIGATORIO` e o front leva
  para *Segurança da conta*.

**Senha e recuperação**
- Troca de senha pelo próprio usuário (senha atual + política de 12 caracteres com letras e
  números), encerrando as outras sessões.
- `usuario:redefinir` (terminal): nova senha e/ou desativa o MFA, encerra as sessões e audita.
  É a recuperação de último recurso até existir recuperação por e-mail.

**Correção**: desde o script `criar-admin` (Rodada 5), o build incluía `prisma/*.ts` e gerava
`dist/src/main.js`, então `npm run start` quebraria em produção. O `tsconfig.build.json` passou
a excluir `prisma/`; o job E2E (que sobe a API compilada) pega uma regressão.

**Banco**: migração `mfa_e_senha` (só adiciona: 2 colunas, 1 tabela, 6 valores no enum de
auditoria), aplicada no Postgres local e no **Supabase**, sem drift.

**Validação**: API 180 testes (+31), web 82 (+8), E2E 12 de 12 em duas execuções (o novo
cenário ativa o MFA pela tela e entra com o código e com um código de recuperação).

## Pendências

| Pendência | Motivo de não ter sido feita | Esforço |
|---|---|---|
| Rate limit e revogação em store compartilhado (Redis) | Infra; hoje vale por instância (inclui o limite do MFA) | P |
| Recuperação de senha por e-mail | Precisa escolher um provedor de e-mail; hoje é pelo script `usuario:redefinir` | P |
| Tela de gestão de usuários (criar, desativar, mudar perfil) | Hoje só por script; o primeiro admin vem de `usuario:admin` | M |
| Re-hash de CPFs legados (SHA-256 puro) | Precisa do CPF em claro, que o sistema não guarda; requer recadastro ou importação da fonte | M |
| Marcação a mercado (cotações) e rentabilidade da carteira | Precisa de fonte de preços; hoje tudo é a custo (Rodada 4) | M |
| Limite FGC, custos de corretagem/come-cotas | Melhorias de domínio | M |
| CD (deploy automatizado) e ambiente de homologação | CI existe (Rodada 3); falta a infraestrutura de destino | M |
| Prisma 5 → 6/7, TypeScript 7, ESLint 10 | Majors; sem necessidade imediata | M |

## Riscos para produção

1. **Regulatório (CVM 30 / ANBIMA)**: questionário, faixas de perfil, mapeamento de
   tolerância e regras do motor foram calibrados por engenharia, **não validados por
   compliance**. Precisam de aprovação formal e versionamento controlado.
2. **LGPD**: falta base legal documentada, política de retenção, atendimento a direitos do
   titular (acesso, correção, eliminação × retenção regulatória), registro de operações e
   avaliação de impacto (RIPD). Os CPFs legados estão em hash fraco.
3. **Modelo de ML**: treinado em dados sintéticos. Usar só depois de treinar com decisões
   reais, validar e monitorar viés; até lá, rodar só com regras.
4. **Segurança**: ~~sem MFA~~ (Rodada 6), sem recuperação de senha por e-mail, sem pentest, rate limit em memória,
   ~~Nest 10 com vulnerabilidades conhecidas~~ (Rodada 3: Nest 11, 0 vulnerabilidades de produção).
5. **Operação**: CI existe (Rodada 3), mas sem CD, sem backups e restore testados, sem métricas/alertas/tracing
   (só logs estruturados e health checks), sem ambiente de homologação.
6. **Integrações**: não há integração com custódia, plataforma de ordens nem cadastro
   oficial; carteira e catálogo são dados de demonstração.

## Próximos passos

1. Revisão de compliance das regras de suitability e do motor (bloqueante).
2. ~~CI (lint, typecheck, build, testes, `npm audit --omit=dev`, pytest)~~ (Rodada 3) + ambiente de homologação.
3. ~~Migração NestJS 11~~ (Rodada 3) e store compartilhado (Redis) para rate limit.
4. Pacote LGPD: retenção, direitos do titular, re-hash de CPFs, RIPD.
5. Observabilidade: métricas, alertas, tracing com o `requestId` já propagado; backups testados.
6. ~~MFA e troca de senha~~ (Rodada 6). Falta recuperação de senha por e-mail.
7. ~~Telas de cadastro (cliente, lead, produto)~~ (Rodada 2) e ~~histórico de carteira (AUM/captação reais)~~ (Rodada 4, a custo).
8. ~~Teste E2E de navegador~~ (Rodada 5) e pentest externo antes do go-live.
9. Criar o projeto Supabase (região São Paulo) e validar migrações e API pelo pooler.

### Estimativa de esforço para produção

Para 1–2 pessoas experientes. Não inclui o tempo de compliance, jurídico e integrações
com sistemas da instituição, que costuma dominar o prazo.

| Frente | Estimativa |
|---|---|
| Segurança (Nest 11, MFA, senha, Redis, pentest e correções) | 3–4 semanas |
| Infra e operação (CI/CD, homologação, backups, observabilidade) | 2–3 semanas |
| LGPD e retenção (técnico) | 1–2 semanas |
| Funcionalidades mínimas de operação (cadastros, histórico de carteira) | 3–4 semanas |
| Ajustes do motor após revisão de compliance + E2E de navegador | 2 semanas |
| **Total técnico** | **~11–15 semanas**, mais as integrações e validações externas |
