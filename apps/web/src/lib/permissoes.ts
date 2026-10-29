import { useMe } from "./queries";
import type { UserRole } from "@/types/api";

/**
 * Espelha a política da API (apps/api/src/auth/escopo.ts) pra esconder ações
 * que o usuário não pode executar. A API continua sendo quem decide — isto é
 * só UX, não controle de acesso.
 */
export function permissoesDe(role: UserRole | undefined) {
  return {
    /** Criar/editar clientes e leads, aplicar suitability, gerar/aprovar recomendações */
    podeOperar: role === "ADMIN" || role === "ASSESSOR",
    /** Curadoria do catálogo de produtos */
    podeGerirCatalogo: role === "ADMIN",
    /** Escolher o assessor responsável (assessor só cadastra na própria carteira) */
    podeAtribuirResponsavel: role === "ADMIN",
    /** Inativar/reativar cliente (exclusão lógica) */
    podeInativarCliente: role === "ADMIN",
    podeVerAuditoria: role === "ADMIN" || role === "COMPLIANCE",
    /** Disparar o e-mail das oportunidades do dia para a equipe */
    podeEnviarOportunidades: role === "ADMIN",
    /** Aprovar cadastros e ver a lista de usuários */
    podeGerirUsuarios: role === "ADMIN",
  };
}

export function usePermissoes() {
  const { data: user, isLoading } = useMe();
  return { ...permissoesDe(user?.role), carregando: isLoading };
}
