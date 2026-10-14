import { SetMetadata } from '@nestjs/common';

export const PERMITIR_SEM_MFA_KEY = 'permitirSemMfa';

/**
 * Libera o endpoint para quem tem MFA obrigatório e ainda não ativou
 * (MFA_OBRIGATORIO_PARA). Só para o necessário à ativação: /auth/me, MFA, senha.
 */
export const PermitirSemMfa = () => SetMetadata(PERMITIR_SEM_MFA_KEY, true);
