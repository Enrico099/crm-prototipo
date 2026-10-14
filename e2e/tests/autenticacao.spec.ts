import { expect, test } from '@playwright/test';
import { USUARIOS, entrar } from './apoio';

test.describe('autenticação', () => {
  test('rota protegida manda para o login e volta para onde estava', async ({ page }) => {
    await page.goto('/leads');
    await expect(page).toHaveURL(/\/login\?from=%2Fleads$/);

    await entrar(page, USUARIOS.joao.email);
    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByRole('heading', { name: 'Leads & Clientes' })).toBeVisible();
  });

  test('senha errada mostra o erro e não entra', async ({ page }) => {
    await page.goto('/login');
    await entrar(page, USUARIOS.marina.email, 'senha-errada');

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('sair encerra a sessão', async ({ page }) => {
    await page.goto('/login');
    await entrar(page, USUARIOS.joao.email);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: new RegExp(USUARIOS.joao.nome) }).click();
    await page.getByRole('menuitem', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/login/);

    // Sem cookie de sessão, voltar para uma tela interna exige login de novo
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?from=%2Fdashboard$/);
  });
});
