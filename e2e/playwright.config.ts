import { defineConfig, devices } from '@playwright/test';
import { PORTA, WEB_URL } from './tests/apoio';

// Sobe os três serviços de verdade (motor Python, API e web em build de produção)
// contra o banco preparado por scripts/preparar-banco.mjs. As portas são próprias
// do E2E para não colidir com servidores de desenvolvimento (3000/3333/8000) nem
// reaproveitar uma API ligada a outro banco.
const CI = !!process.env.CI;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://crm:crm_dev_pwd@localhost:5432/crm?schema=public';
const PYTHON = process.env.E2E_PYTHON ?? 'python';
const AI_ENGINE_TOKEN = 'token-do-motor-somente-e2e';
const API_URL = `http://localhost:${PORTA.api}`;
const MOTOR_URL = `http://localhost:${PORTA.motor}`;

export default defineConfig({
  testDir: './tests',
  // Cada teste cria os próprios dados, mas o banco é um só: em série fica previsível
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: `${PYTHON} -m uvicorn src.main:app --port ${PORTA.motor}`,
      cwd: '../apps/ai-engine',
      url: `${MOTOR_URL}/health`,
      env: { AI_ENGINE_TOKEN },
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: 'npm run build -w @crm/api && npm run start -w @crm/api',
      cwd: '..',
      url: `${API_URL}/api/health/live`,
      env: {
        NODE_ENV: 'development',
        API_PORT: String(PORTA.api),
        DATABASE_URL,
        DIRECT_URL: DATABASE_URL,
        WEB_ORIGIN: WEB_URL,
        JWT_SECRET: 'segredo-e2e-access-0123456789abcdef0123',
        JWT_REFRESH_SECRET: 'segredo-e2e-refresh-0123456789abcdef012',
        CPF_HASH_SECRET: 'dev-somente-local-cpf-hash-secret',
        AI_ENGINE_URL: MOTOR_URL,
        AI_ENGINE_TOKEN,
      },
      reuseExistingServer: !CI,
      timeout: 180_000,
    },
    {
      command: `npm run build -w @crm/web && npm run start -w @crm/web -- --port ${PORTA.web}`,
      cwd: '..',
      url: `${WEB_URL}/login`,
      env: { API_URL },
      reuseExistingServer: !CI,
      timeout: 300_000,
    },
  ],
});
