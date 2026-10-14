// Cria um usuário ADMIN no banco do DATABASE_URL, sem apagar nada. É o ponto de
// partida de um banco de uso real (o seed é só para demonstração e apaga tudo).
//
//   npm run usuario:admin -w @crm/api -- --email voce@empresa.com.br --nome "Seu Nome"
//
// A senha é pedida no terminal, sem eco, e nunca aparece em log nem em argumento.
// Fora de um terminal interativo, vem da variável ADMIN_SENHA.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const SENHA_MIN = 12;

const entradaSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
});

// O bcrypt só considera os primeiros 72 bytes
const senhaSchema = z
  .string()
  .min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres`)
  .refine((s) => Buffer.byteLength(s) <= 72, 'A senha passa de 72 bytes')
  .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), 'Use letras e números');

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

async function lerSenha(): Promise<string> {
  if (!process.stdin.isTTY) {
    const senha = process.env.ADMIN_SENHA;
    if (!senha) throw new Error('Sem terminal interativo: defina a senha em ADMIN_SENHA.');
    return senha;
  }
  const senha = await perguntarOculto('Senha: ');
  const confirmacao = await perguntarOculto('Confirme a senha: ');
  if (senha !== confirmacao) throw new Error('As senhas não conferem.');
  return senha;
}

async function main() {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, nome: { type: 'string' } },
  });
  const entrada = entradaSchema.safeParse(values);
  if (!entrada.success) {
    throw new Error(
      'Uso: npm run usuario:admin -w @crm/api -- --email voce@empresa.com.br --nome "Seu Nome"\n' +
        entrada.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'),
    );
  }
  const { email, nome } = entrada.data;

  const prisma = new PrismaClient();
  try {
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new Error(`Já existe um usuário com o e-mail ${email}. Nada foi alterado.`);
    }

    const senha = senhaSchema.safeParse(await lerSenha());
    if (!senha.success) throw new Error(senha.error.issues.map((i) => i.message).join('; '));

    const senhaHash = await bcrypt.hash(senha.data, 10);
    const user = await prisma.$transaction(async (tx) => {
      const criado = await tx.user.create({ data: { email, nome, senhaHash, role: 'ADMIN' } });
      await tx.auditoria.create({
        data: {
          acao: 'CRIACAO',
          entidade: 'User',
          entidadeId: criado.id,
          diff: { email, nome, role: 'ADMIN', origem: 'script criar-admin' },
        },
      });
      return criado;
    });

    const banco = new URL(process.env.DATABASE_URL ?? 'postgresql://desconhecido').hostname;
    console.log(`Admin criado: ${user.nome} <${user.email}> no banco ${banco}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
