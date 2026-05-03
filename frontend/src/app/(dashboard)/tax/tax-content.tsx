"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n/use-translations";
import { api } from "@/lib/api-client";
import type { Settings } from "@/types";

import { getTaxAdapter } from "./adapters";
import { FinancialAnalysisTab } from "./financial-analysis-tab";

export function TaxContent() {
  const t = useTranslations();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<Settings>("/settings/"),
    staleTime: 5 * 60 * 1000,
  });
  const taxCountry = (settings?.tax_country ?? "ES").toUpperCase();
  const Adapter = getTaxAdapter(taxCountry);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t("fiscal.title")}</h1>
        <Select value={year} onValueChange={(v) => v && setYear(v)}>
          <SelectTrigger className="w-24 font-mono">
            <span data-slot="select-value">{year}</span>
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)} className="font-mono">
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue={0}>
        <TabsList>
          <TabsTrigger value={0}>{t("fiscal.tab.financial")}</TabsTrigger>
          {Adapter && (
            <TabsTrigger value={1}>
              {t("fiscal.tab.renta")} · {taxCountry}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value={0} className="pt-4">
          <FinancialAnalysisTab year={year} />
        </TabsContent>
        {Adapter && (
          <TabsContent value={1} className="pt-4">
            <Adapter year={year} />
          </TabsContent>
        )}
      </Tabs>

      {!Adapter && settings && (
        <p className="text-xs text-muted-foreground">
          {t("fiscal.adapterUnavailable", { country: taxCountry })}
        </p>
      )}
    </div>
  );
}
