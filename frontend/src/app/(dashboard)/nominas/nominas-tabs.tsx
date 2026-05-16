"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n/use-translations";
import { NominasContent } from "./nominas-content";
import { PayrollAnalyticsTab } from "./payroll-analytics-tab";

export function NominasTabs() {
  const t = useTranslations();

  return (
    <Tabs defaultValue={0}>
      <TabsList>
        <TabsTrigger value={0}>{t("payroll.tab.list")}</TabsTrigger>
        <TabsTrigger value={1}>{t("payroll.tab.evolution")}</TabsTrigger>
      </TabsList>
      <TabsContent value={0} className="pt-4">
        <NominasContent />
      </TabsContent>
      <TabsContent value={1} className="pt-4">
        <PayrollAnalyticsTab />
      </TabsContent>
    </Tabs>
  );
}
