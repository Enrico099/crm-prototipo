import { expect, test, type Browser } from '@playwright/test';
import { USUARIOS, codigoTotp, entrar, esperarToast, sessao } from './apoio';

// A Marina ativa o MFA neste teste; nenhum outro teste depois dele usa a sessão dela.
test.use({ storageState: sessao('marina') });

async function loginAteSegundaEtapa(browser: Browser) {
  const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await contexto.newPage();
  await page.goto('/login');
  await entrar(page, USUARIOS.marina.email);
  await expect(page.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible();
  // Sem o segundo fator não há sessão: as telas internas continuam fechadas
  expect((await contexto.cookies()).some((c) => c.name === 'crm_rt')).toBe(false);
  return { contexto, page };
}

test('assessora ativa o MFA e passa a entrar com o código ou com um código de recuperação', async ({ page, browser }) => {
  let segredo = '';
  let recuperacao: string[] = [];

  await test.step('ativa pela tela de segurança', async () => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: new RegExp(USUARIOS.marina.nome) }).click();
    await page.getByRole('menuitem', { name: 'Segurança da conta' }).click();
    await expect(page.getByRole('heading', { name: 'Segurança da conta' })).toBeVisible();

    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
    await expect(page.getByAltText(/QR code/)).toBeVisible();
    segredo = (await page.getByTestId('segredo-mfa').innerText()).replace(/\s/g, '');
    expect(segredo).toMatch(/^[A-Z2-7]{32}$/);

    await page.getByLabel(/Código do aplicativo/).fill(codigoTotp(segredo));
    await page.getByRole('button', { name: 'Confirmar e ativar' }).click();
    await esperarToast(page, 'Verificação em duas etapas ativada');

    const lista = page.getByRole('list', { name: 'Códigos de recuperação' });
    await expect(lista.getByRole('listitem')).toHaveCount(10);
    recuperacao = await lista.getByRole('listitem').allInnerTexts();
    await page.getByRole('button', { name: 'Já guardei os códigos' }).click();
    await expect(page.getByText('10 de 10 disponíveis')).toBeVisible();
  });

  await test.step('entra com o código do autenticador', async () => {
    const { contexto, page: p } = await loginAteSegundaEtapa(browser);
    // O código da ativação já foi usado; o da próxima janela de 30 s é aceito
    await p.getByLabel('Código').fill(codigoTotp(segredo, 1));
    await p.getByRole('button', { name: 'Verificar' }).click();
    await expect(p).toHaveURL(/\/dashboard$/);
    await contexto.close();
  });

  await test.step('código errado não entra', async () => {
    const { contexto, page: p } = await loginAteSegundaEtapa(browser);
    await p.getByLabel('Código').fill('000000');
    await p.getByRole('button', { name: 'Verificar' }).click();
    await expect(p.getByRole('alert').filter({ hasText: 'Código inválido' })).toBeVisible();
    await expect(p).toHaveURL(/\/login/);
    await contexto.close();
  });

  await test.step('entra com um código de recuperação, que depois deixa de valer', async () => {
    const { contexto, page: p } = await loginAteSegundaEtapa(browser);
    await p.getByRole('button', { name: 'Perdi o acesso ao autenticador' }).click();
    await p.getByLabel('Código de recuperação').fill(recuperacao[0]);
    await p.getByRole('button', { name: 'Verificar' }).click();
    await expect(p).toHaveURL(/\/dashboard$/);

    await p.goto('/conta/seguranca');
    await expect(p.getByText('9 de 10 disponíveis')).toBeVisible();
    await contexto.close();

    const segunda = await loginAteSegundaEtapa(browser);
    await segunda.page.getByRole('button', { name: 'Perdi o acesso ao autenticador' }).click();
    await segunda.page.getByLabel('Código de recuperação').fill(recuperacao[0]);
    await segunda.page.getByRole('button', { name: 'Verificar' }).click();
    await expect(segunda.page.getByRole('alert').filter({ hasText: 'já utilizado' })).toBeVisible();
    await segunda.contexto.close();
  });
});
