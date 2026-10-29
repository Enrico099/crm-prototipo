import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderComQuery, jsonResponse } from "@/test/render";
import { mockApi } from "@/test/fetch-mock";
import CadastroPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

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

  it("cria a conta e entra direto no dashboard", async () => {
    replace.mockReset();
    const { chamadas } = mockApi({
      "POST /api/auth/cadastro": { user: { id: "u9", nome: "Paula Nova", email: "paula@ce.com", role: "ASSESSOR" } },
    });
    renderComQuery(<CadastroPage />);
    await preencher();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
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
    mockApi({
      "POST /api/auth/cadastro": () => jsonResponse({ message: "Já existe uma conta com este e-mail." }, 409),
    });
    renderComQuery(<CadastroPage />);
    await preencher();
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe uma conta");
  });
});
