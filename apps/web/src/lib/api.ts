// Caminho relativo — passa pelo rewrite do Next (vide next.config.ts) e cai
// no NestJS na 3333 com cookies same-origin.
const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Código de referência devolvido pela API (X-Request-Id) — útil pro suporte */
  get requestId(): string | undefined {
    const p = this.payload as { requestId?: unknown } | undefined;
    return typeof p?.requestId === "string" ? p.requestId : undefined;
  }
}

const MSG_SEM_CONEXAO =
  "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";

type FetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Não tentar refresh em caso de 401 — usado internamente pra evitar loops */
  _noRetry?: boolean;
};

function buildUrl(path: string, query?: FetchOptions["query"]) {
  const url = new URL(
    `${API_BASE}/${path.replace(/^\//, "")}`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

async function rawFetch(path: string, opts: FetchOptions): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- removido do RequestInit
  const { body, query, headers, _noRetry, ...rest } = opts;
  try {
    return await fetch(buildUrl(path, query), {
      ...rest,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, MSG_SEM_CONEXAO);
  }
}

let refreshInflight: Promise<boolean> | null = null;

/** Tenta /auth/refresh uma única vez; coalesce chamadas concorrentes da mesma aba */
async function tryRefresh(): Promise<boolean> {
  if (refreshInflight) return refreshInflight;
  refreshInflight = (async () => {
    try {
      const r = await rawFetch("/auth/refresh", { method: "POST", _noRetry: true });
      return r.ok;
    } catch {
      return false;
    } finally {
      refreshInflight = null;
    }
  })();
  return refreshInflight;
}

function irParaLogin() {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const from = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(`/login?from=${from}`);
}

export const PAGINA_SEGURANCA = "/conta/seguranca";

function irParaSeguranca() {
  if (typeof window === "undefined" || window.location.pathname === PAGINA_SEGURANCA) return;
  window.location.replace(PAGINA_SEGURANCA);
}

export async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  let res = await rawFetch(path, opts);

  // Access token expirado: renova e repete a request uma vez.
  // Mesmo se o refresh falhar, repete: outra aba pode ter acabado de renovar os
  // cookies (o servidor responde REFRESH_CONCORRENTE nesse caso).
  const isAuthRoute = path.startsWith("/auth/") || path.startsWith("auth/");
  if (res.status === 401 && !opts._noRetry && !isAuthRoute) {
    await tryRefresh();
    res = await rawFetch(path, { ...opts, _noRetry: true });
    if (res.status === 401) irParaLogin();
  }

  const text = await res.text();
  const data = text ? safeParse(text) : null;

  if (!res.ok) {
    // Perfil com MFA obrigatório ainda sem MFA: a API só libera a ativação
    if (res.status === 403 && (data as { code?: unknown } | null)?.code === "MFA_OBRIGATORIO") irParaSeguranca();
    throw new ApiError(res.status, mensagemDeErro(res.status, data), data);
  }

  return data as T;
}

function mensagemDeErro(status: number, data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  if (status === 502 || status === 503 || status === 504) {
    return "Serviço temporariamente indisponível. Tente novamente em instantes.";
  }
  return `Erro inesperado (HTTP ${status})`;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
