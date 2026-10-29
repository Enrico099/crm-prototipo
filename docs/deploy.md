# Deploy: Netlify + Render + Supabase

O sistema tem quatro partes, e o Netlify só hospeda uma delas:

| Parte | Onde | Por quê |
|---|---|---|
| Front (Next.js) + envio agendado | **Netlify** | Hospeda o site e roda a função agendada que dispara o e-mail diário |
| API (NestJS) | **Render** | Servidor que fica ligado; o Netlify não roda esse tipo de servidor |
| Motor de recomendação (Python) | **Render** | Idem, e o Netlify não roda Python como servidor |
| Banco (PostgreSQL) | **Supabase** | Postgres gerenciado, região São Paulo (LGPD) |

O navegador só fala com o Netlify. O Next.js repassa `/api/*` para a API no Render, então
os cookies de sessão continuam no mesmo domínio do site.

```
Navegador → Netlify (site + /api/* repassado) → Render: API → Render: motor
                                                     ↓
                                                 Supabase
```

## 1. Banco no Supabase

Siga a seção [Banco no Supabase](../README.md#banco-no-supabase) do README (projeto na
região São Paulo). Guarde as duas connection strings: `DATABASE_URL` (porta 6543,
terminada em `?pgbouncer=true`) e `DIRECT_URL` (porta 5432).

## 2. API e motor no Render

1. Suba o repositório para o GitHub (o Render e o Netlify publicam a partir dele).
2. No Render: **New → Blueprint**, escolha o repositório. Ele lê o [`render.yaml`](../render.yaml)
   e cria `crm-api` e `crm-ai-engine`, já gerando os segredos (JWT, CPF, MFA, tokens).
3. Ele vai pedir as variáveis sem valor:
   - `DATABASE_URL` e `DIRECT_URL`: as do Supabase.
   - `WEB_ORIGIN`: a URL do site no Netlify (crie o site antes ou volte aqui depois),
     ex.: `https://capital-elite-crm.netlify.app`. Sem barra no final.
   - `AI_ENGINE_URL`: a URL do `crm-ai-engine` que o Render mostrar, ex.:
     `https://crm-ai-engine.onrender.com`.
   - `SMTP_URL` e `EMAIL_REMETENTE`: o e-mail que envia as oportunidades (passo 4). Pode
     deixar vazio por enquanto: o resto funciona e o botão de envio aparece desligado.
4. O build da API já aplica as migrações no banco (`prisma migrate deploy`).
5. Crie o primeiro administrador: no Render, abra o **Shell** do `crm-api` e rode
   ```bash
   cd apps/api && npx tsx prisma/criar-admin.ts --email voce@empresa.com.br --nome "Seu Nome"
   ```
   Para uma demonstração com os dados fictícios, rode o seed **uma vez** (apaga tudo):
   `cd apps/api && SEED_ALLOW_RESET=true npx tsx prisma/seed.ts`.

> **Plano gratuito do Render:** os serviços "dormem" depois de 15 minutos sem uso, e o
> primeiro acesso depois disso leva perto de 1 minuto. Para uso real, use o plano pago
> (Starter) nos dois serviços.

## 3. Front no Netlify

1. **Add new site → Import an existing project**, escolha o repositório.
2. Configuração do build (o [`apps/web/netlify.toml`](../apps/web/netlify.toml) já define o
   comando, a pasta publicada e a versão do Node):
   - **Base directory**: vazio (raiz do repositório)
   - **Package directory**: `apps/web`
3. Variáveis de ambiente do site (**Site configuration → Environment variables**):
   - `API_URL`: a URL do `crm-api` no Render, ex.: `https://crm-api.onrender.com`.
     Ela é usada **no build**: se mudar, faça um novo deploy.
   - `ENVIO_CRON_TOKEN`: copie o valor gerado no Render (serviço `crm-api` → Environment).
4. Faça o deploy e confira se o `WEB_ORIGIN` do Render é exatamente a URL do site. Se não
   for, o login responde 403 (proteção contra CSRF).

## 4. Aviso diário das oportunidades

O aviso sempre chega **dentro do sistema**, no sininho do topo: "N oportunidades para
hoje", com link para a tela *Oportunidades do dia*. O e-mail é opcional e só sai com
`SMTP_URL` configurado.

> **Plano gratuito do Render bloqueia SMTP** (portas 25, 465 e 587): o e-mail só funciona
> com o serviço `crm-api` num plano pago. O aviso no sistema funciona em qualquer plano.


- **SMTP:** qualquer provedor serve. No Gmail, ative a verificação em duas etapas, crie
  uma *senha de app* e use
  `smtps://seu.email%40gmail.com:senha-de-app@smtp.gmail.com:465` (o `@` do usuário vira
  `%40`). Para volume maior, use um provedor transacional (Resend, Brevo, SendGrid,
  Amazon SES), que também fornece uma URL SMTP.
- **Horário:** a função [`enviar-oportunidades`](../apps/web/netlify/functions/enviar-oportunidades.mts)
  roda de segunda a sexta às 8h de Brasília (`0 11 * * 1-5`, em UTC). Para mudar, altere o
  `schedule` e publique de novo.
- **Quem recebe:** cada assessor ativo recebe as oportunidades da própria carteira; cada
  admin, as da base toda. Quem não tem nenhuma oportunidade aprovada pelo comitê não
  recebe e-mail. Quem já recebeu no dia não recebe de novo pelo agendamento.
- **Avisar agora:** o admin tem o botão *Avisar assessores* na tela *Oportunidades do dia*
  (refaz o aviso do dia, trocando o anterior).
- **Auditoria:** cada e-mail enviado fica registrado (`EXPORTACAO_DADOS`, entidade
  `EnvioOportunidades`), com destinatário e clientes citados.

O e-mail leva nome, perfil e patrimônio de clientes. Envie só para endereços corporativos
dos assessores.

## Conferência depois do deploy

- `https://<api>.onrender.com/api/health/ready` responde `{"status":"ok"}` (API + banco).
- `https://<motor>.onrender.com/health` responde com `"status":"ok"`.
- Login no site funciona e a tela *Oportunidades do dia* lista resultados.
- Nos logs da função agendada (Netlify → Logs → Functions), o disparo aparece com `HTTP 202`.
