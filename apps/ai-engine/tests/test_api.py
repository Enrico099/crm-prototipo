"""Endpoints HTTP: contrato, autenticação, justificativa em pt-BR e fallback."""
import re

from fastapi.testclient import TestClient

from src.main import RULE_ENGINE_VERSION, app
from tests.conftest import produto, request

client = TestClient(app)


def corpo(req) -> dict:
    return req.model_dump(mode="json")


def test_health_sem_modelo_ml_reporta_regras():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "engine": RULE_ENGINE_VERSION, "ml_loaded": False}


def test_recommend_contrato_completo(catalogo_basico):
    r = client.post("/recommend", json=corpo(request(perfil="ARROJADO", tolerancia=30, catalog=catalogo_basico)))
    assert r.status_code == 200
    body = r.json()
    assert body["engineVersion"] == RULE_ENGINE_VERSION
    assert body["totalAnalisados"] == 5
    assert 1 <= len(body["recomendacoes"]) <= 3
    for rec in body["recomendacoes"]:
        assert 0 <= rec["score"] <= 1
        assert rec["score"] == round(rec["score"], 3)
        assert rec["scoreFonte"] == "rule-engine"
        assert rec["scoreRegras"] == rec["score"]
        assert set(rec["fatores"]) == {"profileMatch", "diversification", "yield", "liquidity", "cost"}
        assert len(rec["contribs"]) == 5
        assert all(c["frase"] for c in rec["contribs"])


def test_justificativa_em_portugues_sem_markdown_e_com_plural_correto():
    req = request(horizonte=1, catalog=[produto(tributacao="ISENTO", liquidez="D+1")])
    body = client.post("/recommend", json=corpo(req)).json()
    rec = body["recomendacoes"][0]
    textos = [rec["justificativa"], *[c["frase"] for c in rec["contribs"]]]
    tudo = " ".join(textos)
    assert "Mariana" in rec["justificativa"]
    assert "**" not in tudo
    assert "1 anos" not in tudo
    assert re.search(r"horizonte de 1 ano\b", tudo)
    assert "isenta de IR" in tudo


def test_nota_de_concentracao_fala_do_cliente_em_3a_pessoa():
    cat = [produto(), produto(id="p-b", nome="CDB Banco B", emissor="Banco B")]
    req = request(catalog=cat, posicoes=[{"produtoId": "p-cdb", "categoria": "RENDA_FIXA", "valor": 250_000}])
    recs = client.post("/recommend", json=corpo(req)).json()["recomendacoes"]
    rec = next(r for r in recs if r["produtoId"] == "p-b")
    assert "Optei por um emissor diferente de Banco A: o cliente já tem 25%" in rec["justificativa"]
    assert "você" not in rec["justificativa"]


def test_catalogo_vazio_devolve_lista_vazia():
    body = client.post("/recommend", json=corpo(request(catalog=[]))).json()
    assert body == {
        "recomendacoes": [],
        "descartados": [],
        "totalAnalisados": 0,
        "reprovadosComite": [],
        "engineVersion": RULE_ENGINE_VERSION,
    }


def test_patrimonio_zero_e_barrado_pelo_comite():
    # Sem patrimônio não há alocação a avaliar: na dúvida, o comitê não recomenda
    r = client.post("/recommend", json=corpo(request(patrimonio=0)))
    assert r.status_code == 200
    body = r.json()
    assert body["recomendacoes"] == []
    [reprovado] = body["reprovadosComite"]
    assert "concentracao" in {p["especialista"] for p in reprovado["pareceres"]}


def test_recomendacao_sai_com_parecer_aprovado_de_todos_os_especialistas(catalogo_basico):
    req = request(perfil="ARROJADO", tolerancia=30, catalog=catalogo_basico)
    recs = client.post("/recommend", json=corpo(req)).json()["recomendacoes"]
    assert recs
    for rec in recs:
        assert {p["especialista"] for p in rec["comite"]} == {
            "suitability", "risco", "concentracao", "liquidez", "custo", "dados", "conviccao"
        }
        assert all(p["aprovado"] and p["parecer"] for p in rec["comite"])


def test_payload_invalido_responde_422():
    r = client.post("/recommend", json={"cliente": {}})
    assert r.status_code == 422


def test_token_obrigatorio_quando_configurado(monkeypatch):
    monkeypatch.setenv("AI_ENGINE_TOKEN", "segredo-do-servico")
    body = corpo(request())
    assert client.post("/recommend", json=body).status_code == 401
    assert client.post("/recommend", json=body, headers={"Authorization": "Bearer errado"}).status_code == 401
    ok = client.post("/recommend", json=body, headers={"Authorization": "Bearer segredo-do-servico"})
    assert ok.status_code == 200
    # health continua aberto pro monitoramento
    assert client.get("/health").status_code == 200


def test_sem_cors_para_browsers():
    r = client.options(
        "/recommend",
        headers={"Origin": "https://qualquer.site", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in r.headers
