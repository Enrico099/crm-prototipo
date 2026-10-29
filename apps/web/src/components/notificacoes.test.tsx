import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderComQuery } from "@/test/render";
import { mockApi } from "@/test/fetch-mock";
import { Notificacoes } from "./notificacoes";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

const aviso = {
  id: "n1",
  tipo: "OPORTUNIDADES_DO_DIA",
  titulo: "3 oportunidades para hoje",
  mensagem: "O comitê de especialistas aprovou 3 oportunidade(s) para 2 cliente(s) da sua carteira.",
  link: "/oportunidades",
  lidaEm: null,
  criadoEm: "2026-10-29T11:00:00.000Z",
};

describe("Notificações (sininho)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mostra quantas não foram lidas e, ao clicar, marca como lida e abre o link", async () => {
    const { chamadas } = mockApi({
      "GET /api/notificacoes": { itens: [aviso], naoLidas: 1 },
      "PATCH /api/notificacoes/n1/lida": null,
    });
    renderComQuery(<Notificacoes habilitado />);

    const sino = await screen.findByRole("button", { name: "Notificações: 1 não lida(s)" });
    await userEvent.setup().click(sino);
    await userEvent.setup().click(await screen.findByText("3 oportunidades para hoje"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/oportunidades"));
    expect(chamadas.some((c) => c.metodo === "PATCH" && c.caminho.endsWith("/notificacoes/n1/lida"))).toBe(true);
  });

  it("sem notificações mostra o aviso de lista vazia", async () => {
    mockApi({ "GET /api/notificacoes": { itens: [], naoLidas: 0 } });
    renderComQuery(<Notificacoes habilitado />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Notificações" }));
    expect(await screen.findByText("Nenhuma notificação por enquanto.")).toBeInTheDocument();
  });
});
