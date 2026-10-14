import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type Janela = { falhas: number; inicio: number };

const JANELA_MS = 15 * 60 * 1000;
const MAX_FALHAS_POR_EMAIL = 5;
const MAX_FALHAS_POR_IP = 20;
// O código TOTP tem 10^6 combinações: 5 erros por janela tornam o chute inviável
const MAX_FALHAS_MFA = 5;

/**
 * Limita tentativas de login por e-mail e por IP, e de código MFA por usuário
 * (janela de 15 min).
 *
 * Em memória: vale por instância da API. Com mais de uma réplica, trocar por
 * um store compartilhado (Redis — já previsto no docker-compose).
 */
@Injectable()
export class LoginThrottleService {
  private readonly janelas = new Map<string, Janela>();

  /** Lança 429 se o e-mail ou o IP excederam o limite de falhas. */
  verificar(email: string, ip: string | null) {
    const agora = Date.now();
    if (
      this.excedeu(`email:${email}`, MAX_FALHAS_POR_EMAIL, agora) ||
      (ip && this.excedeu(`ip:${ip}`, MAX_FALHAS_POR_IP, agora))
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  registrarFalha(email: string, ip: string | null) {
    const agora = Date.now();
    this.incrementar(`email:${email}`, agora);
    if (ip) this.incrementar(`ip:${ip}`, agora);
    this.limparExpiradas(agora);
  }

  registrarSucesso(email: string) {
    this.janelas.delete(`email:${email}`);
  }

  /** Lança 429 se o usuário errou o código MFA vezes demais. */
  verificarMfa(userId: string) {
    if (this.excedeu(`mfa:${userId}`, MAX_FALHAS_MFA, Date.now())) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Muitas tentativas de código. Aguarde alguns minutos e tente novamente.',
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  registrarFalhaMfa(userId: string) {
    const agora = Date.now();
    this.incrementar(`mfa:${userId}`, agora);
    this.limparExpiradas(agora);
  }

  registrarSucessoMfa(userId: string) {
    this.janelas.delete(`mfa:${userId}`);
  }

  private excedeu(chave: string, max: number, agora: number) {
    const j = this.janelas.get(chave);
    if (!j) return false;
    if (agora - j.inicio > JANELA_MS) {
      this.janelas.delete(chave);
      return false;
    }
    return j.falhas >= max;
  }

  private incrementar(chave: string, agora: number) {
    const j = this.janelas.get(chave);
    if (!j || agora - j.inicio > JANELA_MS) {
      this.janelas.set(chave, { falhas: 1, inicio: agora });
    } else {
      j.falhas += 1;
    }
  }

  private limparExpiradas(agora: number) {
    if (this.janelas.size < 10_000) return;
    for (const [k, j] of this.janelas) {
      if (agora - j.inicio > JANELA_MS) this.janelas.delete(k);
    }
  }
}
