import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { ACCESS_TTL_S, REFRESH_TTL_S } from './auth.service';

export const ACCESS_COOKIE = 'crm_at';
export const REFRESH_COOKIE = 'crm_rt';

function cookieBase(config: ConfigService): CookieOptions {
  const forcado = config.get<boolean | undefined>('COOKIE_SECURE');
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: forcado ?? config.get('NODE_ENV') === 'production',
    // path "/" é necessário: o proxy do Next checa a presença do crm_rt nas
    // rotas de página pra decidir se manda pro /login.
    path: '/',
  };
}

export function gravarCookies(res: Response, config: ConfigService, access: string, refresh: string) {
  const base = cookieBase(config);
  res.cookie(ACCESS_COOKIE, access, { ...base, maxAge: ACCESS_TTL_S * 1000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...base, maxAge: REFRESH_TTL_S * 1000 });
}

export function limparCookies(res: Response, config: ConfigService) {
  const base = cookieBase(config);
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}
