import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMITIR_SEM_MFA_KEY } from '../decorators/permitir-sem-mfa.decorator';
import type { AuthUser } from '../decorators/current-user.decorator';
import { ACCESS_COOKIE } from '../cookies';

type AccessClaims = AuthUser & { type: string; mfa?: boolean };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const alvos = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, alvos);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente');
    }

    let payload: AccessClaims;
    try {
      const secret = this.config.get<string>('JWT_SECRET');
      payload = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
    if (payload.type !== 'access' || !payload.id || !payload.role) {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      nome: payload.nome,
      role: payload.role,
    };

    // Perfil com MFA obrigatório e conta sem MFA: só o necessário para ativar
    const obrigatorio = this.config.get<UserRole[]>('MFA_OBRIGATORIO_PARA') ?? [];
    if (
      obrigatorio.includes(payload.role) &&
      !payload.mfa &&
      !this.reflector.getAllAndOverride<boolean>(PERMITIR_SEM_MFA_KEY, alvos)
    ) {
      throw new ForbiddenException({
        message: 'Ative a verificação em duas etapas para continuar usando o sistema.',
        error: 'Forbidden',
        code: 'MFA_OBRIGATORIO',
      });
    }
    return true;
  }

  private extractToken(req: {
    cookies?: Record<string, string>;
    headers: { authorization?: string };
  }): string | null {
    // Prefere cookie httpOnly (fluxo web seguro)
    if (req.cookies?.[ACCESS_COOKIE]) {
      return req.cookies[ACCESS_COOKIE];
    }
    // Fallback: Authorization: Bearer <token> (curl, server-to-server)
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      return auth.slice(7);
    }
    return null;
  }
}
