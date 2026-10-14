import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { contextoDaRequisicao } from '../../common/request-context';
import { AuthService } from '../auth.service';
import { gravarCookies } from '../cookies';
import {
  codigoMfaSchema,
  desativarMfaSchema,
  type CodigoMfaDto,
  type DesativarMfaDto,
} from '../dto/auth.schemas';
import { CurrentUser, type AuthUser } from '../decorators/current-user.decorator';
import { PermitirSemMfa } from '../decorators/permitir-sem-mfa.decorator';
import { MfaService } from './mfa.service';

/** Gestão do próprio MFA. Qualquer perfil autenticado. */
@PermitirSemMfa()
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.mfa.status(user.id);
  }

  @Post('configurar')
  @HttpCode(HttpStatus.OK)
  configurar(@CurrentUser() user: AuthUser) {
    return this.mfa.configurar(user.id);
  }

  /**
   * Ativa o MFA e devolve os códigos de recuperação (única vez em claro).
   * As outras sessões, abertas sem segundo fator, são encerradas; a atual é renovada.
   */
  @Post('ativar')
  @HttpCode(HttpStatus.OK)
  async ativar(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(codigoMfaSchema)) dto: CodigoMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = contextoDaRequisicao(req);
    const resultado = await this.mfa.ativar(user.id, dto.codigo, ctx);
    await this.renovarSessao(user.id, req, res);
    return resultado;
  }

  @Post('desativar')
  @HttpCode(HttpStatus.OK)
  async desativar(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(desativarMfaSchema)) dto: DesativarMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.mfa.desativar(user.id, dto.senha, dto.codigo, contextoDaRequisicao(req));
    await this.renovarSessao(user.id, req, res);
    return { ok: true };
  }

  @Post('codigos')
  @HttpCode(HttpStatus.OK)
  regenerarCodigos(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(codigoMfaSchema)) dto: CodigoMfaDto,
    @Req() req: Request,
  ) {
    return this.mfa.regenerarCodigos(user.id, dto.codigo, contextoDaRequisicao(req));
  }

  /** Encerra todas as sessões e abre uma nova, com o estado de MFA atualizado no token. */
  private async renovarSessao(userId: string, req: Request, res: Response) {
    await this.auth.encerrarSessoes(userId);
    const tokens = await this.auth.issueTokens(await this.auth.buscarUsuario(userId), {
      ctx: contextoDaRequisicao(req),
    });
    gravarCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
  }
}
