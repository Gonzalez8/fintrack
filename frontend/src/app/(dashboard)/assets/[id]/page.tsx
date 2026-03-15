"use client";

import { use, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MoneyCell } from "@/components/app/money-cell";
import { ArrowLeft, Pencil, X, Check } from "lucide-react";
import { ASSET_TYPE_KEYS, ASSET_TYPE_BADGE_COLORS } from "@/lib/constants";
import { useTranslations } from "@/i18n/use-translations";
import { cn } from "@/lib/utils";
import type { Asset } from "@/types";

const PriceChart = dynamic(
  () =>
    import("@/components/app/price-chart").then((m) => ({
      default: m.PriceChart,
    })),
  { ssr: false },
);

export default function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Asset>>({});
  const [saved, setSaved] = useState(false);
  const [manualPrice, setManualPrice] = useState("");
  const [priceSaved, setPriceSaved] = useState(false);

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api.get<Asset>(`/assets/${id}/`),
  });

  useEffect(() => {
    if (asset) {
      setForm({
        name: asset.name,
        ticker: asset.ticker,
        isin: asset.isin,
        type: asset.type,
        currency: asset.currency,
        price_mode: asset.price_mode,
        issuer_country: asset.issuer_country,
        domicile_country: asset.domicile_country,
        withholding_country: asset.withholding_country,
      });
    }
  }, [asset]);

  const updateMut = useMutation({
    mutationFn: (data: Partial<Asset>) =>
      api.patch(`/assets/${id}/`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const setPriceMut = useMutation({
    mutationFn: (price: string) =>
      api.post(`/assets/${id}/set-price/`, { price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["asset", id] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      setManualPrice("");
      setPriceSaved(true);
      setTimeout(() => setPriceSaved(false), 3000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }
  if (!asset) return null;

  const statusVariant =
    asset.price_status === "OK"
      ? ("default" as const)
      : asset.price_status === "ERROR"
        ? ("destructive" as const)
        : ("secondary" as const);

  const badgeColor = ASSET_TYPE_BADGE_COLORS[asset.type] ?? "";

  const resetFormFromAsset = () => {
    setForm({
      name: asset.name,
      ticker: asset.ticker,
      isin: asset.isin,
      type: asset.type,
      currency: asset.currency,
      price_mode: asset.price_mode,
      issuer_country: asset.issuer_country,
      domicile_country: asset.domicile_country,
      withholding_country: asset.withholding_country,
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 -ml-2 h-9 w-9 p-0 sm:w-auto sm:px-3"
            onClick={() => router.push("/assets")}
          >
            <ArrowLeft className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">{t("assets.title")}</span>
          </Button>
          <h1 className="text-base sm:text-lg font-semibold truncate">{asset.name}</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0 sm:w-auto sm:px-3"
                onClick={() => { setEditing(false); resetFormFromAsset(); }}
              >
                <X className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">{t("common.cancel")}</span>
              </Button>
              <Button
                size="sm"
                className="h-9 w-9 p-0 sm:w-auto sm:px-3"
                onClick={() => updateMut.mutate(form)}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? (
                  <span className="hidden sm:inline">{t("common.loading")}</span>
                ) : (
                  <>
                    <Check className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">{t("common.save")}</span>
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-9 p-0 sm:w-auto sm:px-3"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">{t("common.edit")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── View mode ── */}
      {!editing && (
        <div className="space-y-4 sm:space-y-6">
          {/* Identity badges */}
          <div className="flex flex-wrap items-center gap-2">
            {asset.ticker && (
              <span className="font-mono text-base sm:text-lg font-bold text-primary">
                {asset.ticker}
              </span>
            )}
            <Badge
              variant="secondary"
              className={cn(badgeColor)}
            >
              {t(ASSET_TYPE_KEYS[asset.type]) || asset.type}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs">
              {asset.currency}
            </Badge>
            {saved && (
              <span className="text-sm text-green-600 ml-2">
                {t("common.save")} OK
              </span>
            )}
          </div>

          {/* Price chart — full-bleed on mobile */}
          <div className="-mx-4 sm:mx-0 rounded-none sm:rounded-lg border-y sm:border border-border overflow-hidden">
            <PriceChart assetId={id} ticker={asset.ticker} />
          </div>

          {/* Price + Fiscal cards — stack on mobile */}
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            {/* Price card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
                  {t("portfolio.currentPrice")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-y-4 gap-x-4 sm:gap-x-6">
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      {t("portfolio.currentPrice")}
                    </p>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums">
                      <MoneyCell value={asset.current_price} className="text-xl sm:text-2xl" />
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      {t("assets.priceMode")}
                    </p>
                    <p className="text-sm font-medium">{asset.price_mode}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      {t("assets.priceSource")}
                    </p>
                    <p className="text-sm">{asset.price_source ?? "-"}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      Status
                    </p>
                    {asset.price_status ? (
                      <Badge variant={statusVariant}>
                        {asset.price_status}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      Updated
                    </p>
                    <p className="text-sm">
                      {asset.price_updated_at
                        ? new Date(asset.price_updated_at).toLocaleDateString(
                            "es-ES",
                            {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )
                        : "-"}
                    </p>
                  </div>
                </div>

                {asset.price_mode === "MANUAL" && (
                  <div className="border-t mt-4 pt-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      Manual price update
                    </p>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        step="any"
                        placeholder={
                          asset.current_price ?? t("portfolio.currentPrice")
                        }
                        value={manualPrice}
                        onChange={(e) => setManualPrice(e.target.value)}
                        className="flex-1 max-w-[200px]"
                      />
                      <Button
                        onClick={() => setPriceMut.mutate(manualPrice)}
                        disabled={!manualPrice || setPriceMut.isPending}
                        size="sm"
                        className="h-9 min-w-[72px]"
                      >
                        {setPriceMut.isPending
                          ? t("common.loading")
                          : t("common.save")}
                      </Button>
                    </div>
                    {priceSaved && (
                      <p className="mt-2 text-sm text-green-600">
                        Price updated
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fiscal data card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
                  {t("nav.fiscal")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      {t("assets.isin")}
                    </p>
                    <p className="text-sm font-mono">{asset.isin ?? "-"}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      {t("assets.issuerCountry")}
                    </p>
                    <p className="text-sm font-mono">
                      {asset.issuer_country ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      {t("assets.domicileCountry")}
                    </p>
                    <p className="text-sm font-mono">
                      {asset.domicile_country ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      {t("assets.withholdingCountry")}
                    </p>
                    <p className="text-sm font-mono">
                      {asset.withholding_country ?? "-"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[9px] tracking-[1.5px] uppercase text-muted-foreground mb-1">
                      {t("common.currency")}
                    </p>
                    <p className="text-sm font-mono">{asset.currency}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── Edit mode ── */}
      {editing && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("assets.edit")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium">
                      {t("common.name")}
                    </label>
                    <Input
                      value={form.name ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                    <div>
                      <label className="text-sm font-medium">
                        {t("assets.ticker")}
                      </label>
                      <Input
                        value={form.ticker ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            ticker: e.target.value || "",
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        {t("assets.isin")}
                      </label>
                      <Input
                        value={form.isin ?? ""}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setForm((f) => {
                            const updated: Partial<Asset> = {
                              ...f,
                              isin: val,
                            };
                            if (val && val.length >= 2 && !f.issuer_country) {
                              updated.issuer_country = val.slice(0, 2);
                            }
                            return updated;
                          });
                        }}
                        maxLength={12}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        {t("common.currency")}
                      </label>
                      <Input
                        value={form.currency ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            currency: e.target.value.toUpperCase(),
                          }))
                        }
                        maxLength={3}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 grid-cols-2">
                    <div>
                      <label className="text-sm font-medium">
                        {t("common.type")}
                      </label>
                      <Select
                        value={form.type}
                        onValueChange={(v) =>
                          v && setForm((f) => ({
                            ...f,
                            type: v as Asset["type"],
                          }))
                        }
                      >
                        <SelectTrigger>
                          <span data-slot="select-value">{(form.type && t(ASSET_TYPE_KEYS[form.type])) || form.type}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ASSET_TYPE_KEYS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {t(v)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        {t("assets.priceMode")}
                      </label>
                      <Select
                        value={form.price_mode}
                        onValueChange={(v) =>
                          v && setForm((f) => ({
                            ...f,
                            price_mode: v as Asset["price_mode"],
                          }))
                        }
                      >
                        <SelectTrigger>
                          <span data-slot="select-value">{form.price_mode === "AUTO" ? "Auto" : "Manual"}</span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MANUAL">Manual</SelectItem>
                          <SelectItem value="AUTO">Auto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("nav.fiscal")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div>
                    <label className="text-sm font-medium">
                      {t("assets.issuerCountry")} (ISO)
                    </label>
                    <Input
                      value={form.issuer_country ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          issuer_country:
                            e.target.value.toUpperCase(),
                        }))
                      }
                      maxLength={2}
                      placeholder="ES"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      {t("assets.domicileCountry")}
                    </label>
                    <Input
                      value={form.domicile_country ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          domicile_country:
                            e.target.value.toUpperCase(),
                        }))
                      }
                      maxLength={2}
                      placeholder="IE"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      {t("assets.withholdingCountry")}
                    </label>
                    <Input
                      value={form.withholding_country ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          withholding_country:
                            e.target.value.toUpperCase(),
                        }))
                      }
                      maxLength={2}
                      placeholder="US"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {asset.price_mode === "MANUAL" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Manual price</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    step="any"
                    placeholder={
                      asset.current_price ?? t("portfolio.currentPrice")
                    }
                    value={manualPrice}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className="flex-1 max-w-[200px]"
                  />
                  <Button
                    onClick={() => setPriceMut.mutate(manualPrice)}
                    disabled={!manualPrice || setPriceMut.isPending}
                    size="sm"
                    className="h-9 min-w-[72px]"
                  >
                    {setPriceMut.isPending
                      ? t("common.loading")
                      : t("common.save")}
                  </Button>
                </div>
                {priceSaved && (
                  <p className="mt-2 text-sm text-green-600">Price updated</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
