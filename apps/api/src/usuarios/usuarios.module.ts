import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IdParamPipe } from '../common/pipes/id-param.pipe';
import { contextoDaRequisicao, type ContextoRequisicao } from '../common/request-context';

export const aprovarCadastroSchema = z.object({
  role: z.enum(['ADMIN', 'ASSESSOR', 'COMPLIANCE', 'READONLY']),
});
type AprovarCadastroDto = z.infer<typeof aprovarCadastroSchema>;

@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Assessores ativos — opções de responsável ao cadastrar cliente/lead */
  assessores() {
    return this.prisma.user.findMany({
      where: { role: 'ASSESSOR', ativo: true },
      select: { id: true, nome: true, email: true },
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    });
  }

  /** Todos os usuários, pendentes primeiro */
  listar() {
    return this.prisma.user.findMany({
      select: { id: true, nome: true, email: true, role: true, ativo: true, cadastroPendente: true, createdAt: true },
      orderBy: [{ cadastroPendente: 'desc' }, { nome: 'asc' }, { id: 'asc' }],
    });
  }

  async aprovar(admin: AuthUser, id: string, dto: AprovarCadastroDto, ctx?: ContextoRequisicao) {
    // Condicional: se outro admin decidiu no meio-tempo, count = 0
    const { count } = await this.prisma.user.updateMany({
      where: { id, cadastroPendente: true },
      data: { ativo: true, cadastroPendente: false, role: dto.role },
    });
    if (count === 0) await this.naoPendente(id);

    await this.auditoria.registrar({
      acao: 'ATUALIZACAO',
      entidade: 'User',
      entidadeId: id,
      userId: admin.id,
      diff: { cadastro: 'aprovado', role: dto.role },
      contexto: ctx,
    });
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, nome: true, email: true, role: true, ativo: true, cadastroPendente: true, createdAt: true },
    });
  }

  /** Recusa apaga a conta: ainda não tem nenhum dado no sistema */
  async recusar(admin: AuthUser, id: string, ctx?: ContextoRequisicao) {
    const { count } = await this.prisma.user.deleteMany({ where: { id, cadastroPendente: true } });
    if (count === 0) await this.naoPendente(id);

    await this.auditoria.registrar({
      acao: 'EXCLUSAO',
      entidade: 'User',
      entidadeId: id,
      userId: admin.id,
      diff: { cadastro: 'recusado' },
      contexto: ctx,
    });
  }

  private async naoPendente(id: string): Promise<never> {
    const existe = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new NotFoundException('Usuário não encontrado');
    throw new ConflictException('Este cadastro já foi decidido.');
  }
}

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Get()
  @Roles('ADMIN')
  listar() {
    return this.service.listar();
  }

  // Só quem pode atribuir carteira a outra pessoa precisa da lista
  @Get('assessores')
  @Roles('ADMIN')
  assessores() {
    return this.service.assessores();
  }

  @Patch(':id/aprovar')
  @Roles('ADMIN')
  aprovar(
    @CurrentUser() user: AuthUser,
    @Param('id', IdParamPipe) id: string,
    @Body(new ZodValidationPipe(aprovarCadastroSchema)) dto: AprovarCadastroDto,
    @Req() req: Request,
  ) {
    return this.service.aprovar(user, id, dto, contextoDaRequisicao(req));
  }

  @Delete(':id/cadastro')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  recusar(@CurrentUser() user: AuthUser, @Param('id', IdParamPipe) id: string, @Req() req: Request) {
    return this.service.recusar(user, id, contextoDaRequisicao(req));
  }
}

@Module({
  controllers: [UsuariosController],
  providers: [UsuariosService],
})
export class UsuariosModule {}
