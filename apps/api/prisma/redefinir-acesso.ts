// Recupera o acesso de um usuário que esqueceu a senha ou perdeu o autenticador
// e os códigos de recuperação. Quem roda tem acesso ao servidor e ao banco: é a
// trilha de último recurso enquanto não há recuperação por e-mail.
//
//   npm run usuario:redefinir -w @crm/api -- --email pessoa@empresa.com.br --senha
//   npm run usuario:redefinir -w @crm/api -- --email pessoa@empresa.com.br --sem-mfa
//
// --senha     define uma senha nova (pedida no terminal, ou NOVA_SENHA fora de TTY)
// --sem-mfa   desativa o MFA; a pessoa reativa no próximo login (obrigatório para
//             perfis em MFA_OBRIGATORIO_PARA)
// Em qualquer caso, todas as sessões abertas do usuário são encerradas.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { parseArgs } from 'node:util';
import { lerSenhaNova, nomeDoBanco } from './terminal';

const USO =
  'Uso: npm run usuario:redefinir -w @crm/api -- --email pessoa@empresa.com.br [--senha] [--sem-mfa]';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      senha: { type: 'boolean', default: false },
      'sem-mfa': { type: 'boolean', default: false },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const trocarSenha = values.senha;
  const tirarMfa = values['sem-mfa'];
  if (!email || (!trocarSenha && !tirarMfa)) throw new Error(`${USO}\n  Informe o e-mail e ao menos uma ação.`);

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Nenhum usuário com o e-mail ${email}. Nada foi alterado.`);

    const senhaHash = trocarSenha ? await bcrypt.hash(await lerSenhaNova('NOVA_SENHA'), 10) : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          ...(senhaHash && { senhaHash }),
          ...(tirarMfa && { mfaEnabled: false, mfaSecret: null, mfaUltimoPasso: null, mfaAtivadoEm: null }),
        },
      });
      if (tirarMfa) await tx.codigoRecuperacaoMfa.deleteMany({ where: { userId: user.id } });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revogadoEm: null },
        data: { revogadoEm: new Date() },
      });
      await tx.auditoria.create({
        data: {
          acao: 'REDEFINICAO_ACESSO',
          entidade: 'User',
          entidadeId: user.id,
          diff: { senha: trocarSenha, mfaDesativado: tirarMfa, origem: 'script redefinir-acesso' },
        },
      });
    });

    const feito = [trocarSenha && 'senha redefinida', tirarMfa && 'MFA desativado'].filter(Boolean).join(' e ');
    console.log(`${user.nome} <${user.email}>: ${feito}; sessões encerradas (banco ${nomeDoBanco()}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
