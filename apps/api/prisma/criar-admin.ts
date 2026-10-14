// Cria um usuário ADMIN no banco do DATABASE_URL, sem apagar nada. É o ponto de
// partida de um banco de uso real (o seed é só para demonstração e apaga tudo).
//
//   npm run usuario:admin -w @crm/api -- --email voce@empresa.com.br --nome "Seu Nome"
//
// A senha é pedida no terminal, sem eco, e nunca aparece em log nem em argumento.
// Fora de um terminal interativo, vem da variável ADMIN_SENHA.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { lerSenhaNova, nomeDoBanco } from './terminal';

const entradaSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido').max(254),
  nome: z.string().trim().min(2, 'Informe o nome').max(120),
});

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

    const senhaHash = await bcrypt.hash(await lerSenhaNova('ADMIN_SENHA'), 10);
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

    console.log(`Admin criado: ${user.nome} <${user.email}> no banco ${nomeDoBanco()}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
