import { NextResponse, type NextRequest } from "next/server";

// O backend grava 2 cookies httpOnly: crm_at (access, 15min) e crm_rt (refresh, 7d).
// Aqui checamos só o refresh — se ele existir, há sessão viva; o access expirado
// é renovado automaticamente pelo client (api.ts) na primeira 401.
const SESSION_COOKIE = "crm_rt";
const LOGIN_PATH = "/login";
// Páginas abertas sem sessão (quem já está logado volta para o sistema)
const PAGINAS_PUBLICAS = new Set([LOGIN_PATH, "/cadastro"]);
const DEFAULT_LOGGED_IN = "/dashboard";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);
  const isLoginPage = PAGINAS_PUBLICAS.has(pathname);

  if (!hasSession && !isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (hasSession && isLoginPage) {
    const url = req.nextUrl.clone();
    url.pathname = DEFAULT_LOGGED_IN;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Exclui assets internos do Next, favicon e qualquer rota proxiada /api/*
  // (essa última precisa passar livre — o backend decide o auth dela).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
