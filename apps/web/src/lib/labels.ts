import type {
  CategoriaProduto,
  EstagioPipeline,
  PerfilInvestidor,
  StatusCliente,
  StatusRecomendacao,
  TipoInteracao,
  TipoMovimentacao,
  Tributacao,
  UserRole,
} from "@/types/api";

export const perfilLabel: Record<PerfilInvestidor, string> = {
  CONSERVADOR: "Conservador",
  MODERADO: "Moderado",
  ARROJADO: "Arrojado",
  AGRESSIVO: "Agressivo",
};

// Tons 800 sobre fundo 100: contraste AA pra texto pequeno
export const perfilColor: Record<PerfilInvestidor, string> = {
  CONSERVADOR: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-400/15 dark:text-emerald-200",
  MODERADO: "bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-400/15 dark:text-blue-200",
  ARROJADO: "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-400/15 dark:text-amber-200",
  AGRESSIVO: "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-400/15 dark:text-red-200",
};

export const categoriaLabel: Record<CategoriaProduto, string> = {
  RENDA_FIXA: "Renda Fixa",
  RENDA_VARIAVEL: "Renda Variável",
  FUNDOS: "Fundos",
  PREVIDENCIA: "Previdência",
  ESTRUTURADOS: "Estruturados",
  CAMBIO: "Câmbio",
};

export const tributacaoLabel: Record<Tributacao, string> = {
  TRIBUTADO: "Tributado (IR regressivo)",
  ISENTO: "Isento de IR",
  INCENTIVADO: "Incentivado (isento PF)",
};

export const estagioLabel: Record<EstagioPipeline, string> = {
  PROSPECCAO: "Prospecção",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

/** Sugestões do campo origem do lead (o campo aceita texto livre) */
export const ORIGENS_LEAD = ["Indicação", "Inbound", "Evento", "LinkedIn"] as const;

export const statusClienteLabel: Record<StatusCliente, string> = {
  ATIVO: "Ativo",
  PROSPECTO: "Prospecto",
  INATIVO: "Inativo",
  BLOQUEADO: "Bloqueado",
};

export const statusRecomendacaoLabel: Record<StatusRecomendacao, string> = {
  PENDENTE: "Pendente",
  APROVADA: "Aprovada",
  RECUSADA: "Recusada",
  ATIVA: "Ativa",
  EXPIRADA: "Expirada",
};

export const tipoInteracaoLabel: Record<TipoInteracao, string> = {
  EMAIL: "E-mail",
  LIGACAO: "Ligação",
  REUNIAO: "Reunião",
  WHATSAPP: "WhatsApp",
  TAREFA: "Tarefa",
  NOTA: "Nota",
};

export const AVISO_APOIO_DECISAO =
  "Recomendações são apoio à decisão. A decisão final é do assessor e está sujeita aos controles internos e de compliance.";

/** Ordem dos perfis (mesma da API: apps/api/src/recomendacoes/regras.ts) */
export const perfilOrdem: Record<PerfilInvestidor, number> = {
  CONSERVADOR: 0,
  MODERADO: 1,
  ARROJADO: 2,
  AGRESSIVO: 3,
};

export const tipoMovimentacaoLabel: Record<TipoMovimentacao, string> = {
  SALDO_INICIAL: "Saldo inicial",
  APLICACAO: "Aplicação",
  RESGATE: "Resgate",
};

export const roleLabel: Record<UserRole, string> = {
  ADMIN: "Administrador",
  ASSESSOR: "Assessor",
  COMPLIANCE: "Compliance",
  READONLY: "Somente leitura",
};
