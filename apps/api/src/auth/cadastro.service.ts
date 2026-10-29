import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { ContextoRequisicao } from '../common/request-context';
import type { CadastroDto } from './dto/auth.schemas';

const JANELA_MS = 60 * 60 * 1000;
const MAX_CADASTROS_POR_IP = 5;

export const MENSAGEM_CADASTRO =
  'Cadastro recebido. Um administrador precisa aprovar sua conta antes do primeiro acesso.';

/**
 * Cadastro público pela tela de login. A conta nasce inativa e pendente
 * (perfil ASSESSOR, sem carteira) e só entra no sistema depois que um admin
 * aprova e escolhe o perfil. E-mail já cadastrado recebe a mesma resposta,
 * para não revelar quem tem conta.
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

  async cadastrar(dto: CadastroDto, ctx?: ContextoRequisicao) {
    this.contarTentativa(ctx?.ip ?? null);

    const existente = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (!existente) {
      const user = await this.prisma.user.create({
        data: {
          nome: dto.nome,
          email: dto.email,
          senhaHash: await bcrypt.hash(dto.senha, 10),
          role: 'ASSESSOR',
          ativo: false,
          cadastroPendente: true,
        },
        select: { id: true, email: true },
      });
      await this.auditoria.registrar({
        acao: 'CRIACAO',
        entidade: 'User',
        entidadeId: user.id,
        userId: null,
        diff: { origem: 'cadastro_publico', email: user.email, pendente: true },
        contexto: ctx,
      });
    }
    return { mensagem: MENSAGEM_CADASTRO };
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
