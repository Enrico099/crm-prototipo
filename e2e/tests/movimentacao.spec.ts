import { expect, test } from '@playwright/test';
import { sessao } from './apoio';

test.use({ storageState: sessao('joao') });

// Mariana Andrade é cliente do João no seed e tem posições na carteira
test('resgate acima do saldo é barrado antes de chegar à API', async ({ page }) => {
  await page.goto('/leads');
  await page.getByRole('searchbox', { name: 'Buscar por nome ou e-mail' }).fill('Mariana Andrade');
  await page.getByRole('link', { name: 'Mariana Andrade' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mariana Andrade' })).toBeVisible();

  await page.getByRole('button', { name: 'Registrar movimentação' }).click();
  const form = page.getByRole('dialog', { name: 'Registrar movimentação' });
  await form.getByText('Resgate', { exact: true }).click();
  await form.getByLabel('Produto').click();
  await page.getByRole('option').first().click();

  await form.getByLabel('Valor (R$)').fill('999.999.999,00');
  await form.getByRole('button', { name: 'Registrar resgate' }).click();

  await expect(form.getByText(/O saldo neste produto é R\$/)).toBeVisible();
  await expect(form).toBeVisible();
});
