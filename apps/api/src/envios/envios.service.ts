import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { ContextoRequisicao } from '../common/request-context';
import { RecomendacoesService } from '../recomendacoes/recomendacoes.service';
import { webOrigins } from '../config/env';
import { EmailService } from './email.service';
import { montarEmailOportunidades } from './email-oportunidades';

export const ENTIDADE_ENVIO = 'EnvioOportunidades';

export type ResumoEnvio = {
  enviados: number;
  semOportunidade: number;
  jaEnviadosHoje: number;
  falhas: number;
};

/** 00:00 de hoje em Brasília (sem horário de verão desde 2019) */
function inicioDoDiaBrasilia(agora = new Date()): Date {
  const dia = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
  return new Date(`${dia}T00:00:00-03:00`);
}

/**
 * Envio diário das oportunidades do dia por e-mail. Cada assessor recebe as da
 * própria carteira; cada admin, as da base toda. Destinatário sem oportunidade
 * aprovada pelo comitê não recebe nada. Cada envio é auditado (EXPORTACAO_DADOS:
 * o e-mail leva nome e patrimônio de clientes para fora do sistema).
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

  get configurado(): boolean {
    return this.email.configurado;
  }

  /**
   * Valida e dispara o envio em segundo plano. A varredura passa do tempo que os
   * proxies (Netlify, agendador) esperam, então quem chama recebe a resposta na
   * hora; o resultado vai para o log e cada e-mail fica na auditoria.
   * Lança 503 na hora se o SMTP não estiver configurado ou já houver envio rodando.
   */
  iniciarEnvio(
    opcoes: { pularJaEnviados: boolean; disparadoPor?: string | null },
    ctx?: ContextoRequisicao,
  ): void {
    this.garantirDisponivel();
    this.enviarOportunidadesDoDia(opcoes, ctx).catch((e: Error) =>
      this.logger.error(`Envio de oportunidades falhou: ${e.message}`),
    );
  }

  private garantirDisponivel() {
    if (!this.email.configurado) {
      throw new ServiceUnavailableException(
        'Envio por e-mail não configurado. Defina SMTP_URL nas variáveis de ambiente da API.',
      );
    }
    if (this.emAndamento) {
      throw new ServiceUnavailableException('Já existe um envio em andamento. Aguarde alguns minutos.');
    }
  }

  /**
   * @param pularJaEnviados disparo agendado: quem já recebeu hoje não recebe de novo
   *   (o agendador pode repetir a chamada). O botão "Enviar agora" reenvia.
   */
  async enviarOportunidadesDoDia(
    opcoes: { pularJaEnviados: boolean; disparadoPor?: string | null },
    ctx?: ContextoRequisicao,
  ): Promise<ResumoEnvio> {
    this.garantirDisponivel();
    this.emAndamento = true;
    try {
      return await this.executar(opcoes, ctx);
    } finally {
      this.emAndamento = false;
    }
  }

  private async executar(
    opcoes: { pularJaEnviados: boolean; disparadoPor?: string | null },
    ctx?: ContextoRequisicao,
  ): Promise<ResumoEnvio> {
    const destinatarios = await this.prisma.user.findMany({
      where: { ativo: true, role: { in: ['ADMIN', 'ASSESSOR'] } },
      select: { id: true, email: true, nome: true, role: true },
      orderBy: { id: 'asc' },
    });

    const resumo: ResumoEnvio = { enviados: 0, semOportunidade: 0, jaEnviadosHoje: 0, falhas: 0 };
    const hoje = inicioDoDiaBrasilia();

    for (const u of destinatarios) {
      if (opcoes.pularJaEnviados) {
        const ja = await this.prisma.auditoria.findFirst({
          where: { acao: 'EXPORTACAO_DADOS', entidade: ENTIDADE_ENVIO, entidadeId: u.id, criadoEm: { gte: hoje } },
          select: { id: true },
        });
        if (ja) {
          resumo.jaEnviadosHoje++;
          continue;
        }
      }

      try {
        const r = await this.recomendacoes.oportunidadesDoDia(u, ctx);
        if (r.oportunidades.length === 0) {
          resumo.semOportunidade++;
          continue;
        }
        await this.email.enviar(montarEmailOportunidades(u, r, this.linkApp));
        resumo.enviados++;
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
      } catch (e) {
        resumo.falhas++;
        this.logger.error(`Falha no envio das oportunidades para ${u.email}: ${(e as Error).message}`);
      }
    }

    this.logger.log(`Envio de oportunidades concluído: ${JSON.stringify(resumo)}`);
    return resumo;
  }
}
