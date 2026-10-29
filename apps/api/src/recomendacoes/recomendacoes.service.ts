import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, StatusRecomendacao } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { buildPage, skipTake } from '../common/pagination';
import type { ContextoRequisicao } from '../common/request-context';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { escopoCliente, garantirClienteNoEscopo } from '../auth/escopo';
import { extrairParametrosSuitability } from '../suitability/parametros';
import {
  AiEngineService,
  type AiEngineRecomendacao,
  type AiEngineRequest,
} from './ai-engine.service';
import {
  AVISO_APOIO_DECISAO,
  ESPECIALISTAS_COMITE,
  LIMITE_CATALOGO_MOTOR,
  LIMITE_CLIENTES_OPORTUNIDADES,
  produtoAdequadoAoPerfil,
  VALIDADE_RECOMENDACAO_DIAS,
} from './regras';
import type {
  GenerateDto,
  RecomendacaoQueryDto,
  RecusarDto,
} from './dto/recomendacao.schemas';

const includeRecomendacao = {
  cliente: { select: { id: true, nome: true, perfil: true } },
  produto: { select: { id: true, nome: true, categoria: true, emissor: true } },
  aprovadoPor: { select: { id: true, nome: true } },
} satisfies Prisma.RecomendacaoInclude;

type RecomendacaoComInclude = Prisma.RecomendacaoGetPayload<{ include: typeof includeRecomendacao }>;

/** Snapshot do que o motor recebeu — gravado no payload pra auditoria/reprodução */
export type ContextoGeracao = {
  suitabilityId: string;
  versaoQuestionario: string;
  perfilCalculado: string;
  perfilCadastro: string;
  horizonteAnos: number;
  toleranciaPerda: number;
  origemParametros: 'questionario' | 'legado';
  patrimonio: number;
  numPosicoes: number;
  tamanhoCatalogo: number;
  catalogoHash: string;
  geradoPorUserId: string;
};

const STATUS_FINAIS_BLOQUEADOS = new Set(['INATIVO', 'BLOQUEADO']);

/** Quantas chamadas ao motor rodam em paralelo na varredura de oportunidades */
const CONCORRENCIA_OPORTUNIDADES = 4;

/**
 * Dupla checagem do comitê de especialistas: só aceita do motor recomendação
 * com parecer favorável de TODOS os especialistas. Motor antigo (sem comitê) ou
 * com bug que deixe passar um parecer contrário é barrado aqui.
 */
function aprovadaPeloComite(r: AiEngineRecomendacao): boolean {
  const aprovados = new Set(r.comite.filter((p) => p.aprovado).map((p) => p.especialista));
  return (
    r.comite.every((p) => p.aprovado) && ESPECIALISTAS_COMITE.every((e) => aprovados.has(e))
  );
}

@Injectable()
export class RecomendacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEngine: AiEngineService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Roda o motor pra um cliente:
   *   1. Valida escopo, status do cliente e suitability vigente
   *   2. Monta o contexto (cliente, suitability, posições, catálogo ativo)
   *   3. Chama o microsserviço Python (com timeout) e valida a resposta
   *   4. Numa transação: expira as PENDENTES antigas, grava as novas e audita
   */
  async generate(user: AuthUser, dto: GenerateDto, ctx?: ContextoRequisicao) {
    const { request, contexto } = await this.montarRequest(user, dto.clienteId, dto.topN);
    const result = await this.aiEngine.recommend(request, ctx?.requestId);

    const idsCatalogo = new Set(request.catalog.map((p) => p.id));
    const vistos = new Set<string>();
    for (const r of result.recomendacoes) {
      if (!idsCatalogo.has(r.produtoId) || vistos.has(r.produtoId)) {
        throw new BadGatewayException(
          'O motor de recomendação retornou um produto fora do catálogo enviado.',
        );
      }
      vistos.add(r.produtoId);
      if (!aprovadaPeloComite(r)) {
        throw new BadGatewayException(
          'O motor de recomendação retornou uma recomendação sem aprovação de todo o comitê de especialistas.',
        );
      }
    }

    const descartados = result.descartados.map((d) => ({
      motivo: d.motivo,
      count: d.count,
      ...(d.contexto && {
        contexto: {
          ...(d.contexto.emissor != null && { emissor: d.contexto.emissor }),
          ...(d.contexto.pctPatrimonio != null && { pctPatrimonio: d.contexto.pctPatrimonio }),
        },
      }),
    }));

    const resumo = {
      totalAnalisados: result.totalAnalisados,
      descartados,
      reprovadosComite: result.reprovadosComite,
      engineVersion: result.engineVersion,
    };

    if (result.recomendacoes.length === 0) {
      // Nenhum produto elegível: mantém as pendentes atuais e registra a rodada
      await this.auditoria.registrar({
        acao: 'GERACAO_RECOMENDACAO',
        entidade: 'Cliente',
        entidadeId: dto.clienteId,
        userId: user.id,
        diff: { geradas: 0, ...resumo, contexto } as unknown as Prisma.InputJsonValue,
        contexto: ctx,
      });
      return { geradas: 0, recomendacoes: [], ...resumo };
    }

    const expiraEm = new Date(Date.now() + VALIDADE_RECOMENDACAO_DIAS * 86_400_000);

    const criadas = await this.emTransacaoSerializavel(async (tx) => {
      const expiradas = await tx.recomendacao.updateMany({
        where: { clienteId: dto.clienteId, status: StatusRecomendacao.PENDENTE },
        data: { status: StatusRecomendacao.EXPIRADA },
      });

      const novas: RecomendacaoComInclude[] = [];
      for (const r of result.recomendacoes) {
        novas.push(
          await tx.recomendacao.create({
            data: {
              clienteId: dto.clienteId,
              produtoId: r.produtoId,
              score: new Prisma.Decimal(r.score.toFixed(3)),
              justificativa: r.justificativa,
              payload: {
                fatores: r.fatores,
                pesos: r.pesos,
                contribs: r.contribs,
                scoreRegras: r.scoreRegras ?? null,
                scoreFonte: r.scoreFonte ?? null,
                comite: r.comite,
                reprovadosComiteDaRodada: result.reprovadosComite,
                geradoPor: result.engineVersion,
                descartadosDaRodada: descartados,
                totalAnalisados: result.totalAnalisados,
                contexto,
                aviso: AVISO_APOIO_DECISAO,
              } as Prisma.InputJsonValue,
              status: StatusRecomendacao.PENDENTE,
              expiraEm,
            },
            include: includeRecomendacao,
          }),
        );
      }

      await this.auditoria.registrarEm(tx, {
        acao: 'GERACAO_RECOMENDACAO',
        entidade: 'Cliente',
        entidadeId: dto.clienteId,
        userId: user.id,
        diff: {
          geradas: novas.length,
          pendentesExpiradas: expiradas.count,
          recomendacaoIds: novas.map((n) => n.id),
          engineVersion: result.engineVersion,
          contexto,
        } as unknown as Prisma.InputJsonValue,
        contexto: ctx,
      });
      return novas;
    });

    return {
      geradas: criadas.length,
      recomendacoes: criadas.map((r) => this.sanitize(r)),
      ...resumo,
    };
  }

  /**
   * Oportunidades do dia: roda o motor (com o comitê de especialistas) para cada
   * cliente da carteira e devolve o que passou, sem gravar nada. Para virar
   * recomendação formal, o assessor gera pelo cliente (POST /generate).
   * Clientes que não puderam ser analisados vêm em `pendencias`, com o motivo.
   */
  async oportunidadesDoDia(user: AuthUser, ctx?: ContextoRequisicao) {
    const clientes = await this.prisma.cliente.findMany({
      where: { ...escopoCliente(user), status: { notIn: ['INATIVO', 'BLOQUEADO'] } },
      select: { id: true, nome: true, perfil: true, patrimonio: true },
      orderBy: [{ patrimonio: 'desc' }, { id: 'asc' }],
      take: LIMITE_CLIENTES_OPORTUNIDADES,
    });

    type Resultado =
      | { tipo: 'ok'; recs: AiEngineRecomendacao[]; reprovados: number; engineVersion: string }
      | { tipo: 'pendencia'; motivo: string };

    const analisar = async (clienteId: string): Promise<Resultado> => {
      try {
        const { request } = await this.montarRequest(user, clienteId, 3);
        const result = await this.aiEngine.recommend(request, ctx?.requestId);
        const ids = new Set(request.catalog.map((p) => p.id));
        return {
          tipo: 'ok',
          recs: result.recomendacoes.filter((r) => ids.has(r.produtoId) && aprovadaPeloComite(r)),
          reprovados: result.reprovadosComite.length,
          engineVersion: result.engineVersion,
        };
      } catch (e) {
        if (e instanceof UnprocessableEntityException) {
          return { tipo: 'pendencia', motivo: (e.getResponse() as { message: string }).message };
        }
        if (e instanceof NotFoundException) return { tipo: 'pendencia', motivo: 'Cliente não encontrado.' };
        return { tipo: 'pendencia', motivo: 'O motor de recomendação não respondeu para este cliente.' };
      }
    };

    const resultados: Resultado[] = new Array(clientes.length);
    let proximo = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCORRENCIA_OPORTUNIDADES, clientes.length) }, async () => {
        while (proximo < clientes.length) {
          const i = proximo++;
          resultados[i] = await analisar(clientes[i].id);
        }
      }),
    );

    const oportunidades = [];
    const pendencias = [];
    let reprovadosComite = 0;
    let engineVersion: string | null = null;
    for (const [i, c] of clientes.entries()) {
      const res = resultados[i];
      const cliente = { id: c.id, nome: c.nome, perfil: c.perfil, patrimonio: Number(c.patrimonio.toString()) };
      if (res.tipo === 'pendencia') {
        pendencias.push({ cliente, motivo: res.motivo });
        continue;
      }
      engineVersion = res.engineVersion;
      reprovadosComite += res.reprovados;
      if (res.recs.length === 0) {
        pendencias.push({
          cliente,
          motivo: 'Nenhum produto do catálogo foi aprovado por todo o comitê de especialistas.',
        });
        continue;
      }
      for (const r of res.recs) {
        oportunidades.push({
          cliente,
          produtoId: r.produtoId,
          produtoNome: r.produtoNome,
          score: r.score,
          justificativa: r.justificativa,
          comite: r.comite,
        });
      }
    }
    oportunidades.sort((a, b) => b.score - a.score);

    return {
      geradoEm: new Date().toISOString(),
      clientesAnalisados: clientes.length,
      reprovadosComite,
      engineVersion,
      oportunidades,
      pendencias,
    };
  }

  async list(user: AuthUser, query: RecomendacaoQueryDto) {
    const agora = new Date();
    const where: Prisma.RecomendacaoWhereInput = {
      cliente: escopoCliente(user),
      ...(query.clienteId && { clienteId: query.clienteId }),
      ...this.filtroStatus(query.status, agora),
    };

    const [data, total] = await Promise.all([
      this.prisma.recomendacao.findMany({
        where,
        ...skipTake(query),
        orderBy: [{ status: 'asc' }, { geradoEm: 'desc' }, { id: 'asc' }],
        include: includeRecomendacao,
      }),
      this.prisma.recomendacao.count({ where }),
    ]);

    return buildPage(data.map((r) => this.sanitize(r, agora)), total, query);
  }

  async findById(user: AuthUser, id: string) {
    const r = await this.prisma.recomendacao.findFirst({
      where: { id, cliente: escopoCliente(user) },
      include: includeRecomendacao,
    });
    if (!r) throw new NotFoundException('Recomendação não encontrada');
    return this.sanitize(r);
  }

  /**
   * Aprovação pelo assessor. Revalida as condições de adequação NO MOMENTO da
   * decisão — o mundo pode ter mudado desde a geração (suitability reaplicada
   * ou vencida, produto desativado).
   */
  async aprovar(user: AuthUser, id: string, ctx?: ContextoRequisicao) {
    return this.prisma.$transaction(async (tx) => {
      const r = await this.carregarPendente(tx, user, id);

      const produto = await tx.produto.findUniqueOrThrow({
        where: { id: r.produtoId },
        select: { ativo: true, perfilMinimo: true },
      });
      if (!produto.ativo) {
        throw new ConflictException('O produto foi desativado do catálogo. Gere novas recomendações.');
      }

      const suit = await tx.suitability.findFirst({
        where: { clienteId: r.clienteId },
        orderBy: { aplicadoEm: 'desc' },
        select: { id: true, validoAte: true, perfilCalculado: true },
      });
      if (!suit || suit.validoAte.getTime() <= Date.now()) {
        throw new ConflictException(
          'A suitability do cliente está vencida. Reaplique o questionário antes de aprovar.',
        );
      }
      const ctxGeracao = (r.payload as { contexto?: Partial<ContextoGeracao> } | null)?.contexto;
      if (ctxGeracao?.suitabilityId && ctxGeracao.suitabilityId !== suit.id) {
        throw new ConflictException(
          'O perfil do cliente foi reavaliado depois desta recomendação. Gere novas recomendações.',
        );
      }
      if (!produtoAdequadoAoPerfil(produto.perfilMinimo, suit.perfilCalculado)) {
        throw new ConflictException('Produto incompatível com o perfil atual do cliente.');
      }

      return this.decidir(tx, user, r, StatusRecomendacao.APROVADA, null, ctx);
    });
  }

  async recusar(user: AuthUser, id: string, dto: RecusarDto, ctx?: ContextoRequisicao) {
    return this.prisma.$transaction(async (tx) => {
      const r = await this.carregarPendente(tx, user, id);
      return this.decidir(tx, user, r, StatusRecomendacao.RECUSADA, dto.motivo, ctx);
    });
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Lê do Postgres tudo que o motor Python precisa e monta o request HTTP.
   * Aqui acontece a conversão de Decimal (Prisma) → number (JSON).
   */
  private async montarRequest(user: AuthUser, clienteId: string, topN: number) {
    await garantirClienteNoEscopo(this.prisma, user, clienteId);
    const cliente = await this.prisma.cliente.findUniqueOrThrow({
      where: { id: clienteId },
      include: {
        suitability: { orderBy: { aplicadoEm: 'desc' }, take: 1 },
        posicoes: { include: { produto: { select: { categoria: true } } } },
      },
    });

    if (STATUS_FINAIS_BLOQUEADOS.has(cliente.status)) {
      throw new UnprocessableEntityException(
        `Cliente com status ${cliente.status.toLowerCase()} não pode receber recomendações.`,
      );
    }

    const suit = cliente.suitability[0];
    if (!suit) {
      throw new UnprocessableEntityException(
        'Cliente sem suitability aplicada. Aplique o questionário de perfil antes de gerar recomendações.',
      );
    }
    if (suit.validoAte.getTime() <= Date.now()) {
      throw new UnprocessableEntityException(
        `A suitability do cliente venceu em ${suit.validoAte.toLocaleDateString('pt-BR')}. Reaplique o questionário antes de gerar recomendações.`,
      );
    }
    const params = extrairParametrosSuitability(suit.respostas);
    if (!params) {
      throw new UnprocessableEntityException(
        'Suitability incompleta (sem horizonte ou tolerância a perdas). Reaplique o questionário.',
      );
    }

    const catalog = await this.prisma.produto.findMany({
      where: { ativo: true },
      orderBy: { id: 'asc' },
      take: LIMITE_CATALOGO_MOTOR,
    });

    const patrimonio = Number(cliente.patrimonio.toString());

    const request: AiEngineRequest = {
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        perfil: cliente.perfil,
        patrimonio,
      },
      suitability: {
        perfilCalculado: suit.perfilCalculado,
        horizonteAnos: params.horizonteAnos,
        toleranciaPerda: params.toleranciaPerda,
      },
      posicoes: cliente.posicoes.map((p) => ({
        produtoId: p.produtoId,
        categoria: p.produto.categoria,
        valor: Number(p.valor.toString()),
      })),
      catalog: catalog.map((p) => ({
        id: p.id,
        nome: p.nome,
        emissor: p.emissor,
        categoria: p.categoria,
        rentabilidadeAno: Number(p.rentabilidadeAno.toString()),
        risco: p.risco,
        tributacao: p.tributacao,
        perfilMinimo: p.perfilMinimo,
        liquidez: p.liquidez,
        // null = sem taxa. (Antes, taxa 0 virava null por causa do teste "truthy".)
        taxaAdmin: p.taxaAdmin === null ? null : Number(p.taxaAdmin.toString()),
        ativo: p.ativo,
      })),
      topN,
    };

    const contexto: ContextoGeracao = {
      suitabilityId: suit.id,
      versaoQuestionario: suit.versaoQuestionario,
      perfilCalculado: suit.perfilCalculado,
      perfilCadastro: cliente.perfil,
      horizonteAnos: params.horizonteAnos,
      toleranciaPerda: params.toleranciaPerda,
      origemParametros: params.origem,
      patrimonio,
      numPosicoes: cliente.posicoes.length,
      tamanhoCatalogo: catalog.length,
      // Identifica a versão do catálogo usada (ids + última alteração de cada produto)
      catalogoHash: createHash('sha256')
        .update(catalog.map((p) => `${p.id}:${p.updatedAt.toISOString()}`).join('|'))
        .digest('hex')
        .slice(0, 16),
      geradoPorUserId: user.id,
    };

    return { request, contexto };
  }

  private async carregarPendente(tx: Prisma.TransactionClient, user: AuthUser, id: string) {
    const r = await tx.recomendacao.findFirst({
      where: { id, cliente: escopoCliente(user) },
    });
    if (!r) throw new NotFoundException('Recomendação não encontrada');
    if (r.status !== StatusRecomendacao.PENDENTE) {
      throw new ConflictException(
        `Esta recomendação já está ${r.status.toLowerCase()} e não pode mais ser alterada.`,
      );
    }
    if (r.expiraEm && r.expiraEm.getTime() <= Date.now()) {
      // (sem gravar EXPIRADA aqui: o throw desfaria a escrita junto com a transação;
      // a leitura já trata como expirada e a próxima geração persiste a transição)
      throw new ConflictException('Esta recomendação expirou. Gere novas recomendações para o cliente.');
    }
    return r;
  }

  private async decidir(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    r: { id: string; clienteId: string; produtoId: string; score: Prisma.Decimal; payload: Prisma.JsonValue },
    status: 'APROVADA' | 'RECUSADA',
    motivo: string | null,
    ctx?: ContextoRequisicao,
  ) {
    // Condicional no status: se outra requisição decidiu no meio-tempo, count = 0
    const { count } = await tx.recomendacao.updateMany({
      where: { id: r.id, status: StatusRecomendacao.PENDENTE },
      data: {
        status,
        // aprovadoPor/aprovadoEm registram QUEM DECIDIU e quando (aprovação ou recusa)
        aprovadoPorId: user.id,
        aprovadoEm: new Date(),
        recusaMotivo: motivo,
      },
    });
    if (count === 0) {
      throw new ConflictException('Esta recomendação acabou de ser decidida por outra pessoa.');
    }

    await this.auditoria.registrarEm(tx, {
      acao: status === 'APROVADA' ? 'APROVACAO_RECOMENDACAO' : 'RECUSA_RECOMENDACAO',
      entidade: 'Recomendacao',
      entidadeId: r.id,
      userId: user.id,
      diff: {
        clienteId: r.clienteId,
        produtoId: r.produtoId,
        score: Number(r.score.toString()),
        engineVersion: (r.payload as { geradoPor?: string } | null)?.geradoPor ?? null,
        statusAnterior: 'PENDENTE',
        statusNovo: status,
        ...(motivo && { motivo }),
      },
      contexto: ctx,
    });

    const atualizada = await tx.recomendacao.findUniqueOrThrow({
      where: { id: r.id },
      include: includeRecomendacao,
    });
    return this.sanitize(atualizada);
  }

  /**
   * PENDENTE com prazo vencido é tratada como EXPIRADA na leitura (sem escrever
   * no GET); a transição persistente acontece na próxima geração pro cliente.
   */
  private filtroStatus(status: StatusRecomendacao | undefined, agora: Date): Prisma.RecomendacaoWhereInput {
    if (status === StatusRecomendacao.PENDENTE) {
      return {
        status: StatusRecomendacao.PENDENTE,
        OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }],
      };
    }
    if (status === StatusRecomendacao.EXPIRADA) {
      return {
        OR: [
          { status: StatusRecomendacao.EXPIRADA },
          { status: StatusRecomendacao.PENDENTE, expiraEm: { lte: agora } },
        ],
      };
    }
    return status ? { status } : {};
  }

  private sanitize<T extends { score: Prisma.Decimal; status: StatusRecomendacao; expiraEm: Date | null }>(
    r: T,
    agora = new Date(),
  ) {
    const vencida = r.status === StatusRecomendacao.PENDENTE && r.expiraEm !== null && r.expiraEm <= agora;
    return {
      ...r,
      status: vencida ? StatusRecomendacao.EXPIRADA : r.status,
      score: Number(r.score.toString()),
    };
  }

  /**
   * Serializable: duas gerações simultâneas pro mesmo cliente não podem deixar
   * dois lotes PENDENTES. Uma delas falha (P2034) e vira 409.
   */
  private async emTransacaoSerializavel<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15_000,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
        throw new ConflictException(
          'Já existe uma geração em andamento para este cliente. Aguarde e atualize a página.',
        );
      }
      throw e;
    }
  }
}
