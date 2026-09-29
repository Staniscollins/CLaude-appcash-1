import {
  ArrowLeftRight,
  Calculator,
  ChartLine,
  Globe,
  HandCoins,
  LayoutDashboard,
  Settings,
  Star,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Vue d'ensemble", short: "Accueil", icon: LayoutDashboard, description: "Valeur, performance et faits marquants" },
  {
    href: "/portfolio",
    label: "Portefeuille",
    short: "Positions",
    icon: Wallet,
    description: "Positions, PRU, plus-values et répartition",
  },
  {
    href: "/performance",
    label: "Performance",
    short: "Perf.",
    icon: ChartLine,
    description: "Rendements, risque et comparaison aux indices",
  },
  {
    href: "/dividends",
    label: "Dividendes",
    short: "Dividendes",
    icon: HandCoins,
    description: "Revenus perçus, calendrier et prévisions",
  },
  {
    href: "/transactions",
    label: "Transactions",
    short: "Opérations",
    icon: ArrowLeftRight,
    description: "Historique, saisie et import CSV",
  },
  { href: "/markets", label: "Marchés", short: "Marchés", icon: Globe, description: "Indices, devises, matières premières, crypto" },
  { href: "/watchlist", label: "Watchlist", short: "Watchlist", icon: Star, description: "Valeurs suivies et alertes de cours" },
  {
    href: "/simulator",
    label: "Simulateur",
    short: "Simulateur",
    icon: Calculator,
    description: "Projection d'épargne et d'intérêts composés",
  },
  { href: "/settings", label: "Paramètres", short: "Réglages", icon: Settings, description: "Comptes, devise, affichage et données" },
];

export const MOBILE_NAV = ["/", "/portfolio", "/performance", "/markets"];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
