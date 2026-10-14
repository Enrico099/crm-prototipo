import { expect, test } from '@playwright/test';
import { esperarToast, gerarCpf, sessao, sufixo } from './apoio';

test.use({ storageState: sessao('joao') });

// O ciclo principal do produto, de ponta a ponta e com os três serviços reais:
// cadastro → suitability → recomendação do motor → aprovação → aplicação.
test('assessor cadastra, perfila, recomenda, aprova e executa', async ({ page }) => {
  const id = sufixo();
  const nome = `Cliente E2E ${id}`;

  await test.step('cadastra o cliente como prospecto', async () => {
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Novo cliente' }).click();

    const form = page.getByRole('dialog', { name: 'Novo cliente' });
    await form.getByLabel('Nome completo').fill(nome);
    await form.getByLabel('E-mail').fill(`e2e.${id}@example.com`);
    await form.getByLabel('CPF').fill(gerarCpf());
    await form.getByLabel('Patrimônio declarado (R$)').fill('500.000,00');
    await form.getByLabel('Cidade').fill('São Paulo');
    await form.getByLabel('UF').fill('SP');
    await form.getByRole('button', { name: 'Cadastrar cliente' }).click();

    await expect(page).toHaveURL(/\/clientes\/[\w-]+$/);
    await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible();
    await expect(page.getByText('Prospecto', { exact: true })).toBeVisible();
    // Sem suitability o motor não pode ser acionado
    await expect(page.getByRole('button', { name: 'Gerar recomendação' })).toBeDisabled();
    await expect(page.getByText('Aplique a suitability antes de gerar recomendações.')).toBeVisible();
  });

  await test.step('aplica a suitability (perfil arrojado)', async () => {
    await page.getByRole('link', { name: 'Aplicar agora' }).click();
    await expect(page.getByRole('heading', { name: 'Suitability' })).toBeVisible();

    // A 3ª opção de cada pergunta soma 70 pontos: faixa 51–75, arrojado
    const perguntas = page.getByRole('radiogroup');
    await expect(perguntas).toHaveCount(10);
    for (const pergunta of await perguntas.all()) {
      await pergunta.locator('label').nth(2).click();
    }
    await page.getByRole('button', { name: 'Calcular perfil' }).click();

    await expect(page.getByRole('heading', { name: 'Suitability aplicada' })).toBeVisible();
    await expect(page.getByText(/^70\s*\/100$/)).toBeVisible();
    await expect(page.getByText('Arrojado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Voltar para ${nome}` }).click();
  });

  await test.step('gera recomendações com o motor', async () => {
    await page.getByRole('button', { name: 'Gerar recomendação' }).click();
    await expect(page.getByRole('dialog', { name: /Motor de recomendação/ })).toBeVisible();
    await esperarToast(page, `recomendações geradas para ${nome}`);
    await expect(page.getByRole('button').filter({ hasText: 'Pendente' }).first()).toBeVisible();
  });

  let produto = '';
  await test.step('aprova a primeira recomendação', async () => {
    await page.getByRole('button').filter({ hasText: 'Pendente' }).first().click();
    await page.getByRole('button', { name: 'Aprovar', exact: true }).click();

    const confirmacao = page.getByRole('dialog', { name: 'Aprovar recomendação?' });
    await confirmacao.getByRole('button', { name: 'Confirmar aprovação' }).click();
    await esperarToast(page, `Recomendação aprovada para ${nome}`);

    const executar = page.getByRole('button', { name: /^Registrar aplicação em / });
    await expect(executar).toBeVisible();
    produto = ((await executar.getAttribute('aria-label')) ?? '').replace('Registrar aplicação em ', '');
    expect(produto).not.toBe('');
  });

  await test.step('registra a aplicação, que ativa a recomendação e o cliente', async () => {
    await page.getByRole('button', { name: `Registrar aplicação em ${produto}` }).click();

    const form = page.getByRole('dialog', { name: 'Registrar movimentação' });
    await expect(form.getByText('passará a Ativa')).toBeVisible();
    await form.getByLabel('Valor (R$)').fill('50.000,00');
    await form.getByRole('button', { name: 'Registrar aplicação', exact: true }).click();
    await esperarToast(page, /Aplicação de R\$\s?50\.000,00 registrada/);

    await expect(page.getByText(/1 posições · R\$\s50\.000(,00)? alocado/)).toBeVisible();
    await expect(page.getByRole('button').filter({ hasText: produto }).filter({ hasText: 'Ativa' })).toBeVisible();
    // A primeira aplicação de um prospecto o torna cliente ativo
    await expect(page.getByText('Ativo', { exact: true })).toBeVisible();
  });
});
