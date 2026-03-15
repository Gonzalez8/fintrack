"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, ChevronRight } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SwipeCard } from "@/components/app/swipe-card";
import { formatMoney } from "@/lib/utils";
import { useTranslations } from "@/i18n/use-translations";
import { GoalFormDialog, getGoalIcon } from "@/components/app/goal-form-dialog";
import { ProjectionCard } from "@/components/app/projection-card";
import type { SavingsGoal, SavingsProjection } from "@/types";

interface GoalsResponse {
  count: number;
  results: SavingsGoal[];
}

export function SavingsGoalsTab() {
  const t = useTranslations();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<SavingsGoal | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["savings-goals"],
    queryFn: () => api.get<GoalsResponse>("/savings-goals/"),
    staleTime: 5 * 60_000,
  });

  const { data: projection, isLoading: loadingProjection } = useQuery({
    queryKey: ["savings-projection", selectedGoalId],
    queryFn: () =>
      api.get<SavingsProjection>(`/savings-goals/${selectedGoalId}/projection/`),
    enabled: !!selectedGoalId,
    staleTime: 2 * 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/savings-goals/${id}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["savings-goals"] });
      if (selectedGoalId) {
        setSelectedGoalId(null);
      }
    },
  });

  const goals = data?.results ?? [];

  const handleEdit = (goal: SavingsGoal) => {
    setEditGoal(goal);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditGoal(null);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(t("savings.deleteGoalConfirm"))) {
      deleteMutation.mutate(id);
    }
  };

  const handleSelect = (goal: SavingsGoal) => {
    setSelectedGoalId(selectedGoalId === goal.id ? null : goal.id);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-muted-foreground text-sm">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          {t("savings.goals")}
        </p>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-1" />
          {t("savings.createGoal")}
        </Button>
      </div>

      {/* Empty state */}
      {goals.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            {t("savings.noGoals")}
          </CardContent>
        </Card>
      )}

      {/* Mobile: SwipeCard list */}
      <div className="sm:hidden space-y-2">
        {goals.map((goal) => {
          const Icon = getGoalIcon(goal.icon);
          const isSelected = selectedGoalId === goal.id;
          return (
            <SwipeCard
              key={goal.id}
              onTap={() => handleSelect(goal)}
              onEdit={() => handleEdit(goal)}
              onDelete={() => handleDelete(goal.id)}
              accentColor="border-l-amber-500"
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{goal.name}</span>
                </div>
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${
                    isSelected ? "rotate-90" : ""
                  }`}
                />
              </div>
              <div className="font-mono text-lg font-bold tabular-nums">
                {formatMoney(goal.target_amount)}
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-muted-foreground">
                <span>{t(`savings.baseType.${goal.base_type}`)}</span>
                {goal.deadline && (
                  <span>{t("savings.deadline")}: {goal.deadline}</span>
                )}
              </div>
            </SwipeCard>
          );
        })}
      </div>

      {/* Desktop: Card grid with inline actions */}
      <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {goals.map((goal) => {
          const Icon = getGoalIcon(goal.icon);
          const isSelected = selectedGoalId === goal.id;
          return (
            <Card
              key={goal.id}
              className={`cursor-pointer transition-colors hover:border-primary/50 ${
                isSelected ? "border-primary bg-primary/5" : ""
              }`}
              onClick={() => handleSelect(goal)}
            >
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold text-sm">{goal.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(goal);
                      }}
                      className="p-1 rounded hover:bg-secondary transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(goal.id);
                      }}
                      className="p-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="font-mono text-lg font-bold tabular-nums mb-1">
                  {formatMoney(goal.target_amount)}
                </div>
                <p className="text-[11px] font-mono text-muted-foreground mb-1">
                  {t(`savings.baseType.${goal.base_type}`)}
                </p>
                {goal.deadline && (
                  <p className="text-xs font-mono text-muted-foreground">
                    {t("savings.deadline")}: {goal.deadline}
                  </p>
                )}
                <div className="flex items-center justify-end mt-2">
                  <ChevronRight
                    className={`h-4 w-4 text-muted-foreground transition-transform ${
                      isSelected ? "rotate-90" : ""
                    }`}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Projection panel */}
      {selectedGoalId && (
        <div className="mt-6">
          <p className="font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground mb-3">
            {t("savings.projection")}
          </p>
          {loadingProjection ? (
            <div className="flex min-h-[100px] items-center justify-center text-muted-foreground text-sm">
              {t("common.loading")}
            </div>
          ) : projection ? (
            <ProjectionCard projection={projection} />
          ) : null}
        </div>
      )}

      {/* Form dialog */}
      <GoalFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        goal={editGoal}
      />
    </div>
  );
}
