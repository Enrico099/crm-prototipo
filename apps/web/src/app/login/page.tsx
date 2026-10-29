"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { Marca } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useLogin, useVerificarMfa } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().min(1, "Informe o e-mail").email("E-mail inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

type LoginInputs = z.infer<typeof loginSchema>;

// Só no banco de demonstração (seed): em uso real a dica confundiria
const MOSTRAR_CREDENCIAIS_DEMO = process.env.NEXT_PUBLIC_CREDENCIAIS_DEMO === "true";

export default function LoginPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
      {/* Painel de marca (desktop) */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 15%, oklch(0.79 0.11 80 / 0.22), transparent 45%), radial-gradient(circle at 85% 90%, oklch(0.55 0.08 262 / 0.5), transparent 50%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="relative">
          <Marca />
        </div>
        <div className="relative max-w-md">
          <p className="titulo-display text-[44px] leading-[1.05] text-sidebar-accent-foreground">
            Patrimônio bem cuidado começa por uma boa conversa.
          </p>
          <p className="mt-5 text-sm leading-relaxed text-sidebar-foreground/70">
            Carteiras, suitability e recomendações explicáveis em um só lugar, com cada decisão
            registrada para o compliance.
          </p>
        </div>
        <p className="relative text-[11px] uppercase tracking-[0.2em] text-sidebar-foreground/40">
          Apoio à decisão do assessor · CVM 30
        </p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 rounded-xl bg-sidebar px-5 py-4 inline-flex">
            <Marca />
          </div>
          <h1 className="titulo-display text-[40px] leading-none mb-2">Bem-vindo de volta</h1>
          <p className="text-sm text-muted-foreground mb-8">Entre com suas credenciais corporativas.</p>

          {/* useSearchParams exige Suspense boundary pra não quebrar o prerender */}
          <Suspense fallback={<Card className="h-72" />}>
            <LoginForm />
          </Suspense>

          {MOSTRAR_CREDENCIAIS_DEMO && (
            <p className="text-center text-[11px] text-muted-foreground mt-4">
              Dados de demonstração:{" "}
              <code className="font-mono">admin@capitalelite.com.br</code> /{" "}
              <code className="font-mono">Senha123!</code>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  // Senha certa de conta com MFA: o próximo passo é o código
  const [desafio, setDesafio] = useState<string | null>(null);
  const destino = safeRedirectPath(params.get("from"));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInputs>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInputs) {
    setServerError(null);
    try {
      const res = await login.mutateAsync(values);
      if (res.mfaObrigatorio) {
        setDesafio(res.desafio);
        return;
      }
      router.replace(destino);
    } catch (e) {
      setServerError(mensagemDeLogin(e));
    }
  }

  if (desafio) {
    return (
      <SegundoFatorForm
        desafio={desafio}
        onConcluido={() => router.replace(destino)}
        onVoltar={() => setDesafio(null)}
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">
              E-mail
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@capitalelite.com.br"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-erro" : undefined}
              className={cn(errors.email && "border-destructive")}
              {...register("email")}
            />
            {errors.email && (
              <p id="email-erro" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">
              Senha
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "senha-erro" : undefined}
              className={cn(errors.password && "border-destructive")}
              {...register("password")}
            />
            {errors.password && (
              <p id="senha-erro" className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>{serverError}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Entrar
          </Button>
        </form>

        <p className="text-center text-sm pt-1">
          Não tem conta?{" "}
          <Link href="/cadastro" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Esqueceu a senha ou perdeu o autenticador? Procure o administrador do sistema.
        </p>
      </CardContent>
    </Card>
  );
}

function mensagemDeLogin(e: unknown): string {
  if (!(e instanceof ApiError)) return "Não foi possível conectar ao servidor. Tente novamente.";
  if (e.status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return e.message;
}

const codigoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .min(6, "Informe o código de 6 dígitos ou um código de recuperação"),
});
type CodigoInputs = z.infer<typeof codigoSchema>;

function SegundoFatorForm({
  desafio,
  onConcluido,
  onVoltar,
}: {
  desafio: string;
  onConcluido: () => void;
  onVoltar: () => void;
}) {
  const verificar = useVerificarMfa();
  const [serverError, setServerError] = useState<string | null>(null);
  const [recuperacao, setRecuperacao] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CodigoInputs>({ resolver: zodResolver(codigoSchema), defaultValues: { codigo: "" } });

  async function onSubmit({ codigo }: CodigoInputs) {
    setServerError(null);
    try {
      await verificar.mutateAsync({ desafio, codigo });
      onConcluido();
    } catch (e) {
      setServerError(mensagemDeLogin(e));
    }
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h2 className="font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Verificação em duas etapas
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {recuperacao
              ? "Digite um dos códigos de recuperação que você guardou. Cada um vale uma vez."
              : "Abra o aplicativo autenticador e digite o código de 6 dígitos."}
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="codigo" className="text-xs">
              {recuperacao ? "Código de recuperação" : "Código"}
            </Label>
            <Input
              id="codigo"
              key={recuperacao ? "recuperacao" : "totp"}
              autoFocus
              autoComplete="one-time-code"
              inputMode={recuperacao ? "text" : "numeric"}
              placeholder={recuperacao ? "abcde-fghjk" : "000000"}
              maxLength={recuperacao ? 20 : 6}
              aria-invalid={!!errors.codigo}
              aria-describedby={errors.codigo ? "codigo-erro" : undefined}
              className={cn("font-mono tracking-widest", errors.codigo && "border-destructive")}
              {...register("codigo")}
            />
            {errors.codigo && (
              <p id="codigo-erro" className="text-xs text-destructive">
                {errors.codigo.message}
              </p>
            )}
          </div>

          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>{serverError}</span>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Verificar
          </Button>
        </form>

        <div className="flex items-center justify-between text-xs">
          <button type="button" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline" onClick={onVoltar}>
            Voltar
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setRecuperacao((v) => !v);
              setServerError(null);
            }}
          >
            {recuperacao ? "Usar o aplicativo autenticador" : "Perdi o acesso ao autenticador"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
