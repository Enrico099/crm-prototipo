import {
  LayoutDashboard,
  Users,
  FileCheck2,
  Package,
  Sparkles,
  GitBranch,
  History,
  BarChart3,
  Target,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGrupo = { titulo: string; itens: NavItem[] };

/** Navegação principal, agrupada como o assessor trabalha */
export const navGrupos: NavGrupo[] = [
  {
    titulo: "Carteira",
    itens: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/leads", label: "Leads & Clientes", icon: Users },
      { href: "/pipeline", label: "Pipeline", icon: GitBranch },
      { href: "/historico", label: "Histórico", icon: History },
    ],
  },
  {
    titulo: "Investimentos",
    itens: [
      { href: "/suitability", label: "Suitability", icon: FileCheck2 },
      { href: "/produtos", label: "Produtos", icon: Package },
      { href: "/oportunidades", label: "Oportunidades do dia", icon: Target },
      { href: "/recomendacao", label: "Recomendações IA", icon: Sparkles },
    ],
  },
  {
    titulo: "Análise",
    itens: [{ href: "/relatorios", label: "Relatórios", icon: BarChart3 }],
  },
];

export const mainNav: NavItem[] = navGrupos.flatMap((g) => g.itens);
