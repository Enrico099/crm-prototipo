import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderComQuery, jsonResponse } from "@/test/render";
import { mockApi } from "@/test/fetch-mock";
import SegurancaPage from "./page";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,QR") } }));

afterEach(() => vi.unstubAllGlobals());

const status = (extra: Record<string, unknown> = {}) => ({
  ativo: false,
  ativadoEm: null,
  obrigatorio: false,
  codigosRestantes: 0,
  ...extra,
});

describe("Segurança da conta", () => {
  it("ativa o MFA: QR code, confirmação do código e códigos de recuperação", async () => {
    const codigos = Array.from({ length: 10 }, (_, i) => `aaaa${i}-bbbbb`);
    const { chamadas } = mockApi({
      "GET /api/auth/mfa": status(),
      "POST /api/auth/mfa/configurar": { segredo: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x" },
      "POST /api/auth/mfa/ativar": { codigosRecuperacao: codigos },
    });
    renderComQuery(<SegurancaPage />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Ativar verificação em duas etapas" }));
    expect(await screen.findByAltText(/QR code/)).toHaveAttribute("src", "data:image/png;base64,QR");
    expect(screen.getByTestId("segredo-mfa")).toHaveTextContent("JBSW Y3DP EHPK 3PXP");

    await user.type(screen.getByLabelText(/Código do aplicativo/), "123456");
    await user.click(screen.getByRole("button", { name: "Confirmar e ativar" }));

    const lista = await screen.findByRole("list", { name: "Códigos de recuperação" });
    expect(lista.querySelectorAll("li")).toHaveLength(10);
    expect(screen.getByText(/não serão mostrados de novo/)).toBeInTheDocument();
    expect(chamadas.find((c) => c.caminho === "/api/auth/mfa/ativar")?.body).toEqual({ codigo: "123456" });
  });

  it("código errado na ativação aparece no campo", async () => {
    mockApi({
      "GET /api/auth/mfa": status(),
      "POST /api/auth/mfa/configurar": { segredo: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x" },
      "POST /api/auth/mfa/ativar": () =>
        jsonResponse({ message: "x", errors: { fieldErrors: { codigo: ["Código inválido. Confira o horário do celular e tente de novo."] } } }, 400),
    });
    renderComQuery(<SegurancaPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ativar verificação em duas etapas" }));
    await user.type(await screen.findByLabelText(/Código do aplicativo/), "000000");
    await user.click(screen.getByRole("button", { name: "Confirmar e ativar" }));
    expect(await screen.findByText(/Confira o horário do celular/)).toBeInTheDocument();
  });

  it("MFA obrigatório e inativo mostra o aviso; ativo e obrigatório não oferece desativar", async () => {
    mockApi({ "GET /api/auth/mfa": status({ obrigatorio: true }) });
    const { unmount } = renderComQuery(<SegurancaPage />);
    expect(await screen.findByText(/obrigatória para o seu perfil/)).toBeInTheDocument();
    unmount();

    mockApi({ "GET /api/auth/mfa": status({ ativo: true, obrigatorio: true, codigosRestantes: 2, ativadoEm: "2026-10-14T12:00:00Z" }) });
    renderComQuery(<SegurancaPage />);
    expect(await screen.findByText("2 de 10 disponíveis")).toBeInTheDocument();
    expect(screen.getByText(/Restam poucos códigos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desativar" })).not.toBeInTheDocument();
  });

  it("troca de senha confere a confirmação antes de chamar a API", async () => {
    const { chamadas } = mockApi({
      "GET /api/auth/mfa": status(),
      "POST /api/auth/senha": { user: {} },
    });
    renderComQuery(<SegurancaPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Senha atual/), "Senha123!");
    await user.type(screen.getByLabelText(/^Nova senha/), "NovaSenhaForte2026");
    await user.type(screen.getByLabelText(/Confirme a nova senha/), "outra-coisa-2026");
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(await screen.findByText("As senhas não conferem")).toBeInTheDocument();
    expect(chamadas.some((c) => c.caminho === "/api/auth/senha")).toBe(false);

    await user.clear(screen.getByLabelText(/Confirme a nova senha/));
    await user.type(screen.getByLabelText(/Confirme a nova senha/), "NovaSenhaForte2026");
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));
    await waitFor(() =>
      expect(chamadas.find((c) => c.caminho === "/api/auth/senha")?.body).toEqual({
        senhaAtual: "Senha123!",
        novaSenha: "NovaSenhaForte2026",
      }),
    );
  });

  it("senha atual errada aparece no campo", async () => {
    mockApi({
      "GET /api/auth/mfa": status(),
      "POST /api/auth/senha": () =>
        jsonResponse({ message: "x", errors: { fieldErrors: { senhaAtual: ["Senha atual incorreta."] } } }, 400),
    });
    renderComQuery(<SegurancaPage />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Senha atual/), "errada");
    await user.type(screen.getByLabelText(/^Nova senha/), "NovaSenhaForte2026");
    await user.type(screen.getByLabelText(/Confirme a nova senha/), "NovaSenhaForte2026");
    await user.click(screen.getByRole("button", { name: "Alterar senha" }));
    expect(await screen.findByText("Senha atual incorreta.")).toBeInTheDocument();
  });
});
