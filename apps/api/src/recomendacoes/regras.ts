import type { PerfilInvestidor } from '@prisma/client';

/** Ordem ordinal dos perfis (mais conservador → mais agressivo) */
export const PERFIL_ORDEM: Record<PerfilInvestidor, number> = {
  CONSERVADOR: 0,
  MODERADO: 1,
  ARROJADO: 2,
  AGRESSIVO: 3,
};

/** Produto é adequado se o perfil mínimo dele não excede o perfil do cliente. */
export function produtoAdequadoAoPerfil(
  perfilMinimoProduto: PerfilInvestidor,
  perfilCliente: PerfilInvestidor,
): boolean {
  return PERFIL_ORDEM[perfilMinimoProduto] <= PERFIL_ORDEM[perfilCliente];
}

/** Recomendação pendente vale por 30 dias */
export const VALIDADE_RECOMENDACAO_DIAS = 30;

/** Teto de produtos enviados ao motor por rodada (limite de payload) */
export const LIMITE_CATALOGO_MOTOR = 2000;

/** Teto de clientes varridos por rodada de oportunidades do dia */
export const LIMITE_CLIENTES_OPORTUNIDADES = 200;

/** Especialistas do comitê do motor: todos precisam aprovar a recomendação */
export const ESPECIALISTAS_COMITE = [
  'suitability',
  'risco',
  'concentracao',
  'liquidez',
  'custo',
  'dados',
  'conviccao',
] as const;

export const AVISO_APOIO_DECISAO =
  'Recomendação gerada por motor de apoio à decisão. A decisão final é do assessor ' +
  'e está sujeita aos controles internos e de compliance da instituição.';
