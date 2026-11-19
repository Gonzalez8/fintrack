import {
  LayoutDashboard, TrendingUp, HandCoins, Landmark, FileText,
  type LucideIcon,
} from "lucide-react";

export interface NavSection {
  href: string;
  labelKey: string;
}

export interface NavArea {
  key: string;
  labelKey: string;
  icon: LucideIcon;
  sections: NavSection[];
}

// Five top-level areas; each groups existing pages as sections.
// Pages, URLs and their inner tabs stay as they are.
export const NAV_AREAS: NavArea[] = [
  {
    key: "home",
    labelKey: "nav.home",
    icon: LayoutDashboard,
    sections: [{ href: "/", labelKey: "nav.dashboard" }],
  },
  {
    key: "investments",
    labelKey: "nav.investments",
    icon: TrendingUp,
    sections: [
      { href: "/portfolio", labelKey: "nav.portfolio" },
      { href: "/transactions", labelKey: "nav.operations" },
      { href: "/dividends", labelKey: "nav.dividends" },
      { href: "/assets", labelKey: "nav.assets" },
    ],
  },
  {
    key: "income",
    labelKey: "nav.income",
    icon: HandCoins,
    sections: [
      { href: "/nominas", labelKey: "nav.payroll" },
      { href: "/interests", labelKey: "nav.interests" },
      { href: "/other-income", labelKey: "nav.otherIncome" },
    ],
  },
  {
    key: "wealth",
    labelKey: "nav.wealth",
    icon: Landmark,
    sections: [
      { href: "/accounts", labelKey: "nav.accounts" },
      { href: "/properties", labelKey: "nav.properties" },
      { href: "/savings", labelKey: "nav.savings" },
    ],
  },
  {
    key: "fiscal",
    labelKey: "nav.fiscal",
    icon: FileText,
    sections: [{ href: "/tax", labelKey: "nav.fiscal" }],
  },
];

export function isSectionActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findArea(pathname: string): NavArea | undefined {
  return NAV_AREAS.find((area) =>
    area.sections.some((s) => isSectionActive(s.href, pathname)),
  );
}
