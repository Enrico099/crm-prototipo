"""
FastAPI app — motor de recomendação (apoio à decisão do assessor).

Stateless: recebe contexto completo do NestJS, calcula, devolve.
Não tem acesso a banco.

Híbrido ML + regras:
- Filtros hard (perfil, risco, concentração) são determinísticos — compliance.
- Pontuação: LightGBM treinado quando modelo carregado, senão soma ponderada
  dos 5 fatores rule-based (fallback). `engineVersion` reflete qual está em uso
  e cada recomendação traz `scoreFonte` + `scoreRegras`.
- Comitê de especialistas (especialistas.py): segunda análise independente de cada
  candidato pontuado; só sai o que todos os especialistas aprovam.
- Justificativa em pt-BR sempre vem das regras (são auditáveis e explicáveis),
  independente de o ranking ter vindo do ML.

Segurança: serviço interno. Com AI_ENGINE_TOKEN definido, exige
`Authorization: Bearer <token>` em /recommend. Sem CORS — não é chamado por browser.
"""
import hmac
import logging
import os
import time

from fastapi import Depends, FastAPI, Header, HTTPException, Request

from .justificativa import build_justificativa, preencher_frases_fator
from .ml.scorer import get_scorer
from .especialistas import aplicar_comite
from .models import MAX_REPROVADOS_COMITE, RecommendRequest, RecommendResponse
from .rules import clamp, exposicao_por_emissor, top_recomendacoes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("ai-engine")

RULE_ENGINE_VERSION = "rule-engine-py-v1.5"


def resolve_engine_version() -> str:
    scorer = get_scorer()
    return scorer.version if scorer.loaded else RULE_ENGINE_VERSION


def exigir_token(authorization: str | None = Header(default=None)) -> None:
    """Valida o token compartilhado com a API (se configurado)."""
    esperado = os.getenv("AI_ENGINE_TOKEN")
    if not esperado:
        return
    recebido = (authorization or "").removeprefix("Bearer ").strip()
    # compare_digest: comparação em tempo constante
    if not recebido or not hmac.compare_digest(recebido, esperado):
        raise HTTPException(status_code=401, detail="Não autorizado")


app = FastAPI(
    title="Capital Elite — AI Engine",
    description=(
        "Motor de recomendação híbrido (LightGBM + regras explicáveis). "
        "Apoio à decisão: a decisão final é do assessor e dos controles internos."
    ),
    version="0.3.0",
    # Swagger só fora de produção
    docs_url=None if os.getenv("ENV") == "production" else "/docs",
    redoc_url=None,
    openapi_url=None if os.getenv("ENV") == "production" else "/openapi.json",
)


@app.middleware("http")
async def log_requisicao(request: Request, call_next):
    """Log de acesso sem corpo (o corpo tem nome e patrimônio do cliente)."""
    inicio = time.perf_counter()
    request_id = request.headers.get("x-request-id", "-")[:64]
    response = await call_next(request)
    logger.info(
        "http method=%s path=%s status=%s duracao_ms=%d request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        (time.perf_counter() - inicio) * 1000,
        request_id,
    )
    return response


@app.get("/health")
def health():
    """Liveness — usado por monitores e pelo GET /api/health do NestJS."""
    scorer = get_scorer()
    return {
        "status": "ok",
        "engine": resolve_engine_version(),
        "ml_loaded": scorer.loaded,
    }


@app.post(
    "/recommend",
    response_model=RecommendResponse,
    dependencies=[Depends(exigir_token)],
)
def recommend(req: RecommendRequest) -> RecommendResponse:
    """
    Recebe contexto do cliente + catálogo. Devolve top-N recomendações
    com score (ML quando disponível, regras como fallback), justificativa
    em pt-BR (sempre rule-based, pra auditoria) e breakdown dos descartes.
    """
    scorer = get_scorer()
    # Pontua todos os elegíveis; o comitê escolhe os top-N que aprova por unanimidade
    candidatos, descartados, total = top_recomendacoes(
        req, max(len(req.catalog), 1), ml_scorer=scorer
    )
    exposicao_emissor = exposicao_por_emissor(req.posicoes, req.catalog)
    scoreds, reprovados = aplicar_comite(req, candidatos, req.topN, exposicao_emissor)

    recomendacoes = []
    for scored in scoreds:
        preencher_frases_fator(scored, req.cliente, req.posicoes, req.suitability)
        justificativa = build_justificativa(
            scored, req.cliente, req.posicoes, req.suitability, exposicao_emissor
        )

        recomendacoes.append(
            {
                "produtoId": scored["produto"].id,
                "produtoNome": scored["produto"].nome,
                # clamp antes do round: soma de floats pode dar 1.0000000002
                "score": round(clamp(scored["score"]), 3),
                "justificativa": justificativa,
                "fatores": {k: round(v, 4) for k, v in scored["fatores"].items()},
                "pesos": scored["pesos"],
                "contribs": scored["contribs"],
                "scoreRegras": round(clamp(scored["score_rules"]), 3),
                "scoreFonte": scored["score_source"],
                "comite": scored["comite"],
            }
        )

    return RecommendResponse(
        recomendacoes=recomendacoes,
        descartados=descartados,
        totalAnalisados=total,
        reprovadosComite=reprovados[:MAX_REPROVADOS_COMITE],
        engineVersion=resolve_engine_version(),
    )
