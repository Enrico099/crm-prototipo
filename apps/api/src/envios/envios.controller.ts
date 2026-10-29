import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator';
import { contextoDaRequisicao } from '../common/request-context';
import { EnviosService } from './envios.service';

function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller('envios')
export class EnviosController {
  private readonly cronToken?: string;

  constructor(
    private readonly service: EnviosService,
    config: ConfigService,
  ) {
    this.cronToken = config.get<string>('ENVIO_CRON_TOKEN') || undefined;
  }

  @Get('status')
  @Roles('ADMIN')
  status() {
    return { emailConfigurado: this.service.emailConfigurado, agendamentoConfigurado: !!this.cronToken };
  }

  /** Botão "Avisar agora" (admin): refaz o aviso do dia para todos, mesmo quem já foi avisado */
  @Post('oportunidades-do-dia')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.ACCEPTED)
  enviarAgora(@CurrentUser() user: AuthUser, @Req() req: Request) {
    this.service.iniciarEnvio({ pularJaEnviados: false, disparadoPor: user.id }, contextoDaRequisicao(req));
    return { iniciado: true };
  }

  /**
   * Disparo agendado (função agendada do Netlify ou cron externo), autenticado por
   * `Authorization: Bearer <ENVIO_CRON_TOKEN>`. Responde 202 na hora e envia em
   * segundo plano: o agendador tem pouco tempo de execução e a varredura pode demorar.
   */
  @Public()
  @Post('oportunidades-do-dia/agendado')
  @HttpCode(HttpStatus.ACCEPTED)
  disparoAgendado(@Headers('authorization') authorization: string | undefined, @Req() req: Request) {
    const recebido = (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!this.cronToken || !recebido || !tokenConfere(recebido, this.cronToken)) {
      throw new UnauthorizedException('Não autorizado');
    }
    this.service.iniciarEnvio({ pularJaEnviados: true }, contextoDaRequisicao(req));
    return { iniciado: true };
  }
}
