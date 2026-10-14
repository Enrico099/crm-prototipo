import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// TOTP (RFC 6238) sobre HOTP (RFC 4226), no formato que Google Authenticator,
// Microsoft Authenticator, 1Password etc. entendem: SHA-1, 6 dígitos, 30 s.

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PASSO_S = 30;
const DIGITOS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let valor = 0;
  let out = '';
  for (const byte of buf) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALFABETO[(valor << (5 - bits)) & 31];
  return out;
}

export function base32Decode(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let valor = 0;
  const out: number[] = [];
  for (const ch of limpo) {
    const i = ALFABETO.indexOf(ch);
    if (i < 0) throw new Error('Segredo base32 inválido');
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((valor >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 bits, o tamanho recomendado pela RFC 4226 para HMAC-SHA1 */
export function gerarSegredo(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(segredo: Buffer, contador: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = createHmac('sha1', segredo).update(msg).digest();
  const deslocamento = h[h.length - 1] & 0xf;
  const binario = h.readUInt32BE(deslocamento) & 0x7fffffff;
  return (binario % 10 ** DIGITOS).toString().padStart(DIGITOS, '0');
}

export function passoAtual(agoraMs = Date.now()): number {
  return Math.floor(agoraMs / 1000 / PASSO_S);
}

/**
 * Confere o código no passo atual e nos vizinhos (tolerância de relógio de ±30 s).
 * Devolve o passo que casou, para o chamador recusar códigos já usados, ou null.
 */
export function verificarTotp(segredoBase32: string, codigo: string, agoraMs = Date.now(), janela = 1): number | null {
  if (!/^\d{6}$/.test(codigo)) return null;
  const segredo = base32Decode(segredoBase32);
  const atual = passoAtual(agoraMs);
  let casou: number | null = null;
  // Percorre a janela inteira sem sair cedo: o tempo não revela qual passo casou
  for (let d = -janela; d <= janela; d++) {
    if (timingSafeEqual(Buffer.from(hotp(segredo, atual + d)), Buffer.from(codigo))) casou = atual + d;
  }
  return casou;
}

export function uriOtpauth(segredoBase32: string, conta: string, emissor = 'Capital Elite'): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  const params = new URLSearchParams({
    secret: segredoBase32,
    issuer: emissor,
    algorithm: 'SHA1',
    digits: String(DIGITOS),
    period: String(PASSO_S),
  });
  return `otpauth://totp/${rotulo}?${params.toString()}`;
}
