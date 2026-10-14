import { createHmac } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

/** Portas próprias do E2E (as de desenvolvimento são 3000/3333/8000) */
export const PORTA = { web: 3100, api: 3433, motor: 8100 };
export const WEB_URL = `http://localhost:${PORTA.web}`;

/** Usuários criados pelo seed (apps/api/prisma/seed.ts) */
export const SENHA = 'Senha123!';
export const USUARIOS = {
  admin: { email: 'admin@capitalelite.com.br', nome: 'Admin Capital' },
  joao: { email: 'joao.diniz@capitalelite.com.br', nome: 'João Diniz' },
  marina: { email: 'marina.lopes@capitalelite.com.br', nome: 'Marina Lopes' },
} as const;
export type Usuario = keyof typeof USUARIOS;

/** Sessão salva pelo auth.setup.ts */
export const sessao = (u: Usuario) => `.auth/${u}.json`;

export async function entrar(page: Page, email: string, senha = SENHA) {
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** CPF válido e aleatório: cada execução cadastra um cliente novo sem colidir */
export function gerarCpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (base: number[]) => {
    const soma = base.reduce((acc, d, i) => acc + d * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join('');
}

/** Sufixo curto para nomes e e-mails únicos por execução */
export const sufixo = () => Date.now().toString(36);

/**
 * Código TOTP (RFC 6238) como o aplicativo autenticador geraria. `passos`
 * desloca a janela de 30 s (a API aceita ±1 e não aceita o mesmo passo duas vezes).
 */
export function codigoTotp(segredoBase32: string, passos = 0): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of segredoBase32.replace(/\s/g, '')) bits += alfabeto.indexOf(ch).toString(2).padStart(5, '0');
  const segredo = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + passos));
  const h = createHmac('sha1', segredo).update(contador).digest();
  const desloc = h[h.length - 1] & 0xf;
  return ((h.readUInt32BE(desloc) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

export async function esperarToast(page: Page, texto: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: texto }).first()).toBeVisible();
}
