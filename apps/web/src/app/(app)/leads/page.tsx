"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState, TableSkeleton, EmptyState } from "@/components/query-states";
import { ClienteFormDialog } from "@/components/forms/cliente-form-dialog";
import { useClientes } from "@/lib/queries";
import { usePermissoes } from "@/lib/permissoes";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { perfilColor, perfilLabel, statusClienteLabel } from "@/lib/labels";
import { fmt } from "@/lib/format";
import type { PerfilInvestidor, StatusCliente } from "@/types/api";

const TODOS = "todos";
const POR_PAGINA = 20;

// `items` faz o Select exibir o rótulo (e não o valor cru) no gatilho
const itensPerfil = { [TODOS]: "Todos os perfis", ...perfilLabel };
const itensStatus = { [TODOS]: "Todos os status", ...statusClienteLabel };

function initials(nome: string) {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function LeadsPage() {
  const router = useRouter();
  const { podeOperar } = usePermissoes();
  const [q, setQ] = useState("");
  const [perfil, setPerfil] = useState<string>(TODOS);
  const [status, setStatus] = useState<string>(TODOS);
  const [page, setPage] = useState(1);
  const [novoAberto, setNovoAberto] = useState(false);
  const busca = useDebouncedValue(q.trim(), 300);

  const { data, isLoading, error, refetch, isFetching } = useClientes({
    q: busca || undefined,
    perfil: perfil === TODOS ? undefined : (perfil as PerfilInvestidor),
    status: status === TODOS ? undefined : (status as StatusCliente),
    page,
    limit: POR_PAGINA,
  });

  // Qualquer mudança de filtro volta pra primeira página
  function filtrar(fn: () => void) {
    fn();
    setPage(1);
  }

  return (
    <>
      <PageHeader
        title="Leads & Clientes"
        description="Base de clientes da sua carteira — busca, filtros e acesso à ficha completa"
        actions={
          podeOperar && (
            <Button size="sm" onClick={() => setNovoAberto(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Novo cliente
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                type="search"
                aria-label="Buscar por nome ou e-mail"
                placeholder="Buscar por nome ou e-mail…"
                className="pl-9 h-9"
                value={q}
                onChange={(e) => filtrar(() => setQ(e.target.value))}
              />
            </div>
            <Select
              items={itensPerfil}
              value={perfil}
              onValueChange={(v) => filtrar(() => setPerfil(v ?? TODOS))}
            >
              <SelectTrigger className="w-full md:w-44" aria-label="Filtrar por perfil">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os perfis</SelectItem>
                {(Object.keys(perfilLabel) as PerfilInvestidor[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {perfilLabel[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={itensStatus}
              value={status}
              onValueChange={(v) => filtrar(() => setStatus(v ?? TODOS))}
            >
              <SelectTrigger className="w-full md:w-40" aria-label="Filtrar por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os status</SelectItem>
                {(Object.keys(statusClienteLabel) as StatusCliente[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {statusClienteLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {data && (
              <div className="text-sm text-muted-foreground md:ml-auto" aria-live="polite">
                {data.meta.total} cliente(s)
              </div>
            )}
          </div>

          {isLoading && (
            <div className="p-4">
              <TableSkeleton />
            </div>
          )}

          {error && (
            <div className="p-4">
              <ErrorState message={error.message} onRetry={() => refetch()} />
            </div>
          )}

          {data && data.data.length === 0 && (
            <div className="p-4">
              <EmptyState message="Nenhum cliente corresponde aos filtros." />
            </div>
          )}

          {data && data.data.length > 0 && (
            <div className="overflow-x-auto" aria-busy={isFetching}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="hidden md:table-cell">Cidade</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead className="text-right">Patrimônio</TableHead>
                    <TableHead className="hidden lg:table-cell">Última interação</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/clientes/${c.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-muted">{initials(c.nome)}</AvatarFallback>
                          </Avatar>
                          <div className="leading-tight">
                            {/* Link real: navegação por teclado e "abrir em nova aba" */}
                            <Link
                              href={`/clientes/${c.id}`}
                              className="font-medium text-sm hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {c.nome}
                            </Link>
                            <p className="text-xs text-muted-foreground">{c.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {c.cidade ? `${c.cidade}${c.uf ? `, ${c.uf}` : ""}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge className={perfilColor[c.perfil]} variant="secondary">
                          {perfilLabel[c.perfil]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm tabular-nums">
                        {fmt.brl(c.patrimonio)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                        {c.ultimaInteracao ? fmt.date(c.ultimaInteracao) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={c.status === "ATIVO" ? "default" : "outline"}>
                          {statusClienteLabel[c.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.meta.totalPages > 1 && (
            <nav className="flex items-center justify-between p-4 border-t" aria-label="Paginação">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                Página {data.meta.page} de {data.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </nav>
          )}
        </CardContent>
      </Card>

      <ClienteFormDialog
        open={novoAberto}
        onOpenChange={setNovoAberto}
        onSalvo={(c) => router.push(`/clientes/${c.id}`)}
      />
    </>
  );
}
