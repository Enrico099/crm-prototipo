"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlternarTema } from "@/components/alternar-tema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Marca, NavLinks } from "@/components/nav-links";
import { cn } from "@/lib/utils";
import { useLogout, useMe } from "@/lib/queries";

const roleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  ASSESSOR: "Assessor",
  COMPLIANCE: "Compliance",
  READONLY: "Somente leitura",
};

function initials(nome: string) {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function hoje() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export function AppHeader() {
  const router = useRouter();
  const { data: user, isLoading } = useMe();
  const logout = useLogout();
  const [menuAberto, setMenuAberto] = useState(false);

  async function handleLogout() {
    try {
      await logout.mutateAsync();
    } catch {
      // Mesmo se a API falhar, o cache local já foi limpo (onSettled) e o
      // usuário precisa conseguir sair — sem rejeição não tratada no onClick.
    } finally {
      router.replace("/login");
    }
  }

  return (
    <header className="h-[72px] border-b border-border/70 bg-background/85 backdrop-blur-xl sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6 md:px-10">
      {/* Menu mobile — a sidebar só aparece a partir de md */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Abrir menu de navegação"
        onClick={() => setMenuAberto(true)}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>
      <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
        <SheetContent side="left" className="bg-sidebar text-sidebar-foreground p-0 w-72">
          <div className="flex items-center px-5 h-16 border-b border-sidebar-border">
            <Marca />
          </div>
          <SheetTitle className="sr-only">Navegação</SheetTitle>
          <nav className="px-3 py-2" aria-label="Operação">
            <NavLinks onNavigate={() => setMenuAberto(false)} />
          </nav>
        </SheetContent>
      </Sheet>

      <p className="hidden sm:block text-sm text-muted-foreground first-letter:uppercase" suppressHydrationWarning>
        {hoje()}
      </p>

      <div className="flex items-center gap-1 ml-auto">
        <AlternarTema />
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: "ghost" }), "h-9 gap-2 px-2")}
            disabled={!user}
            aria-label={user ? `Conta de ${user.nome}` : "Carregando conta"}
          >
            {isLoading || !user ? (
              <>
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="hidden sm:block h-3 w-20" />
              </>
            ) : (
              <>
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                    {initials(user.nome)}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left leading-tight">
                  <p className="text-sm font-medium">{user.nome}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {roleLabel[user.role] ?? user.role}
                  </p>
                </div>
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                {user ? (
                  <div className="font-normal">
                    <p className="text-sm font-medium">{user.nome}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                ) : (
                  "Minha conta"
                )}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/conta/seguranca" />}>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Segurança da conta
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={handleLogout}
              disabled={logout.isPending}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
