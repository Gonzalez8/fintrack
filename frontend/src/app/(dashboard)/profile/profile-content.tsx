"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { UserCircle, CheckCircle } from "lucide-react";
import { useTranslations } from "@/i18n/use-translations";
import type { ProfileData, ChangePasswordData } from "@/types";

// ---------------------------------------------------------------------------
// Profile card — view/edit toggle like v1
// ---------------------------------------------------------------------------
function ProfileCard() {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<ProfileData>("/auth/profile/"),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const updateMut = useMutation({
    mutationFn: (data: { username: string; email: string }) =>
      api.put("/auth/profile/", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: Record<string, string[]> } })
        ?.response?.data;
      if (data && typeof data === "object") {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          flat[k] = Array.isArray(v) ? v[0] : String(v);
        }
        setErrors(flat);
      }
    },
  });

  const startEditing = () => {
    setForm({
      username: profile?.username ?? "",
      email: profile?.email ?? "",
    });
    setErrors({});
    setEditing(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    updateMut.mutate(form);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCircle className="h-4 w-4 text-primary" />
          {t("profile.accountInfo")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[120px_1fr] gap-2 text-sm">
              <span className="text-muted-foreground">
                {t("common.username")}
              </span>
              <span className="font-mono font-medium">
                {profile?.username}
              </span>
              <span className="text-muted-foreground">
                {t("common.email")}
              </span>
              <span>
                {profile?.email || (
                  <span className="text-muted-foreground italic">
                    {t("profile.noEmail")}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">
                {t("profile.memberSince")}
              </span>
              <span>
                {profile?.date_joined
                  ? new Date(profile.date_joined).toLocaleDateString(
                      undefined,
                      {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      },
                    )
                  : "—"}
              </span>
              {profile?.id && (
                <>
                  <span className="text-muted-foreground">
                    {t("profile.userId")}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {profile.id}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={startEditing}>
                {t("profile.editProfile")}
              </Button>
              {saved && (
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <CheckCircle className="h-3 w-3" /> {t("profile.saved")}
                </span>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 max-w-sm">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("common.username")}
              </label>
              <Input
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                autoFocus
              />
              {errors.username && (
                <p className="text-xs text-destructive">{errors.username}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {t("common.email")}
              </label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder={t("common.emailPlaceholder")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={updateMut.isPending}
              >
                {updateMut.isPending
                  ? t("profile.saving")
                  : t("common.save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Change password card
// ---------------------------------------------------------------------------
function ChangePasswordCard() {
  const t = useTranslations();
  const [form, setForm] = useState<ChangePasswordData>({
    old_password: "",
    new_password: "",
    new_password2: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const changeMut = useMutation({
    mutationFn: (data: ChangePasswordData) =>
      api.post("/auth/change-password/", data),
    onSuccess: () => {
      setForm({ old_password: "", new_password: "", new_password2: "" });
      setErrors({});
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    },
    onError: (err: unknown) => {
      const data = (
        err as { response?: { data?: Record<string, string | string[]> } }
      )?.response?.data;
      if (data && typeof data === "object") {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          flat[k] = Array.isArray(v) ? v[0] : String(v);
        }
        setErrors(flat);
      } else {
        setErrors({ non_field_errors: t("profile.passwordError") });
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    changeMut.mutate(form);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("profile.changePassword")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("profile.currentPassword")}
            </label>
            <Input
              type="password"
              value={form.old_password}
              onChange={(e) =>
                setForm((f) => ({ ...f, old_password: e.target.value }))
              }
            />
            {errors.current_password && (
              <p className="text-xs text-destructive">
                {errors.current_password}
              </p>
            )}
            {errors.old_password && (
              <p className="text-xs text-destructive">
                {errors.old_password}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("profile.newPassword")}
            </label>
            <Input
              type="password"
              value={form.new_password}
              onChange={(e) =>
                setForm((f) => ({ ...f, new_password: e.target.value }))
              }
            />
            {errors.new_password && (
              <p className="text-xs text-destructive">
                {errors.new_password}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t("profile.confirmNewPassword")}
            </label>
            <Input
              type="password"
              value={form.new_password2}
              onChange={(e) =>
                setForm((f) => ({ ...f, new_password2: e.target.value }))
              }
            />
            {errors.new_password2 && (
              <p className="text-xs text-destructive">
                {errors.new_password2}
              </p>
            )}
          </div>
          {errors.non_field_errors && (
            <p className="text-sm text-destructive">
              {errors.non_field_errors}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={changeMut.isPending}
            >
              {changeMut.isPending
                ? t("profile.saving")
                : t("profile.changePassword")}
            </Button>
            {success && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <CheckCircle className="h-3 w-3" />{" "}
                {t("profile.passwordUpdated")}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function ProfileContent() {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-lg font-semibold">{t("profile.title")}</h1>
      <ProfileCard />
      <ChangePasswordCard />
    </div>
  );
}
