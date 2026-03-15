"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n/use-translations";
import { MonthlySavingsTab } from "./tabs/monthly-savings-tab";
import { AnnualSavingsTab } from "./tabs/annual-savings-tab";
import { SavingsGoalsTab } from "./tabs/savings-goals-tab";

export function SavingsContent() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{t("savings.title")}</h1>

      <Tabs defaultValue={0}>
        <TabsList>
          <TabsTrigger value={0}>{t("savings.tabMonthly")}</TabsTrigger>
          <TabsTrigger value={1}>{t("savings.tabAnnual")}</TabsTrigger>
          <TabsTrigger value={2}>{t("savings.tabGoals")}</TabsTrigger>
        </TabsList>
        <TabsContent value={0} className="pt-4">
          <MonthlySavingsTab />
        </TabsContent>
        <TabsContent value={1} className="pt-4">
          <AnnualSavingsTab />
        </TabsContent>
        <TabsContent value={2} className="pt-4">
          <SavingsGoalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
