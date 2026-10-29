"""
Comitê de especialistas — segunda análise, independente, de cada recomendação.

Os filtros de `rules.passa_filtro` decidem o que pode ser pontuado. O comitê roda
DEPOIS da pontuação e revisa cada candidato como uma mesa de especialistas
revisaria: cada especialista dá um parecer e o produto só é recomendado com
aprovação unânime. Algumas checagens repetem os filtros de propósito (dupla
checagem: um bug num lado não passa sozinho); outras são critérios de prudência
que os filtros não têm (teto de risco por perfil, liquidez vs. horizonte,
divergência entre o perfil do cadastro e o do questionário, dados implausíveis).

Na dúvida, o comitê reprova: é melhor não recomendar do que recomendar errado.
Continua sendo apoio à decisão; não substitui o assessor nem o compliance.
"""
import math
from typing import Callable

from .models import RecommendRequest
from .rules import (
    ALVO,
    COST_CAP_BY_CATEGORY,
    LIMITE_CONCENTRACAO_EMISSOR,
    PERFIL_ORDEM,
    RISCO_DRAWDOWN_ESPERADO,
    emissor_soberano,
    liquidez_em_meses,
)

# Risco máximo do produto (1..5) aceito por perfil, independente da tolerância declarada
RISCO_MAXIMO_POR_PERFIL: dict[str, int] = {
    "CONSERVADOR": 2,
    "MODERADO": 3,
    "ARROJADO": 4,
    "AGRESSIVO": 5,
}

# Score de regras mínimo: abaixo disso a recomendação é fraca demais para sair
SCORE_MINIMO = 0.40

# Diferença máxima aceita entre o score do modelo ML e o das regras
DIVERGENCIA_MAXIMA_ML = 0.35

# Rentabilidade anual (%) acima disso é tratada como erro de cadastro até ser conferida
RENTABILIDADE_MAXIMA_PLAUSIVEL = 60.0

ESPECIALISTAS: dict[str, str] = {
    "suitability": "Suitability",
    "risco": "Risco",
    "concentracao": "Alocação e concentração",
    "liquidez": "Liquidez",
    "custo": "Custo",
    "dados": "Qualidade dos dados",
    "conviccao": "Convicção da análise",
}

Parecer = tuple[bool, str]


def _perfil_efetivo(req: RecommendRequest) -> str:
    """Perfil do cadastro e do questionário divergem → vale o mais conservador."""
    a, b = req.cliente.perfil, req.suitability.perfilCalculado
    return a if PERFIL_ORDEM[a] < PERFIL_ORDEM[b] else b


def _suitability(req: RecommendRequest, item: dict, exp_emissor: dict[str, float]) -> Parecer:
    p = item["produto"]
    if not p.ativo:
        return (False, "Produto inativo no catálogo.")
    perfil = _perfil_efetivo(req)
    if PERFIL_ORDEM[p.perfilMinimo] > PERFIL_ORDEM[perfil]:
        if perfil != req.suitability.perfilCalculado:
            return (
                False,
                f"Exige perfil {p.perfilMinimo.lower()}; o cadastro do cliente está como "
                f"{req.cliente.perfil.lower()}, diferente do questionário. Vale o mais conservador.",
            )
        return (False, f"Exige perfil {p.perfilMinimo.lower()}, acima do perfil {perfil.lower()} do cliente.")
    return (True, f"Adequado ao perfil {perfil.lower()}.")


def _risco(req: RecommendRequest, item: dict, exp_emissor: dict[str, float]) -> Parecer:
    p = item["produto"]
    perfil = _perfil_efetivo(req)
    teto = RISCO_MAXIMO_POR_PERFIL[perfil]
    if p.risco > teto:
        return (False, f"Risco {p.risco}/5 acima do teto {teto}/5 para perfil {perfil.lower()}.")
    drawdown = RISCO_DRAWDOWN_ESPERADO.get(p.risco, 50.0)
    if drawdown > req.suitability.toleranciaPerda * 1.5:
        return (
            False,
            f"Perda de referência de {drawdown:.0f}% excede a tolerância declarada de "
            f"{req.suitability.toleranciaPerda:.0f}%.",
        )
    return (True, f"Risco {p.risco}/5 dentro do teto do perfil e da tolerância a perdas.")


def _concentracao(req: RecommendRequest, item: dict, exp_emissor: dict[str, float]) -> Parecer:
    p = item["produto"]
    patrimonio = req.cliente.patrimonio
    if patrimonio <= 0:
        return (False, "Patrimônio zerado: não há como avaliar alocação.")
    if not emissor_soberano(p.emissor):
        pct = exp_emissor.get(p.emissor, 0.0) / patrimonio
        if pct > LIMITE_CONCENTRACAO_EMISSOR:
            return (False, f"Cliente já tem {pct:.0%} do patrimônio em {p.emissor}.")
    no_produto = sum(pos.valor for pos in req.posicoes if pos.produtoId == p.id) / patrimonio
    if no_produto > LIMITE_CONCENTRACAO_EMISSOR:
        return (False, f"Cliente já tem {no_produto:.0%} do patrimônio neste produto.")
    alvo = ALVO.get(req.suitability.perfilCalculado, {}).get(p.categoria, 0.0)
    na_categoria = 100 * sum(pos.valor for pos in req.posicoes if pos.categoria == p.categoria) / patrimonio
    if alvo == 0:
        return (False, "Categoria fora da alocação-alvo do perfil.")
    if na_categoria >= alvo:
        return (
            False,
            f"Categoria já está em {na_categoria:.0f}% da carteira, no alvo de {alvo:.0f}% ou acima.",
        )
    return (True, f"Categoria em {na_categoria:.0f}% da carteira, abaixo do alvo de {alvo:.0f}%.")


def _liquidez(req: RecommendRequest, item: dict, exp_emissor: dict[str, float]) -> Parecer:
    p = item["produto"]
    horizonte_meses = max(req.suitability.horizonteAnos * 12, 1)
    liq = liquidez_em_meses(p.liquidez)
    if liq > horizonte_meses:
        return (
            False,
            f"Liquidez {p.liquidez} prende o recurso além do horizonte de "
            f"{req.suitability.horizonteAnos} ano(s) do cliente.",
        )
    return (True, f"Liquidez {p.liquidez} compatível com o horizonte.")


def _custo(req: RecommendRequest, item: dict, exp_emissor: dict[str, float]) -> Parecer:
    p = item["produto"]
    if p.taxaAdmin is None:
        return (True, "Sem taxa de administração.")
    teto = COST_CAP_BY_CATEGORY.get(p.categoria, 3.0)
    if p.taxaAdmin >= teto:
        return (False, f"Taxa de {p.taxaAdmin:.2f}% a.a. no teto da categoria ({teto:.2f}%) ou acima.")
    return (True, f"Taxa de {p.taxaAdmin:.2f}% a.a., abaixo do teto da categoria ({teto:.2f}%).")


def _dados(req: RecommendRequest, item: dict, exp_emissor: dict[str, float]) -> Parecer:
    p = item["produto"]
    if not math.isfinite(p.rentabilidadeAno) or p.rentabilidadeAno <= 0:
        return (False, "Rentabilidade de referência zerada ou negativa: conferir o cadastro.")
    if p.rentabilidadeAno > RENTABILIDADE_MAXIMA_PLAUSIVEL:
        return (False, f"Rentabilidade de {p.rentabilidadeAno:.1f}% a.a. implausível: conferir o cadastro.")
    valores = [item["score"], item["score_rules"], *item["fatores"].values()]
    if any(not math.isfinite(v) or v < 0 or v > 1 for v in valores):
        return (False, "Cálculo com valor fora da faixa esperada.")
    return (True, "Cadastro do produto e cálculos consistentes.")


def _conviccao(req: RecommendRequest, item: dict, exp_emissor: dict[str, float]) -> Parecer:
    regras = item["score_rules"]
    if regras < SCORE_MINIMO:
        return (False, f"Score de {regras:.2f}, abaixo do mínimo de {SCORE_MINIMO:.2f}.")
    if item["score_source"] not in ("rule-engine", "rule-engine-fallback"):
        if abs(item["score"] - regras) > DIVERGENCIA_MAXIMA_ML:
            return (
                False,
                f"Modelo ({item['score']:.2f}) e regras ({regras:.2f}) divergem demais.",
            )
    return (True, f"Score de {regras:.2f}, acima do mínimo de {SCORE_MINIMO:.2f}.")


REVISORES: dict[str, Callable[[RecommendRequest, dict, dict[str, float]], Parecer]] = {
    "suitability": _suitability,
    "risco": _risco,
    "concentracao": _concentracao,
    "liquidez": _liquidez,
    "custo": _custo,
    "dados": _dados,
    "conviccao": _conviccao,
}


def avaliar(req: RecommendRequest, item: dict, exp_emissor: dict[str, float]) -> list[dict]:
    """Parecer de cada especialista. Exceção num revisor conta como reprovação."""
    pareceres = []
    for chave, revisor in REVISORES.items():
        try:
            aprovado, texto = revisor(req, item, exp_emissor)
        except Exception:  # noqa: BLE001
            aprovado, texto = False, "Não foi possível concluir a análise."
        pareceres.append(
            {"especialista": chave, "nome": ESPECIALISTAS[chave], "aprovado": aprovado, "parecer": texto}
        )
    return pareceres


def aplicar_comite(
    req: RecommendRequest, scoreds: list[dict], n: int, exp_emissor: dict[str, float]
) -> tuple[list[dict], list[dict]]:
    """Percorre os candidatos em ordem de score e fica com os N primeiros aprovados
    por unanimidade. Devolve (aprovados com `comite` preenchido, reprovados)."""
    aprovados: list[dict] = []
    reprovados: list[dict] = []
    for item in scoreds:
        if len(aprovados) >= n:
            break
        pareceres = avaliar(req, item, exp_emissor)
        if all(p["aprovado"] for p in pareceres):
            item["comite"] = pareceres
            aprovados.append(item)
        else:
            reprovados.append(
                {
                    "produtoId": item["produto"].id,
                    "produtoNome": item["produto"].nome,
                    "pareceres": [p for p in pareceres if not p["aprovado"]],
                }
            )
    return aprovados, reprovados
