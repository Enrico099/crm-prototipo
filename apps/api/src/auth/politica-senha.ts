import { z } from 'zod';

export const SENHA_MIN = 12;

/** Política de senha nova (troca, redefinição e criação de usuário). */
export const senhaNovaSchema = z
  .string()
  .min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres`)
  // O bcrypt só considera os primeiros 72 bytes
  .refine((s) => Buffer.byteLength(s) <= 72, 'A senha passa do tamanho máximo (72 bytes)')
  .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), 'Use letras e números');
