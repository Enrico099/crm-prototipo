import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderComQuery, jsonResponse } from "@/test/render";
import { mockApi, usuario } from "@/test/fetch-mock";
import { AppHeader } from "./app-header";
import { NavLinks } from "./nav-links";
import { RecomendacaoCard } from "./recomendacao-card";
import { ThinkingDialog } from "./thinking-dialog";
import { ErrorState, EmptyState } from "./query-states";
import type { Recomendacao } from "@/types/api";

const replace = vi.fn();
let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
});

const recomendacao: Recomendacao = {
  id: "r1",
  clienteId: "c1",
  cliente: { id: "c1", nome: "Ana Souza", perfil: "MODERADO" },
  produtoId: "p1",
  produto: { id: "p1", nome: "CDB Banco A", categoria: "RENDA_FIXA", emissor: "Banco A" },
  score: 0.82,
  justificativa: "Olhei a carteira de Ana e faltava renda fixa.",
  status: "PENDENTE",
  aprovadoPor: null,
  aprovadoEm: null,
  recusaMotivo: null,
  geradoEm: "2026-10-01T12:00:00Z",
  expiraEm: "2026-10-31T12:00:00Z",
  payload: {
    fatores: { profileMatch: 1, diversification: 0.8, yield: 0.5, liquidity: 0.9, cost: 1 },
    pesos: { profileMatch: 0.2, diversification: 0.3, yield: 0.2, liquidity: 0.15, cost: 0.15 },
    contribs: [{ fator: "cost", contrib: 0.15, frase: "Sem taxa de administração." }],
    geradoPor: "rule-engine-py-v1.4",
    scoreFonte: "rule-engine",
    descartadosDaRodada: [{ motivo: "perfil_incompativel", count: 2 }],
  },
};

describe("RecomendacaoCard", () => {
  it("aprovação exige confirmação explícita com o aviso de apoio à decisão", async () => {
    const { chamadas } = mockApi({
      "GET /api/auth/me": usuario("ASSESSOR"),
      "PATCH /api/recomendacoes/r1/aprovar": { ...recomendacao, status: "APROVADA" },
    });
    const user = userEvent.setup();
    renderComQuery(<RecomendacaoCard recomendacao={recomendacao} />);

    await user.click(await screen.findByRole("button", { name: "Aprovar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent(/apoio à decisão/);
    expect(chamadas.some((c) => c.metodo === "PATCH")).toBe(false);

    await user.click(within(dialogo).getByRole("button", { name: /Confirmar aprovação/ }));
    await waitFor(() =>
      expect(chamadas.some((c) => c.metodo === "PATCH" && c.caminho === "/api/recomendacoes/r1/aprovar")).toBe(true),
    );
  });

  it("recusa exige motivo antes de chamar a API", async () => {
    const { chamadas } = mockApi({
      "GET /api/auth/me": usuario("ASSESSOR"),
      "PATCH /api/recomendacoes/r1/recusar": { ...recomendacao, status: "RECUSADA" },
    });
    const user = userEvent.setup();
    renderComQuery(<RecomendacaoCard recomendacao={recomendacao} />);

    await user.click(await screen.findByRole("button", { name: "Recusar" }));
    const dialogo = await screen.findByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    expect(await within(dialogo).findByText(/pelo menos 3 caracteres/)).toBeInTheDocument();
    expect(chamadas.some((c) => c.metodo === "PATCH")).toBe(false);

    await user.type(within(dialogo).getByLabelText(/Motivo/), "Cliente prefere liquidez");
    await user.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    await waitFor(() => {
      const patch = chamadas.find((c) => c.metodo === "PATCH");
      expect(patch?.body).toEqual({ motivo: "Cliente prefere liquidez" });
    });
  });

  it("perfil somente leitura não vê os botões de decisão", async () => {
    mockApi({ "GET /api/auth/me": usuario("READONLY") });
    renderComQuery(<RecomendacaoCard recomendacao={recomendacao} />);
    expect(await screen.findByText(/Aguardando decisão do assessor/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  });

  it("explica os fatores e os descartes sob demanda (aria-expanded)", async () => {
    mockApi({ "GET /api/auth/me": usuario() });
    const user = userEvent.setup();
    renderComQuery(<RecomendacaoCard recomendacao={recomendacao} />);
    const botao = screen.getByRole("button", { name: /Como a sugestão foi calculada/ });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    await user.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Sem taxa de administração.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /2 produto\(s\) foram descartados/ }));
    expect(screen.getByText("Perfil incompatível")).toBeInTheDocument();
  });
});

describe("ThinkingDialog", () => {
  it("chama a geração uma única vez por abertura e fecha ao terminar", async () => {
    const onOpenChange = vi.fn();
    const { chamadas } = mockApi({
      "POST /api/recomendacoes/generate": {
        geradas: 1,
        recomendacoes: [recomendacao],
        totalAnalisados: 5,
        descartados: [],
        engineVersion: "rule-engine-py-v1.4",
      },
    });
    renderComQuery(
      <ThinkingDialog
        cliente={{ id: "c1", nome: "Ana Souza", patrimonio: 1_000_000, posicoesCount: 2 }}
        open
        onOpenChange={onOpenChange}
      />,
    );
    expect(await screen.findByText(/Analisando o cenário de/)).toBeInTheDocument();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false), { timeout: 8000 });
    expect(chamadas.filter((c) => c.caminho === "/api/recomendacoes/generate")).toHaveLength(1);
    expect(chamadas[0].body).toEqual({ clienteId: "c1", topN: 3 });
  }, 10_000);

  it("erro da API (ex.: suitability vencida) fecha o diálogo com a mensagem", async () => {
    const { toast } = await import("sonner");
    const onOpenChange = vi.fn();
    mockApi({
      "POST /api/recomendacoes/generate": () =>
        jsonResponse({ message: "A suitability do cliente venceu em 01/01/2026." }, 422),
    });
    renderComQuery(
      <ThinkingDialog cliente={{ id: "c1", nome: "Ana", patrimonio: 0 }} open onOpenChange={onOpenChange} />,
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.error).toHaveBeenCalledWith("A suitability do cliente venceu em 01/01/2026.");
  });
});

describe("AppHeader — logout", () => {
  it("encerra a sessão no servidor e volta pro login", async () => {
    const { chamadas } = mockApi({
      "GET /api/auth/me": usuario(),
      "POST /api/auth/logout": () => new Response(null, { status: 204 }),
    });
    const user = userEvent.setup();
    renderComQuery(<AppHeader />);

    await user.click(await screen.findByRole("button", { name: "Conta de João Diniz" }));
    await user.click(await screen.findByRole("menuitem", { name: /Sair/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(chamadas.some((c) => c.metodo === "POST" && c.caminho === "/api/auth/logout")).toBe(true);
  });

  it("volta pro login mesmo se a API de logout falhar", async () => {
    mockApi({
      "GET /api/auth/me": usuario(),
      "POST /api/auth/logout": () => jsonResponse({ message: "erro" }, 500),
    });
    const user = userEvent.setup();
    renderComQuery(<AppHeader />);
    await user.click(await screen.findByRole("button", { name: "Conta de João Diniz" }));
    await user.click(await screen.findByRole("menuitem", { name: /Sair/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});

describe("Navegação principal", () => {
  it("lista todas as seções e marca a atual com aria-current", () => {
    pathname = "/clientes/abc";
    renderComQuery(<NavLinks />);
    const links = screen.getAllByRole("link");
    // Agrupada: Carteira · Investimentos · Análise
    expect(links.map((l) => l.textContent)).toEqual([
      "Dashboard",
      "Leads & Clientes",
      "Pipeline",
      "Histórico",
      "Suitability",
      "Produtos",
      "Recomendações IA",
      "Relatórios",
    ]);
    for (const grupo of ["Carteira", "Investimentos", "Análise"]) {
      expect(screen.getByText(grupo)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Leads & Clientes" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });
});

describe("Estados de tela", () => {
  it("erro é anunciado e oferece tentar novamente", async () => {
    const onRetry = vi.fn();
    renderComQuery(<ErrorState message="Banco indisponível" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Banco indisponível");
    await userEvent.setup().click(screen.getByRole("button", { name: /Tentar novamente/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("vazio mostra a mensagem", () => {
    renderComQuery(<EmptyState message="Nada por aqui." />);
    expect(screen.getByText("Nada por aqui.")).toBeInTheDocument();
  });
});
