import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdParamPipe } from '../common/pipes/id-param.pipe';

/** Quantas notificações o sininho mostra (as mais recentes) */
const LIMITE_LISTA = 30;

/** Notificações do próprio usuário. Ninguém lê ou marca as de outra pessoa. */
@Injectable()
export class NotificacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(user: AuthUser) {
    const [itens, naoLidas] = await Promise.all([
      this.prisma.notificacao.findMany({
        where: { userId: user.id },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        take: LIMITE_LISTA,
        select: { id: true, tipo: true, titulo: true, mensagem: true, link: true, lidaEm: true, criadoEm: true },
      }),
      this.prisma.notificacao.count({ where: { userId: user.id, lidaEm: null } }),
    ]);
    return { itens, naoLidas };
  }

  async marcarLida(user: AuthUser, id: string) {
    const { count } = await this.prisma.notificacao.updateMany({
      where: { id, userId: user.id, lidaEm: null },
      data: { lidaEm: new Date() },
    });
    if (count === 0) {
      const existe = await this.prisma.notificacao.findFirst({ where: { id, userId: user.id }, select: { id: true } });
      if (!existe) throw new NotFoundException('Notificação não encontrada');
    }
  }

  async marcarTodasLidas(user: AuthUser) {
    await this.prisma.notificacao.updateMany({
      where: { userId: user.id, lidaEm: null },
      data: { lidaEm: new Date() },
    });
  }
}

// Marcar como lida é escrita, mas sobre os próprios avisos: vale para todos os perfis
const TODOS_OS_PERFIS = ['ADMIN', 'ASSESSOR', 'COMPLIANCE', 'READONLY'] as const;

@Controller('notificacoes')
export class NotificacoesController {
  constructor(private readonly service: NotificacoesService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser) {
    return this.service.listar(user);
  }

  @Patch(':id/lida')
  @Roles(...TODOS_OS_PERFIS)
  @HttpCode(HttpStatus.NO_CONTENT)
  marcarLida(@CurrentUser() user: AuthUser, @Param('id', IdParamPipe) id: string) {
    return this.service.marcarLida(user, id);
  }

  @Post('lidas')
  @Roles(...TODOS_OS_PERFIS)
  @HttpCode(HttpStatus.NO_CONTENT)
  marcarTodasLidas(@CurrentUser() user: AuthUser) {
    return this.service.marcarTodasLidas(user);
  }
}

@Module({
  controllers: [NotificacoesController],
  providers: [NotificacoesService],
})
export class NotificacoesModule {}
