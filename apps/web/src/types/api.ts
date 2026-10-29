// Tipos que casam com as respostas da API NestJS.
// Mantidos manualmente por enquanto; quando criarmos packages/shared
// (Fase 3), substituímos por imports do schema Zod compartilhado.

export type UserRole = "ADMIN" | "ASSESSOR" | "COMPLIANCE" | "READONLY";

/** Usuário na tela de administração (GET /usuarios) */
export type UsuarioAdmin = {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  /** Criou a conta pela tela de cadastro e aguarda aprovação */
  cadastroPendente: boolean;
  createdAt: string;
};

export type AuthUser = {
  id: string;
  email: string;
  nome: string;
  role: UserRole;
};

/** Login: sessão aberta, ou desafio do segundo fator quando a conta tem MFA */
export type LoginResposta =
  | { user: AuthUser; mfaObrigatorio?: undefined }
  | { mfaObrigatorio: true; desafio: string };

export type MfaStatus = {
  ativo: boolean;
  ativadoEm: string | null;
  obrigatorio: boolean;
  codigosRestantes: number;
};

export type Page<T> = {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type PerfilInvestidor =
  | "CONSERVADOR"
  | "MODERADO"
  | "ARROJADO"
  | "AGRESSIVO";

export type StatusCliente = "ATIVO" | "PROSPECTO" | "INATIVO" | "BLOQUEADO";

export type EstagioPipeline =
  | "PROSPECCAO"
  | "QUALIFICACAO"
  | "PROPOSTA"
  | "NEGOCIACAO"
  | "FECHADO"
  | "PERDIDO";

export type CategoriaProduto =
  | "RENDA_FIXA"
  | "RENDA_VARIAVEL"
  | "FUNDOS"
  | "PREVIDENCIA"
  | "ESTRUTURADOS"
  | "CAMBIO";

export type Tributacao = "TRIBUTADO" | "ISENTO" | "INCENTIVADO";

export type Responsavel = {
  id: string;
  nome: string;
  email: string;
};

export type Cliente = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  cpfMasked: string;
  cidade: string | null;
  uf: string | null;
  perfil: PerfilInvestidor;
  status: StatusCliente;
  patrimonio: number;
  ultimaInteracao: string | null;
  responsavelId: string | null;
  responsavel: Responsavel | null;
  createdAt: string;
  updatedAt: string;
};

export type Produto = {
  id: string;
  nome: string;
  emissor: string;
  categoria: CategoriaProduto;
  rentabilidadeAno: number;
  risco: 1 | 2 | 3 | 4 | 5;
  tributacao: Tributacao;
  perfilMinimo: PerfilInvestidor;
  liquidez: string;
  taxaAdmin: number | null;
  taxaPerformance: number | null;
  ticker: string | null;
  ativo: boolean;
  descricao: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Lead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  origem: string;
  estagio: EstagioPipeline;
  valorEstimado: number;
  observacoes: string | null;
  responsavelId: string | null;
  responsavel: Responsavel | null;
  clienteId: string | null;
  /** Cliente gerado pela conversão do lead, se houver */
  cliente: { id: string; nome: string } | null;
  createdAt: string;
  updatedAt: string;
  fechadoEm: string | null;
};

export type EstagioHistorico = {
  id: string;
  estagio: EstagioPipeline;
  notas: string | null;
  criadoEm: string;
};

export type LeadDetalhado = Lead & { estagioHistorico: EstagioHistorico[] };

export type ConversaoLeadResult = { lead: Lead; cliente: Cliente };

export type LeadBoardColumn = {
  estagio: EstagioPipeline;
  total: number;
  count: number;
  itens: Lead[];
};

export type Posicao = {
  id: string;
  produto: {
    id: string;
    nome: string;
    categoria: CategoriaProduto;
    emissor: string;
  };
  valor: number;
  adquiridoEm: string;
};

export type Suitability = {
  id: string;
  perfilCalculado: PerfilInvestidor;
  pontuacao: number;
  versaoQuestionario: string;
  validoAte: string;
  aplicadoEm: string;
};

export type SuitabilityResumo = Suitability & {
  /** true quando validoAte já passou — cliente não pode receber recomendação */
  vencida: boolean;
  aplicadoPor: { id: string; nome: string } | null;
};

// A pontuação de cada opção fica só no servidor (exibir induz a resposta)
export type OpcaoQuestionario = {
  id: string;
  label: string;
};

export type PerguntaQuestionario = {
  id: string;
  pergunta: string;
  ajuda?: string;
  opcoes: OpcaoQuestionario[];
};

export type Questionario = {
  versao: string;
  perguntas: PerguntaQuestionario[];
};

export type AplicarSuitabilityResult = {
  suitability: Suitability;
  perfilAnterior: PerfilInvestidor;
  perfilNovo: PerfilInvestidor;
  mudou: boolean;
};

export type ClienteDetalhado = Cliente & {
  posicoes: Posicao[];
  suitability: SuitabilityResumo | null;
  recomendacoes: Array<{
    id: string;
    produto: { id: string; nome: string; categoria: CategoriaProduto; emissor: string };
    score: number;
    justificativa: string;
    status: StatusRecomendacao;
    geradoEm: string;
  }>;
};

// ----- Recomendações IA -----

export type StatusRecomendacao =
  | "PENDENTE"
  | "APROVADA"
  | "RECUSADA"
  | "ATIVA"
  | "EXPIRADA";

export type FatorRecomendacao =
  | "profileMatch"
  | "diversification"
  | "yield"
  | "liquidity"
  | "cost";

export type MotivoDescarte =
  | "perfil_incompativel"
  | "concentracao_emissor"
  | "risco_alem_tolerancia"
  | "ja_sobrealocado";

export type DescarteAgregado = {
  motivo: MotivoDescarte;
  count: number;
  contexto?: { emissor?: string; pctPatrimonio?: number };
};

export type Especialista =
  | "suitability"
  | "risco"
  | "concentracao"
  | "liquidez"
  | "custo"
  | "dados"
  | "conviccao";

/** Parecer de um especialista do comitê que revisa cada recomendação do motor */
export type ParecerEspecialista = {
  especialista: Especialista;
  nome: string;
  aprovado: boolean;
  parecer: string;
};

export type ReprovacaoComite = {
  produtoId: string;
  produtoNome: string;
  pareceres: ParecerEspecialista[];
};

export type Recomendacao = {
  id: string;
  clienteId: string;
  cliente: { id: string; nome: string; perfil: PerfilInvestidor };
  produtoId: string;
  produto: {
    id: string;
    nome: string;
    categoria: CategoriaProduto;
    emissor: string;
  };
  score: number;
  justificativa: string;
  status: StatusRecomendacao;
  aprovadoPor: { id: string; nome: string } | null;
  aprovadoEm: string | null;
  recusaMotivo: string | null;
  geradoEm: string;
  expiraEm: string | null;
  // Payload é JSON arbitrário no banco. Recomendações geradas pelo engine
  // têm os campos abaixo; recomendações legadas (importadas/seedadas) podem não ter.
  payload: {
    fatores?: Record<FatorRecomendacao, number>;
    pesos?: Record<FatorRecomendacao, number>;
    contribs?: { fator: FatorRecomendacao; contrib: number; frase: string }[];
    geradoPor?: string;
    /** Soma ponderada dos 5 fatores (o que a justificativa explica) */
    scoreRegras?: number | null;
    /** Origem do score: versão do modelo ML ou "rule-engine" */
    scoreFonte?: string | null;
    descartadosDaRodada?: DescarteAgregado[];
    /** Pareceres do comitê de especialistas (todos favoráveis) */
    comite?: ParecerEspecialista[];
    reprovadosComiteDaRodada?: ReprovacaoComite[];
    totalAnalisados?: number;
    contexto?: {
      suitabilityId: string;
      perfilCalculado: PerfilInvestidor;
      horizonteAnos: number;
      toleranciaPerda: number;
    };
    aviso?: string;
    [k: string]: unknown;
  };
};

// ----- Dashboard -----

export type DashboardResumo = {
  /** Soma das posições (o que está aplicado na casa), a valor de custo */
  aumTotal: number;
  /** Patrimônio declarado pelos clientes ativos (inclui o que está fora da casa) */
  patrimonioDeclarado: number;
  clientesAtivos: number;
  leadsAbertos: number;
  valorPipeline: number;
  recomendacoesPendentes: number;
  clientesSemSuitabilityValida: number;
  distribuicaoPerfil: { perfil: PerfilInvestidor; quantidade: number; pct: number }[];
};

// ----- Interações -----

export type TipoInteracao = "EMAIL" | "LIGACAO" | "REUNIAO" | "WHATSAPP" | "TAREFA" | "NOTA";

export type Interacao = {
  id: string;
  tipo: TipoInteracao;
  assunto: string;
  resumo: string | null;
  data: string;
  cliente: { id: string; nome: string };
  autor: { id: string; nome: string };
};

export type GenerateResult = {
  geradas: number;
  recomendacoes: Recomendacao[];
  totalAnalisados: number;
  descartados: DescarteAgregado[];
  reprovadosComite: ReprovacaoComite[];
  engineVersion: string;
};

// ----- Oportunidades do dia -----

export type StatusEnvio = { emailConfigurado: boolean; agendamentoConfigurado: boolean };

export type ResumoEnvio = {
  enviados: number;
  semOportunidade: number;
  jaEnviadosHoje: number;
  falhas: number;
};

export type ClienteOportunidade = {
  id: string;
  nome: string;
  perfil: PerfilInvestidor;
  patrimonio: number;
};

export type OportunidadesDoDia = {
  geradoEm: string;
  clientesAnalisados: number;
  /** Candidatos que algum especialista barrou, somando todos os clientes */
  reprovadosComite: number;
  engineVersion: string | null;
  oportunidades: {
    cliente: ClienteOportunidade;
    produtoId: string;
    produtoNome: string;
    score: number;
    justificativa: string;
    comite: ParecerEspecialista[];
  }[];
  pendencias: { cliente: ClienteOportunidade; motivo: string }[];
};

// ----- Carteira -----

export type TipoMovimentacao = "SALDO_INICIAL" | "APLICACAO" | "RESGATE";

export type Movimentacao = {
  id: string;
  clienteId: string;
  produtoId: string;
  produto: { id: string; nome: string; categoria: CategoriaProduto; emissor: string };
  tipo: TipoMovimentacao;
  valor: number;
  data: string;
  observacao: string | null;
  /** Aplicação acima do perfil / sem suitability válida, com ciência do cliente */
  desenquadrada: boolean;
  recomendacaoId: string | null;
  registradoPor: { id: string; nome: string } | null;
  criadoEm: string;
};

export type SerieCarteira = {
  /** Valores a custo: o sistema não tem cotações (sem marcação a mercado) */
  base: "custo";
  meses: Array<{
    /** "2026-10" */
    mes: string;
    patrimonioAplicado: number;
    entradas: number;
    saidas: number;
    captacaoLiquida: number;
  }>;
};
