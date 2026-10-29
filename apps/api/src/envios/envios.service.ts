import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { ContextoRequisicao } from '../common/request-context';
import { RecomendacoesService } from '../recomendacoes/recomendacoes.service';
import { webOrigins } from '../config/env';
import { EmailService } from './email.service';
import { montarEmailOportunidades, type ResultadoOportunidades } from './email-oportunidades';

export const ENTIDADE_ENVIO = 'EnvioOportunidades';
export const TIPO_NOTIFICACAO_OPORTUNIDADES = 'OPORTUNIDADES_DO_DIA';

export type ResumoEnvio = {
  /** Receberam a notificação no sistema (sininho) */
  notificados: number;
  /** Receberam também por e-mail (só com SMTP configurado) */
  emails: number;
  semOportunidade: number;
  jaAvisadosHoje: number;
  falhas: number;
};

type Opcoes = { pularJaEnviados: boolean; disparadoPor?: string | null };

/** 00:00 de hoje em Brasília (sem horário de verão desde 2019) */
function inicioDoDiaBrasilia(agora = new Date()): Date {
  const dia = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
  return new Date(`${dia}T00:00:00-03:00`);
}

/**
 * Aviso diário das oportunidades do dia. Cada assessor recebe as da própria
 * carteira; cada admin, as da base toda. Quem não tem oportunidade aprovada pelo
 * comitê não recebe nada.
 *
 * O aviso sempre vira uma notificação no sistema (sininho do topo). Com SMTP
 * configurado vai também por e-mail, e cada e-mail é auditado
 * (EXPORTACAO_DADOS: leva nome e patrimônio de clientes para fora do sistema).
 */
@Injectable()
export class EnviosService {
  private readonly logger = new Logger(EnviosService.name);
  private readonly linkApp: string;
  private emAndamento = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recomendacoes: RecomendacoesService,
    private readonly email: EmailService,
    private readonly auditoria: AuditoriaService,
    config: ConfigService,
  ) {
    this.linkApp = webOrigins({ WEB_ORIGIN: config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000' })[0];
  }

  get emailConfigurado(): boolean {
    return this.email.configurado;
  }

  /**
   * Dispara o aviso em segundo plano. A varredura passa do tempo que os proxies
   * (Netlify, agendador) esperam, então quem chama recebe a resposta na hora e o
   * resumo vai para o log. Lança 503 na hora se já houver um aviso rodando.
   */
  iniciarEnvio(opcoes: Opcoes, ctx?: ContextoRequisicao): void {
    this.garantirLivre();
    this.enviarOportunidadesDoDia(opcoes, ctx).catch((e: Error) =>
      this.logger.error(`Aviso de oportunidades falhou: ${e.message}`),
    );
  }

  /**
   * @param opcoes.pularJaEnviados disparo agendado: quem já foi avisado hoje não é
   *   avisado de novo (o agendador pode repetir a chamada). O botão do admin refaz
   *   o aviso do dia, trocando o anterior.
   */
  async enviarOportunidadesDoDia(opcoes: Opcoes, ctx?: ContextoRequisicao): Promise<ResumoEnvio> {
    this.garantirLivre();
    this.emAndamento = true;
    try {
      return await this.executar(opcoes, ctx);
    } finally {
      this.emAndamento = false;
    }
  }

  private garantirLivre() {
    if (this.emAndamento) {
      throw new ServiceUnavailableException('Já existe um aviso em andamento. Aguarde alguns minutos.');
    }
  }

  private async executar(opcoes: Opcoes, ctx?: ContextoRequisicao): Promise<ResumoEnvio> {
    const destinatarios = await this.prisma.user.findMany({
      where: { ativo: true, role: { in: ['ADMIN', 'ASSESSOR'] } },
      select: { id: true, email: true, nome: true, role: true },
      orderBy: { id: 'asc' },
    });

    const resumo: ResumoEnvio = { notificados: 0, emails: 0, semOportunidade: 0, jaAvisadosHoje: 0, falhas: 0 };
    const doDia = { tipo: TIPO_NOTIFICACAO_OPORTUNIDADES, criadoEm: { gte: inicioDoDiaBrasilia() } };

    for (const u of destinatarios) {
      if (opcoes.pularJaEnviados) {
        const ja = await this.prisma.notificacao.findFirst({ where: { userId: u.id, ...doDia }, select: { id: true } });
        if (ja) {
          resumo.jaAvisadosHoje++;
          continue;
        }
      }

      try {
        const r = await this.recomendacoes.oportunidadesDoDia(u, ctx);
        if (r.oportunidades.length === 0) {
          resumo.semOportunidade++;
          continue;
        }

        const n = r.oportunidades.length;
        const clientes = new Set(r.oportunidades.map((o) => o.cliente.id)).size;
        await this.prisma.notificacao.deleteMany({ where: { userId: u.id, ...doDia } });
        await this.prisma.notificacao.create({
          data: {
            userId: u.id,
            tipo: TIPO_NOTIFICACAO_OPORTUNIDADES,
            titulo: n === 1 ? '1 oportunidade para hoje' : `${n} oportunidades para hoje`,
            mensagem:
              `O comitê de especialistas aprovou ${n} oportunidade(s) para ${clientes} cliente(s)` +
              (u.role === 'ADMIN' ? ' da base.' : ' da sua carteira.'),
            link: '/oportunidades',
          },
        });
        resumo.notificados++;

        if (this.email.configurado) await this.enviarEmail(u, r, opcoes, resumo, ctx);
      } catch (e) {
        resumo.falhas++;
        this.logger.error(`Falha no aviso de oportunidades para ${u.email}: ${(e as Error).message}`);
      }
    }

    this.logger.log(`Aviso de oportunidades concluído: ${JSON.stringify(resumo)}`);
    return resumo;
  }

  /** E-mail é extra: se falhar, a notificação no sistema continua valendo */
  private async enviarEmail(
    u: { id: string; email: string; nome: string },
    r: ResultadoOportunidades,
    opcoes: Opcoes,
    resumo: ResumoEnvio,
    ctx?: ContextoRequisicao,
  ) {
    try {
      await this.email.enviar(montarEmailOportunidades(u, r, this.linkApp));
    } catch (e) {
      this.logger.error(`E-mail de oportunidades para ${u.email} falhou: ${(e as Error).message}`);
      return;
    }
    resumo.emails++;
    await this.auditoria.registrar({
      acao: 'EXPORTACAO_DADOS',
      entidade: ENTIDADE_ENVIO,
      entidadeId: u.id,
      userId: opcoes.disparadoPor ?? null,
      diff: {
        canal: 'email',
        destinatario: u.email,
        oportunidades: r.oportunidades.length,
        clientes: [...new Set(r.oportunidades.map((o) => o.cliente.id))],
        engineVersion: r.engineVersion,
        agendado: opcoes.pularJaEnviados,
      },
      contexto: ctx,
    });
  }
}
