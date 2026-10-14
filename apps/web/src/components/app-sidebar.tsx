"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Marca, NavLinks } from "@/components/nav-links";

export function AppSidebar() {
  return (
    <aside
      className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:z-30 bg-sidebar text-sidebar-foreground"
      aria-label="Navegação principal"
    >
      <div className="flex items-center px-6 h-[72px]">
        <Marca />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-4 pb-6" aria-label="Operação">
        <NavLinks />
      </nav>

      <div className="px-3 pb-4">
        <Link
          href="/conta/seguranca"
          className="flex items-center gap-3 rounded-lg border border-sidebar-border px-3 py-2.5 text-xs text-sidebar-foreground/70 transition-colors hover:border-sidebar-primary/40 hover:text-sidebar-accent-foreground"
        >
          <ShieldCheck className="h-4 w-4 text-sidebar-primary" strokeWidth={1.75} aria-hidden />
          <span>
            Segurança da conta
            <span className="block text-[10.5px] text-sidebar-foreground/45">Senha e verificação em duas etapas</span>
          </span>
        </Link>
      </div>
    </aside>
  );
}
