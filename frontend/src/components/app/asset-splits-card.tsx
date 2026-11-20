"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Pencil, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SwipeCard } from "@/components/app/swipe-card";
import { DetailDrawer } from "@/components/app/detail-drawer";
import { useTranslations } from "@/i18n/use-translations";
import { formatSplitDate, formatSplitRatio, useSplitsChanged } from "@/lib/splits";
import type { Asset, PaginatedResponse, StockSplit, StockSplitStatus } from "@/types";

const STATUS_KEYS: Record<StockSplitStatus, string> = {
  PENDING: "splits.statusPending",
  APPLIED: "splits.statusApplied",
  DISMISSED: "splits.statusDismissed",
};

const STATUS_VARIANTS: Record<StockSplitStatus, "default" | "secondary" | "outline"> = {
  PENDING: "secondary",
  APPLIED: "default",
  DISMISSED: "outline",
};

const EMPTY_FORM = { date: "", ratio_to: "", ratio_from: "1" };

/** Split history of one asset: review detected splits and record them manually. */
export function AssetSplitsCard({ asset }: { asset: Asset }) {
  const t = useTranslations();
  const onChanged = useSplitsChanged();

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StockSplit | null>(null);

  const { data } = useQuery({
    queryKey: ["splits", "asset", asset.id],
    queryFn: () => api.get<PaginatedResponse<StockSplit>>(`/splits/?asset_id=${asset.id}`),
  });
  const splits = data?.results ?? [];

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = { asset: asset.id, ...form };
      return editingId ? api.patch(`/splits/${editingId}/`, payload) : api.post("/splits/", payload);
    },
    onSuccess: () => {
      toast.success(t("splits.saved"));
      resetForm();
      onChanged();
    },
    onError: (err) => {
      const duplicate = err instanceof ApiClientError && err.status === 400 && err.body.includes("already exists");
      toast.error(t(duplicate ? "splits.duplicateError" : "splits.saveError"));
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "apply" | "dismiss" }) => api.post(`/splits/${id}/${action}/`),
    onSuccess: onChanged,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/splits/${id}/`),
    onSuccess: onChanged,
  });

  const detectMut = useMutation({
    mutationFn: () => api.post<{ created: StockSplit[] }>("/splits/detect/"),
    onSuccess: (res) => {
      const found = res.created.filter((s) => s.asset === asset.id).length;
      if (found > 0) toast.success(t("splits.detectFound", { count: found }));
      else toast(t("splits.detectNone"));
      onChanged();
    },
    onError: () => toast.error(t("splits.detectError")),
  });

  const startEdit = (s: StockSplit) => {
    setEditingId(s.id);
    setForm({ date: s.date, ratio_to: String(Number(s.ratio_to)), ratio_from: String(Number(s.ratio_from)) });
  };

  const confirmDelete = (s: StockSplit) => {
    if (confirm(t("splits.confirmDelete"))) deleteMut.mutate(s.id);
  };

  const canDetect = Boolean(asset.ticker) && asset.price_mode === "AUTO";
  const canSave =
    Boolean(form.date) && Number(form.ratio_to) > 0 && Number(form.ratio_from) > 0 && form.ratio_to !== form.ratio_from;

  const statusActions = (s: StockSplit) =>
    s.status !== "APPLIED" && (
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7"
          disabled={statusMut.isPending}
          onClick={(e) => {
            e.stopPropagation();
            statusMut.mutate({ id: s.id, action: "apply" });
          }}
        >
          {t("splits.apply")}
        </Button>
        {s.status === "PENDING" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={statusMut.isPending}
            onClick={(e) => {
              e.stopPropagation();
              statusMut.mutate({ id: s.id, action: "dismiss" });
            }}
          >
            {t("splits.dismiss")}
          </Button>
        )}
      </div>
    );

  const summary = (s: StockSplit) => (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-mono font-semibold">{formatSplitRatio(s)}</span>
      <span className="text-muted-foreground">{formatSplitDate(s.date)}</span>
      <Badge variant={STATUS_VARIANTS[s.status]}>{t(STATUS_KEYS[s.status])}</Badge>
      {s.source === "AUTO" && <span className="text-xs text-muted-foreground">{t("splits.sourceAuto")}</span>}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {t("splits.title")}
        </CardTitle>
        {canDetect && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={detectMut.isPending}
            onClick={() => detectMut.mutate()}
          >
            <Search className="h-3.5 w-3.5" />
            {detectMut.isPending ? t("common.loading") : t("splits.detect")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("splits.help")}</p>

        {splits.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("splits.empty")}</p>
        ) : (
          <>
            {/* Mobile: swipe for edit/delete, tap for details */}
            <div className="space-y-2 sm:hidden">
              {splits.map((s) => (
                <SwipeCard
                  key={s.id}
                  onTap={() => setDetail(s)}
                  onEdit={() => startEdit(s)}
                  onDelete={() => confirmDelete(s)}
                  accentColor="border-l-amber-500"
                >
                  <div className="space-y-2 p-3">
                    {summary(s)}
                    {statusActions(s)}
                  </div>
                </SwipeCard>
              ))}
            </div>

            {/* Desktop: inline actions on hover */}
            <ul className="hidden divide-y divide-border rounded-md border border-border sm:block">
              {splits.map((s) => (
                <li key={s.id} className="group flex items-center justify-between gap-3 px-3 py-2">
                  {summary(s)}
                  <div className="flex items-center gap-2">
                    {statusActions(s)}
                    <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => confirmDelete(s)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Add / edit form */}
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">{editingId ? t("splits.editTitle") : t("splits.addTitle")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_auto] sm:items-end sm:justify-start">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("splits.date")}</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("splits.ratioLabel")}</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="4"
                  aria-label={t("splits.newShares")}
                  className="w-20"
                  value={form.ratio_to}
                  onChange={(e) => setForm((f) => ({ ...f, ratio_to: e.target.value }))}
                />
                <span className="font-mono text-muted-foreground">:</span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="1"
                  aria-label={t("splits.oldShares")}
                  className="w-20"
                  value={form.ratio_from}
                  onChange={(e) => setForm((f) => ({ ...f, ratio_from: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("splits.ratioHelp")}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={!canSave || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? t("common.loading") : t("common.save")}
            </Button>
            {editingId && (
              <Button size="sm" variant="ghost" onClick={resetForm}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      {detail && (
        <DetailDrawer
          open
          onOpenChange={(v) => {
            if (!v) setDetail(null);
          }}
          title={`${asset.name || asset.ticker} · ${formatSplitRatio(detail)}`}
          subtitle={formatSplitDate(detail.date)}
          rows={[
            { label: t("splits.ratioLabel"), value: formatSplitRatio(detail) },
            { label: t("splits.date"), value: formatSplitDate(detail.date) },
            { label: t("splits.status"), value: t(STATUS_KEYS[detail.status]) },
            {
              label: t("splits.source"),
              value: t(detail.source === "AUTO" ? "splits.sourceAuto" : "splits.sourceManual"),
            },
          ]}
        />
      )}
    </Card>
  );
}
