"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/query-states";
import { useAprovarCadastro, useRecusarCadastro, useUsuarios } from "@/lib/queries";
import { usePermissoes } from "@/lib/permissoes";
import { roleLabel } from "@/lib/labels";
import { fmt } from "@/lib/format";
import type { UserRole, UsuarioAdmin } from "@/types/api";

export default function UsuariosPage() {
  const { podeGerirUsuarios, carregando } = usePermissoes();
  const { data, isLoading, error, refetch } = useUsuarios();

  if (!carregando && !podeGerirUsuarios) {
    return <EmptyState message="Apenas administradores gerenciam usuários." />;
  }

  const pendentes = data?.filter((u) => u.cadastroPendente) ?? [];
  const demais = data?.filter((u) => !u.cadastroPendente) ?? [];

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Quem tem acesso ao sistema. Contas criadas pela tela de cadastro entram como assessor."
      />

      {isLoading && (
        <Card>
          <CardContent className="p-4">
            <TableSkeleton rows={4} />
          </CardContent>
        </Card>
      )}
      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}

      {data && (
        <div className="space-y-6">
          {pendentes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Aguardando aprovação</CardTitle>
              <CardDescription>
                Cadastros feitos antes do acesso imediato. Até serem aprovados, não acessam o sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendentes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum cadastro pendente.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {pendentes.map((u) => (
                    <CadastroPendente key={u.id} usuario={u} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Usuários do sistema</CardTitle>
              <CardDescription>{demais.length} usuário(s)</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {demais.map((u) => (
                  <li key={u.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <div className="min-w-0 sm:flex-1">
                      <p className="text-sm font-medium truncate">{u.nome}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{roleLabel[u.role]}</Badge>
                      {!u.ativo && <Badge variant="outline">Inativo</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

const itensPerfil = roleLabel;

function CadastroPendente({ usuario: u }: { usuario: UsuarioAdmin }) {
  const [role, setRole] = useState<UserRole>("ASSESSOR");
  const aprovar = useAprovarCadastro();
  const recusar = useRecusarCadastro();
  const ocupado = aprovar.isPending || recusar.isPending;

  return (
    <li className="py-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="min-w-0 md:flex-1">
        <p className="text-sm font-medium truncate">{u.nome}</p>
        <p className="text-xs text-muted-foreground truncate">
          {u.email} · cadastro em {fmt.dateTime(u.createdAt)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select items={itensPerfil} value={role} onValueChange={(v) => v && setRole(v as UserRole)}>
          <SelectTrigger className="w-44" aria-label={`Perfil de ${u.nome}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(roleLabel) as UserRole[]).map((r) => (
              <SelectItem key={r} value={r}>
                {roleLabel[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={ocupado}
          onClick={() =>
            aprovar.mutate(
              { id: u.id, role },
              {
                onSuccess: () => toast.success(`${u.nome} aprovado(a) como ${roleLabel[role].toLowerCase()}`),
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          {aprovar.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
          Aprovar
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() =>
            recusar.mutate(u.id, {
              onSuccess: () => toast.success(`Cadastro de ${u.nome} recusado`),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          <X className="h-4 w-4" aria-hidden />
          Recusar
        </Button>
      </div>
    </li>
  );
}
