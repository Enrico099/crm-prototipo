"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGrupos } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function isAtivo(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  // /leads também cobre a ficha do cliente (/clientes/:id)
  if (href === "/leads") return pathname.startsWith("/leads") || pathname.startsWith("/clientes");
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Links da navegação principal — usados na sidebar (desktop) e no menu mobile. */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-6">
      {navGrupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-3 mb-1.5 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45 font-medium">
            {grupo.titulo}
          </p>
          <ul className="flex flex-col gap-0.5">
            {grupo.itens.map((item) => {
              const Icon = item.icon;
              const active = isAtivo(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors focus-visible:outline-2 focus-visible:outline-sidebar-primary",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-sidebar-primary" />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
                      )}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Marca() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-primary/40 bg-sidebar-primary/10 text-sidebar-primary">
        <span className="titulo-display text-lg leading-none" aria-hidden>
          CE
        </span>
      </div>
      <div className="leading-tight">
        <p className="titulo-display text-[19px] leading-none text-sidebar-accent-foreground">Capital Elite</p>
        <p className="text-[9.5px] text-sidebar-foreground/50 uppercase tracking-[0.22em] mt-1">
          Wealth Management
        </p>
      </div>
    </div>
  );
}
