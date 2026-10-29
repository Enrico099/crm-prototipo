import { z } from 'zod';
import { senhaNovaSchema } from '../politica-senha';

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).toLowerCase(),
  // max evita DoS: bcrypt é caro e só considera os primeiros 72 bytes
  password: z.string().min(6).max(128),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const cadastroSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo').max(120),
  email: z.string().trim().email('E-mail inválido').max(254).toLowerCase(),
  senha: senhaNovaSchema,
});
export type CadastroDto = z.infer<typeof cadastroSchema>;

// TOTP (6 dígitos) ou código de recuperação ("abcde-fghjk")
const codigoMfa = z.string().trim().min(6, 'Informe o código').max(20);

export const verificarMfaSchema = z.object({
  desafio: z.string().min(1).max(2000),
  codigo: codigoMfa,
});
export type VerificarMfaDto = z.infer<typeof verificarMfaSchema>;

export const codigoMfaSchema = z.object({ codigo: codigoMfa });
export type CodigoMfaDto = z.infer<typeof codigoMfaSchema>;

export const desativarMfaSchema = z.object({
  senha: z.string().min(1, 'Informe a senha').max(128),
  codigo: codigoMfa,
});
export type DesativarMfaDto = z.infer<typeof desativarMfaSchema>;

export const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual').max(128),
  novaSenha: senhaNovaSchema,
});
export type AlterarSenhaDto = z.infer<typeof alterarSenhaSchema>;
