// Ambiente fixo pros testes — nunca lê o .env real e nunca toca banco.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://teste:teste@127.0.0.1:1/teste';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.JWT_SECRET = 'segredo-de-teste-access-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'segredo-de-teste-refresh-0123456789abcdef';
process.env.CPF_HASH_SECRET = 'segredo-de-teste-cpf-0123456789abcdef';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.AI_ENGINE_URL = 'http://127.0.0.1:1';
