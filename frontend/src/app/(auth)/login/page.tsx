"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TrendingUp, ArrowRight } from "lucide-react";
import { authApi, ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const ALLOW_REGISTRATION = process.env.NEXT_PUBLIC_ALLOW_REGISTRATION !== "false";

// ── Login form ───────────────────────────────────────────────────
function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await authApi.login({ username, password });
      onSuccess();
    } catch {
      setError("Credenciales invalidas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Usuario</label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Contrasena</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Iniciando sesion..." : "Iniciar sesion"}
      </Button>
    </form>
  );
}

// ── Register form ────────────────────────────────────────────────
function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    password2: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const setField = (field: string, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      await authApi.register(form);
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        try {
          const data = JSON.parse(err.body);
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(data)) {
            flat[k] = Array.isArray(v) ? (v as string[])[0] : String(v);
          }
          setErrors(flat);
        } catch {
          setErrors({ non_field_errors: "Error al registrar" });
        }
      } else {
        setErrors({ non_field_errors: "Error al registrar" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Usuario</label>
        <Input
          value={form.username}
          onChange={(e) => setField("username", e.target.value)}
          autoFocus
        />
        {errors.username && (
          <p className="text-xs text-destructive">{errors.username}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-muted-foreground">
          Email <span className="text-xs">(opcional)</span>
        </label>
        <Input
          type="email"
          value={form.email}
          onChange={(e) => setField("email", e.target.value)}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Contrasena</label>
        <Input
          type="password"
          value={form.password}
          onChange={(e) => setField("password", e.target.value)}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Confirmar contrasena</label>
        <Input
          type="password"
          value={form.password2}
          onChange={(e) => setField("password2", e.target.value)}
        />
        {errors.password2 && (
          <p className="text-xs text-destructive">{errors.password2}</p>
        )}
      </div>
      {errors.non_field_errors && (
        <p className="text-sm text-destructive">{errors.non_field_errors}</p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Registrando..." : "Registrarse"}
      </Button>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");

  const onSuccess = () => router.push("/");
  const openLogin = () => {
    setAuthTab("login");
    setAuthOpen(true);
  };
  const openRegister = () => {
    setAuthTab("register");
    setAuthOpen(true);
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    setDemoError("");
    try {
      const { worker } = await import("@/demo/index");
      await worker.start({
        onUnhandledRequest: "bypass",
        serviceWorker: { url: "/mockServiceWorker.js" },
      });
      await authApi.login({ username: "demo", password: "demo" });
      router.push("/");
    } catch {
      setDemoError("Error al iniciar demo");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/30 bg-background/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-mono text-sm font-bold tracking-[3px] uppercase">
              Fintrack
            </span>
          </div>

          <div className="flex items-center gap-2">
            {IS_DEMO && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDemo}
                disabled={demoLoading}
                className="hidden sm:inline-flex"
              >
                {demoLoading ? "Cargando..." : "Probar Demo"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={openLogin}
              className="hidden sm:inline-flex"
            >
              Iniciar sesion
            </Button>
            <Button
              size="sm"
              onClick={ALLOW_REGISTRATION ? openRegister : openLogin}
              className="bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_0_20px_rgba(59,130,246,0.3)]"
            >
              Comenzar
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.15),transparent_70%)]" />
          <div
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
            style={{
              backgroundImage:
                "radial-gradient(circle, currentColor 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 mb-8">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-[10px] tracking-[2px] uppercase text-primary">
              Open Source &middot; Self-Hosted
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.1]">
            <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
              Controla tus
            </span>
            <br />
            <span className="bg-gradient-to-r from-[#1d4ed8] to-[#60a5fa] bg-clip-text text-transparent">
              inversiones
            </span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Cartera, operaciones, dividendos, intereses y fiscalidad.
            Todo en un unico panel, con total privacidad.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={ALLOW_REGISTRATION ? openRegister : openLogin}
              className="h-12 px-8 text-base bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_4px_24px_rgba(59,130,246,0.4)] gap-2"
            >
              Comenzar <ArrowRight className="h-4 w-4" />
            </Button>
            {IS_DEMO && (
              <Button
                size="lg"
                variant="outline"
                onClick={handleDemo}
                disabled={demoLoading}
                className="h-12 px-8 text-base"
              >
                {demoLoading ? "Cargando demo..." : "Ver demo"}
              </Button>
            )}
          </div>

          {demoError && (
            <p className="mt-4 text-sm text-destructive">{demoError}</p>
          )}
        </div>
      </section>

      {/* ── Auth Dialog ── */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_16px_rgba(59,130,246,0.5)] mb-2">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <DialogTitle className="font-mono text-[18px] font-bold tracking-[4px] uppercase">
              Fintrack
            </DialogTitle>
            <p className="font-mono text-[9px] tracking-[4px] uppercase text-primary">
              Investment Tracker
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {ALLOW_REGISTRATION ? (
              <Tabs
                value={authTab}
                onValueChange={(v) =>
                  setAuthTab(v as "login" | "register")
                }
              >
                <TabsList className="w-full mb-1">
                  <TabsTrigger value="login" className="flex-1">
                    Iniciar sesion
                  </TabsTrigger>
                  <TabsTrigger value="register" className="flex-1">
                    Registrarse
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="mt-3">
                  <LoginForm onSuccess={onSuccess} />
                </TabsContent>
                <TabsContent value="register" className="mt-3">
                  <RegisterForm onSuccess={onSuccess} />
                </TabsContent>
              </Tabs>
            ) : (
              <LoginForm onSuccess={onSuccess} />
            )}

            {IS_DEMO && (
              <div className="border-t pt-4">
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  Sin cuenta? Prueba la demo
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={demoLoading}
                  onClick={handleDemo}
                >
                  {demoLoading ? "Cargando..." : "Probar Demo"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
