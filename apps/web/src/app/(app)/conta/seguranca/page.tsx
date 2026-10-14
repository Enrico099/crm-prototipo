"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import QRCode from "qrcode";
import { AlertTriangle, Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/query-states";
import { Campo, ErroFormulario, ariaCampo } from "@/components/forms/campo";
import { ApiError } from "@/lib/api";
import { aplicarErrosDaApi } from "@/lib/formularios";
import { fmt } from "@/lib/format";
import {
  useAlterarSenha,
  useAtivarMfa,
  useConfigurarMfa,
  useDesativarMfa,
  useMfaStatus,
  useRegenerarCodigosMfa,
} from "@/lib/queries";
import type { MfaStatus } from "@/types/api";

export default function SegurancaPage() {
  const status = useMfaStatus();

  return (
    <>
      <PageHeader title="Segurança da conta" description="Verificação em duas etapas e senha de acesso" />
      {status.data?.obrigatorio && !status.data.ativo && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-aviso-borda bg-aviso p-3 text-sm text-aviso-foreground"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-aviso-foreground" aria-hidden />
          A verificação em duas etapas é obrigatória para o seu perfil. Ative abaixo para voltar a usar o sistema.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        {status.isLoading && <Skeleton className="h-64" />}
        {status.error && <ErrorState message={status.error.message} onRetry={() => status.refetch()} />}
        {status.data && <CartaoMfa status={status.data} />}
        <CartaoSenha />
      </div>
    </>
  );
}

// ============================================================
// MFA
// ============================================================

function CartaoMfa({ status }: { status: MfaStatus }) {
  const [codigosNovos, setCodigosNovos] = useState<string[] | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Verificação em duas etapas
          <Badge variant={status.ativo ? "default" : "outline"} className="ml-auto">
            {status.ativo ? "Ativa" : "Inativa"}
          </Badge>
        </CardTitle>
        <CardDescription>
          Além da senha, o login pede um código de 6 dígitos gerado por um aplicativo autenticador no seu celular
          (Google Authenticator, Microsoft Authenticator, 1Password e similares).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {codigosNovos ? (
          <CodigosRecuperacao codigos={codigosNovos} onConcluir={() => setCodigosNovos(null)} />
        ) : status.ativo ? (
          <MfaAtivo status={status} onCodigosNovos={setCodigosNovos} />
        ) : (
          <AtivarMfa onAtivado={setCodigosNovos} />
        )}
      </CardContent>
    </Card>
  );
}

const codigoSchema = z.object({ codigo: z.string().trim().regex(/^\d{6}$/, "Digite os 6 dígitos do aplicativo") });

function AtivarMfa({ onAtivado }: { onAtivado: (codigos: string[]) => void }) {
  const configurar = useConfigurarMfa();
  const ativar = useAtivarMfa();
  const [cadastro, setCadastro] = useState<{ segredo: string; qr: string } | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof codigoSchema>>({ resolver: zodResolver(codigoSchema), defaultValues: { codigo: "" } });

  async function comecar() {
    setErroGeral(null);
    try {
      const { segredo, uri } = await configurar.mutateAsync();
      const qr = await QRCode.toDataURL(uri, { margin: 1, width: 200 });
      setCadastro({ segredo, qr });
    } catch (e) {
      setErroGeral(e instanceof ApiError ? e.message : "Não foi possível iniciar a configuração.");
    }
  }

  async function onSubmit({ codigo }: z.infer<typeof codigoSchema>) {
    setErroGeral(null);
    try {
      const { codigosRecuperacao } = await ativar.mutateAsync({ codigo });
      toast.success("Verificação em duas etapas ativada");
      onAtivado(codigosRecuperacao);
    } catch (e) {
      setErroGeral(aplicarErrosDaApi(e, setError, ["codigo"]));
    }
  }

  if (!cadastro) {
    return (
      <div className="space-y-3">
        <ErroFormulario mensagem={erroGeral} />
        <Button size="sm" onClick={comecar} disabled={configurar.isPending}>
          {configurar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Ativar verificação em duas etapas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="list-decimal pl-5 space-y-1 text-sm">
        <li>No aplicativo autenticador, adicione uma conta e escaneie o QR code.</li>
        <li>Digite o código de 6 dígitos que aparecer para confirmar.</li>
      </ol>
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no navegador */}
        <img
          src={cadastro.qr}
          alt="QR code para cadastrar a conta no aplicativo autenticador"
          width={200}
          height={200}
          className="rounded-md border bg-white p-1"
        />
        <div className="text-xs space-y-1 min-w-0">
          <p className="text-muted-foreground">Sem câmera? Digite esta chave no aplicativo:</p>
          <code data-testid="segredo-mfa" className="block break-all rounded bg-muted px-2 py-1.5 font-mono text-sm">
            {cadastro.segredo.match(/.{1,4}/g)?.join(" ")}
          </code>
        </div>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
        <Campo id="mfa-codigo" label="Código do aplicativo" erro={errors.codigo?.message} obrigatorio>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="font-mono tracking-widest max-w-40"
            {...ariaCampo("mfa-codigo", errors.codigo?.message)}
            {...register("codigo")}
          />
        </Campo>
        <ErroFormulario mensagem={erroGeral} />
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Confirmar e ativar
        </Button>
      </form>
    </div>
  );
}

function CodigosRecuperacao({ codigos, onConcluir }: { codigos: string[]; onConcluir: () => void }) {
  const texto = codigos.join("\n");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Códigos copiados");
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

  function baixar() {
    const blob = new Blob(
      [`Capital Elite — códigos de recuperação (cada um vale uma vez)\n\n${texto}\n`],
      { type: "text/plain;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "capital-elite-codigos-de-recuperacao.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <p className="rounded-md border border-aviso-borda bg-aviso p-3 text-xs text-aviso-foreground" role="status">
        Guarde estes códigos em lugar seguro. Se perder o celular, cada código substitui o aplicativo em um login.
        <strong> Eles não serão mostrados de novo.</strong>
      </p>
      <ul aria-label="Códigos de recuperação" className="grid grid-cols-2 gap-2 font-mono text-sm">
        {codigos.map((c) => (
          <li key={c} className="rounded bg-muted px-2 py-1.5 text-center">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={copiar}>
          <Copy className="h-4 w-4" aria-hidden />
          Copiar
        </Button>
        <Button size="sm" variant="outline" onClick={baixar}>
          <Download className="h-4 w-4" aria-hidden />
          Baixar .txt
        </Button>
        <Button size="sm" onClick={onConcluir} className="ml-auto">
          Já guardei os códigos
        </Button>
      </div>
    </div>
  );
}

function MfaAtivo({ status, onCodigosNovos }: { status: MfaStatus; onCodigosNovos: (c: string[]) => void }) {
  const [acao, setAcao] = useState<"codigos" | "desativar" | null>(null);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Ativada em</dt>
          <dd className="font-medium">{status.ativadoEm ? fmt.date(status.ativadoEm) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Códigos de recuperação</dt>
          <dd className={status.codigosRestantes <= 2 ? "font-medium text-destructive" : "font-medium"}>
            {status.codigosRestantes} de 10 disponíveis
          </dd>
        </div>
      </dl>
      {status.codigosRestantes <= 2 && (
        <p className="text-xs text-destructive">Restam poucos códigos de recuperação. Gere novos.</p>
      )}

      {acao === "codigos" && (
        <RegenerarCodigos
          onCancelar={() => setAcao(null)}
          onGerados={(c) => {
            setAcao(null);
            onCodigosNovos(c);
          }}
        />
      )}
      {acao === "desativar" && <DesativarMfa onCancelar={() => setAcao(null)} />}

      {!acao && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAcao("codigos")}>
            <KeyRound className="h-4 w-4" aria-hidden />
            Gerar novos códigos de recuperação
          </Button>
          {!status.obrigatorio && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setAcao("desativar")}>
              <ShieldOff className="h-4 w-4" aria-hidden />
              Desativar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

const codigoOuRecuperacao = z.string().trim().min(6, "Informe o código do aplicativo ou um código de recuperação");

function RegenerarCodigos({ onCancelar, onGerados }: { onCancelar: () => void; onGerados: (c: string[]) => void }) {
  const regenerar = useRegenerarCodigosMfa();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const schema = z.object({ codigo: codigoOuRecuperacao });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { codigo: "" } });

  async function onSubmit(v: z.infer<typeof schema>) {
    setErroGeral(null);
    try {
      const { codigosRecuperacao } = await regenerar.mutateAsync(v);
      onGerados(codigosRecuperacao);
    } catch (e) {
      setErroGeral(aplicarErrosDaApi(e, setError, ["codigo"]));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3 rounded-md border p-3">
      <p className="text-xs text-muted-foreground">Os códigos atuais deixam de valer.</p>
      <Campo id="regen-codigo" label="Código do aplicativo" erro={errors.codigo?.message} obrigatorio>
        <Input autoComplete="one-time-code" className="font-mono max-w-48" {...ariaCampo("regen-codigo", errors.codigo?.message)} {...register("codigo")} />
      </Campo>
      <ErroFormulario mensagem={erroGeral} />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Gerar novos códigos
        </Button>
      </div>
    </form>
  );
}

function DesativarMfa({ onCancelar }: { onCancelar: () => void }) {
  const desativar = useDesativarMfa();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const schema = z.object({ senha: z.string().min(1, "Informe a senha"), codigo: codigoOuRecuperacao });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { senha: "", codigo: "" } });

  async function onSubmit(v: z.infer<typeof schema>) {
    setErroGeral(null);
    try {
      await desativar.mutateAsync(v);
      toast.success("Verificação em duas etapas desativada");
    } catch (e) {
      setErroGeral(aplicarErrosDaApi(e, setError, ["senha", "codigo"]));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3 rounded-md border border-destructive/30 p-3">
      <p className="text-xs text-muted-foreground">
        Sem a verificação em duas etapas, quem descobrir sua senha consegue entrar na sua conta.
      </p>
      <Campo id="desat-senha" label="Senha" erro={errors.senha?.message} obrigatorio>
        <Input type="password" autoComplete="current-password" {...ariaCampo("desat-senha", errors.senha?.message)} {...register("senha")} />
      </Campo>
      <Campo id="desat-codigo" label="Código do aplicativo" erro={errors.codigo?.message} obrigatorio>
        <Input autoComplete="one-time-code" className="font-mono max-w-48" {...ariaCampo("desat-codigo", errors.codigo?.message)} {...register("codigo")} />
      </Campo>
      <ErroFormulario mensagem={erroGeral} />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancelar} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" variant="destructive" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Desativar
        </Button>
      </div>
    </form>
  );
}

// ============================================================
// Senha
// ============================================================

// Mesma política da API (apps/api/src/auth/politica-senha.ts)
const senhaSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual"),
    novaSenha: z
      .string()
      .min(12, "A senha precisa ter pelo menos 12 caracteres")
      .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Use letras e números"),
    confirmacao: z.string(),
  })
  .refine((v) => v.novaSenha === v.confirmacao, { path: ["confirmacao"], message: "As senhas não conferem" });
type SenhaInputs = z.infer<typeof senhaSchema>;

function CartaoSenha() {
  const alterar = useAlterarSenha();
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SenhaInputs>({
    resolver: zodResolver(senhaSchema),
    defaultValues: { senhaAtual: "", novaSenha: "", confirmacao: "" },
  });

  async function onSubmit({ senhaAtual, novaSenha }: SenhaInputs) {
    setErroGeral(null);
    try {
      await alterar.mutateAsync({ senhaAtual, novaSenha });
      reset();
      toast.success("Senha alterada", { description: "As sessões abertas em outros dispositivos foram encerradas." });
    } catch (e) {
      setErroGeral(aplicarErrosDaApi(e, setError, ["senhaAtual", "novaSenha"]));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" aria-hidden />
          Senha
        </CardTitle>
        <CardDescription>
          Mínimo de 12 caracteres, com letras e números. Ao trocar, as sessões em outros dispositivos são encerradas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
          <Campo id="senha-atual" label="Senha atual" erro={errors.senhaAtual?.message} obrigatorio>
            <Input type="password" autoComplete="current-password" {...ariaCampo("senha-atual", errors.senhaAtual?.message)} {...register("senhaAtual")} />
          </Campo>
          <Campo id="senha-nova" label="Nova senha" erro={errors.novaSenha?.message} obrigatorio>
            <Input type="password" autoComplete="new-password" {...ariaCampo("senha-nova", errors.novaSenha?.message)} {...register("novaSenha")} />
          </Campo>
          <Campo id="senha-confirmacao" label="Confirme a nova senha" erro={errors.confirmacao?.message} obrigatorio>
            <Input type="password" autoComplete="new-password" {...ariaCampo("senha-confirmacao", errors.confirmacao?.message)} {...register("confirmacao")} />
          </Campo>
          <ErroFormulario mensagem={erroGeral} />
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Alterar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
