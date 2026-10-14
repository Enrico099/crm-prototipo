import { expect, request, test } from '@playwright/test';
import { WEB_URL, sessao } from './apoio';

// Bianca Lemos é cliente da Marina no seed; o João não pode vê-la por nenhum caminho.
const CLIENTE_DA_MARINA = 'Bianca Lemos';

async function idDoCliente(nome: string) {
  const admin = await request.newContext({
    baseURL: WEB_URL,
    storageState: sessao('admin'),
  });
  const res = await admin.get(`/api/clientes?q=${encodeURIComponent(nome)}`);
  expect(res.ok()).toBeTruthy();
  const corpo = (await res.json()) as { data: { id: string; nome: string }[] };
  await admin.dispose();
  const cliente = corpo.data.find((c) => c.nome === nome);
  expect(cliente, `${nome} deveria existir no seed`).toBeDefined();
  return cliente!.id;
}

test.describe('escopo por assessor', () => {
  test.use({ storageState: sessao('joao') });

  test('cliente de outro assessor não aparece na busca', async ({ page }) => {
    await page.goto('/leads');
    await page.getByRole('searchbox', { name: 'Buscar por nome ou e-mail' }).fill(CLIENTE_DA_MARINA);
    await expect(page.getByText('Nenhum cliente corresponde aos filtros.')).toBeVisible();
  });

  test('ficha de cliente de outro assessor não abre pelo link direto', async ({ page }) => {
    const id = await idDoCliente(CLIENTE_DA_MARINA);
    await page.goto(`/clientes/${id}`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: CLIENTE_DA_MARINA })).toHaveCount(0);
  });
});

test.describe('administrador', () => {
  test.use({ storageState: sessao('admin') });

  test('vê clientes de todos os assessores', async ({ page }) => {
    await page.goto('/leads');
    await page.getByRole('searchbox', { name: 'Buscar por nome ou e-mail' }).fill(CLIENTE_DA_MARINA);
    await expect(page.getByRole('link', { name: CLIENTE_DA_MARINA })).toBeVisible();
  });
});
