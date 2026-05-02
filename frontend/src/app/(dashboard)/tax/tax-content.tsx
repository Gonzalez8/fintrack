"use client";

import { useState } from "react";

import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n/use-translations";

import { FinancialAnalysisTab } from "./financial-analysis-tab";
import { RentaModeTab } from "./renta-mode-tab";

export function TaxContent() {
  const t = useTranslations();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

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
          <TabsTrigger value={1}>{t("fiscal.tab.renta")}</TabsTrigger>
        </TabsList>
        <TabsContent value={0} className="pt-4">
          <FinancialAnalysisTab year={year} />
        </TabsContent>
        <TabsContent value={1} className="pt-4">
          <RentaModeTab year={year} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
