-- Cadastro pela tela de login: a conta nasce inativa e pendente até um admin aprovar
ALTER TABLE "users" ADD COLUMN "cadastroPendente" BOOLEAN NOT NULL DEFAULT false;
