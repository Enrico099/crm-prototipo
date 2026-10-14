// Prepara o banco dos testes E2E: aplica as migrações e roda o seed, que APAGA
// todos os dados. Por isso só aceita banco local, a menos que a variável
// E2E_PERMITIR_BANCO_REMOTO=true diga explicitamente o contrário.
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL_PADRAO = 'postgresql://crm:crm_dev_pwd@localhost:5432/crm?schema=public';
const databaseUrl = process.env.E2E_DATABASE_URL ?? URL_PADRAO;

const host = new URL(databaseUrl).hostname;
const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
if (!local && process.env.E2E_PERMITIR_BANCO_REMOTO !== 'true') {
  console.error(
    `E2E recusado: o banco "${host}" não é local e o seed apaga todos os dados.\n` +
      'Use um Postgres descartável (ex.: docker compose up -d postgres).',
  );
  process.exit(1);
}

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/api');
const env = { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl };
const rodar = (cmd) => execSync(cmd, { cwd: apiDir, env, stdio: 'inherit' });

rodar('npx prisma migrate deploy');
rodar('npx tsx prisma/seed.ts');
