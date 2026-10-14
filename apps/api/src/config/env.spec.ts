import { validateEnv, webOrigins } from './env';

const segredo = (c: string) => c.repeat(40);

const prodOk = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/crm',
  JWT_SECRET: segredo('a'),
  JWT_REFRESH_SECRET: segredo('b'),
  CPF_HASH_SECRET: segredo('c'),
  MFA_CHAVE: segredo('d'),
  AI_ENGINE_TOKEN: 'token-servico',
};

describe('validateEnv', () => {
  it('aceita configuração de produção completa', () => {
    expect(validateEnv(prodOk).NODE_ENV).toBe('production');
  });

  it('em dev aceita segredos de exemplo', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'x', JWT_SECRET: 'dev-change-me', JWT_REFRESH_SECRET: 'dev-change-me-too' }),
    ).not.toThrow();
  });

  it.each([
    ['JWT_SECRET curto', { JWT_SECRET: 'curto' }],
    ['JWT_SECRET de exemplo', { JWT_SECRET: 'dev-change-me' }],
    ['segredos iguais', { JWT_REFRESH_SECRET: segredo('a') }],
    ['sem CPF_HASH_SECRET', { CPF_HASH_SECRET: undefined }],
    ['sem AI_ENGINE_TOKEN', { AI_ENGINE_TOKEN: undefined }],
    ['sem MFA_CHAVE', { MFA_CHAVE: undefined }],
    ['perfil inválido em MFA_OBRIGATORIO_PARA', { MFA_OBRIGATORIO_PARA: 'ADMIN,GERENTE' }],
  ])('recusa produção com %s', (_nome, override) => {
    expect(() => validateEnv({ ...prodOk, ...override })).toThrow(/Configuração inválida/);
  });

  it('nunca inclui o valor do segredo na mensagem de erro', () => {
    try {
      validateEnv({ ...prodOk, JWT_SECRET: 'valor-super-secreto' });
      fail('deveria lançar');
    } catch (e) {
      expect((e as Error).message).not.toContain('valor-super-secreto');
    }
  });

  it('exige DATABASE_URL e segredos JWT em qualquer ambiente', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL|JWT_SECRET/);
  });

  it('lê os perfis com MFA obrigatório (vazio = nenhum)', () => {
    expect(validateEnv({ ...prodOk, MFA_OBRIGATORIO_PARA: ' admin, Compliance ' }).MFA_OBRIGATORIO_PARA).toEqual([
      'ADMIN',
      'COMPLIANCE',
    ]);
    expect(validateEnv(prodOk).MFA_OBRIGATORIO_PARA).toEqual([]);
  });

  it('separa WEB_ORIGIN por vírgula', () => {
    expect(webOrigins({ WEB_ORIGIN: 'https://a.com, https://b.com,' })).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
