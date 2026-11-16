"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useTranslations } from "@/i18n/use-translations";
import { uiLocale } from "@/lib/utils";
import type { ApiToken, ApiTokenScope, PaginatedResponse } from "@/types";

/** MCP package pinned to this Fintrack release, so the installed tools match the deployed API. */
export function mcpPackage(version = process.env.NEXT_PUBLIC_APP_VERSION): string {
  const ref = version ? `@v${version}` : "";
  return `git+https://github.com/Gonzalez8/fintrack${ref}#subdirectory=mcp`;
}
const TOKENS_KEY = ["api-tokens"];

/** Backend URL the MCP should call: same host as the app, backend port of docker-compose.prod.yml. */
function defaultBackendUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8001";
  return `${window.location.protocol}//${window.location.hostname}:8001`;
}

export function claudeCodeCommand(url: string, key: string): string {
  return [
    "claude mcp add fintrack \\",
    `  --env FINTRACK_URL=${url} \\`,
    `  --env FINTRACK_TOKEN=${key} \\`,
    `  -- uvx --from "${mcpPackage()}" fintrack-mcp`,
  ].join("\n");
}

export function claudeDesktopConfig(url: string, key: string): string {
  const config = {
    mcpServers: {
      fintrack: {
        command: "uvx",
        args: ["--from", mcpPackage(), "fintrack-mcp"],
        env: { FINTRACK_URL: url, FINTRACK_TOKEN: key },
      },
    },
  };
  return JSON.stringify(config, null, 2);
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t("aiAccess.copied") : t("aiAccess.copy")}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] leading-relaxed">{text}</pre>
    </div>
  );
}

/** Personal access tokens for the Fintrack MCP server (AI assistants running on the user's computer). */
export function AiAccessCard() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [name, setName] = useState("Claude");
  const [scope, setScope] = useState<ApiTokenScope>("READ");
  const [created, setCreated] = useState<ApiToken | null>(null);
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);

  const { data } = useQuery({
    queryKey: TOKENS_KEY,
    queryFn: () => api.get<PaginatedResponse<ApiToken> | ApiToken[]>("/auth/api-tokens/"),
  });
  const tokens = Array.isArray(data) ? data : (data?.results ?? []);

  const createMut = useMutation({
    mutationFn: () => api.post<ApiToken>("/auth/api-tokens/", { name, scope }),
    onSuccess: (token) => {
      setCreated(token);
      queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
    },
    onError: () => toast.error(t("common.errorSaving")),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/api-tokens/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
      toast.success(t("aiAccess.revoked"));
    },
  });

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(uiLocale(), { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
  const scopeLabel = (s: ApiTokenScope) => (s === "WRITE" ? t("aiAccess.scopeWrite") : t("aiAccess.scopeRead"));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-mono text-[9px] tracking-[2px] uppercase text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          {t("aiAccess.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("aiAccess.description")}</p>

        {tokens.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {tokens.map((tk) => (
              <li key={tk.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{tk.name}</span>
                    <Badge variant={tk.scope === "WRITE" ? "default" : "secondary"}>{scopeLabel(tk.scope)}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{tk.key_prefix}…</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("aiAccess.createdOn", { date: formatDate(tk.created_at) })} ·{" "}
                    {tk.last_used_at
                      ? t("aiAccess.lastUsed", { date: formatDate(tk.last_used_at) })
                      : t("aiAccess.neverUsed")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start text-destructive sm:self-auto"
                  disabled={revokeMut.isPending}
                  onClick={() => {
                    if (confirm(t("aiAccess.confirmRevoke"))) revokeMut.mutate(tk.id);
                  }}
                >
                  {t("aiAccess.revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {created?.key ? (
          <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">{t("aiAccess.keyOnce")}</p>
            <CopyBlock label={t("aiAccess.token")} text={created.key} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t("aiAccess.backendUrl")}</label>
              <Input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t("aiAccess.backendUrlHelp")}</p>
            </div>
            <CopyBlock label="Claude Code" text={claudeCodeCommand(backendUrl, created.key)} />
            <CopyBlock
              label="Claude Desktop (claude_desktop_config.json)"
              text={claudeDesktopConfig(backendUrl, created.key)}
            />
            <p className="text-xs text-muted-foreground">{t("aiAccess.uvHelp")}</p>
            <Button size="sm" variant="outline" onClick={() => setCreated(null)}>
              {t("aiAccess.done")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("aiAccess.name")}</label>
                <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">{t("aiAccess.scope")}</label>
                <Select value={scope} onValueChange={(v) => v && setScope(v as ApiTokenScope)}>
                  <SelectTrigger className="w-full">
                    <span data-slot="select-value">{scopeLabel(scope)}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="READ">{t("aiAccess.scopeRead")}</SelectItem>
                    <SelectItem value="WRITE">{t("aiAccess.scopeWrite")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {scope === "WRITE" ? t("aiAccess.scopeWriteHelp") : t("aiAccess.scopeReadHelp")}
            </p>
            <Button size="sm" disabled={!name.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending ? t("common.loading") : t("aiAccess.create")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
