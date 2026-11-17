"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslations } from "@/i18n/use-translations";
import { PropertiesTab } from "./tabs/properties-tab";
import { RentalTab } from "./tabs/rental-tab";

export function PropertiesContent() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">{t("properties.title")}</h1>
      <Tabs defaultValue={0}>
        <TabsList>
          <TabsTrigger value={0}>{t("properties.tabProperties")}</TabsTrigger>
          <TabsTrigger value={1}>{t("properties.tabRental")}</TabsTrigger>
        </TabsList>
        <TabsContent value={0} className="pt-4">
          <PropertiesTab />
        </TabsContent>
        <TabsContent value={1} className="pt-4">
          <RentalTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
