/**
 * Banco em memória que imita o subconjunto do Prisma Client usado pela API.
 * Permite testar os fluxos HTTP reais (guards, pipes, filtros, cookies,
 * transações) sem Postgres. Não é um ORM completo — só o que os testes usam.
 */
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';

type Row = Record<string, unknown> & { id: string };
type Rel = [tipo: 'one' | 'many', tabela: string, fk: string];

const RELACOES: Record<string, Record<string, Rel>> = {
  cliente: {
    responsavel: ['one', 'user', 'responsavelId'],
    suitability: ['many', 'suitability', 'clienteId'],
    posicoes: ['many', 'posicao', 'clienteId'],
    recomendacoes: ['many', 'recomendacao', 'clienteId'],
  },
  suitability: { cliente: ['one', 'cliente', 'clienteId'], aplicadoPor: ['one', 'user', 'aplicadoPorId'] },
  posicao: { produto: ['one', 'produto', 'produtoId'], cliente: ['one', 'cliente', 'clienteId'] },
  recomendacao: {
    cliente: ['one', 'cliente', 'clienteId'],
    produto: ['one', 'produto', 'produtoId'],
    aprovadoPor: ['one', 'user', 'aprovadoPorId'],
  },
  refreshToken: { user: ['one', 'user', 'userId'] },
  codigoRecuperacaoMfa: { user: ['one', 'user', 'userId'] },
  auditoria: { user: ['one', 'user', 'userId'] },
  lead: {
    responsavel: ['one', 'user', 'responsavelId'],
    cliente: ['one', 'cliente', 'clienteId'],
    estagioHistorico: ['many', 'estagioHistorico', 'leadId'],
  },
  interacao: { cliente: ['one', 'cliente', 'clienteId'], autor: ['one', 'user', 'autorId'] },
  movimentacao: {
    cliente: ['one', 'cliente', 'clienteId'],
    produto: ['one', 'produto', 'produtoId'],
    registradoPor: ['one', 'user', 'registradoPorId'],
    recomendacao: ['one', 'recomendacao', 'recomendacaoId'],
  },
};

const DECIMAIS = new Set(['patrimonio', 'valor', 'score', 'rentabilidadeAno', 'taxaAdmin', 'taxaPerformance', 'valorEstimado']);

const DEFAULTS: Record<string, () => Record<string, unknown>> = {
  user: () => ({ ativo: true, cadastroPendente: false, createdAt: new Date(), role: 'ASSESSOR', mfaEnabled: false, mfaSecret: null, mfaUltimoPasso: null, mfaAtivadoEm: null }),
  codigoRecuperacaoMfa: () => ({ usadoEm: null, criadoEm: new Date() }),
  cliente: () => ({
    telefone: null, cidade: null, uf: null, perfil: 'MODERADO', status: 'PROSPECTO',
    responsavelId: null, ultimaInteracao: null, patrimonio: new Prisma.Decimal(0),
  }),
  refreshToken: () => ({ revogadoEm: null, substituidoPor: null, ip: null, userAgent: null, criadoEm: new Date() }),
  auditoria: () => ({ entidadeId: null, userId: null, diff: null, ip: null, userAgent: null, requestId: null, criadoEm: new Date() }),
  suitability: () => ({ versaoQuestionario: 'v1', aplicadoEm: new Date(), aplicadoPorId: null }),
  recomendacao: () => ({
    status: 'PENDENTE', aprovadoPorId: null, aprovadoEm: null, recusaMotivo: null, geradoEm: new Date(), expiraEm: null,
  }),
  produto: () => ({ ativo: true, tributacao: 'TRIBUTADO', taxaAdmin: null, taxaPerformance: null, ticker: null, descricao: null }),
  lead: () => ({ estagio: 'PROSPECCAO', email: null, telefone: null, observacoes: null, responsavelId: null, clienteId: null, fechadoEm: null }),
  estagioHistorico: () => ({ notas: null, criadoEm: new Date() }),
  posicao: () => ({ adquiridoEm: new Date(), atualizadoEm: new Date() }),
  movimentacao: () => ({ observacao: null, desenquadrada: false, recomendacaoId: null, registradoPorId: null, criadoEm: new Date() }),
};

export function novoId() {
  return 'c' + randomBytes(12).toString('hex');
}

export class FakePrisma {
  readonly dados: Record<string, Row[]> = {};
  readonly user = this.tabela('user');
  readonly cliente = this.tabela('cliente');
  readonly suitability = this.tabela('suitability');
  readonly posicao = this.tabela('posicao');
  readonly produto = this.tabela('produto');
  readonly recomendacao = this.tabela('recomendacao');
  readonly refreshToken = this.tabela('refreshToken');
  readonly codigoRecuperacaoMfa = this.tabela('codigoRecuperacaoMfa');
  readonly auditoria = this.tabela('auditoria');
  readonly lead = this.tabela('lead');
  readonly estagioHistorico = this.tabela('estagioHistorico');
  readonly interacao = this.tabela('interacao');
  readonly movimentacao = this.tabela('movimentacao');

  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    // Snapshot raso pra simular rollback quando a transação lança
    const snapshot = Object.fromEntries(Object.entries(this.dados).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
    try {
      return await fn(this);
    } catch (e) {
      for (const k of Object.keys(this.dados)) this.dados[k] = snapshot[k] ?? [];
      throw e;
    }
  }

  async $queryRaw() {
    return [{ '?column?': 1 }];
  }
  async $connect() {}
  async $disconnect() {}

  linhas(nome: string) {
    return (this.dados[nome] ??= []);
  }

  private tabela(nome: string) {
    const db = this;
    const rows = () => db.linhas(nome);
    const filtrar = (where?: Record<string, unknown>) => rows().filter((r) => db.casa(nome, r, where));

    return {
      findUnique: async (a: Args) => db.projetar(nome, filtrar(a.where)[0] ?? null, a),
      findUniqueOrThrow: async (a: Args) => {
        const r = filtrar(a.where)[0];
        if (!r) throw new Prisma.PrismaClientKnownRequestError('não encontrado', { code: 'P2025', clientVersion: 'fake' });
        return db.projetar(nome, r, a);
      },
      findFirst: async (a: Args = {}) => db.projetar(nome, db.ordenar(filtrar(a.where), a.orderBy)[0] ?? null, a),
      findMany: async (a: Args = {}) => {
        let lista = db.ordenar(filtrar(a.where), a.orderBy);
        if (a.skip) lista = lista.slice(a.skip);
        if (a.take !== undefined) lista = lista.slice(0, a.take);
        return lista.map((r) => db.projetar(nome, r, a));
      },
      count: async (a: Args = {}) => filtrar(a.where).length,
      create: async (a: Args) => {
        const row = { id: novoId(), createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS[nome]?.(), ...db.normalizar(a.data!) } as Row;
        db.checarUnicos(nome, row);
        rows().push(row);
        return db.projetar(nome, row, a);
      },
      createMany: async (a: { data: Record<string, unknown>[] }) => {
        for (const data of a.data) {
          const row = { id: novoId(), ...DEFAULTS[nome]?.(), ...db.normalizar(data) } as Row;
          db.checarUnicos(nome, row);
          rows().push(row);
        }
        return { count: a.data.length };
      },
      update: async (a: Args) => {
        const r = filtrar(a.where)[0];
        if (!r) throw new Prisma.PrismaClientKnownRequestError('não encontrado', { code: 'P2025', clientVersion: 'fake' });
        Object.assign(r, db.aplicar(r, a.data!), { updatedAt: new Date() });
        return db.projetar(nome, r, a);
      },
      updateMany: async (a: Args) => {
        const alvo = filtrar(a.where);
        for (const r of alvo) Object.assign(r, db.aplicar(r, a.data!));
        return { count: alvo.length };
      },
      upsert: async (a: Args & { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const r = filtrar(a.where)[0];
        if (r) {
          Object.assign(r, db.aplicar(r, a.update), { updatedAt: new Date() });
          return db.projetar(nome, r, a);
        }
        const row = { id: novoId(), createdAt: new Date(), updatedAt: new Date(), ...DEFAULTS[nome]?.(), ...db.normalizar(a.create) } as Row;
        db.checarUnicos(nome, row);
        rows().push(row);
        return db.projetar(nome, row, a);
      },
      delete: async (a: Args) => {
        const r = filtrar(a.where)[0];
        if (!r) throw new Prisma.PrismaClientKnownRequestError('não encontrado', { code: 'P2025', clientVersion: 'fake' });
        db.dados[nome] = rows().filter((x) => x !== r);
        return r;
      },
      deleteMany: async (a: Args = {}) => {
        const antes = rows().length;
        db.dados[nome] = rows().filter((r) => !db.casa(nome, r, a.where));
        return { count: antes - db.linhas(nome).length };
      },
    };
  }

  /** Como normalizar(), mas resolve { increment } / { decrement } sobre o valor atual */
  aplicar(row: Row, data: Record<string, unknown>) {
    const out = this.normalizar(data);
    for (const [k, v] of Object.entries(out)) {
      if (v && typeof v === 'object' && !(v instanceof Date) && !(v instanceof Prisma.Decimal)) {
        const op = v as { increment?: number; decrement?: number };
        const atual = new Prisma.Decimal((row[k] as Prisma.Decimal | number | undefined) ?? 0);
        if (op.increment !== undefined) out[k] = atual.plus(op.increment);
        else if (op.decrement !== undefined) out[k] = atual.minus(op.decrement);
      }
    }
    return out;
  }

  private normalizar(data: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      out[k] = DECIMAIS.has(k) && typeof v === 'number' ? new Prisma.Decimal(v) : v;
    }
    return out;
  }

  private checarUnicos(nome: string, row: Row) {
    const unicos: Record<string, string[]> = {
      user: ['email'],
      cliente: ['email', 'cpfHash'],
      lead: ['clienteId'],
      codigoRecuperacaoMfa: ['hash'],
    };
    for (const campo of unicos[nome] ?? []) {
      // Como no Postgres, NULL não conflita com NULL
      if (row[campo] === null || row[campo] === undefined) continue;
      if (this.linhas(nome).some((r) => r.id !== row.id && r[campo] === row[campo])) {
        throw new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002', clientVersion: 'fake', meta: { target: [campo] },
        });
      }
    }
  }

  casa(nome: string, row: Row, where?: Record<string, unknown>): boolean {
    if (!where) return true;
    return Object.entries(where).every(([k, cond]) => {
      if (cond === undefined) return true;
      if (k === 'OR') return (cond as Record<string, unknown>[]).some((w) => this.casa(nome, row, w));
      if (k === 'AND') return (cond as Record<string, unknown>[]).every((w) => this.casa(nome, row, w));
      // Chave única composta do Prisma (ex.: clienteId_produtoId: { clienteId, produtoId })
      if (k.includes('_') && !(k in row) && cond && typeof cond === 'object') {
        return this.casa(nome, row, cond as Record<string, unknown>);
      }
      const rel = RELACOES[nome]?.[k];
      if (rel) {
        const [tipo, tabela, fk] = rel;
        if (tipo === 'one') {
          const alvo = this.linhas(tabela).find((r) => r.id === row[fk]);
          return !!alvo && this.casa(tabela, alvo, cond as Record<string, unknown>);
        }
        const filhos = this.linhas(tabela).filter((r) => r[fk] === row.id);
        const c = cond as { some?: Record<string, unknown> };
        return c.some ? filhos.some((f) => this.casa(tabela, f, c.some)) : true;
      }
      return comparar(row[k], cond);
    });
  }

  ordenar(lista: Row[], orderBy?: unknown): Row[] {
    if (!orderBy) return [...lista];
    const regras = (Array.isArray(orderBy) ? orderBy : [orderBy]) as Record<string, 'asc' | 'desc'>[];
    return [...lista].sort((a, b) => {
      for (const regra of regras) {
        const [campo, dir] = Object.entries(regra)[0];
        const va = valorOrdenavel(a[campo]);
        const vb = valorOrdenavel(b[campo]);
        if (va < vb) return dir === 'asc' ? -1 : 1;
        if (va > vb) return dir === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }

  projetar(nome: string, row: Row | null, a: Args): Record<string, unknown> | null {
    if (!row) return null;
    if (a.select) return this.aplicarSelect(nome, row, a.select);
    const base: Record<string, unknown> = { ...row };
    if (a.include) Object.assign(base, this.resolverRelacoes(nome, row, a.include));
    return base;
  }

  private aplicarSelect(nome: string, row: Row, select: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(select)) {
      if (!v) continue;
      if (RELACOES[nome]?.[k]) Object.assign(out, this.resolverRelacoes(nome, row, { [k]: v }));
      else out[k] = row[k];
    }
    return out;
  }

  private resolverRelacoes(nome: string, row: Row, include: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(include)) {
      const rel = RELACOES[nome]?.[k];
      if (!rel || !v) continue;
      const [tipo, tabela, fk] = rel;
      const sub = (v === true ? {} : v) as Args;
      if (tipo === 'one') {
        const alvo = this.linhas(tabela).find((r) => r.id === row[fk]) ?? null;
        out[k] = this.projetar(tabela, alvo, sub);
      } else {
        let filhos = this.ordenar(
          this.linhas(tabela).filter((r) => r[fk] === row.id && this.casa(tabela, r, sub.where)),
          sub.orderBy,
        );
        if (sub.take !== undefined) filhos = filhos.slice(0, sub.take);
        out[k] = filhos.map((f) => this.projetar(tabela, f, sub));
      }
    }
    return out;
  }
}

type Args = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  skip?: number;
};

function valorOrdenavel(v: unknown): number | string {
  if (v instanceof Date) return v.getTime();
  if (v instanceof Prisma.Decimal) return v.toNumber();
  if (v === null || v === undefined) return '';
  return v as number | string;
}

function comparar(valor: unknown, cond: unknown): boolean {
  if (cond === null) return valor === null || valor === undefined;
  if (cond instanceof Date) return valor instanceof Date && valor.getTime() === cond.getTime();
  if (typeof cond === 'object' && !(cond instanceof Prisma.Decimal)) {
    const c = cond as Record<string, unknown>;
    const v = valorOrdenavel(valor);
    return Object.entries(c).every(([op, alvo]) => {
      if (op === 'mode') return true;
      const t = valorOrdenavel(alvo);
      switch (op) {
        case 'in': return (alvo as unknown[]).includes(valor);
        case 'notIn': return !(alvo as unknown[]).includes(valor);
        case 'gt': return valor !== null && valor !== undefined && v > t;
        case 'gte': return valor !== null && valor !== undefined && v >= t;
        case 'lt': return valor !== null && valor !== undefined && v < t;
        case 'lte': return valor !== null && valor !== undefined && v <= t;
        case 'not': return !comparar(valor, alvo);
        case 'equals': return comparar(valor, alvo);
        case 'contains': return typeof valor === 'string' && valor.toLowerCase().includes(String(alvo).toLowerCase());
        default: throw new Error(`FakePrisma: operador não suportado "${op}"`);
      }
    });
  }
  return valor === cond;
}
