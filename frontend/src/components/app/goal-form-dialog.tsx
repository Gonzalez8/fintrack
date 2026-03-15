"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { useTranslations } from "@/i18n/use-translations";
import type { SavingsGoal } from "@/types";
import {
  Target,
  Home,
  Car,
  Umbrella,
  GraduationCap,
  Plane,
  PiggyBank,
  Landmark,
  Wallet,
} from "lucide-react";

const ICONS = [
  { value: "target", Icon: Target },
  { value: "house", Icon: Home },
  { value: "car", Icon: Car },
  { value: "umbrella", Icon: Umbrella },
  { value: "graduation-cap", Icon: GraduationCap },
  { value: "plane", Icon: Plane },
  { value: "piggy-bank", Icon: PiggyBank },
] as const;

export function getGoalIcon(icon: string) {
  const found = ICONS.find((i) => i.value === icon);
  return found ? found.Icon : Target;
}

const BASE_TYPE_OPTIONS = [
  { value: "PATRIMONY" as const, Icon: Landmark },
  { value: "CASH" as const, Icon: Wallet },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: SavingsGoal | null;
}

export function GoalFormDialog({ open, onOpenChange, goal }: Props) {
  const t = useTranslations();
  const qc = useQueryClient();
  const isEdit = !!goal;

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [baseType, setBaseType] = useState<"PATRIMONY" | "CASH">("PATRIMONY");
  const [deadline, setDeadline] = useState("");
  const [icon, setIcon] = useState("target");

  useEffect(() => {
    if (open) {
      if (goal) {
        setName(goal.name);
        setTargetAmount(goal.target_amount);
        setBaseType(goal.base_type);
        setDeadline(goal.deadline ?? "");
        setIcon(goal.icon || "target");
      } else {
        setName("");
        setTargetAmount("");
        setBaseType("PATRIMONY");
        setDeadline("");
        setIcon("target");
      }
    }
  }, [open, goal]);

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      isEdit
        ? api.put(`/savings-goals/${goal!.id}/`, data)
        : api.post("/savings-goals/", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["savings-goals"] });
      qc.invalidateQueries({ queryKey: ["savings-projection"] });
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name,
      target_amount: targetAmount,
      base_type: baseType,
      deadline: deadline || null,
      icon,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("savings.editGoal") : t("savings.createGoal")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-name">{t("savings.goalName")}</Label>
            <Input
              id="goal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-target">{t("savings.targetAmount")}</Label>
            <Input
              id="goal-target"
              type="number"
              step="0.01"
              min="0"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t("savings.baseTypeLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {BASE_TYPE_OPTIONS.map(({ value, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBaseType(value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm transition-colors ${
                    baseType === value
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{t(`savings.baseType.${value}`)}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t(`savings.baseTypeHint.${baseType}`)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-deadline">{t("savings.deadline")}</Label>
            <Input
              id="goal-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("savings.icon")}</Label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map(({ value, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setIcon(value)}
                  className={`p-2 rounded-md border transition-colors ${
                    icon === value
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {isEdit ? t("common.save") : t("savings.createGoal")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
