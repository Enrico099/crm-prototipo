"""
Modelos de domínio do motor de IA.
Espelham o contrato do NestJS (apps/api/src/recomendacoes/ai-engine.service.ts)
— qualquer mudança aqui exige ajustar o schema zod de resposta de lá.
"""
from typing import Literal

from pydantic import BaseModel, Field


# ============================================================
# Enums
# ============================================================

PerfilInvestidor = Literal["CONSERVADOR", "MODERADO", "ARROJADO", "AGRESSIVO"]

CategoriaProduto = Literal[
    "RENDA_FIXA",
    "RENDA_VARIAVEL",
    "FUNDOS",
    "PREVIDENCIA",
    "ESTRUTURADOS",
    "CAMBIO",
]

Tributacao = Literal["TRIBUTADO", "ISENTO", "INCENTIVADO"]

MotivoDescarte = Literal[
    "perfil_incompativel",
    "concentracao_emissor",
    "risco_alem_tolerancia",
    "ja_sobrealocado",
]

Fator = Literal["profileMatch", "diversification", "yield", "liquidity", "cost"]

# Limites de payload: o serviço é interno, mas não confia no tamanho do input.
MAX_CATALOGO = 2000
MAX_POSICOES = 1000
MAX_REPROVADOS_COMITE = 20


# ============================================================
# Input — contexto enviado pelo NestJS
# ============================================================


class Cliente(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    nome: str = Field(min_length=1, max_length=200)
    perfil: PerfilInvestidor
    patrimonio: float = Field(ge=0, le=1e15)


class Suitability(BaseModel):
    perfilCalculado: PerfilInvestidor
    horizonteAnos: int = Field(ge=0, le=100)
    toleranciaPerda: float = Field(ge=0, le=100)


class Posicao(BaseModel):
    produtoId: str = Field(min_length=1, max_length=64)
    categoria: CategoriaProduto
    valor: float = Field(ge=0, le=1e15)


class Produto(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    nome: str = Field(min_length=1, max_length=200)
    emissor: str = Field(min_length=1, max_length=200)
    categoria: CategoriaProduto
    rentabilidadeAno: float = Field(ge=-100, le=1000)
    risco: int = Field(ge=1, le=5)
    tributacao: Tributacao = "TRIBUTADO"
    perfilMinimo: PerfilInvestidor
    liquidez: str = Field(min_length=1, max_length=30)
    # None = produto sem taxa de administração
    taxaAdmin: float | None = Field(default=None, ge=0, le=100)
    ativo: bool = True


class RecommendRequest(BaseModel):
    cliente: Cliente
    suitability: Suitability
    posicoes: list[Posicao] = Field(max_length=MAX_POSICOES)
    catalog: list[Produto] = Field(max_length=MAX_CATALOGO)
    topN: int = Field(default=3, ge=1, le=10)


# ============================================================
# Output — resposta pro NestJS
# ============================================================


class Contribuicao(BaseModel):
    fator: Fator
    contrib: float
    frase: str


class DescarteContexto(BaseModel):
    """Contexto opcional pra enriquecer a frase do descarte (ex: concentração)."""
    emissor: str | None = None
    pctPatrimonio: int | None = None


class DescarteAgregado(BaseModel):
    motivo: MotivoDescarte
    count: int
    contexto: DescarteContexto | None = None


Especialista = Literal[
    "suitability", "risco", "concentracao", "liquidez", "custo", "dados", "conviccao"
]


class ParecerEspecialista(BaseModel):
    especialista: Especialista
    nome: str
    aprovado: bool
    parecer: str


class ReprovacaoComite(BaseModel):
    """Candidato pontuado que o comitê de especialistas barrou (só os pareceres contrários)."""
    produtoId: str
    produtoNome: str
    pareceres: list[ParecerEspecialista]


class RecomendacaoOut(BaseModel):
    produtoId: str
    produtoNome: str
    # Score usado no ranking, em [0, 1]
    score: float = Field(ge=0, le=1)
    justificativa: str
    fatores: dict[str, float]
    pesos: dict[str, float]
    contribs: list[Contribuicao]
    # Soma ponderada dos 5 fatores (sempre calculada — é o que a justificativa explica)
    scoreRegras: float = Field(ge=0, le=1)
    # De onde veio `score`: versão do modelo ML, "rule-engine" ou "rule-engine-fallback"
    scoreFonte: str
    # Pareceres do comitê de especialistas (todos aprovados — senão não sairia)
    comite: list[ParecerEspecialista] = []


class RecommendResponse(BaseModel):
    recomendacoes: list[RecomendacaoOut]
    descartados: list[DescarteAgregado] = []
    totalAnalisados: int = 0
    # Candidatos barrados pelo comitê, em ordem de score (no máximo MAX_REPROVADOS_COMITE)
    reprovadosComite: list[ReprovacaoComite] = []
    engineVersion: str
