import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { contextoDaRequisicao } from '../common/request-context';
import { AuthService } from './auth.service';
import { CadastroService } from './cadastro.service';
import { REFRESH_COOKIE, gravarCookies, limparCookies } from './cookies';
import {
  alterarSenhaSchema,
  cadastroSchema,
  loginSchema,
  verificarMfaSchema,
  type AlterarSenhaDto,
  type CadastroDto,
  type LoginDto,
  type VerificarMfaDto,
} from './dto/auth.schemas';
import { Public } from './decorators/public.decorator';
import { PermitirSemMfa } from './decorators/permitir-sem-mfa.decorator';
import { CurrentUser, type AuthUser } from './decorators/current-user.decorator';
import { MfaService } from './mfa/mfa.service';

export { ACCESS_COOKIE, REFRESH_COOKIE } from './cookies';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cadastro: CadastroService,
    private readonly mfa: MfaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = contextoDaRequisicao(req);
    const user = await this.auth.validateLogin(dto, ctx);
    if (user.mfaEnabled) {
      // Sem cookies de sessão até o segundo fator
      return { mfaObrigatorio: true, desafio: await this.auth.emitirDesafioMfa(user) };
    }
    const tokens = await this.auth.issueTokens(user, { ctx });
    gravarCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
    return { user: tokens.user };
  }

  /** Cadastro pela tela de login: a conta fica pendente até um admin aprovar */
  @Public()
  @Post('cadastro')
  @HttpCode(HttpStatus.ACCEPTED)
  cadastrar(@Body(new ZodValidationPipe(cadastroSchema)) dto: CadastroDto, @Req() req: Request) {
    return this.cadastro.cadastrar(dto, contextoDaRequisicao(req));
  }

  @Public()
  @Post('mfa/verificar')
  @HttpCode(HttpStatus.OK)
  async verificarMfa(
    @Body(new ZodValidationPipe(verificarMfaSchema)) dto: VerificarMfaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = contextoDaRequisicao(req);
    const user = await this.auth.concluirLoginMfa(dto.desafio, dto.codigo, ctx);
    const tokens = await this.auth.issueTokens(user, { ctx });
    gravarCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
    return { user: tokens.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rt = req.cookies?.[REFRESH_COOKIE];
    if (!rt) throw new UnauthorizedException('Sessão expirada. Faça login novamente.');

    const tokens = await this.auth.refresh(rt, contextoDaRequisicao(req));
    gravarCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
    return { user: tokens.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Revoga a sessão no servidor (se o refresh for válido) e sempre limpa os cookies
    // — mesmo expirado, o usuário precisa conseguir sair.
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], contextoDaRequisicao(req));
    limparCookies(res, this.config);
  }

  @PermitirSemMfa()
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const { ativo, obrigatorio } = await this.mfa.status(user.id);
    return { user, mfa: { ativo, obrigatorio } };
  }

  /** Troca a própria senha. Encerra as outras sessões e renova a atual. */
  @PermitirSemMfa()
  @Post('senha')
  @HttpCode(HttpStatus.OK)
  async alterarSenha(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(alterarSenhaSchema)) dto: AlterarSenhaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = contextoDaRequisicao(req);
    const atualizado = await this.auth.alterarSenha(user.id, dto, ctx);
    const tokens = await this.auth.issueTokens(atualizado, { ctx });
    gravarCookies(res, this.config, tokens.accessToken, tokens.refreshToken);
    return { user: tokens.user };
  }
}
