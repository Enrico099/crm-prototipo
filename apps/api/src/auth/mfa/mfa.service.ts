import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import type { Prisma, User, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import type { ContextoRequisicao } from '../../common/request-context';
import { LoginThrottleService } from '../login-throttle.service';
import { CifraMfa, gerarCodigoRecuperacao, pareceCodigoRecuperacao } from './cifra';
import { gerarSegredo, uriOtpauth, verificarTotp } from './totp';

export const QTD_CODIGOS_RECUPERACAO = 10;

// Só para desenvolvimento: em produção a API não sobe sem MFA_CHAVE (config/env.ts)
const CHAVE_DEV = 'dev-somente-local-mfa-chave';

export type MetodoMfa = 'totp' | 'recuperacao';

/** Erro de um campo do formulário, no mesmo formato do ZodValidationPipe */
export function erroDeCampo(campo: string, mensagem: string) {
  return new BadRequestException({
    message: mensagem,
    error: 'Bad Request',
    errors: { formErrors: [], fieldErrors: { [campo]: [mensagem] } },
  });
}

@Injectable()
export class MfaService {
  private readonly cifra: CifraMfa;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly throttle: LoginThrottleService,
    private readonly config: ConfigService,
  ) {
    this.cifra = new CifraMfa(config.get<string>('MFA_CHAVE') || CHAVE_DEV);
  }

  obrigatorio(role: UserRole): boolean {
    return (this.config.get<UserRole[]>('MFA_OBRIGATORIO_PARA') ?? []).includes(role);
  }

  async status(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const codigosRestantes = user.mfaEnabled
      ? await this.prisma.codigoRecuperacaoMfa.count({ where: { userId, usadoEm: null } })
      : 0;
    return {
      ativo: user.mfaEnabled,
      ativadoEm: user.mfaAtivadoEm,
      obrigatorio: this.obrigatorio(user.role),
      codigosRestantes,
    };
  }

  /** 1ª etapa: gera o segredo (ainda inativo) que o usuário cadastra no autenticador. */
  async configurar(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new ConflictException('A verificação em duas etapas já está ativa.');

    const segredo = gerarSegredo();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: this.cifra.cifrar(segredo), mfaUltimoPasso: null },
    });
    return { segredo, uri: uriOtpauth(segredo, user.email) };
  }

  /** 2ª etapa: um código válido do autenticador confirma o cadastro e ativa o MFA. */
  async ativar(userId: string, codigo: string, ctx?: ContextoRequisicao) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new ConflictException('A verificação em duas etapas já está ativa.');
    if (!user.mfaSecret) throw new BadRequestException('Comece a configuração antes de ativar.');

    const passo = verificarTotp(this.cifra.decifrar(user.mfaSecret), codigo);
    if (passo === null) throw erroDeCampo('codigo', 'Código inválido. Confira o horário do celular e tente de novo.');

    const codigos = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabled: true, mfaUltimoPasso: passo, mfaAtivadoEm: new Date() },
      });
      const novos = await this.trocarCodigos(tx, userId);
      await this.auditoria.registrarEm(tx, {
        acao: 'MFA_ATIVACAO',
        entidade: 'User',
        entidadeId: userId,
        userId,
        contexto: ctx,
      });
      return novos;
    });
    return { codigosRecuperacao: codigos };
  }

  /**
   * Confere o segundo fator: código de 6 dígitos do autenticador (cada passo de
   * 30 s vale uma única vez) ou código de recuperação (uso único). Erros contam
   * para o limite de tentativas e vão para a auditoria.
   */
  async verificar(user: User, codigo: string, ctx?: ContextoRequisicao): Promise<MetodoMfa> {
    this.throttle.verificarMfa(user.id);
    const metodo = await this.conferir(user, codigo.trim());

    if (!metodo) {
      this.throttle.registrarFalhaMfa(user.id);
      await this.auditoria.registrar({
        acao: 'MFA_FALHA',
        entidade: 'User',
        entidadeId: user.id,
        userId: user.id,
        contexto: ctx,
      });
      throw new UnauthorizedException('Código inválido ou já utilizado.');
    }

    this.throttle.registrarSucessoMfa(user.id);
    if (metodo === 'recuperacao') {
      await this.auditoria.registrar({
        acao: 'MFA_USO_RECUPERACAO',
        entidade: 'User',
        entidadeId: user.id,
        userId: user.id,
        diff: { codigosRestantes: await this.prisma.codigoRecuperacaoMfa.count({ where: { userId: user.id, usadoEm: null } }) },
        contexto: ctx,
      });
    }
    return metodo;
  }

  /** Desativar exige senha e segundo fator: uma sessão roubada sozinha não basta. */
  async desativar(userId: string, senha: string, codigo: string, ctx?: ContextoRequisicao) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled) throw new ConflictException('A verificação em duas etapas não está ativa.');
    if (this.obrigatorio(user.role)) {
      throw new BadRequestException('A verificação em duas etapas é obrigatória para o seu perfil.');
    }
    if (!(await bcrypt.compare(senha, user.senhaHash))) throw erroDeCampo('senha', 'Senha incorreta.');
    await this.verificarEmFormulario(user, codigo, ctx);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { mfaEnabled: false, mfaSecret: null, mfaUltimoPasso: null, mfaAtivadoEm: null },
      });
      await tx.codigoRecuperacaoMfa.deleteMany({ where: { userId } });
      await this.auditoria.registrarEm(tx, {
        acao: 'MFA_DESATIVACAO',
        entidade: 'User',
        entidadeId: userId,
        userId,
        contexto: ctx,
      });
    });
  }

  /** Novos códigos de recuperação; os anteriores deixam de valer. */
  async regenerarCodigos(userId: string, codigo: string, ctx?: ContextoRequisicao) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled) throw new ConflictException('A verificação em duas etapas não está ativa.');
    await this.verificarEmFormulario(user, codigo, ctx);

    const codigos = await this.prisma.$transaction(async (tx) => {
      const novos = await this.trocarCodigos(tx, userId);
      await this.auditoria.registrarEm(tx, {
        acao: 'ATUALIZACAO',
        entidade: 'User',
        entidadeId: userId,
        userId,
        diff: { campo: 'codigosRecuperacaoMfa' },
        contexto: ctx,
      });
      return novos;
    });
    return { codigosRecuperacao: codigos };
  }

  /** Mesma verificação, mas o erro vira erro do campo "codigo" (o usuário já está logado). */
  private async verificarEmFormulario(user: User, codigo: string, ctx?: ContextoRequisicao) {
    try {
      await this.verificar(user, codigo, ctx);
    } catch (e) {
      if (e instanceof UnauthorizedException) throw erroDeCampo('codigo', 'Código inválido ou já utilizado.');
      throw e;
    }
  }

  private async conferir(user: User, codigo: string): Promise<MetodoMfa | null> {
    if (!user.mfaEnabled || !user.mfaSecret) return null;

    if (/^\d{6}$/.test(codigo)) {
      const passo = verificarTotp(this.cifra.decifrar(user.mfaSecret), codigo);
      if (passo === null) return null;
      // Condicional: o mesmo código (ou um mais antigo) não vale duas vezes,
      // nem em duas requisições simultâneas
      const { count } = await this.prisma.user.updateMany({
        where: { id: user.id, OR: [{ mfaUltimoPasso: null }, { mfaUltimoPasso: { lt: passo } }] },
        data: { mfaUltimoPasso: passo },
      });
      return count === 1 ? 'totp' : null;
    }

    if (pareceCodigoRecuperacao(codigo)) {
      const { count } = await this.prisma.codigoRecuperacaoMfa.updateMany({
        where: { userId: user.id, hash: this.cifra.hashCodigo(codigo), usadoEm: null },
        data: { usadoEm: new Date() },
      });
      return count === 1 ? 'recuperacao' : null;
    }
    return null;
  }

  private async trocarCodigos(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
    await tx.codigoRecuperacaoMfa.deleteMany({ where: { userId } });
    const codigos = Array.from({ length: QTD_CODIGOS_RECUPERACAO }, gerarCodigoRecuperacao);
    await tx.codigoRecuperacaoMfa.createMany({
      data: codigos.map((c) => ({ userId, hash: this.cifra.hashCodigo(c) })),
    });
    return codigos;
  }
}
