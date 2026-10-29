import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderComQuery, jsonResponse } from "@/test/render";
import { mockApi } from "@/test/fetch-mock";
import CadastroPage from "./page";

describe("Cadastro", () => {
  afterEach(() => vi.unstubAllGlobals());

  async function preencher(senha = "senhaforte1234", confirmacao = senha) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nome completo"), "Paula Nova");
    await user.type(screen.getByLabelText("E-mail corporativo"), "paula@ce.com");
    await user.type(screen.getByLabelText("Senha"), senha);
    await user.type(screen.getByLabelText("Confirme a senha"), confirmacao);
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
  }

  it("envia o cadastro e mostra que falta a aprovação do admin", async () => {
    const { chamadas } = mockApi({
      "POST /api/auth/cadastro": { mensagem: "Cadastro recebido. Um administrador precisa aprovar sua conta." },
    });
    renderComQuery(<CadastroPage />);
    await preencher();
    expect(await screen.findByRole("status")).toHaveTextContent(/administrador precisa aprovar/);
    expect(chamadas[0].body).toEqual({ nome: "Paula Nova", email: "paula@ce.com", senha: "senhaforte1234" });
  });

  it("não envia com senha fraca ou confirmação diferente", async () => {
    const { chamadas } = mockApi({ "POST /api/auth/cadastro": { mensagem: "ok" } });
    renderComQuery(<CadastroPage />);
    await preencher("senhaforte1234", "outrasenha1234");
    expect(await screen.findByText("As senhas não conferem")).toBeInTheDocument();
    expect(chamadas).toHaveLength(0);
  });

  it("erro da API aparece num alerta", async () => {
    mockApi({ "POST /api/auth/cadastro": () => jsonResponse({ message: "Muitos cadastros a partir desta rede." }, 429) });
    renderComQuery(<CadastroPage />);
    await preencher();
    expect(await screen.findByRole("alert")).toHaveTextContent("Muitos cadastros");
  });
});
