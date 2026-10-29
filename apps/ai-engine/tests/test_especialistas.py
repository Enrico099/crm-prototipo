"""Comitê de especialistas: cada parecer e a regra de unanimidade."""
import pytest

from src import especialistas, rules
from tests.conftest import produto, request


def candidatos(req):
    scoreds, _, _ = rules.top_recomendacoes(req, max(len(req.catalog), 1))
    return scoreds


def comite(req, n=3):
    exp = rules.exposicao_por_emissor(req.posicoes, req.catalog)
    return especialistas.aplicar_comite(req, candidatos(req), n, exp)


def contrarios(reprovados, produto_id):
    item = next(r for r in reprovados if r["produtoId"] == produto_id)
    return {p["especialista"] for p in item["pareceres"]}


class TestUnanimidade:
    def test_produto_adequado_passa_com_todos_os_pareceres(self):
        aprovados, reprovados = comite(request())
        assert [a["produto"].id for a in aprovados] == ["p-cdb"]
        assert reprovados == []
        assert len(aprovados[0]["comite"]) == len(especialistas.REVISORES)

    def test_um_parecer_contrario_basta_para_barrar(self):
        cat = [produto(liquidez="Vencimento")]
        aprovados, reprovados = comite(request(horizonte=1, catalog=cat))
        assert aprovados == []
        assert contrarios(reprovados, "p-cdb") == {"liquidez"}

    def test_barrado_abre_vaga_para_o_proximo_da_fila(self):
        cat = [
            produto(id="p-alto", nome="CDB alto", emissor="Banco X", rentabilidadeAno=14.0, liquidez="Vencimento"),
            produto(id="p-ok", nome="CDB ok", emissor="Banco Y", rentabilidadeAno=11.0),
        ]
        aprovados, reprovados = comite(request(horizonte=1, catalog=cat), n=1)
        assert [a["produto"].id for a in aprovados] == ["p-ok"]
        assert [r["produtoId"] for r in reprovados] == ["p-alto"]

    def test_revisor_que_quebra_conta_como_reprovacao(self, monkeypatch):
        def explode(*_):
            raise RuntimeError("bug")

        monkeypatch.setitem(especialistas.REVISORES, "custo", explode)
        aprovados, reprovados = comite(request())
        assert aprovados == []
        [parecer] = reprovados[0]["pareceres"]
        assert parecer["especialista"] == "custo"
        assert parecer["parecer"] == "Não foi possível concluir a análise."


class TestPareceres:
    def test_cadastro_mais_conservador_que_questionario_prevalece(self):
        req = request(perfil="ARROJADO", tolerancia=30, catalog=[
            produto(categoria="FUNDOS", risco=3, perfilMinimo="MODERADO", liquidez="D+30"),
        ])
        req.cliente.perfil = "CONSERVADOR"
        _, reprovados = comite(req)
        assert {"suitability", "risco"} <= contrarios(reprovados, "p-cdb")

    def test_risco_acima_do_teto_do_perfil(self):
        # Tolerância alta não libera risco 4 para quem é moderado
        cat = [produto(categoria="FUNDOS", risco=4, perfilMinimo="MODERADO", liquidez="D+30")]
        _, reprovados = comite(request(tolerancia=40, catalog=cat))
        assert "risco" in contrarios(reprovados, "p-cdb")

    def test_categoria_ja_no_alvo(self):
        # MODERADO: alvo de renda fixa 45%; cliente já tem 50%
        pos = [{"produtoId": "p-outro", "categoria": "RENDA_FIXA", "valor": 500_000}]
        _, reprovados = comite(request(posicoes=pos))
        assert contrarios(reprovados, "p-cdb") == {"concentracao"}

    def test_taxa_no_teto_da_categoria(self):
        cat = [produto(taxaAdmin=1.0)]
        _, reprovados = comite(request(catalog=cat))
        assert "custo" in contrarios(reprovados, "p-cdb")

    @pytest.mark.parametrize("rent", [0.0, -2.0, 80.0])
    def test_rentabilidade_implausivel(self, rent):
        _, reprovados = comite(request(catalog=[produto(rentabilidadeAno=rent)]))
        assert "dados" in contrarios(reprovados, "p-cdb")

    def test_score_abaixo_do_minimo(self):
        req = request()
        [item] = candidatos(req)
        item["score"] = item["score_rules"] = 0.2
        ok, _ = especialistas._conviccao(req, item, {})
        assert not ok

    def test_modelo_divergente_das_regras(self):
        req = request()
        [item] = candidatos(req)
        item["score_source"], item["score"], item["score_rules"] = "lgbm-v1", 0.95, 0.5
        ok, texto = especialistas._conviccao(req, item, {})
        assert not ok
        assert "divergem" in texto
