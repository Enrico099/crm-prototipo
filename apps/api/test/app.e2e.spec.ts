import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/main';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiEngineService, type AiEngineResponse } from '../src/recomendacoes/ai-engine.service';
import { QUESTIONARIO } from '../src/suitability/questionario';
import { EmailService } from '../src/envios/email.service';
import { FakePrisma, novoId } from './fake-prisma';
import { ConfigService } from '@nestjs/config';
import { base32Decode, hotp, passoAtual } from '../src/auth/mfa/totp';

const SENHA = 'Senha123!';

type Contexto = Awaited<ReturnType<typeof criarApp>>;

async function criarApp() {
  const prisma = new FakePrisma();
  const ai = { recommend: jest.fn(), health: jest.fn().mockResolvedValue({ ok: true }) };
  const email = { configurado: true, enviar: jest.fn().mockResolvedValue(undefined) };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(AiEngineService)
    .useValue(ai)
    .overrideProvider(EmailService)
    .useValue(email)
    .compile();

  const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
  configurarApp(app, { WEB_ORIGIN: 'http://localhost:3000', TRUST_PROXY: 'loopback' });
  await app.init();

  const senhaHash = await bcrypt.hash(SENHA, 4);
  const mkUser = (email: string, role: string, nome: string) =>
    prisma.user.create({ data: { email, role, nome, senhaHash } }) as Promise<{ id: string }>;

  const admin = await mkUser('admin@ce.com', 'ADMIN', 'Admin');
  const joao = await mkUser('joao@ce.com', 'ASSESSOR', 'João Diniz');
  const marina = await mkUser('marina@ce.com', 'ASSESSOR', 'Marina Lopes');
  const leitor = await mkUser('leitor@ce.com', 'READONLY', 'Leitor');
  const compliance = await mkUser('compliance@ce.com', 'COMPLIANCE', 'Compliance');

  const mkCliente = (nome: string, responsavelId: string, extra: Record<string, unknown> = {}) =>
    prisma.cliente.create({
      data: {
        nome,
        email: `${nome.split(' ')[0].toLowerCase()}@cliente.com`,
        cpfHash: `h1:${novoId()}`,
        cpfMasked: '***.***.000-00',
        perfil: 'MODERADO',
        status: 'ATIVO',
        patrimonio: 1_000_000,
        responsavelId,
        ...extra,
      },
    }) as Promise<{ id: string }>;

  const clienteJoao = await mkCliente('Ana Joao', joao.id);
  const clienteMarina = await mkCliente('Bruno Marina', marina.id);
  const clienteSemSuit = await mkCliente('Caio Semsuit', joao.id);

  const cdb = (await prisma.produto.create({
    data: {
      nome: 'CDB Liquidez', emissor: 'Banco A', categoria: 'RENDA_FIXA', rentabilidadeAno: 11.5,
      risco: 1, perfilMinimo: 'CONSERVADOR', liquidez: 'D+1', taxaAdmin: null,
    },
  })) as { id: string };
  const acoes = (await prisma.produto.create({
    data: {
      nome: 'Fundo Ações', emissor: 'Gestora B', categoria: 'FUNDOS', rentabilidadeAno: 14,
      risco: 4, perfilMinimo: 'ARROJADO', liquidez: 'D+30', taxaAdmin: 2,
    },
  })) as { id: string };

  await prisma.posicao.create({ data: { clienteId: clienteJoao.id, produtoId: cdb.id, valor: 200_000 } });

  // Suitability gravada no formato real do questionário (ids de opção)
  const suitJoao = (await prisma.suitability.create({
    data: {
      clienteId: clienteJoao.id,
      respostas: { horizonte: 'h3', tolerancia_perda: 't2' },
      pontuacao: 40,
      perfilCalculado: 'MODERADO',
      validoAte: new Date(Date.now() + 365 * 86_400_000),
      aplicadoPorId: joao.id,
    },
  })) as { id: string };

  return {
    app, prisma, ai, admin, joao, marina, leitor, compliance,
    clienteJoao, clienteMarina, clienteSemSuit, cdb, acoes, suitJoao, email,
  };
}

async function logar(c: Contexto, email: string) {
  const agent = request.agent(c.app.getHttpServer());
  await agent.post('/api/auth/login').send({ email, password: SENHA }).expect(200);
  return agent;
}

function cookies(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as unknown as string[] | string | undefined;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

function valorCookie(res: request.Response, nome: string) {
  return cookies(res).find((c) => c.startsWith(`${nome}=`))?.split(';')[0].slice(nome.length + 1);
}

function auditorias(c: Contexto, acao?: string) {
  return c.prisma.linhas('auditoria').filter((a) => !acao || a.acao === acao);
}

const ESPECIALISTAS = ['suitability', 'risco', 'concentracao', 'liquidez', 'custo', 'dados', 'conviccao'] as const;
const comiteAprovado = () =>
  ESPECIALISTAS.map((especialista) => ({ especialista, nome: especialista, aprovado: true, parecer: 'Ok.' }));

function respostaMotor(produtoIds: string[]): AiEngineResponse {
  return {
    recomendacoes: produtoIds.map((produtoId, i) => ({
      produtoId,
      produtoNome: 'Produto',
      score: 0.9 - i * 0.1,
      justificativa: 'Justificativa em pt-BR',
      fatores: { profileMatch: 1, diversification: 0.5, yield: 0.5, liquidity: 0.8, cost: 1 },
      pesos: { profileMatch: 0.2, diversification: 0.3, yield: 0.2, liquidity: 0.15, cost: 0.15 },
      contribs: [{ fator: 'cost', contrib: 0.15, frase: 'Sem taxa de administração.' }],
      scoreRegras: 0.8,
      scoreFonte: 'rule-engine',
      comite: comiteAprovado(),
    })),
    descartados: [{ motivo: 'perfil_incompativel', count: 1 }],
    totalAnalisados: 2,
    reprovadosComite: [],
    engineVersion: 'rule-engine-py-v1.4',
  };
}

describe('API (e2e com banco em memória)', () => {
  let c: Contexto;

  beforeEach(async () => {
    c = await criarApp();
  });
  afterEach(async () => {
    await c.app.close();
  });

  // ============================================================
  describe('autenticação', () => {
    it('login válido grava cookies httpOnly/SameSite e audita', async () => {
      const res = await request(c.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'JOAO@ce.com', password: SENHA })
        .expect(200);

      expect(res.body.user).toEqual({ id: c.joao.id, email: 'joao@ce.com', nome: 'João Diniz', role: 'ASSESSOR' });
      expect(JSON.stringify(res.body)).not.toContain('senhaHash');
      const set = cookies(res);
      for (const nome of ['crm_at', 'crm_rt']) {
        const ck = set.find((s) => s.startsWith(`${nome}=`))!;
        expect(ck).toMatch(/HttpOnly/i);
        expect(ck).toMatch(/SameSite=Lax/i);
        expect(ck).toMatch(/Path=\//);
      }
      expect(auditorias(c, 'LOGIN')).toHaveLength(1);
      expect(c.prisma.linhas('refreshToken')).toHaveLength(1);
    });

    it.each([
      ['senha errada', 'joao@ce.com', 'errada123'],
      ['e-mail inexistente', 'ninguem@ce.com', SENHA],
    ])('login inválido (%s) → 401 com mensagem genérica e auditoria', async (_n, email, password) => {
      const res = await request(c.app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(401);
      expect(res.body.message).toBe('Credenciais inválidas');
      expect(res.body.requestId).toBeDefined();
      expect(auditorias(c, 'LOGIN_FALHA')).toHaveLength(1);
    });

    it('usuário inativo não loga', async () => {
      await c.prisma.user.update({ where: { id: c.joao.id }, data: { ativo: false } });
      await request(c.app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'joao@ce.com', password: SENHA })
        .expect(401);
    });

    it('bloqueia com 429 após 5 falhas seguidas', async () => {
      const http = request(c.app.getHttpServer());
      for (let i = 0; i < 5; i++) {
        await http.post('/api/auth/login').send({ email: 'joao@ce.com', password: 'errada123' }).expect(401);
      }
      await http.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA }).expect(429);
    });

    it('payload de login inválido → 400 com mensagens em pt-BR', async () => {
      const res = await request(c.app.getHttpServer()).post('/api/auth/login').send({ email: 'x' }).expect(400);
      expect(res.body.errors.fieldErrors.email).toContain('E-mail inválido');
      expect(res.body.errors.fieldErrors.password).toContain('Campo obrigatório');
    });

    it('refresh rotaciona o token e o anterior fica revogado', async () => {
      const agent = request.agent(c.app.getHttpServer());
      const login = await agent.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA });
      const rt1 = valorCookie(login, 'crm_rt');

      const ref = await agent.post('/api/auth/refresh').expect(200);
      const rt2 = valorCookie(ref, 'crm_rt');
      expect(rt2).toBeDefined();
      expect(rt2).not.toBe(rt1);

      const tokens = c.prisma.linhas('refreshToken');
      expect(tokens).toHaveLength(2);
      expect(tokens[0].revogadoEm).toBeInstanceOf(Date);
      expect(tokens[0].substituidoPor).toBe(tokens[1].id);
      expect(tokens[1].familiaId).toBe(tokens[0].familiaId);

      await agent.get('/api/auth/me').expect(200);
    });

    it('reuso de refresh token já rotacionado revoga a sessão inteira e audita', async () => {
      const agent = request.agent(c.app.getHttpServer());
      const login = await agent.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA });
      const rtAntigo = valorCookie(login, 'crm_rt')!;
      await agent.post('/api/auth/refresh').expect(200);

      // Simula reapresentação fora da janela de concorrência (token roubado)
      c.prisma.linhas('refreshToken')[0].revogadoEm = new Date(Date.now() - 60_000);

      await request(c.app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `crm_rt=${rtAntigo}`)
        .expect(401);

      expect(c.prisma.linhas('refreshToken').every((t) => t.revogadoEm)).toBe(true);
      expect(auditorias(c, 'REUSO_REFRESH_TOKEN')).toHaveLength(1);
      // O token "legítimo" mais novo também morreu
      await agent.post('/api/auth/refresh').expect(401);
    });

    it('refresh concorrente (outra aba, dentro da janela) não derruba a sessão', async () => {
      const agent = request.agent(c.app.getHttpServer());
      const login = await agent.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA });
      const rtAntigo = valorCookie(login, 'crm_rt')!;
      await agent.post('/api/auth/refresh').expect(200);

      const res = await request(c.app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', `crm_rt=${rtAntigo}`)
        .expect(401);
      expect(res.body.code).toBe('REFRESH_CONCORRENTE');
      await agent.post('/api/auth/refresh').expect(200);
    });

    it('logout revoga no servidor, limpa cookies e audita', async () => {
      const agent = request.agent(c.app.getHttpServer());
      const login = await agent.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA });
      const rt = valorCookie(login, 'crm_rt')!;

      const out = await agent.post('/api/auth/logout').expect(204);
      expect(cookies(out).some((s) => /^crm_rt=;/.test(s) && /Expires=Thu, 01 Jan 1970/.test(s))).toBe(true);
      expect(auditorias(c, 'LOGOUT')).toHaveLength(1);

      // Mesmo que alguém tenha copiado o cookie, ele não vale mais
      await request(c.app.getHttpServer()).post('/api/auth/refresh').set('Cookie', `crm_rt=${rt}`).expect(401);
    });

    it('logout sem sessão ainda responde 204', async () => {
      await request(c.app.getHttpServer()).post('/api/auth/logout').expect(204);
    });

    it('endpoint protegido sem token → 401', async () => {
      await request(c.app.getHttpServer()).get('/api/clientes').expect(401);
      await request(c.app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('rejeita POST com Origin de outro site (CSRF)', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent
        .patch(`/api/clientes/${c.clienteJoao.id}`)
        .set('Origin', 'https://site-malicioso.example')
        .send({ cidade: 'Recife' })
        .expect(403);
    });
  });

  // ============================================================
  describe('autorização e escopo', () => {
    it('assessor só lista os próprios clientes', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const res = await agent.get('/api/clientes').expect(200);
      const ids = res.body.data.map((x: { id: string }) => x.id).sort();
      expect(ids).toEqual([c.clienteJoao.id, c.clienteSemSuit.id].sort());
    });

    it('assessor recebe 404 (não 403) ao acessar cliente de outro assessor', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent.get(`/api/clientes/${c.clienteMarina.id}`).expect(404);
      await agent.get(`/api/clientes/${c.clienteMarina.id}/detalhado`).expect(404);
      await agent.patch(`/api/clientes/${c.clienteMarina.id}`).send({ cidade: 'Xanxerê' }).expect(404);
    });

    it('READONLY lê a base toda mas não altera nada', async () => {
      const agent = await logar(c, 'leitor@ce.com');
      const res = await agent.get('/api/clientes').expect(200);
      expect(res.body.meta.total).toBe(3);
      await agent.patch(`/api/clientes/${c.clienteJoao.id}`).send({ cidade: 'Xanxerê' }).expect(403);
      await agent
        .post('/api/clientes')
        .send({ nome: 'Novo', email: 'n@x.com', cpf: '52998224725' })
        .expect(403);
      await agent.post('/api/recomendacoes/generate').send({ clienteId: c.clienteJoao.id }).expect(403);
    });

    it('auditoria é visível só pra ADMIN e COMPLIANCE', async () => {
      await (await logar(c, 'compliance@ce.com')).get('/api/auditoria').expect(200);
      await (await logar(c, 'admin@ce.com')).get('/api/auditoria').expect(200);
      await (await logar(c, 'joao@ce.com')).get('/api/auditoria').expect(403);
    });

    it('catálogo: assessor consulta mas não cria nem altera produtos', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent.get('/api/produtos').expect(200);
      await agent.patch(`/api/produtos/${c.cdb.id}`).send({ risco: 2 }).expect(403);
    });

    it('health detalhado só pra ADMIN; live e ready são públicos', async () => {
      const http = request(c.app.getHttpServer());
      await http.get('/api/health/live').expect(200);
      await http.get('/api/health/ready').expect(200);
      await http.get('/api/health').expect(401);
      await (await logar(c, 'joao@ce.com')).get('/api/health').expect(403);
      const res = await (await logar(c, 'admin@ce.com')).get('/api/health').expect(200);
      expect(res.body.dependencias.aiEngine.ok).toBe(true);
    });

    it('corpo acima do limite → 413 (não 500) e JSON malformado → 400', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const grande = await agent
        .post('/api/leads')
        .send({ nome: 'x'.repeat(150_000), origem: 'Teste' })
        .expect(413);
      expect(grande.body).toMatchObject({ statusCode: 413, message: 'Corpo da requisição grande demais' });
      await agent.post('/api/leads').set('Content-Type', 'application/json').send('{"nome":').expect(400);
    });

    it('id de rota malformado → 400 antes de tocar o banco', async () => {
      const agent = await logar(c, 'admin@ce.com');
      await agent.get('/api/clientes/1%20OR%201=1').expect(400);
    });
  });

  // ============================================================
  describe('clientes', () => {
    it('assessor cria cliente na própria carteira; CPF nunca sai na resposta nem na auditoria', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const res = await agent
        .post('/api/clientes')
        .send({ nome: 'Diana Nova', email: 'diana@x.com', cpf: '529.982.247-25', patrimonio: 500000 })
        .expect(201);

      expect(res.body.responsavelId).toBe(c.joao.id);
      expect(res.body.cpfMasked).toBe('***.***.247-25');
      expect(res.body).not.toHaveProperty('cpfHash');
      expect(res.body.patrimonio).toBe(500000);
      const aud = auditorias(c, 'CRIACAO');
      expect(aud).toHaveLength(1);
      expect(JSON.stringify(aud[0])).not.toContain('52998224725');
    });

    it('assessor não pode criar cliente na carteira de outro', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent
        .post('/api/clientes')
        .send({ nome: 'Diana', email: 'd@x.com', cpf: '52998224725', responsavelId: c.marina.id })
        .expect(403);
    });

    it('CPF inválido → 400; CPF duplicado → 409', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent.post('/api/clientes').send({ nome: 'X Y', email: 'x@x.com', cpf: '52998224724' }).expect(400);
      await agent.post('/api/clientes').send({ nome: 'X Y', email: 'x@x.com', cpf: '52998224725' }).expect(201);
      const dup = await agent
        .post('/api/clientes')
        .send({ nome: 'Z W', email: 'z@x.com', cpf: '52998224725' })
        .expect(409);
      expect(dup.body.message).toMatch(/CPF/);
    });

    it('atualização audita só os campos alterados; perfil não muda por PATCH', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent.patch(`/api/clientes/${c.clienteJoao.id}`).send({ cidade: 'Recife', patrimonio: 1_000_000 }).expect(200);
      const aud = auditorias(c, 'ATUALIZACAO');
      expect(aud).toHaveLength(1);
      expect(aud[0].diff).toEqual({ antes: { cidade: null }, depois: { cidade: 'Recife' } });

      await agent.patch(`/api/clientes/${c.clienteJoao.id}`).send({ perfil: 'AGRESSIVO' }).expect(400);
    });

    it('filtros e paginação', async () => {
      const agent = await logar(c, 'admin@ce.com');
      const p1 = await agent.get('/api/clientes?limit=2&page=1&sort=nome').expect(200);
      expect(p1.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect(p1.body.data.map((x: { nome: string }) => x.nome)).toEqual(['Ana Joao', 'Bruno Marina']);
      const p2 = await agent.get('/api/clientes?limit=2&page=2&sort=nome').expect(200);
      expect(p2.body.data).toHaveLength(1);

      const busca = await agent.get('/api/clientes?q=bruno').expect(200);
      expect(busca.body.data).toHaveLength(1);

      await agent.get('/api/clientes?limit=1000').expect(400);
      await agent.get('/api/clientes?sort=senhaHash').expect(400);
    });

    it('exclusão é lógica (INATIVO), só ADMIN, e preserva suitability', async () => {
      await (await logar(c, 'joao@ce.com')).delete(`/api/clientes/${c.clienteJoao.id}`).expect(403);
      const admin = await logar(c, 'admin@ce.com');
      const res = await admin.delete(`/api/clientes/${c.clienteJoao.id}`).expect(200);
      expect(res.body).toEqual({ id: c.clienteJoao.id, inativado: true });
      expect(c.prisma.linhas('cliente').find((x) => x.id === c.clienteJoao.id)?.status).toBe('INATIVO');
      expect(c.prisma.linhas('suitability')).toHaveLength(1);
    });

    it('assessor não inativa nem reativa cliente por PATCH de status', async () => {
      const joao = await logar(c, 'joao@ce.com');
      await joao.patch(`/api/clientes/${c.clienteJoao.id}`).send({ status: 'INATIVO' }).expect(403);
      await joao.patch(`/api/clientes/${c.clienteJoao.id}`).send({ status: 'BLOQUEADO' }).expect(200);

      const admin = await logar(c, 'admin@ce.com');
      await admin.patch(`/api/clientes/${c.clienteJoao.id}`).send({ status: 'INATIVO' }).expect(200);
      await joao.patch(`/api/clientes/${c.clienteJoao.id}`).send({ status: 'ATIVO' }).expect(403);
      await admin.patch(`/api/clientes/${c.clienteJoao.id}`).send({ status: 'ATIVO' }).expect(200);
    });

    it('detalhado registra acesso a dado sensível', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const res = await agent.get(`/api/clientes/${c.clienteJoao.id}/detalhado`).expect(200);
      expect(res.body.posicoes).toHaveLength(1);
      expect(res.body.suitability.vencida).toBe(false);
      expect(res.body.suitability).not.toHaveProperty('respostas');
      expect(auditorias(c, 'ACESSO_DADO_SENSIVEL')).toHaveLength(1);
    });
  });

  // ============================================================
  describe('suitability', () => {
    const respostas = Object.fromEntries(QUESTIONARIO.map((p) => [p.id, p.opcoes.at(-1)!.id]));

    it('questionário não expõe a pontuação das opções', async () => {
      const res = await (await logar(c, 'joao@ce.com')).get('/api/suitability/questionario').expect(200);
      expect(JSON.stringify(res.body)).not.toContain('pontos');
    });

    it('aplicação atualiza o perfil e audita na mesma transação', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const res = await agent.post('/api/suitability').send({ clienteId: c.clienteSemSuit.id, respostas }).expect(201);
      expect(res.body).toMatchObject({ perfilAnterior: 'MODERADO', perfilNovo: 'AGRESSIVO', mudou: true });
      expect(c.prisma.linhas('cliente').find((x) => x.id === c.clienteSemSuit.id)?.perfil).toBe('AGRESSIVO');
      const aud = auditorias(c, 'APLICACAO_SUITABILITY');
      expect(aud).toHaveLength(1);
      expect(aud[0].diff).toMatchObject({ pontuacao: 100, perfilNovo: 'AGRESSIVO' });
    });

    it('respostas incompletas → 400 e nada é gravado', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const { horizonte: _h, ...incompletas } = respostas;
      await agent.post('/api/suitability').send({ clienteId: c.clienteSemSuit.id, respostas: incompletas }).expect(400);
      expect(c.prisma.linhas('suitability')).toHaveLength(1);
    });

    it('não aplica em cliente de outro assessor', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent.post('/api/suitability').send({ clienteId: c.clienteMarina.id, respostas }).expect(404);
    });
  });

  // ============================================================
  describe('envio das oportunidades do dia', () => {
    const TOKEN = 'token-de-teste-do-agendador-0123456789';

    it('só admin dispara pelo botão; e-mail só para quem tem oportunidade, com auditoria', async () => {
      const joao = await logar(c, 'joao@ce.com');
      await joao.post('/api/envios/oportunidades-do-dia').expect(403);

      // Ordem dos destinatários: por id (admin, joao, marina). Admin vê a base toda.
      c.ai.recommend.mockResolvedValue(respostaMotor([c.cdb.id]));
      const admin = await logar(c, 'admin@ce.com');
      const res = await admin.post('/api/envios/oportunidades-do-dia').expect(200);

      expect(res.body).toMatchObject({ enviados: 2, semOportunidade: 1, falhas: 0 });
      const para = c.email.enviar.mock.calls.map(([e]: [{ para: string }]) => e.para).sort();
      expect(para).toEqual(['admin@ce.com', 'joao@ce.com']);
      const [emailJoao] = c.email.enviar.mock.calls.find(([e]: [{ para: string }]) => e.para === 'joao@ce.com');
      expect(emailJoao.html).toContain('Ana Joao');
      expect(emailJoao.html).not.toContain('Bruno Marina');
      expect(auditorias(c, 'EXPORTACAO_DADOS')).toHaveLength(2);
    });

    it('disparo agendado exige o token e não reenvia no mesmo dia', async () => {
      const server = c.app.getHttpServer();
      await request(server).post('/api/envios/oportunidades-do-dia/agendado').expect(401);
      await request(server)
        .post('/api/envios/oportunidades-do-dia/agendado')
        .set('Authorization', 'Bearer errado')
        .expect(401);

      c.ai.recommend.mockResolvedValue(respostaMotor([c.cdb.id]));
      await request(server)
        .post('/api/envios/oportunidades-do-dia/agendado')
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(202);
      await new Promise((r) => setTimeout(r, 50));
      expect(c.email.enviar).toHaveBeenCalledTimes(2);

      await request(server)
        .post('/api/envios/oportunidades-do-dia/agendado')
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(202);
      await new Promise((r) => setTimeout(r, 50));
      expect(c.email.enviar).toHaveBeenCalledTimes(2);
    });

    it('sem SMTP configurado → 503', async () => {
      c.email.configurado = false;
      const admin = await logar(c, 'admin@ce.com');
      const res = await admin.post('/api/envios/oportunidades-do-dia').expect(503);
      expect(res.body.message).toMatch(/SMTP_URL/);
    });
  });

  // ============================================================
  describe('recomendações', () => {
    function gerar(agent: ReturnType<typeof request.agent>, clienteId = c.clienteJoao.id) {
      c.ai.recommend.mockResolvedValueOnce(respostaMotor([c.cdb.id]));
      return agent.post('/api/recomendacoes/generate').send({ clienteId, topN: 3 });
    }

    it('sem suitability → 422 e o motor nem é chamado', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const res = await agent.post('/api/recomendacoes/generate').send({ clienteId: c.clienteSemSuit.id }).expect(422);
      expect(res.body.message).toMatch(/suitability/i);
      expect(c.ai.recommend).not.toHaveBeenCalled();
    });

    it('suitability vencida → 422', async () => {
      c.prisma.linhas('suitability')[0].validoAte = new Date(Date.now() - 1000);
      const agent = await logar(c, 'joao@ce.com');
      await agent.post('/api/recomendacoes/generate').send({ clienteId: c.clienteJoao.id }).expect(422);
    });

    it('topN acima do limite → 400', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent.post('/api/recomendacoes/generate').send({ clienteId: c.clienteJoao.id, topN: 50 }).expect(400);
    });

    it('converte a suitability do questionário em números pro motor (regressão do bug crítico)', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await gerar(agent).expect(200);
      const enviado = c.ai.recommend.mock.calls[0][0];
      expect(enviado.suitability).toEqual({ perfilCalculado: 'MODERADO', horizonteAnos: 5, toleranciaPerda: 10 });
      // Produto sem taxa vai como null; com taxa vai como número
      expect(enviado.catalog.find((p: { id: string }) => p.id === c.cdb.id).taxaAdmin).toBeNull();
      expect(enviado.catalog.find((p: { id: string }) => p.id === c.acoes.id).taxaAdmin).toBe(2);
      // Request id propagado pro motor
      expect(typeof c.ai.recommend.mock.calls[0][1]).toBe('string');
    });

    it('geração persiste PENDENTE com snapshot do contexto, expira as antigas e audita', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const r1 = await gerar(agent).expect(200);
      expect(r1.body).toMatchObject({ geradas: 1, totalAnalisados: 2, engineVersion: 'rule-engine-py-v1.4' });
      expect(r1.body.descartados).toEqual([{ motivo: 'perfil_incompativel', count: 1 }]);

      const rec = c.prisma.linhas('recomendacao')[0];
      expect(rec.status).toBe('PENDENTE');
      expect(rec.score).toBeInstanceOf(Prisma.Decimal);
      expect((rec.payload as { contexto: { suitabilityId: string } }).contexto.suitabilityId).toBe(c.suitJoao.id);
      expect((rec.payload as { aviso: string }).aviso).toMatch(/apoio à decisão/);

      await gerar(agent).expect(200);
      const status = c.prisma.linhas('recomendacao').map((r) => r.status);
      expect(status).toEqual(['EXPIRADA', 'PENDENTE']);
      expect(auditorias(c, 'GERACAO_RECOMENDACAO')).toHaveLength(2);
    });

    it('nenhum produto elegível: devolve resumo e mantém as pendentes', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await gerar(agent).expect(200);
      c.ai.recommend.mockResolvedValueOnce({ ...respostaMotor([]), descartados: [] });
      const res = await agent.post('/api/recomendacoes/generate').send({ clienteId: c.clienteJoao.id }).expect(200);
      expect(res.body).toMatchObject({ geradas: 0, recomendacoes: [] });
      expect(c.prisma.linhas('recomendacao')[0].status).toBe('PENDENTE');
    });

    it('motor devolvendo produto fora do catálogo → 502 e nada é gravado', async () => {
      const agent = await logar(c, 'joao@ce.com');
      c.ai.recommend.mockResolvedValueOnce(respostaMotor([novoId()]));
      await agent.post('/api/recomendacoes/generate').send({ clienteId: c.clienteJoao.id }).expect(502);
      expect(c.prisma.linhas('recomendacao')).toHaveLength(0);
    });

    it('recomendação sem aprovação de todo o comitê → 502 e nada é gravado', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const resp = respostaMotor([c.cdb.id]);
      resp.recomendacoes[0].comite[2].aprovado = false;
      c.ai.recommend.mockResolvedValueOnce(resp);
      await agent.post('/api/recomendacoes/generate').send({ clienteId: c.clienteJoao.id }).expect(502);

      const semEspecialista = respostaMotor([c.cdb.id]);
      semEspecialista.recomendacoes[0].comite.pop();
      c.ai.recommend.mockResolvedValueOnce(semEspecialista);
      await agent.post('/api/recomendacoes/generate').send({ clienteId: c.clienteJoao.id }).expect(502);
      expect(c.prisma.linhas('recomendacao')).toHaveLength(0);
    });

    it('geração grava os pareceres do comitê no payload', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await gerar(agent).expect(200);
      const payload = c.prisma.linhas('recomendacao')[0].payload as { comite: unknown[] };
      expect(payload.comite).toHaveLength(ESPECIALISTAS.length);
    });

    it('oportunidades do dia: só a carteira do assessor, sem gravar, com pendências explicadas', async () => {
      const agent = await logar(c, 'joao@ce.com');
      c.ai.recommend.mockResolvedValueOnce(respostaMotor([c.cdb.id]));
      const res = await agent.get('/api/recomendacoes/oportunidades-do-dia').expect(200);

      expect(res.body.clientesAnalisados).toBe(2);
      expect(res.body.oportunidades).toHaveLength(1);
      expect(res.body.oportunidades[0]).toMatchObject({
        cliente: { id: c.clienteJoao.id },
        produtoId: c.cdb.id,
      });
      expect(res.body.oportunidades[0].comite).toHaveLength(ESPECIALISTAS.length);
      expect(res.body.pendencias).toEqual([
        { cliente: expect.objectContaining({ id: c.clienteSemSuit.id }), motivo: expect.stringMatching(/suitability/i) },
      ]);
      expect(c.ai.recommend).toHaveBeenCalledTimes(1);
      expect(c.prisma.linhas('recomendacao')).toHaveLength(0);
    });

    it('oportunidades do dia: falha do motor num cliente vira pendência, não derruba a lista', async () => {
      const agent = await logar(c, 'joao@ce.com');
      c.ai.recommend.mockRejectedValueOnce(new Error('motor fora'));
      const res = await agent.get('/api/recomendacoes/oportunidades-do-dia').expect(200);
      expect(res.body.oportunidades).toEqual([]);
      expect(res.body.pendencias.map((p: { motivo: string }) => p.motivo)).toEqual(
        expect.arrayContaining([expect.stringMatching(/não respondeu/)]),
      );
    });

    it('aprovação grava decisor, audita e não pode ser repetida', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const id = (await gerar(agent)).body.recomendacoes[0].id;

      const res = await agent.patch(`/api/recomendacoes/${id}/aprovar`).expect(200);
      expect(res.body).toMatchObject({ status: 'APROVADA', aprovadoPor: { id: c.joao.id } });
      const aud = auditorias(c, 'APROVACAO_RECOMENDACAO');
      expect(aud).toHaveLength(1);
      expect(aud[0].diff).toMatchObject({ statusAnterior: 'PENDENTE', statusNovo: 'APROVADA', produtoId: c.cdb.id });

      await agent.patch(`/api/recomendacoes/${id}/aprovar`).expect(409);
      await agent.patch(`/api/recomendacoes/${id}/recusar`).send({ motivo: 'mudei de ideia' }).expect(409);
    });

    it('recusa exige motivo e o registra na auditoria', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const id = (await gerar(agent)).body.recomendacoes[0].id;
      await agent.patch(`/api/recomendacoes/${id}/recusar`).send({}).expect(400);
      await agent.patch(`/api/recomendacoes/${id}/recusar`).send({ motivo: '  ' }).expect(400);
      const res = await agent.patch(`/api/recomendacoes/${id}/recusar`).send({ motivo: 'Cliente prefere liquidez' }).expect(200);
      expect(res.body).toMatchObject({ status: 'RECUSADA', recusaMotivo: 'Cliente prefere liquidez' });
      expect(auditorias(c, 'RECUSA_RECOMENDACAO')[0].diff).toMatchObject({ motivo: 'Cliente prefere liquidez' });
    });

    it('não aprova se a suitability foi reaplicada depois da geração', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const id = (await gerar(agent)).body.recomendacoes[0].id;
      await c.prisma.suitability.create({
        data: {
          clienteId: c.clienteJoao.id,
          respostas: { horizonte: 'h1', tolerancia_perda: 't1' },
          pontuacao: 10,
          perfilCalculado: 'CONSERVADOR',
          aplicadoEm: new Date(Date.now() + 1000),
          validoAte: new Date(Date.now() + 365 * 86_400_000),
        },
      });
      const res = await agent.patch(`/api/recomendacoes/${id}/aprovar`).expect(409);
      expect(res.body.message).toMatch(/reavaliado/);
      expect(c.prisma.linhas('recomendacao')[0].status).toBe('PENDENTE');
      expect(auditorias(c, 'APROVACAO_RECOMENDACAO')).toHaveLength(0);
    });

    it('não aprova produto desativado depois da geração', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const id = (await gerar(agent)).body.recomendacoes[0].id;
      await (await logar(c, 'admin@ce.com')).delete(`/api/produtos/${c.cdb.id}`).expect(200);
      await agent.patch(`/api/recomendacoes/${id}/aprovar`).expect(409);
    });

    it('pendente vencida aparece como EXPIRADA e não pode ser aprovada', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const id = (await gerar(agent)).body.recomendacoes[0].id;
      c.prisma.linhas('recomendacao')[0].expiraEm = new Date(Date.now() - 1000);

      const pend = await agent.get('/api/recomendacoes?status=PENDENTE').expect(200);
      expect(pend.body.data).toHaveLength(0);
      const exp = await agent.get('/api/recomendacoes?status=EXPIRADA').expect(200);
      expect(exp.body.data[0]).toMatchObject({ id, status: 'EXPIRADA' });

      await agent.patch(`/api/recomendacoes/${id}/aprovar`).expect(409);
    });

    it('assessor não decide recomendação de cliente de outro assessor', async () => {
      const marina = await logar(c, 'marina@ce.com');
      const joao = await logar(c, 'joao@ce.com');
      const id = (await gerar(joao)).body.recomendacoes[0].id;
      await marina.patch(`/api/recomendacoes/${id}/aprovar`).expect(404);
      await (await logar(c, 'leitor@ce.com')).patch(`/api/recomendacoes/${id}/aprovar`).expect(403);
    });
  });

  // ============================================================
  describe('leads', () => {
    it('estágio só muda via mover-estagio (com histórico), não por PATCH', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const lead = (await agent.post('/api/leads').send({ nome: 'Lead X', origem: 'Indicação' }).expect(201)).body;
      await agent.patch(`/api/leads/${lead.id}`).send({ estagio: 'FECHADO' }).expect(400);
      await agent.post(`/api/leads/${lead.id}/mover-estagio`).send({ estagio: 'PROPOSTA' }).expect(200);
      expect(c.prisma.linhas('estagioHistorico').map((h) => h.estagio)).toEqual(['PROSPECCAO', 'PROPOSTA']);
    });

    it('conversão cria o cliente, fecha o lead e audita, tudo na mesma transação', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const lead = (
        await agent
          .post('/api/leads')
          .send({ nome: 'Lia Convertida', email: 'lia@x.com', origem: 'Evento', valorEstimado: 750000 })
          .expect(201)
      ).body;

      const res = await agent
        .post(`/api/leads/${lead.id}/converter`)
        .send({ cpf: '529.982.247-25', uf: 'sp' })
        .expect(201);

      // Nome, e-mail e patrimônio herdados do lead; responsável idem
      expect(res.body.cliente).toMatchObject({
        nome: 'Lia Convertida',
        email: 'lia@x.com',
        patrimonio: 750000,
        uf: 'SP',
        status: 'PROSPECTO',
        responsavelId: c.joao.id,
      });
      expect(res.body.cliente).not.toHaveProperty('cpfHash');
      expect(res.body.lead).toMatchObject({ estagio: 'FECHADO', clienteId: res.body.cliente.id });
      expect(res.body.lead.cliente).toEqual({ id: res.body.cliente.id, nome: 'Lia Convertida' });
      expect(c.prisma.linhas('estagioHistorico').at(-1)).toMatchObject({ estagio: 'FECHADO', notas: 'Convertido em cliente' });

      const criacao = auditorias(c, 'CRIACAO').find((a) => a.entidade === 'Cliente');
      expect(criacao?.diff).toMatchObject({ origemLeadId: lead.id });
      expect(JSON.stringify(auditorias(c))).not.toContain('52998224725');

      // Segunda conversão, mudança de estágio e exclusão ficam bloqueadas
      await agent.post(`/api/leads/${lead.id}/converter`).send({ cpf: '11144477735' }).expect(409);
      await agent.post(`/api/leads/${lead.id}/mover-estagio`).send({ estagio: 'PROPOSTA' }).expect(409);
      await agent.delete(`/api/leads/${lead.id}`).expect(409);
    });

    it('conversão com CPF duplicado não altera nada (rollback)', async () => {
      const agent = await logar(c, 'joao@ce.com');
      await agent.post('/api/clientes').send({ nome: 'Já Existe', email: 'ja@x.com', cpf: '52998224725' }).expect(201);
      const lead = (await agent.post('/api/leads').send({ nome: 'Lead Dup', email: 'dup@x.com', origem: 'Inbound' })).body;
      const clientesAntes = c.prisma.linhas('cliente').length;

      await agent.post(`/api/leads/${lead.id}/converter`).send({ cpf: '52998224725' }).expect(409);

      expect(c.prisma.linhas('cliente')).toHaveLength(clientesAntes);
      const depois = c.prisma.linhas('lead').find((l) => l.id === lead.id);
      expect(depois).toMatchObject({ estagio: 'PROSPECCAO', clienteId: null });
    });

    it('conversão exige e-mail quando o lead não tem, recusa lead perdido e respeita o escopo', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const semEmail = (await joao.post('/api/leads').send({ nome: 'Sem Email', origem: 'Inbound' })).body;
      await joao.post(`/api/leads/${semEmail.id}/converter`).send({ cpf: '52998224725' }).expect(422);

      await joao.post(`/api/leads/${semEmail.id}/mover-estagio`).send({ estagio: 'PERDIDO' }).expect(200);
      await joao
        .post(`/api/leads/${semEmail.id}/converter`)
        .send({ cpf: '52998224725', email: 'a@x.com' })
        .expect(422);

      const marina = await logar(c, 'marina@ce.com');
      await marina.post(`/api/leads/${semEmail.id}/converter`).send({ cpf: '52998224725', email: 'a@x.com' }).expect(404);
      const leitor = await logar(c, 'leitor@ce.com');
      await leitor.post(`/api/leads/${semEmail.id}/converter`).send({ cpf: '52998224725', email: 'a@x.com' }).expect(403);
    });

    it('conversão rejeita campos que não podem vir do formulário', async () => {
      const agent = await logar(c, 'joao@ce.com');
      const lead = (await agent.post('/api/leads').send({ nome: 'Lead P', email: 'p@x.com', origem: 'Inbound' })).body;
      await agent
        .post(`/api/leads/${lead.id}/converter`)
        .send({ cpf: '52998224725', perfil: 'AGRESSIVO' })
        .expect(400);
    });
  });

  describe('carteira (movimentações)', () => {
    const posicao = (clienteId: string, produtoId: string) =>
      c.prisma.linhas('posicao').find((p) => p.clienteId === clienteId && p.produtoId === produtoId);
    const valorDe = (row?: Record<string, unknown>) => (row ? Number(String(row.valor)) : undefined);

    it('aplicação soma na posição existente; resgate subtrai; resgate total encerra a posição', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const url = `/api/clientes/${c.clienteJoao.id}/movimentacoes`;

      const apl = await joao.post(url).send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 50_000.5 }).expect(201);
      expect(apl.body).toMatchObject({ tipo: 'APLICACAO', valor: 50_000.5, desenquadrada: false, registradoPor: { nome: 'João Diniz' } });
      expect(valorDe(posicao(c.clienteJoao.id, c.cdb.id))).toBe(250_000.5);

      await joao.post(url).send({ tipo: 'RESGATE', produtoId: c.cdb.id, valor: 300_000 }).expect(422);
      expect(valorDe(posicao(c.clienteJoao.id, c.cdb.id))).toBe(250_000.5);

      await joao.post(url).send({ tipo: 'RESGATE', produtoId: c.cdb.id, valor: 250_000.5 }).expect(201);
      expect(posicao(c.clienteJoao.id, c.cdb.id)).toBeUndefined();

      const lista = await joao.get(url).expect(200);
      expect(lista.body.meta.total).toBe(2);
      const aud = auditorias(c, 'CRIACAO').filter((a) => a.entidade === 'Movimentacao');
      expect(aud).toHaveLength(2);
    });

    it('resgate sem posição → 422; valor inválido, data futura e SALDO_INICIAL → 400', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const url = `/api/clientes/${c.clienteJoao.id}/movimentacoes`;
      const r = await joao.post(url).send({ tipo: 'RESGATE', produtoId: c.acoes.id, valor: 10 }).expect(422);
      expect(r.body.message).toMatch(/não tem posição/);
      await joao.post(url).send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 0 }).expect(400);
      await joao.post(url).send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 10.555 }).expect(400);
      const futuro = new Date(Date.now() + 86_400_000).toISOString();
      await joao.post(url).send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 10, data: futuro }).expect(400);
      await joao.post(url).send({ tipo: 'SALDO_INICIAL', produtoId: c.cdb.id, valor: 10 }).expect(400);
    });

    it('produto acima do perfil exige ciência do cliente e fica marcado como desenquadrado', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const url = `/api/clientes/${c.clienteJoao.id}/movimentacoes`;
      // Cliente MODERADO, fundo exige ARROJADO
      const sem = await joao.post(url).send({ tipo: 'APLICACAO', produtoId: c.acoes.id, valor: 1000 }).expect(422);
      expect(sem.body).toMatchObject({ code: 'DESENQUADRAMENTO' });
      expect(sem.body.message).toMatch(/acima do perfil/);
      expect(posicao(c.clienteJoao.id, c.acoes.id)).toBeUndefined();

      const com = await joao
        .post(url)
        .send({ tipo: 'APLICACAO', produtoId: c.acoes.id, valor: 1000, cienciaDesenquadramento: true })
        .expect(201);
      expect(com.body.desenquadrada).toBe(true);
      const aud = auditorias(c, 'CRIACAO').find((a) => a.entidadeId === com.body.id);
      expect(aud?.diff).toMatchObject({ desenquadrada: true });
    });

    it('cliente sem suitability: aplicação também exige ciência', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const r = await joao
        .post(`/api/clientes/${c.clienteSemSuit.id}/movimentacoes`)
        .send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 1000 })
        .expect(422);
      expect(r.body.message).toMatch(/não tem suitability/);
    });

    it('primeira aplicação torna o prospecto ativo; inativo não aplica; bloqueado não movimenta', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const prospecto = await c.prisma.cliente.create({
        data: { nome: 'Pedro Prospecto', email: 'pedro@cliente.com', cpfHash: 'h1:p', cpfMasked: 'x', status: 'PROSPECTO', responsavelId: c.joao.id },
      }) as { id: string };
      await joao
        .post(`/api/clientes/${prospecto.id}/movimentacoes`)
        .send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 1000, cienciaDesenquadramento: true })
        .expect(201);
      expect(c.prisma.linhas('cliente').find((x) => x.id === prospecto.id)?.status).toBe('ATIVO');

      const linha = c.prisma.linhas('cliente').find((x) => x.id === prospecto.id)!;
      linha.status = 'INATIVO';
      await joao
        .post(`/api/clientes/${prospecto.id}/movimentacoes`)
        .send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 1000, cienciaDesenquadramento: true })
        .expect(422);
      // Inativo ainda pode resgatar o que tem
      await joao.post(`/api/clientes/${prospecto.id}/movimentacoes`).send({ tipo: 'RESGATE', produtoId: c.cdb.id, valor: 500 }).expect(201);

      // A transação que falhou acima restaurou um snapshot: buscar a linha de novo
      c.prisma.linhas('cliente').find((x) => x.id === prospecto.id)!.status = 'BLOQUEADO';
      await joao.post(`/api/clientes/${prospecto.id}/movimentacoes`).send({ tipo: 'RESGATE', produtoId: c.cdb.id, valor: 100 }).expect(422);
    });

    it('aplicação vinculada a recomendação aprovada a marca como ATIVA, uma única vez', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const rec = await c.prisma.recomendacao.create({
        data: { clienteId: c.clienteJoao.id, produtoId: c.cdb.id, score: 0.8, justificativa: 'x', payload: {}, status: 'APROVADA' },
      }) as { id: string };
      const url = `/api/clientes/${c.clienteJoao.id}/movimentacoes`;

      await joao.post(url).send({ tipo: 'APLICACAO', produtoId: c.acoes.id, valor: 10, recomendacaoId: rec.id, cienciaDesenquadramento: true }).expect(422);
      await joao.post(url).send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 10, recomendacaoId: rec.id }).expect(201);
      expect(c.prisma.linhas('recomendacao').find((r) => r.id === rec.id)?.status).toBe('ATIVA');
      await joao.post(url).send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 10, recomendacaoId: rec.id }).expect(409);
    });

    it('escopo: assessor não movimenta nem lista carteira de outro; leitura não registra', async () => {
      const marina = await logar(c, 'marina@ce.com');
      await marina.post(`/api/clientes/${c.clienteJoao.id}/movimentacoes`).send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 10 }).expect(404);
      await marina.get(`/api/clientes/${c.clienteJoao.id}/movimentacoes`).expect(404);
      const leitor = await logar(c, 'leitor@ce.com');
      await leitor.get(`/api/clientes/${c.clienteJoao.id}/movimentacoes`).expect(200);
      await leitor.post(`/api/clientes/${c.clienteJoao.id}/movimentacoes`).send({ tipo: 'APLICACAO', produtoId: c.cdb.id, valor: 10 }).expect(403);
    });

    it('série mensal: patrimônio aplicado acumulado e captação, sem contar saldo inicial; respeita escopo', async () => {
      const agora = new Date();
      const mesesAtras = (n: number) => new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - n, 15, 12));
      const mov = (clienteId: string, tipo: string, valor: number, data: Date) =>
        c.prisma.movimentacao.create({ data: { clienteId, produtoId: c.cdb.id, tipo, valor, data } });
      await mov(c.clienteJoao.id, 'SALDO_INICIAL', 1000, mesesAtras(14)); // antes da janela
      await mov(c.clienteJoao.id, 'APLICACAO', 500, mesesAtras(2));
      await mov(c.clienteJoao.id, 'RESGATE', 200, mesesAtras(1));
      await mov(c.clienteMarina.id, 'APLICACAO', 9999, mesesAtras(1)); // fora do escopo do João

      const joao = await logar(c, 'joao@ce.com');
      const res = await joao.get('/api/carteira/series?meses=3').expect(200);
      expect(res.body.base).toBe('custo');
      expect(res.body.meses.map((m: { patrimonioAplicado: number }) => m.patrimonioAplicado)).toEqual([1500, 1300, 1300]);
      expect(res.body.meses[0]).toMatchObject({ entradas: 500, saidas: 0, captacaoLiquida: 500 });
      expect(res.body.meses[1]).toMatchObject({ entradas: 0, saidas: 200, captacaoLiquida: -200 });
      expect(res.body.meses[2].mes).toMatch(/^\d{4}-\d{2}$/);

      const admin = await logar(c, 'admin@ce.com');
      const todos = await admin.get('/api/carteira/series?meses=3').expect(200);
      expect(todos.body.meses[1].entradas).toBe(9999);
      await admin.get('/api/carteira/series?meses=99').expect(400);
    });
  });

  describe('usuários', () => {
    it('lista de assessores só para ADMIN e sem dados de credencial', async () => {
      const admin = await logar(c, 'admin@ce.com');
      const res = await admin.get('/api/usuarios/assessores').expect(200);
      expect(res.body.map((u: { nome: string }) => u.nome)).toEqual(['João Diniz', 'Marina Lopes']);
      expect(Object.keys(res.body[0]).sort()).toEqual(['email', 'id', 'nome']);

      const joao = await logar(c, 'joao@ce.com');
      await joao.get('/api/usuarios/assessores').expect(403);
    });
  });

  // ============================================================
  describe('MFA (verificação em duas etapas)', () => {
    /** Código do autenticador para o segredo, deslocado em passos de 30 s */
    const codigo = (segredo: string, passos = 0) => hotp(base32Decode(segredo), passoAtual() + passos);

    /** Configura e ativa o MFA do usuário logado; devolve segredo e códigos de recuperação */
    async function ativarMfa(agent: ReturnType<typeof request.agent>) {
      const conf = await agent.post('/api/auth/mfa/configurar').expect(200);
      const segredo = conf.body.segredo as string;
      const ativ = await agent.post('/api/auth/mfa/ativar').send({ codigo: codigo(segredo) }).expect(200);
      return { segredo, recuperacao: ativ.body.codigosRecuperacao as string[] };
    }

    /** Avança o relógio da API (TOTP e JWT) sem fake timers, que travam o supertest */
    function adiantarRelogio(ms: number) {
      const real = Date.now.bind(Date);
      return jest.spyOn(Date, 'now').mockImplementation(() => real() + ms);
    }

    afterEach(() => jest.restoreAllMocks());

    it('configurar guarda o segredo cifrado; ativar exige código válido e devolve 10 códigos', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const conf = await joao.post('/api/auth/mfa/configurar').expect(200);
      expect(conf.body.uri).toMatch(/^otpauth:\/\/totp\/Capital%20Elite%3Ajoao%40ce\.com\?secret=/);

      const salvo = c.prisma.linhas('user').find((u) => u.id === c.joao.id)!;
      expect(salvo.mfaSecret).toBeTruthy();
      expect(salvo.mfaSecret).not.toContain(conf.body.segredo);
      expect(salvo.mfaEnabled).toBe(false);

      const errado = await joao.post('/api/auth/mfa/ativar').send({ codigo: '000000' }).expect(400);
      expect(errado.body.errors.fieldErrors.codigo[0]).toMatch(/Código inválido/);

      const ok = await joao.post('/api/auth/mfa/ativar').send({ codigo: codigo(conf.body.segredo) }).expect(200);
      expect(ok.body.codigosRecuperacao).toHaveLength(10);
      expect(valorCookie(ok, 'crm_at')).toBeDefined();
      expect(auditorias(c, 'MFA_ATIVACAO')).toHaveLength(1);
      // Só os hashes vão para o banco
      const hashes = c.prisma.linhas('codigoRecuperacaoMfa').map((r) => r.hash);
      expect(hashes).toHaveLength(10);
      expect(hashes).not.toContain(ok.body.codigosRecuperacao[0]);

      const status = await joao.get('/api/auth/mfa').expect(200);
      expect(status.body).toMatchObject({ ativo: true, codigosRestantes: 10, obrigatorio: false });
      await joao.post('/api/auth/mfa/configurar').expect(409);
    });

    it('ativar encerra as sessões abertas sem MFA e mantém a atual', async () => {
      const outraAba = await logar(c, 'joao@ce.com');
      const joao = await logar(c, 'joao@ce.com');
      await ativarMfa(joao);

      await outraAba.post('/api/auth/refresh').expect(401);
      await joao.post('/api/auth/refresh').expect(200);
    });

    it('login com MFA: senha certa dá só um desafio; o código abre a sessão', async () => {
      const { segredo } = await ativarMfa(await logar(c, 'joao@ce.com'));

      const agent = request.agent(c.app.getHttpServer());
      const etapa1 = await agent.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA }).expect(200);
      expect(etapa1.body).toEqual({ mfaObrigatorio: true, desafio: expect.any(String) });
      expect(cookies(etapa1)).toHaveLength(0);
      await agent.get('/api/auth/me').expect(401);
      // O desafio não serve como token de acesso
      await request(c.app.getHttpServer()).get('/api/clientes').set('Authorization', `Bearer ${etapa1.body.desafio}`).expect(401);

      // O código usado na ativação não vale de novo (mesmo passo de 30 s)
      await agent.post('/api/auth/mfa/verificar').send({ desafio: etapa1.body.desafio, codigo: codigo(segredo) }).expect(401);
      expect(auditorias(c, 'MFA_FALHA')).toHaveLength(1);

      adiantarRelogio(30_000);
      const etapa2 = await agent
        .post('/api/auth/mfa/verificar')
        .send({ desafio: etapa1.body.desafio, codigo: codigo(segredo) })
        .expect(200);
      expect(etapa2.body.user.email).toBe('joao@ce.com');
      const me = await agent.get('/api/auth/me').expect(200);
      expect(me.body.mfa).toEqual({ ativo: true, obrigatorio: false });
      expect(auditorias(c, 'LOGIN').at(-1)?.diff).toEqual({ mfa: 'totp' });
    });

    it('código de recuperação entra uma única vez e é auditado', async () => {
      const { recuperacao } = await ativarMfa(await logar(c, 'joao@ce.com'));
      const http = request(c.app.getHttpServer());
      const desafio = async () =>
        (await http.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA })).body.desafio as string;

      // Digitado com maiúsculas e espaço, como alguém copiaria de um papel
      const digitado = recuperacao[0].toUpperCase().replace('-', ' ');
      const d1 = await desafio();
      await http.post('/api/auth/mfa/verificar').send({ desafio: d1, codigo: digitado }).expect(200);
      const d2 = await desafio();
      await http.post('/api/auth/mfa/verificar').send({ desafio: d2, codigo: recuperacao[0] }).expect(401);

      expect(auditorias(c, 'MFA_USO_RECUPERACAO')[0].diff).toEqual({ codigosRestantes: 9 });
    });

    it('5 códigos errados bloqueiam o segundo fator com 429', async () => {
      const { segredo } = await ativarMfa(await logar(c, 'joao@ce.com'));
      const http = request(c.app.getHttpServer());
      const { desafio } = (await http.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA })).body;

      for (let i = 0; i < 5; i++) {
        await http.post('/api/auth/mfa/verificar').send({ desafio, codigo: '000000' }).expect(401);
      }
      adiantarRelogio(30_000);
      await http.post('/api/auth/mfa/verificar').send({ desafio, codigo: codigo(segredo) }).expect(429);
    });

    it('desafio inválido ou expirado → 401', async () => {
      await ativarMfa(await logar(c, 'joao@ce.com'));
      const http = request(c.app.getHttpServer());
      await http.post('/api/auth/mfa/verificar').send({ desafio: 'nao-e-um-jwt', codigo: '123456' }).expect(401);

      const { desafio } = (await http.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA })).body;
      adiantarRelogio(6 * 60_000);
      const res = await http.post('/api/auth/mfa/verificar').send({ desafio, codigo: '123456' }).expect(401);
      expect(res.body.message).toMatch(/expirou/);
    });

    it('desativar exige senha e código; apaga segredo e códigos', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const { segredo } = await ativarMfa(joao);
      adiantarRelogio(30_000);

      const senhaErrada = await joao
        .post('/api/auth/mfa/desativar')
        .send({ senha: 'errada123', codigo: codigo(segredo) })
        .expect(400);
      expect(senhaErrada.body.errors.fieldErrors.senha).toEqual(['Senha incorreta.']);
      const codigoErrado = await joao.post('/api/auth/mfa/desativar').send({ senha: SENHA, codigo: '000000' }).expect(400);
      expect(codigoErrado.body.errors.fieldErrors.codigo).toBeDefined();

      await joao.post('/api/auth/mfa/desativar').send({ senha: SENHA, codigo: codigo(segredo) }).expect(200);
      const salvo = c.prisma.linhas('user').find((u) => u.id === c.joao.id)!;
      expect(salvo).toMatchObject({ mfaEnabled: false, mfaSecret: null });
      expect(c.prisma.linhas('codigoRecuperacaoMfa')).toHaveLength(0);
      expect(auditorias(c, 'MFA_DESATIVACAO')).toHaveLength(1);
      // Volta ao login de uma etapa
      const login = await request(c.app.getHttpServer()).post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA });
      expect(login.body.user).toBeDefined();
    });

    it('regenerar códigos invalida os anteriores', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const { segredo, recuperacao } = await ativarMfa(joao);
      adiantarRelogio(30_000);
      const novos = await joao.post('/api/auth/mfa/codigos').send({ codigo: codigo(segredo) }).expect(200);
      expect(novos.body.codigosRecuperacao).toHaveLength(10);

      const http = request(c.app.getHttpServer());
      const { desafio } = (await http.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA })).body;
      await http.post('/api/auth/mfa/verificar').send({ desafio, codigo: recuperacao[1] }).expect(401);
      await http.post('/api/auth/mfa/verificar').send({ desafio, codigo: novos.body.codigosRecuperacao[0] }).expect(200);
    });

    describe('obrigatório por perfil (MFA_OBRIGATORIO_PARA=ADMIN)', () => {
      beforeEach(() => {
        const config = c.app.get(ConfigService);
        const get = config.get.bind(config);
        jest
          .spyOn(config, 'get')
          .mockImplementation(((chave: string) => (chave === 'MFA_OBRIGATORIO_PARA' ? ['ADMIN'] : get(chave))) as typeof config.get);
      });

      it('sem MFA, o admin só acessa o necessário para ativar; depois de ativar, tudo', async () => {
        const admin = await logar(c, 'admin@ce.com');
        const bloqueado = await admin.get('/api/clientes').expect(403);
        expect(bloqueado.body.code).toBe('MFA_OBRIGATORIO');

        const me = await admin.get('/api/auth/me').expect(200);
        expect(me.body.mfa).toEqual({ ativo: false, obrigatorio: true });

        await ativarMfa(admin);
        await admin.get('/api/clientes').expect(200);
      });

      it('perfis fora da lista não são afetados, e o admin não pode desativar', async () => {
        const joao = await logar(c, 'joao@ce.com');
        await joao.get('/api/clientes').expect(200);

        const admin = await logar(c, 'admin@ce.com');
        const { segredo } = await ativarMfa(admin);
        adiantarRelogio(30_000);
        const res = await admin.post('/api/auth/mfa/desativar').send({ senha: SENHA, codigo: codigo(segredo) }).expect(400);
        expect(res.body.message).toMatch(/obrigatória/);
      });
    });
  });

  // ============================================================
  describe('troca de senha', () => {
    const NOVA = 'NovaSenhaForte2026';

    it('confere a senha atual e aplica a política na nova', async () => {
      const joao = await logar(c, 'joao@ce.com');
      const atual = await joao.post('/api/auth/senha').send({ senhaAtual: 'errada123', novaSenha: NOVA }).expect(400);
      expect(atual.body.errors.fieldErrors.senhaAtual).toEqual(['Senha atual incorreta.']);

      const fraca = await joao.post('/api/auth/senha').send({ senhaAtual: SENHA, novaSenha: 'curta1' }).expect(400);
      expect(fraca.body.errors.fieldErrors.novaSenha[0]).toMatch(/12 caracteres/);
    });

    it('troca a senha, encerra as outras sessões e mantém a atual', async () => {
      const outraAba = await logar(c, 'joao@ce.com');
      const joao = await logar(c, 'joao@ce.com');

      await joao.post('/api/auth/senha').send({ senhaAtual: SENHA, novaSenha: NOVA }).expect(200);
      expect(auditorias(c, 'ALTERACAO_SENHA')).toHaveLength(1);
      expect(JSON.stringify(auditorias(c, 'ALTERACAO_SENHA'))).not.toContain(NOVA);

      await outraAba.post('/api/auth/refresh').expect(401);
      await joao.post('/api/auth/refresh').expect(200);

      const http = request(c.app.getHttpServer());
      await http.post('/api/auth/login').send({ email: 'joao@ce.com', password: SENHA }).expect(401);
      await http.post('/api/auth/login').send({ email: 'joao@ce.com', password: NOVA }).expect(200);
    });

    it('a mesma senha não é aceita como nova', async () => {
      await c.prisma.user.update({
        where: { id: c.joao.id },
        data: { senhaHash: await bcrypt.hash(NOVA, 4) },
      });
      const agent = request.agent(c.app.getHttpServer());
      await agent.post('/api/auth/login').send({ email: 'joao@ce.com', password: NOVA }).expect(200);
      const res = await agent.post('/api/auth/senha').send({ senhaAtual: NOVA, novaSenha: NOVA }).expect(400);
      expect(res.body.errors.fieldErrors.novaSenha).toEqual(['A nova senha precisa ser diferente da atual.']);
    });
  });
});
