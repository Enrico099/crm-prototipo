// Leitura de senha nos scripts de administração (criar-admin, redefinir-acesso).
import readline from 'node:readline';
import { senhaNovaSchema } from '../src/auth/politica-senha';

function perguntarOculto(pergunta: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let mudo = false;
    // Silencia o eco do que é digitado depois da pergunta
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!mudo) process.stdout.write(s);
    };
    rl.question(pergunta, (resposta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(resposta);
    });
    mudo = true;
  });
}

/**
 * Senha nova, validada pela política da API. No terminal é pedida duas vezes,
 * sem eco; fora de um terminal interativo vem da variável de ambiente indicada.
 */
export async function lerSenhaNova(variavel: string): Promise<string> {
  let senha: string;
  if (process.stdin.isTTY) {
    senha = await perguntarOculto('Senha: ');
    const confirmacao = await perguntarOculto('Confirme a senha: ');
    if (senha !== confirmacao) throw new Error('As senhas não conferem.');
  } else {
    const env = process.env[variavel];
    if (!env) throw new Error(`Sem terminal interativo: defina a senha em ${variavel}.`);
    senha = env;
  }
  const valida = senhaNovaSchema.safeParse(senha);
  if (!valida.success) throw new Error(valida.error.issues.map((i) => i.message).join('; '));
  return valida.data;
}

export function nomeDoBanco(): string {
  return new URL(process.env.DATABASE_URL ?? 'postgresql://desconhecido').hostname;
}
