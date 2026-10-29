import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "./api";
import type {
  AplicarSuitabilityResult,
  AuthUser,
  LoginResposta,
  MfaStatus,
  Cliente,
  ClienteDetalhado,
  ConversaoLeadResult,
  DashboardResumo,
  EstagioPipeline,
  Lead,
  LeadDetalhado,
  Movimentacao,
  SerieCarteira,
  Responsavel,
  GenerateResult,
  Interacao,
  LeadBoardColumn,
  Page,
  Produto,
  Questionario,
  Recomendacao,
  StatusCliente,
  StatusRecomendacao,
  Suitability,
  PerfilInvestidor,
  CategoriaProduto,
  OportunidadesDoDia,
  ResumoEnvio,
  StatusEnvio,
  UserRole,
  UsuarioAdmin,
} from "@/types/api";

// ----- Auth -----

export const ME_QUERY_KEY = ["auth", "me"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiFetch<{ user: AuthUser }>("/auth/me").then((r) => r.user),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiFetch<LoginResposta>("/auth/login", { method: "POST", body }),
    onSuccess: (res) => {
      if (!res.mfaObrigatorio) qc.setQueryData(ME_QUERY_KEY, res.user);
    },
  });
}

/** Cadastro público: a conta fica pendente até um admin aprovar */
export function useCadastro() {
  return useMutation({
    mutationFn: (body: { nome: string; email: string; senha: string }) =>
      apiFetch<{ mensagem: string }>("/auth/cadastro", { method: "POST", body }),
  });
}

export const USUARIOS_KEY = "usuarios" as const;

export function useUsuarios() {
  return useQuery({
    queryKey: [USUARIOS_KEY],
    queryFn: () => apiFetch<UsuarioAdmin[]>("/usuarios"),
  });
}

export function useAprovarCadastro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      apiFetch<UsuarioAdmin>(`/usuarios/${id}/aprovar`, { method: "PATCH", body: { role } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [USUARIOS_KEY] }),
  });
}

export function useRecusarCadastro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/usuarios/${id}/cadastro`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [USUARIOS_KEY] }),
  });
}

/** 2ª etapa do login: código do autenticador ou de recuperação */
export function useVerificarMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { desafio: string; codigo: string }) =>
      apiFetch<{ user: AuthUser }>("/auth/mfa/verificar", { method: "POST", body }),
    onSuccess: ({ user }) => {
      qc.setQueryData(ME_QUERY_KEY, user);
    },
  });
}

// ----- Segurança da conta (MFA e senha) -----

export const MFA_STATUS_KEY = ["auth", "mfa"] as const;

export function useMfaStatus() {
  return useQuery({
    queryKey: MFA_STATUS_KEY,
    queryFn: () => apiFetch<MfaStatus>("/auth/mfa"),
    retry: false,
  });
}

export function useConfigurarMfa() {
  return useMutation({
    mutationFn: () => apiFetch<{ segredo: string; uri: string }>("/auth/mfa/configurar", { method: "POST" }),
  });
}

/** Ativar e desativar renovam a sessão (cookies novos): tudo o que é cacheado é recarregado */
export function useAtivarMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { codigo: string }) =>
      apiFetch<{ codigosRecuperacao: string[] }>("/auth/mfa/ativar", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDesativarMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { senha: string; codigo: string }) =>
      apiFetch<{ ok: true }>("/auth/mfa/desativar", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRegenerarCodigosMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { codigo: string }) =>
      apiFetch<{ codigosRecuperacao: string[] }>("/auth/mfa/codigos", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: MFA_STATUS_KEY }),
  });
}

export function useAlterarSenha() {
  return useMutation({
    mutationFn: (body: { senhaAtual: string; novaSenha: string }) =>
      apiFetch<{ user: AuthUser }>("/auth/senha", { method: "POST", body }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>("/auth/logout", { method: "POST" }),
    // onSettled roda em sucesso E erro — sempre limpa o cache local.
    onSettled: () => {
      qc.clear();
    },
  });
}

// ----- Dashboard / Interações -----

export function useDashboardResumo() {
  return useQuery({
    queryKey: ["dashboard", "resumo"],
    queryFn: () => apiFetch<DashboardResumo>("/dashboard/resumo"),
  });
}

export function useInteracoes(filters: { page?: number; limit?: number; clienteId?: string } = {}) {
  return useQuery({
    queryKey: ["interacoes", filters],
    queryFn: () => apiFetch<Page<Interacao>>("/interacoes", { query: filters }),
  });
}

// ----- Clientes -----

export type ClientesFilters = {
  page?: number;
  limit?: number;
  perfil?: PerfilInvestidor;
  status?: StatusCliente;
  q?: string;
  sort?: string;
};

export function useClientes(filters: ClientesFilters = {}) {
  return useQuery({
    queryKey: ["clientes", filters],
    queryFn: () =>
      apiFetch<Page<Cliente>>("/clientes", {
        query: filters,
      }),
    // Mantém a lista anterior enquanto busca/filtra (sem piscar o skeleton)
    placeholderData: keepPreviousData,
  });
}

export const CLIENTE_DETALHADO_KEY = "cliente-detalhado" as const;

export function useClienteDetalhado(id: string | null) {
  return useQuery({
    queryKey: [CLIENTE_DETALHADO_KEY, id],
    queryFn: () => apiFetch<ClienteDetalhado>(`/clientes/${id}/detalhado`),
    enabled: !!id,
  });
}

// ----- Produtos -----

export type ProdutosFilters = {
  page?: number;
  limit?: number;
  categoria?: CategoriaProduto;
  perfilMinimo?: PerfilInvestidor;
  ativo?: boolean;
  riscoMax?: number;
  q?: string;
};

export function useProdutos(filters: ProdutosFilters = {}) {
  return useQuery({
    queryKey: ["produtos", filters],
    queryFn: () =>
      apiFetch<Page<Produto>>("/produtos", {
        query: filters,
      }),
  });
}

// ----- Leads -----

export function useLeadsBoard(responsavelId?: string) {
  return useQuery({
    queryKey: ["leads", "board", responsavelId ?? null],
    queryFn: () =>
      apiFetch<LeadBoardColumn[]>("/leads/board", {
        query: { responsavelId },
      }),
  });
}

// ----- Recomendações IA -----

export type RecomendacoesFilters = {
  page?: number;
  limit?: number;
  clienteId?: string;
  status?: StatusRecomendacao;
};

export const RECOMENDACOES_KEY = "recomendacoes" as const;

export function useRecomendacoes(filters: RecomendacoesFilters = {}) {
  return useQuery({
    queryKey: [RECOMENDACOES_KEY, filters],
    queryFn: () =>
      apiFetch<Page<Recomendacao>>("/recomendacoes", {
        query: filters,
      }),
  });
}

export function useRecomendacao(id: string | null) {
  return useQuery({
    queryKey: [RECOMENDACOES_KEY, "detail", id],
    queryFn: () => apiFetch<Recomendacao>(`/recomendacoes/${id}`),
    enabled: !!id,
  });
}

export function useOportunidadesDoDia() {
  return useQuery({
    queryKey: [RECOMENDACOES_KEY, "oportunidades-do-dia"],
    queryFn: () => apiFetch<OportunidadesDoDia>("/recomendacoes/oportunidades-do-dia"),
    // Roda o motor para a carteira inteira: não refaz a cada troca de aba
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useStatusEnvio(habilitado: boolean) {
  return useQuery({
    queryKey: ["envios", "status"],
    queryFn: () => apiFetch<StatusEnvio>("/envios/status"),
    enabled: habilitado,
  });
}

export function useEnviarOportunidades() {
  return useMutation({
    mutationFn: () => apiFetch<ResumoEnvio>("/envios/oportunidades-do-dia", { method: "POST" }),
  });
}

export function useGenerateRecomendacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { clienteId: string; topN?: number }) =>
      apiFetch<GenerateResult>("/recomendacoes/generate", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RECOMENDACOES_KEY] });
      qc.invalidateQueries({ queryKey: [CLIENTE_DETALHADO_KEY] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useAprovarRecomendacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Recomendacao>(`/recomendacoes/${id}/aprovar`, {
        method: "PATCH",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RECOMENDACOES_KEY] });
      qc.invalidateQueries({ queryKey: [CLIENTE_DETALHADO_KEY] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ----- Suitability -----

export const SUITABILITY_RECENTES_KEY = "suitability-recentes" as const;
export const QUESTIONARIO_KEY = "suitability-questionario" as const;

export function useQuestionario() {
  return useQuery({
    queryKey: [QUESTIONARIO_KEY],
    queryFn: () => apiFetch<Questionario>("/suitability/questionario"),
    staleTime: 60 * 60_000, // 1h — não muda em runtime
  });
}

export function useSuitabilityRecentes(limit = 20) {
  return useQuery({
    queryKey: [SUITABILITY_RECENTES_KEY, limit],
    queryFn: () =>
      apiFetch<
        Array<Suitability & { cliente: { id: string; nome: string; email: string } }>
      >("/suitability", { query: { limit } }),
  });
}

export function useAplicarSuitability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { clienteId: string; respostas: Record<string, string> }) =>
      apiFetch<AplicarSuitabilityResult>("/suitability", {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [CLIENTE_DETALHADO_KEY] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: [SUITABILITY_RECENTES_KEY] });
    },
  });
}

export function useRecusarRecomendacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; motivo: string }) =>
      apiFetch<Recomendacao>(`/recomendacoes/${input.id}/recusar`, {
        method: "PATCH",
        body: { motivo: input.motivo },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [RECOMENDACOES_KEY] });
      qc.invalidateQueries({ queryKey: [CLIENTE_DETALHADO_KEY] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ----- Cadastros (clientes, leads, produtos) -----

/** Payloads de escrita: só os campos que a API aceita em cada operação */
export type ClienteCriarInput = {
  nome: string;
  email: string;
  cpf: string;
  telefone?: string;
  cidade?: string;
  uf?: string;
  patrimonio?: number;
  responsavelId?: string;
};
export type ClienteAtualizarInput = Partial<Omit<ClienteCriarInput, "cpf">> & {
  status?: StatusCliente;
};

export type LeadCriarInput = {
  nome: string;
  email?: string;
  telefone?: string;
  origem: string;
  valorEstimado?: number;
  observacoes?: string;
  responsavelId?: string;
};
export type LeadAtualizarInput = Partial<LeadCriarInput>;

export type ConverterLeadInput = {
  cpf: string;
  nome?: string;
  email?: string;
  telefone?: string;
  cidade?: string;
  uf?: string;
  patrimonio?: number;
};

export type ProdutoInput = {
  nome: string;
  emissor: string;
  categoria: CategoriaProduto;
  rentabilidadeAno: number;
  risco: number;
  tributacao: Produto["tributacao"];
  perfilMinimo: PerfilInvestidor;
  liquidez: string;
  taxaAdmin?: number | null;
  taxaPerformance?: number | null;
  ticker?: string;
  descricao?: string;
  ativo?: boolean;
};

/** Assessores ativos — só ADMIN consulta (escolha do responsável) */
export function useAssessores(enabled: boolean) {
  return useQuery({
    queryKey: ["usuarios", "assessores"],
    queryFn: () => apiFetch<Responsavel[]>("/usuarios/assessores"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

function useInvalidarClientes() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["clientes"] });
    qc.invalidateQueries({ queryKey: [CLIENTE_DETALHADO_KEY] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useCriarCliente() {
  const invalidar = useInvalidarClientes();
  return useMutation({
    mutationFn: (body: ClienteCriarInput) =>
      apiFetch<Cliente>("/clientes", { method: "POST", body }),
    onSuccess: invalidar,
  });
}

export function useAtualizarCliente(id: string) {
  const invalidar = useInvalidarClientes();
  return useMutation({
    mutationFn: (body: ClienteAtualizarInput) =>
      apiFetch<Cliente>(`/clientes/${id}`, { method: "PATCH", body }),
    onSuccess: invalidar,
  });
}

export function useInativarCliente() {
  const invalidar = useInvalidarClientes();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; inativado: true }>(`/clientes/${id}`, { method: "DELETE" }),
    onSuccess: invalidar,
  });
}

export const LEAD_KEY = "lead" as const;

export function useLead(id: string | null) {
  return useQuery({
    queryKey: [LEAD_KEY, id],
    queryFn: () => apiFetch<LeadDetalhado>(`/leads/${id}`),
    enabled: !!id,
  });
}

function useInvalidarLeads() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: [LEAD_KEY] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

export function useCriarLead() {
  const invalidar = useInvalidarLeads();
  return useMutation({
    mutationFn: (body: LeadCriarInput) => apiFetch<Lead>("/leads", { method: "POST", body }),
    onSuccess: invalidar,
  });
}

export function useAtualizarLead(id: string) {
  const invalidar = useInvalidarLeads();
  return useMutation({
    mutationFn: (body: LeadAtualizarInput) =>
      apiFetch<Lead>(`/leads/${id}`, { method: "PATCH", body }),
    onSuccess: invalidar,
  });
}

export function useMoverEstagio(id: string) {
  const invalidar = useInvalidarLeads();
  return useMutation({
    mutationFn: (body: { estagio: EstagioPipeline; notas?: string }) =>
      apiFetch<Lead>(`/leads/${id}/mover-estagio`, { method: "POST", body }),
    onSuccess: invalidar,
  });
}

export function useExcluirLead() {
  const invalidar = useInvalidarLeads();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string; deleted: true }>(`/leads/${id}`, { method: "DELETE" }),
    onSuccess: invalidar,
  });
}

export function useConverterLead(id: string) {
  const invalidarLeads = useInvalidarLeads();
  const invalidarClientes = useInvalidarClientes();
  return useMutation({
    mutationFn: (body: ConverterLeadInput) =>
      apiFetch<ConversaoLeadResult>(`/leads/${id}/converter`, { method: "POST", body }),
    onSuccess: () => {
      invalidarLeads();
      invalidarClientes();
    },
  });
}

function useInvalidarProdutos() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["produtos"] });
}

export function useCriarProduto() {
  const invalidar = useInvalidarProdutos();
  return useMutation({
    mutationFn: (body: ProdutoInput) => apiFetch<Produto>("/produtos", { method: "POST", body }),
    onSuccess: invalidar,
  });
}

export function useAtualizarProduto() {
  const invalidar = useInvalidarProdutos();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ProdutoInput> & { id: string }) =>
      apiFetch<Produto>(`/produtos/${id}`, { method: "PATCH", body }),
    onSuccess: invalidar,
  });
}

// ----- Carteira (movimentações e evolução) -----

export type MovimentacaoInput = {
  tipo: "APLICACAO" | "RESGATE";
  produtoId: string;
  valor: number;
  /** ISO; omitido = agora */
  data?: string;
  observacao?: string;
  recomendacaoId?: string;
  cienciaDesenquadramento?: boolean;
};

export const MOVIMENTACOES_KEY = "movimentacoes" as const;

export function useMovimentacoes(clienteId: string, filters: { page?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: [MOVIMENTACOES_KEY, clienteId, filters],
    queryFn: () =>
      apiFetch<Page<Movimentacao>>(`/clientes/${clienteId}/movimentacoes`, { query: filters }),
  });
}

export function useRegistrarMovimentacao(clienteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MovimentacaoInput) =>
      apiFetch<Movimentacao>(`/clientes/${clienteId}/movimentacoes`, { method: "POST", body }),
    onSuccess: () => {
      // Posição, status do cliente, recomendação (ATIVA) e dashboard mudam juntos
      qc.invalidateQueries({ queryKey: [MOVIMENTACOES_KEY, clienteId] });
      qc.invalidateQueries({ queryKey: [CLIENTE_DETALHADO_KEY] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: [RECOMENDACOES_KEY] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["carteira"] });
    },
  });
}

export function useSerieCarteira(meses = 12) {
  return useQuery({
    queryKey: ["carteira", "series", meses],
    queryFn: () => apiFetch<SerieCarteira>("/carteira/series", { query: { meses } }),
  });
}
