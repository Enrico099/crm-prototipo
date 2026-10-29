"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { Marca } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useCadastro } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// Mesma política da API (apps/api/src/auth/politica-senha.ts)
const cadastroSchema = z
  .object({
    nome: z.string().trim().min(3, "Informe o nome completo").max(120),
    email: z.string().trim().min(1, "Informe o e-mail").email("E-mail inválido"),
    senha: z
      .string()
      .min(12, "Mínimo 12 caracteres")
      .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Use letras e números"),
    confirmacao: z.string(),
  })
  .refine((v) => v.senha === v.confirmacao, { path: ["confirmacao"], message: "As senhas não conferem" });

type CadastroInputs = z.infer<typeof cadastroSchema>;

export default function CadastroPage() {
  const router = useRouter();
  const cadastro = useCadastro();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CadastroInputs>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: { nome: "", email: "", senha: "", confirmacao: "" },
  });

  async function onSubmit({ nome, email, senha }: CadastroInputs) {
    setServerError(null);
    try {
      await cadastro.mutateAsync({ nome, email, senha });
      router.replace("/dashboard");
    } catch (e) {
      setServerError(
        e instanceof ApiError ? e.message : "Não foi possível conectar ao servidor. Tente novamente.",
      );
    }
  }

  const campo = (id: keyof CadastroInputs) => ({
    id,
    "aria-invalid": !!errors[id],
    "aria-describedby": errors[id] ? `${id}-erro` : undefined,
    className: cn(errors[id] && "border-destructive"),
  });

  const erro = (id: keyof CadastroInputs) =>
    errors[id] && (
      <p id={`${id}-erro`} className="text-xs text-destructive">
        {errors[id]?.message}
      </p>
    );

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6 sm:p-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 rounded-xl bg-sidebar px-5 py-4 inline-flex">
          <Marca />
        </div>
        <h1 className="titulo-display text-[40px] leading-none mb-2">Criar conta</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Você entra como assessor, com sua própria carteira de clientes.
        </p>

        <Card>
            <CardContent className="p-6 space-y-4">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="nome" className="text-xs">
                    Nome completo
                  </Label>
                  <Input autoComplete="name" {...campo("nome")} {...register("nome")} />
                  {erro("nome")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs">
                    E-mail corporativo
                  </Label>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="voce@capitalelite.com.br"
                    {...campo("email")}
                    {...register("email")}
                  />
                  {erro("email")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="senha" className="text-xs">
                    Senha
                  </Label>
                  <Input type="password" autoComplete="new-password" {...campo("senha")} {...register("senha")} />
                  {erro("senha") ?? (
                    <p className="text-[11px] text-muted-foreground">Mínimo 12 caracteres, com letras e números.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmacao" className="text-xs">
                    Confirme a senha
                  </Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    {...campo("confirmacao")}
                    {...register("confirmacao")}
                  />
                  {erro("confirmacao")}
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
                  Criar conta
                </Button>
              </form>
              <p className="text-center text-sm">
                Já tem conta?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Entrar
                </Link>
              </p>
            </CardContent>
        </Card>
      </div>
    </main>
  );
}
