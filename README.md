# Capital Elite — Wealth Management CRM

CRM de wealth management com motor de recomendação explicável.

> **Estágio: MVP técnico demonstrável — não está pronto para uso financeiro em produção.**
> Veja [`docs/relatorio-evolucao.md`](docs/relatorio-evolucao.md) para o que já foi
> validado, os riscos conhecidos e o que falta para produção.
>
> As recomendações são **apoio à decisão**: a decisão final é do assessor e está
> sujeita aos controles internos e de compliance da instituição.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui (Base UI) |
| Estado / data | TanStack Query |
| Backend transacional | NestJS 11 (Express 5) · TypeScript · Zod |
| Motor de recomendação | Python 3.11+ · FastAPI · Pydantic (regras + ranker LightGBM opcional) |
| ORM / Banco | Prisma 5 · PostgreSQL |
| Auth | JWT em cookies httpOnly, refresh token com rotação e revogação |
| Testes | Jest + Supertest (API) · Vitest + Testing Library (web) · pytest (motor) |

## Arquitetura

```
Browser ─→ Next.js (web, :3000)
              ↓ /api/* (rewrite — cookies same-origin)
          NestJS (api, :3333) ─── PostgreSQL
              ↓ POST /recommend  (Bearer AI_ENGINE_TOKEN, timeout, X-Request-Id)
          Python FastAPI (ai-engine, :8000) ← stateless, sem acesso a banco
```

- O Python recebe o contexto completo (cliente, suitability vigente, carteira, catálogo
  ativo), calcula e devolve. A API valida a resposta antes de gravar.
- Cada recomendação guarda no `payload` o snapshot do contexto usado (suitability,
  horizonte, tolerância, versão do motor, hash do catálogo) para auditoria.
- Toda requisição recebe um `X-Request-Id`, propagado ao motor e gravado na auditoria.

## Perfis de acesso

| Perfil | Clientes / leads | Suitability e recomendações | Catálogo | Auditoria |
|---|---|---|---|---|
| ADMIN | todos, leitura e escrita | aplicar, gerar, aprovar, recusar | gerir | ler |
| ASSESSOR | **só a própria carteira** | aplicar, gerar, aprovar, recusar (própria carteira) | consultar | — |
| COMPLIANCE | todos, só leitura | só leitura | consultar | ler |
| READONLY | todos, só leitura | só leitura | consultar | — |

Registros fora do escopo respondem **404** (não revela que existem). Escrita sem `@Roles`
explícito exige ADMIN ou ASSESSOR por padrão (`RolesGuard`).

### Segurança da conta

- **Verificação em duas etapas (MFA)** com aplicativo autenticador (TOTP: Google
  Authenticator, Microsoft Authenticator, 1Password…), ativada em *Segurança da conta* (menu do
  usuário). Com MFA, a senha certa só devolve um desafio de 5 minutos; a sessão abre com o
  código de 6 dígitos ou com um dos 10 **códigos de recuperação** (uso único).
- O segredo TOTP fica **cifrado** no banco (AES-256-GCM, `MFA_CHAVE`); dos códigos de
  recuperação só o hash é guardado. Cada código TOTP vale uma vez, e 5 erros bloqueiam o
  segundo fator por 15 minutos.
- `MFA_OBRIGATORIO_PARA` (ex.: `ADMIN` ou `ADMIN,ASSESSOR,COMPLIANCE,READONLY`) torna o MFA
  obrigatório por perfil. **A API aplica a regra**: sem MFA, esses perfis só acessam o necessário
  para ativá-lo (403 `MFA_OBRIGATORIO` no resto), e não conseguem desativar.
- **Troca de senha** em *Segurança da conta*: exige a senha atual, mínimo de 12 caracteres com
  letras e números, e encerra as sessões nos outros dispositivos.
- **Acesso perdido** (senha esquecida, ou celular e códigos perdidos): quem administra o servidor
  redefine pelo terminal, o que encerra as sessões da pessoa e fica na auditoria:
  ```bash
  npm run usuario:redefinir -w @crm/api -- --email pessoa@empresa.com.br --senha     # nova senha
  npm run usuario:redefinir -w @crm/api -- --email pessoa@empresa.com.br --sem-mfa   # reconfigurar MFA
  ```
  Ainda não há recuperação de senha por e-mail (depende de um provedor de e-mail).

## Setup local

Requisitos: Node 20+ (testado com 24), Python 3.11+ e um PostgreSQL 16+: local, via
Docker ou [Supabase](#banco-no-supabase).

```bash
# 1. Dependências
npm install
cd apps/ai-engine && python -m venv .venv
.\.venv\Scripts\Activate.ps1          # Windows  (source .venv/bin/activate no macOS/Linux)
pip install -r requirements-dev.txt
cd ../..

# 2. Variáveis de ambiente (ver comentários no arquivo)
cp .env.example apps/api/.env

# 3. Banco (Postgres local via Docker, opcional; para Supabase veja abaixo)
docker compose up -d postgres
npm run prisma:migrate -w @crm/api     # dev; em servidores use: npx prisma migrate deploy
npm run prisma:seed -w @crm/api        # APAGA e recria os dados de demonstração

# 4. Subir os 3 serviços (3 terminais)
cd apps/ai-engine && uvicorn src.main:app --reload --port 8000
npm run dev -w @crm/api                # http://localhost:3333/api
npm run dev -w @crm/web                # http://localhost:3000
```

> O seed **apaga todas as tabelas**. Em `NODE_ENV=production` ele se recusa a rodar,
> a menos que `SEED_ALLOW_RESET=true`.

### Banco no Supabase

O Supabase é usado **só como PostgreSQL gerenciado**. Autenticação, escopo por assessor e
auditoria continuam na API; não use Supabase Auth, RLS nem `supabase-js` no front.

1. Crie o projeto na região **South America (São Paulo)**, porque o banco guarda dados
   pessoais de clientes (LGPD).
2. Em *Project Settings → Database → Connection string*, copie para `apps/api/.env`:
   - `DATABASE_URL`: pooler em modo transação (porta **6543**), terminada em `?pgbouncer=true`;
   - `DIRECT_URL`: conexão de sessão (porta **5432**), usada pelas migrações.
3. Aplique o schema com `npx prisma migrate deploy` (em `apps/api`), não com `migrate dev`,
   que pede um shadow database. O seed é opcional e **apaga os dados**.
4. Em uso real, sem seed, crie o primeiro administrador (a senha é pedida no terminal, sem eco):
   ```bash
   npm run usuario:admin -w @crm/api -- --email voce@empresa.com.br --nome "Seu Nome"
   ```
   Mínimo de 12 caracteres, com letras e números. Não altera usuário existente e registra a
   criação na auditoria.

No plano gratuito o projeto pausa depois de 7 dias sem uso. CI e testes E2E continuam em um
Postgres descartável: não aponte para o banco do Supabase.

### Credenciais de demonstração (somente ambiente local, criadas pelo seed)

| Email | Perfil | Senha |
|---|---|---|
| `admin@capitalelite.com.br` | ADMIN | `Senha123!` |
| `joao.diniz@capitalelite.com.br` | ASSESSOR | `Senha123!` |
| `marina.lopes@capitalelite.com.br` | ASSESSOR | `Senha123!` |

### Variáveis obrigatórias em produção

A API **não sobe** em `NODE_ENV=production` sem: `JWT_SECRET` e `JWT_REFRESH_SECRET`
(32+ caracteres, diferentes), `CPF_HASH_SECRET` (32+), `MFA_CHAVE` (32+) e `AI_ENGINE_TOKEN` (mesmo valor
configurado no motor Python). Detalhes em [`.env.example`](.env.example).

## Validação

```bash
npm run lint        # ESLint (web)
npm run typecheck   # tsc (api + web + e2e)
npm run build       # prisma generate + nest build · next build
npm test            # Jest (api) + Vitest (web)

cd apps/ai-engine && pytest -q
```

Os testes da API sobem a aplicação Nest real (guards, pipes, filtros, cookies) com o
Prisma trocado por um banco em memória — não precisam de Postgres.

### Testes E2E (Playwright)

Testam o sistema como o usuário usa: navegador real, web em build de produção, API, motor
Python e PostgreSQL. Cobrem login e sessão, escopo entre assessores e a jornada completa
(cadastro → suitability → recomendação do motor → aprovação → aplicação).

```bash
npx playwright install chromium     # uma vez (em e2e/)
npm run e2e                         # na raiz
```

- **O banco é apagado e recriado pelo seed** a cada execução. Por padrão o E2E usa o Postgres
  local do docker compose (`E2E_DATABASE_URL` muda isso) e **se recusa a rodar contra um
  banco que não seja local**, para nunca apagar o Supabase por engano.
- Os serviços sobem sozinhos em portas próprias (web 3100, API 3433, motor 8100), sem conflito
  com o ambiente de desenvolvimento. `E2E_PYTHON` aponta o Python do motor (padrão: `python`).
- Relatório com trace e screenshot das falhas: `npm run e2e:report -w @crm/e2e`.

O CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) roda em todo PR e push na
`main`: os comandos acima, `npm audit --omit=dev` (falha em vulnerabilidade alta ou crítica
de produção), as migrações do zero num PostgreSQL real com checagem de drift contra o
`schema.prisma` e o seed, o pytest do motor e os testes E2E.

## Endpoints principais

| Método | Rota | Quem |
|---|---|---|
| POST | `/api/auth/login` · `/refresh` · `/logout` · `/mfa/verificar` (2ª etapa do login) | público |
| GET/POST | `/api/auth/me` · `/senha` · `/mfa` · `/mfa/configurar` · `/mfa/ativar` · `/mfa/desativar` · `/mfa/codigos` | o próprio usuário |
| GET | `/api/clientes` · `/:id` · `/:id/detalhado` | autenticado (escopo) |
| POST/PATCH | `/api/clientes` · `/:id` | ADMIN, ASSESSOR (entrar/sair de INATIVO: só ADMIN) |
| DELETE | `/api/clientes/:id` (inativa — não apaga) | ADMIN |
| GET | `/api/leads` · `/board` · `/:id` | autenticado (escopo) |
| POST/PATCH/DELETE | `/api/leads` · `/:id` · `/:id/mover-estagio` | ADMIN, ASSESSOR |
| POST | `/api/leads/:id/converter` (cria o cliente e fecha o lead, numa transação) | ADMIN, ASSESSOR |
| GET | `/api/produtos` · `/:id` | autenticado |
| POST/PATCH/DELETE | `/api/produtos` · `/:id` (DELETE desativa) | ADMIN |
| GET | `/api/usuarios/assessores` | ADMIN |
| GET/POST | `/api/suitability` · `/questionario` · `/cliente/:id` | leitura: todos · aplicar: ADMIN, ASSESSOR |
| POST | `/api/recomendacoes/generate` | ADMIN, ASSESSOR |
| PATCH | `/api/recomendacoes/:id/aprovar` · `/recusar` | ADMIN, ASSESSOR |
| GET | `/api/dashboard/resumo` · `/api/interacoes` · `/api/carteira/series` | autenticado (escopo) |
| GET | `/api/clientes/:id/movimentacoes` | autenticado (escopo) |
| POST | `/api/clientes/:id/movimentacoes` (aplicação/resgate; atualiza a posição na mesma transação) | ADMIN, ASSESSOR |
| GET | `/api/auditoria` | ADMIN, COMPLIANCE |
| GET | `/api/health/live` · `/ready` (público) · `/api/health` (ADMIN) | — |

## Como o motor funciona

Para cada cliente com **suitability válida** (sem ela a API responde 422):

1. Filtros de adequação (determinísticos): perfil mínimo do produto, risco além da
   tolerância declarada, concentração > 30% em um emissor privado (título público
   federal não conta), sobrealocação > 30% no produto.
2. Cinco fatores ponderados: diversificação vs. alocação-alvo do perfil (30%),
   compatibilidade de perfil (20%), rentabilidade líquida de IR relativa à categoria
   (20%), liquidez vs. horizonte (15%), custo (15%).
3. Ranking: ranker LightGBM quando o modelo carrega; senão, a soma ponderada. Cada
   recomendação informa `scoreFonte` e `scoreRegras`.
4. Justificativa em pt-BR sempre gerada pelas regras (auditável).

Detalhes: [`apps/ai-engine/README.md`](apps/ai-engine/README.md).

## Estrutura

```
crm-prototipo/
├── apps/
│   ├── web/          Next.js (UI, proxy /api)
│   ├── api/          NestJS (REST, Prisma, auth, auditoria) — testes em test/ e *.spec.ts
│   └── ai-engine/    Python + FastAPI (motor) — testes em tests/
├── docs/             Relatório de evolução e documentos de integração
├── stitch-export/    Designs originais (não-código)
└── docker-compose.yml   Postgres + Redis pra dev local
```
