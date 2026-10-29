import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { ContextoRequisicao } from '../common/request-context';
import type { CadastroDto } from './dto/auth.schemas';

const JANELA_MS = 60 * 60 * 1000;
const MAX_CADASTROS_POR_IP = 5;

/**
 * Cadastro público pela tela de login. A conta já nasce ativa, com perfil
 * ASSESSOR e carteira vazia: pelo escopo por assessor, ela só enxerga os
 * clientes e leads que ela mesma cadastrar. Outro perfil, só um admin define.
 *
 * Limite por IP em memória (vale por instância, como o LoginThrottleService).
 */
@Injectable()
export class CadastroService {
  private readonly janelas = new Map<string, { total: number; inicio: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async cadastrar(dto: CadastroDto, ctx?: ContextoRequisicao): Promise<User> {
    this.contarTentativa(ctx?.ip ?? null);

    const existente = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (existente) {
      throw new ConflictException('Já existe uma conta com este e-mail. Entre pela tela de login.');
    }
    const user = await this.prisma.user.create({
      data: {
        nome: dto.nome,
        email: dto.email,
        senhaHash: await bcrypt.hash(dto.senha, 10),
        role: 'ASSESSOR',
      },
    });
    await this.auditoria.registrar({
      acao: 'CRIACAO',
      entidade: 'User',
      entidadeId: user.id,
      userId: user.id,
      diff: { origem: 'cadastro_publico', email: user.email, role: user.role },
      contexto: ctx,
    });
    return user;
  }

  private contarTentativa(ip: string | null) {
    if (!ip) return;
    const agora = Date.now();
    const j = this.janelas.get(ip);
    if (!j || agora - j.inicio > JANELA_MS) {
      this.janelas.set(ip, { total: 1, inicio: agora });
      return;
    }
    if (j.total >= MAX_CADASTROS_POR_IP) {
      throw new HttpException(
        { statusCode: 429, message: 'Muitos cadastros a partir desta rede. Tente novamente mais tarde.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    j.total++;
  }
}
