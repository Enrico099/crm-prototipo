"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt } from "@/lib/format";
import type { SerieCarteira } from "@/types/api";

type Props = {
  /** null enquanto carrega */
  serie: SerieCarteira["meses"] | null;
  erroSerie?: string;
  /** null enquanto carrega */
  distribuicaoPerfil: { perfil: string; quantidade: number; pct: number }[] | null;
};

// Cores vêm dos tokens --viz-* (globals.css): validadas para daltonismo e
// contraste em cada tema, e trocam sozinhas no modo escuro.
// Ordem fixa conservador → agressivo, a mesma dos selos de perfil.
const PERFIL_COLORS = ["var(--viz-perfil-1)", "var(--viz-perfil-2)", "var(--viz-perfil-3)", "var(--viz-perfil-4)"];
const LINHA = "var(--viz-linha)";
const GRADE = "var(--viz-grade)";
// Par validado para daltonismo (verde × vermelho falhava em deutan)
const APLICACOES = "var(--viz-aplicacoes)";
const RESGATES = "var(--viz-resgates)";
const TINTA = "var(--viz-eixo)";

// Evita o aviso "width(-1)" no prerender (o container ainda não tem tamanho)
const DIM_INICIAL = { width: 320, height: 200 };

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "0 8px 24px -8px rgba(15,23,42,0.18)",
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" → "out/26" */
export function rotuloMes(mes: string) {
  const [ano, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}/${ano.slice(2)}`;
}

// Eixo: "R$ 25 mi", "R$ 800 mil"
const compacto = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function DashboardCharts({ serie, erroSerie, distribuicaoPerfil }: Props) {
  const semClientes = distribuicaoPerfil?.every((p) => p.quantidade === 0);
  const dados = serie?.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) }));
  const semMovimento = serie?.every((m) => m.patrimonioAplicado === 0 && m.entradas === 0 && m.saidas === 0);

  const estadoSerie = (altura: string) =>
    erroSerie ? (
      <p role="alert" className={`${altura} flex items-center justify-center text-sm text-destructive`}>
        Não foi possível carregar a evolução da carteira: {erroSerie}
      </p>
    ) : !dados ? (
      <Skeleton className={`${altura} w-full`} />
    ) : semMovimento ? (
      <p className={`${altura} flex items-center justify-center text-center text-sm text-muted-foreground`}>
        Nenhuma movimentação registrada no período.
      </p>
    ) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Patrimônio aplicado</CardTitle>
          <CardDescription>
            Fim de cada mês, últimos 12 meses · valor de custo (sem marcação a mercado)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {estadoSerie("h-64") ?? (
            <div className="h-64" role="img" aria-label="Evolução mensal do patrimônio aplicado (detalhes na tabela abaixo)">
              <ResponsiveContainer width="100%" height="100%" initialDimension={DIM_INICIAL}>
                <AreaChart data={dados} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={LINHA} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={LINHA} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: TINTA }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: TINTA }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                    tickFormatter={(v: number) => compacto.format(v)}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => [fmt.brl(Number(v)), "Patrimônio aplicado"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="patrimonioAplicado"
                    stroke={LINHA}
                    strokeWidth={2}
                    fill="url(#gAum)"
                    activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distribuição por perfil</CardTitle>
          <CardDescription>Clientes ativos e prospectos</CardDescription>
        </CardHeader>
        <CardContent>
          {!distribuicaoPerfil ? (
            <Skeleton className="h-64 w-full" />
          ) : semClientes ? (
            <p className="h-64 flex items-center justify-center text-sm text-muted-foreground">
              Nenhum cliente na sua carteira ainda.
            </p>
          ) : (
            <>
              <div className="h-64" role="img" aria-label="Distribuição de clientes por perfil de investidor">
                <ResponsiveContainer width="100%" height="100%" initialDimension={DIM_INICIAL}>
                  <PieChart>
                    <Pie
                      data={distribuicaoPerfil}
                      dataKey="quantidade"
                      nameKey="perfil"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="var(--card)"
                      strokeWidth={2}
                    >
                      {distribuicaoPerfil.map((_, i) => (
                        <Cell key={i} fill={PERFIL_COLORS[i % PERFIL_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${String(v)} cliente(s)`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1">
                {distribuicaoPerfil.map((p, i) => (
                  <li key={p.perfil} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: PERFIL_COLORS[i % PERFIL_COLORS.length] }}
                        aria-hidden
                      />
                      {p.perfil}
                    </span>
                    <span className="font-medium tabular-nums">
                      {p.quantidade} · {fmt.pct(p.pct)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Captação</CardTitle>
          <CardDescription>
            Aplicações e resgates por mês · saldos iniciais não contam como captação
          </CardDescription>
        </CardHeader>
        <CardContent>
          {estadoSerie("h-56") ?? (
            <>
              <div className="h-56" role="img" aria-label="Aplicações e resgates por mês (detalhes na tabela abaixo)">
                <ResponsiveContainer width="100%" height="100%" initialDimension={DIM_INICIAL}>
                  <BarChart data={dados} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRADE} vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: TINTA }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: TINTA }}
                      axisLine={false}
                      tickLine={false}
                      width={72}
                      tickFormatter={(v: number) => compacto.format(v)}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v, nome) => [fmt.brl(Number(v)), String(nome)]}
                      cursor={{ fill: GRADE }}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 12, color: TINTA, paddingBottom: 8 }}
                    />
                    <Bar dataKey="entradas" name="Aplicações" fill={APLICACOES} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas" name="Resgates" fill={RESGATES} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Os mesmos números em tabela: leitura sem depender de cor ou do gráfico */}
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Ver os números em tabela
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full tabular-nums">
                    <caption className="sr-only">Evolução mensal da carteira</caption>
                    <thead className="text-muted-foreground">
                      <tr className="border-b">
                        <th scope="col" className="py-1.5 text-left font-medium">Mês</th>
                        <th scope="col" className="py-1.5 text-right font-medium">Patrimônio aplicado</th>
                        <th scope="col" className="py-1.5 text-right font-medium">Aplicações</th>
                        <th scope="col" className="py-1.5 text-right font-medium">Resgates</th>
                        <th scope="col" className="py-1.5 text-right font-medium">Captação líquida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados!.map((m) => (
                        <tr key={m.mes} className="border-b last:border-0">
                          <th scope="row" className="py-1.5 text-left font-normal">{m.rotulo}</th>
                          <td className="py-1.5 text-right">{fmt.brl(m.patrimonioAplicado)}</td>
                          <td className="py-1.5 text-right">{fmt.brl(m.entradas)}</td>
                          <td className="py-1.5 text-right">{fmt.brl(m.saidas)}</td>
                          <td className="py-1.5 text-right">
                            {m.captacaoLiquida < 0 ? "−" : ""}
                            {fmt.brl(Math.abs(m.captacaoLiquida))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
