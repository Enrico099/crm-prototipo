import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const VERSAO = 'v1';

/**
 * Cifra os segredos TOTP (AES-256-GCM) e calcula o hash dos códigos de
 * recuperação (HMAC-SHA256). Um vazamento do banco sozinho não entrega nem os
 * segredos nem os códigos: falta a chave, que fica só no ambiente da API.
 */
export class CifraMfa {
  private readonly chave: Buffer;

  constructor(chave: string) {
    this.chave = createHash('sha256').update(chave).digest();
  }

  cifrar(texto: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.chave, iv);
    const conteudo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
    return [VERSAO, iv, c.getAuthTag(), conteudo]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  decifrar(cifrado: string): string {
    const [versao, iv, tag, conteudo] = cifrado.split('.');
    if (versao !== VERSAO || !iv || !tag || !conteudo) throw new Error('Segredo MFA em formato desconhecido');
    const d = createDecipheriv('aes-256-gcm', this.chave, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(conteudo, 'base64url')), d.final()]).toString('utf8');
  }

  hashCodigo(codigo: string): string {
    return createHmac('sha256', this.chave).update(normalizarCodigoRecuperacao(codigo)).digest('hex');
  }
}

const ALFABETO_CODIGO = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem 0/o, 1/l/i

/** "abcde-fghjk": 10 caracteres de 31 símbolos, ~49 bits */
export function gerarCodigoRecuperacao(): string {
  const bytes = randomBytes(10);
  const chars = [...bytes].map((b) => ALFABETO_CODIGO[b % ALFABETO_CODIGO.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function normalizarCodigoRecuperacao(codigo: string): string {
  return codigo.toLowerCase().replace(/[\s-]/g, '');
}

export function pareceCodigoRecuperacao(codigo: string): boolean {
  return /^[a-z0-9]{10}$/.test(normalizarCodigoRecuperacao(codigo));
}
