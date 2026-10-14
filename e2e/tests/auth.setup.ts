import { expect, test as setup } from '@playwright/test';
import { USUARIOS, entrar, sessao, type Usuario } from './apoio';

// Um login por usuário, salvo em .auth/: os testes reaproveitam a sessão em vez
// de logar a cada caso (e não esbarram no limite de tentativas da API).
for (const usuario of Object.keys(USUARIOS) as Usuario[]) {
  setup(`sessão de ${usuario}`, async ({ page }) => {
    await page.goto('/login');
    await entrar(page, USUARIOS[usuario].email);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(USUARIOS[usuario].nome).first()).toBeVisible();
    await page.context().storageState({ path: sessao(usuario) });
  });
}
