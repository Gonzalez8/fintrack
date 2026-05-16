"use client";

import Link from "next/link";
import {
  TrendingUp,
  ArrowRight,
  Shield,
  PieChart,
  BarChart3,
  Wallet,
  Calculator,
  Globe,
  Github,
  Lock,
  Server,
  Zap,
  LineChart,
  Receipt,
  Landmark,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "@/i18n/use-translations";
import type { LucideIcon } from "lucide-react";

// ── Feature config (icons + i18n keys) ──────────────────────────────
const featureKeys: { icon: LucideIcon; titleKey: string; descKey: string }[] = [
  { icon: PieChart, titleKey: "marketing.featurePortfolio", descKey: "marketing.featurePortfolioDesc" },
  { icon: BarChart3, titleKey: "marketing.featureTransactions", descKey: "marketing.featureTransactionsDesc" },
  { icon: Wallet, titleKey: "marketing.featureDividends", descKey: "marketing.featureDividendsDesc" },
  { icon: Calculator, titleKey: "marketing.featureFiscal", descKey: "marketing.featureFiscalDesc" },
  { icon: LineChart, titleKey: "marketing.featureEvolution", descKey: "marketing.featureEvolutionDesc" },
  { icon: Globe, titleKey: "marketing.featureMultilang", descKey: "marketing.featureMultilangDesc" },
  { icon: Shield, titleKey: "marketing.featurePrivacy", descKey: "marketing.featurePrivacyDesc" },
  { icon: Landmark, titleKey: "marketing.featureAccounts", descKey: "marketing.featureAccountsDesc" },
  { icon: Receipt, titleKey: "marketing.featureSavings", descKey: "marketing.featureSavingsDesc" },
];

// ── Step config ─────────────────────────────────────────────────────
const stepKeys = [
  { number: "01", titleKey: "marketing.step1Title", descKey: "marketing.step1Desc", code: "docker compose up -d" },
  { number: "02", titleKey: "marketing.step2Title", descKey: "marketing.step2Desc", code: "FIFO · LIFO · WAC" },
  { number: "03", titleKey: "marketing.step3Title", descKey: "marketing.step3Desc", code: "BUY · SELL · GIFT · DIV" },
  { number: "04", titleKey: "marketing.step4Title", descKey: "marketing.step4Desc", code: "P&L · Fiscal · Portfolio" },
];

// ── Tech Stack ──────────────────────────────────────────────────────
const techStack = [
  { name: "Django", category: "Backend" },
  { name: "PostgreSQL", category: "Database" },
  { name: "Next.js", category: "Frontend" },
  { name: "React", category: "UI" },
  { name: "TypeScript", category: "Language" },
  { name: "Celery", category: "Tasks" },
  { name: "Redis", category: "Cache" },
  { name: "Docker", category: "Infra" },
];

// ── Page ─────────────────────────────────────────────────────────────
export default function MarketingPage() {
  const t = useTranslations();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/30 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-mono text-sm font-bold tracking-[3px] uppercase">
              Fintrack
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {t("marketing.navFeatures")}
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {t("marketing.navHowItWorks")}
            </a>
            <a href="#open-source" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {t("marketing.navOpenSource")}
            </a>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {t("marketing.signIn")}
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-4 bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] text-white hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all"
            >
              {t("marketing.getStarted")}
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.15),transparent_70%)]" />
          <div
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
            style={{
              backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 mb-8">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-[10px] tracking-[2px] uppercase text-primary">
              {t("marketing.badge")}
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.1]">
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
              {t("marketing.heroTitle1")}
            </span>
            <br />
            <span className="bg-gradient-to-r from-[#1d4ed8] to-[#60a5fa] bg-clip-text text-transparent">
              {t("marketing.heroTitle2")}
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t("marketing.heroSubtitle")}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-md text-base font-medium h-12 px-8 bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] text-white hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_4px_24px_rgba(59,130,246,0.4)] transition-all"
            >
              {t("marketing.ctaStart")} <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/Gonzalez8/fintrack"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md text-base font-medium h-12 px-8 border border-border hover:bg-accent transition-colors"
            >
              <Github className="h-4 w-4" />
              {t("marketing.ctaGithub")}
            </a>
          </div>

          {/* Terminal preview */}
          <div className="mt-16 mx-auto max-w-3xl">
            <div className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm shadow-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-muted/30">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider ml-2">
                  {t("marketing.terminalTitle")}
                </span>
              </div>
              <div className="p-6 sm:p-8 font-mono text-xs sm:text-sm space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[2px] text-muted-foreground mb-1">{t("marketing.terminalPatrimony")}</p>
                    <p className="text-lg font-bold tabular-nums">127.450,32 &euro;</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[2px] text-muted-foreground mb-1">{t("marketing.terminalPnl")}</p>
                    <p className="text-lg font-bold tabular-nums text-green-500">+12.340,18 &euro;</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[2px] text-muted-foreground mb-1">{t("marketing.terminalDividends")}</p>
                    <p className="text-lg font-bold tabular-nums">3.210,50 &euro;</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[2px] text-muted-foreground mb-1">{t("marketing.terminalInterests")}</p>
                    <p className="text-lg font-bold tabular-nums">891,20 &euro;</p>
                  </div>
                </div>
                <div className="border-t border-border/30" />
                <div className="space-y-2">
                  <div className="grid grid-cols-4 text-[10px] uppercase tracking-[2px] text-muted-foreground">
                    <span>{t("marketing.terminalAsset")}</span>
                    <span className="text-right">{t("marketing.terminalPrice")}</span>
                    <span className="text-right">{t("marketing.terminalValue")}</span>
                    <span className="text-right">{t("marketing.terminalPnl")}</span>
                  </div>
                  {[
                    { name: "MSCI World", price: "89,42", value: "45.120,00", pnl: "+8.230,12", positive: true },
                    { name: "S&P 500", price: "532,18", value: "26.609,00", pnl: "+3.105,40", positive: true },
                    { name: "BBVA", price: "11,85", value: "11.850,00", pnl: "+1.240,00", positive: true },
                    { name: "Bitcoin", price: "62.450", value: "6.245,00", pnl: "-380,50", positive: false },
                  ].map((row) => (
                    <div key={row.name} className="grid grid-cols-4 py-1.5 border-b border-border/10">
                      <span className="text-foreground font-medium">{row.name}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{row.price}</span>
                      <span className="text-right tabular-nums">{row.value}</span>
                      <span className={`text-right tabular-nums ${row.positive ? "text-green-500" : "text-red-500"}`}>
                        {row.pnl}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tech Stack ── */}
      <section className="py-16 border-t border-border/30">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <p className="text-center font-mono text-[10px] uppercase tracking-[3px] text-muted-foreground mb-8">
            {t("marketing.techTitle")}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            {techStack.map((tech) => (
              <div key={tech.name} className="flex flex-col items-center gap-1">
                <span className="text-sm font-medium text-foreground/80">{tech.name}</span>
                <span className="font-mono text-[9px] uppercase tracking-[2px] text-muted-foreground">
                  {tech.category}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 mb-6">
              <span className="font-mono text-[10px] tracking-[2px] uppercase text-primary">
                {t("marketing.featuresTag")}
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {t("marketing.featuresTitle")}{" "}
              <span className="bg-gradient-to-r from-[#1d4ed8] to-[#60a5fa] bg-clip-text text-transparent">
                {t("marketing.featuresTitleHighlight")}
              </span>
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              {t("marketing.featuresSubtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureKeys.map((feature) => (
              <div
                key={feature.titleKey}
                className="group relative rounded-xl border border-border/50 bg-card/50 p-6 hover:border-primary/25 hover:bg-card/80 transition-all duration-300"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold mb-2">{t(feature.titleKey)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(feature.descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="relative py-24 sm:py-32 border-t border-border/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(59,130,246,0.08),transparent_70%)]" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 mb-6">
              <span className="font-mono text-[10px] tracking-[2px] uppercase text-primary">
                {t("marketing.stepsTag")}
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {t("marketing.stepsTitle1")}{" "}
              <span className="bg-gradient-to-r from-[#1d4ed8] to-[#60a5fa] bg-clip-text text-transparent">
                {t("marketing.stepsTitle2")}
              </span>{" "}
              {t("marketing.stepsTitle3")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {stepKeys.map((step) => (
              <div
                key={step.number}
                className="relative rounded-xl border border-border/50 bg-card/50 p-6 hover:border-primary/25 transition-all duration-300"
              >
                <div className="flex items-start gap-4">
                  <span className="font-mono text-3xl font-bold text-primary/20">
                    {step.number}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold mb-2">{t(step.titleKey)}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                      {t(step.descKey)}
                    </p>
                    <div className="inline-flex items-center rounded-md bg-muted/50 border border-border/50 px-3 py-1.5">
                      <code className="font-mono text-xs text-primary">{step.code}</code>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Open Source ── */}
      <section id="open-source" className="relative py-24 sm:py-32 border-t border-border/30">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-2xl border border-border/50 bg-card/50 p-8 sm:p-12 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(59,130,246,0.1),transparent_70%)]" />

            <div className="relative text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-6">
                <Lock className="h-7 w-7" />
              </div>

              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                {t("marketing.openSourceTitle1")}{" "}
                <span className="bg-gradient-to-r from-[#1d4ed8] to-[#60a5fa] bg-clip-text text-transparent">
                  {t("marketing.openSourceTitle2")}
                </span>
              </h2>

              <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-8">
                {t("marketing.openSourceDesc")}
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-primary" />
                  <span>{t("marketing.openSourceDocker")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span>{t("marketing.openSourceNoTracking")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <span>{t("marketing.openSourceUpdates")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative py-24 sm:py-32 border-t border-border/30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.12),transparent_70%)]" />

        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            {t("marketing.ctaTitle1")}{" "}
            <span className="bg-gradient-to-r from-[#1d4ed8] to-[#60a5fa] bg-clip-text text-transparent">
              {t("marketing.ctaTitle2")}
            </span>
          </h2>
          <p className="text-lg text-muted-foreground mb-10">
            {t("marketing.ctaSubtitle")}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-md text-base font-medium h-12 px-8 bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] text-white hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_4px_24px_rgba(59,130,246,0.4)] transition-all"
            >
              {t("marketing.ctaCreate")} <ChevronRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/Gonzalez8/fintrack"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md text-base font-medium h-12 px-8 border border-border hover:bg-accent transition-colors"
            >
              <Github className="h-4 w-4" />
              {t("marketing.ctaSource")}
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/30 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6]">
                <TrendingUp className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-mono text-xs font-bold tracking-[2px] uppercase text-muted-foreground">
                Fintrack
              </span>
            </div>
            <p className="font-mono text-[10px] tracking-[1px] text-muted-foreground">
              {t("marketing.footerLicense")}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
