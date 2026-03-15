"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  Eye,
  EyeOff,
  ArrowRight,
  PieChart,
  Shield,
  Zap,
} from "lucide-react";
import { authApi, ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const ALLOW_REGISTRATION =
  process.env.NEXT_PUBLIC_ALLOW_REGISTRATION !== "false";

// ── Password input with toggle ──────────────────────────────────
function PasswordInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-10 pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ── Login form ──────────────────────────────────────────────────
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="login-user" className="text-sm font-medium">
          Usuario
        </label>
        <Input
          id="login-user"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Tu nombre de usuario"
          className="h-10"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="login-pass" className="text-sm font-medium">
          Contrasena
        </label>
        <PasswordInput
          id="login-pass"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Tu contrasena"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <Button
        type="submit"
        className="w-full h-10 bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_2px_12px_rgba(59,130,246,0.3)]"
        disabled={loading}
      >
        {loading ? "Iniciando sesion..." : "Iniciar sesion"}
      </Button>
    </form>
  );
}

// ── Register form ───────────────────────────────────────────────
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="reg-user" className="text-sm font-medium">
          Usuario
        </label>
        <Input
          id="reg-user"
          value={form.username}
          onChange={(e) => setField("username", e.target.value)}
          placeholder="Elige un nombre de usuario"
          className="h-10"
          autoFocus
        />
        {errors.username && (
          <p className="text-xs text-destructive">{errors.username}</p>
        )}
      </div>
      <div className="space-y-2">
        <label
          htmlFor="reg-email"
          className="text-sm font-medium text-muted-foreground"
        >
          Email <span className="text-xs">(opcional)</span>
        </label>
        <Input
          id="reg-email"
          type="email"
          value={form.email}
          onChange={(e) => setField("email", e.target.value)}
          placeholder="tu@email.com"
          className="h-10"
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email}</p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="reg-pass" className="text-sm font-medium">
          Contrasena
        </label>
        <PasswordInput
          id="reg-pass"
          value={form.password}
          onChange={(e) => setField("password", e.target.value)}
          placeholder="Min. 8 caracteres"
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password}</p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="reg-pass2" className="text-sm font-medium">
          Confirmar contrasena
        </label>
        <PasswordInput
          id="reg-pass2"
          value={form.password2}
          onChange={(e) => setField("password2", e.target.value)}
          placeholder="Repite la contrasena"
        />
        {errors.password2 && (
          <p className="text-xs text-destructive">{errors.password2}</p>
        )}
      </div>

      {errors.non_field_errors && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
          <p className="text-sm text-destructive">{errors.non_field_errors}</p>
        </div>
      )}

      <Button
        type="submit"
        className="w-full h-10 bg-gradient-to-r from-[#1d4ed8] to-[#3b82f6] hover:from-[#1e40af] hover:to-[#2563eb] shadow-[0_2px_12px_rgba(59,130,246,0.3)]"
        disabled={loading}
      >
        {loading ? "Registrando..." : "Crear cuenta"}
      </Button>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");

  const onSuccess = () => router.push("/");

  const handleDemo = async () => {
    setDemoLoading(true);
    setDemoError("");
    try {
      // 1. Login via Next.js server handler (sets httpOnly cookies properly).
      //    Must happen BEFORE MSW starts, otherwise the service worker
      //    intercepts the request and browsers strip Set-Cookie headers
      //    from service worker responses.
      await authApi.login({ username: "demo", password: "demo" });

      // 2. Start MSW to intercept subsequent client-side /api/proxy/* calls
      //    (optional optimisation — the server proxy also handles demo sessions)
      try {
        const { worker } = await import("@/demo/index");
        await worker.start({
          onUnhandledRequest: "bypass",
          serviceWorker: { url: "/mockServiceWorker.js" },
        });
      } catch {
        // MSW failure is non-fatal: server-side proxy handles demo data
      }

      router.push("/");
    } catch {
      setDemoError("Error al iniciar demo");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* ── Left panel: branding ── */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a]">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_30%_20%,rgba(59,130,246,0.2),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_40%_at_70%_80%,rgba(99,102,241,0.1),transparent_70%)]" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        {/* Logo */}
        <div className="relative z-10 p-8 lg:p-10">
          <Link href="/welcome" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#6366f1] shadow-[0_0_24px_rgba(59,130,246,0.5)] transition-shadow group-hover:shadow-[0_0_32px_rgba(59,130,246,0.6)]">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span className="font-mono text-sm font-bold tracking-[3px] uppercase text-white/90">
              Fintrack
            </span>
          </Link>
        </div>

        {/* Central content */}
        <div className="relative z-10 flex-1 flex items-center px-8 lg:px-10 xl:px-16">
          <div className="max-w-lg">
            <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-white leading-[1.2]">
              Todas tus inversiones,
              <br />
              <span className="bg-gradient-to-r from-[#60a5fa] to-[#818cf8] bg-clip-text text-transparent">
                un unico panel.
              </span>
            </h1>
            <p className="mt-4 text-base text-white/50 leading-relaxed max-w-md">
              Controla cartera, operaciones, dividendos, intereses y
              fiscalidad con total privacidad.
            </p>

            {/* Feature highlights */}
            <div className="mt-10 space-y-5">
              {[
                {
                  icon: PieChart,
                  title: "Cartera completa",
                  desc: "FIFO, LIFO y WAC con P&L en tiempo real",
                },
                {
                  icon: Shield,
                  title: "100% privado",
                  desc: "Self-hosted, sin tracking, tus datos son tuyos",
                },
                {
                  icon: Zap,
                  title: "Listo en minutos",
                  desc: "Docker Compose y a funcionar",
                },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.08]">
                    <item.icon className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/90">
                      {item.title}
                    </p>
                    <p className="text-sm text-white/40">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom stats bar */}
        <div className="relative z-10 border-t border-white/[0.06] px-8 lg:px-10 xl:px-16 py-6">
          <div className="flex items-center gap-8">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[2px] text-white/30">
                Stack
              </p>
              <p className="mt-1 text-sm text-white/60">
                Django + Next.js + PostgreSQL
              </p>
            </div>
            <div className="h-8 w-px bg-white/[0.06]" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[2px] text-white/30">
                Licencia
              </p>
              <p className="mt-1 text-sm text-white/60">Open Source</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel: auth forms ── */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <div className="flex items-center justify-between p-4 lg:hidden">
          <Link href="/welcome" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#1d4ed8] to-[#3b82f6] shadow-[0_0_20px_rgba(59,130,246,0.4)]">
              <TrendingUp className="h-4 w-4 text-white" />
            </div>
            <span className="font-mono text-sm font-bold tracking-[3px] uppercase">
              Fintrack
            </span>
          </Link>
        </div>

        {/* Form container */}
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[380px]">
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight">
                {mode === "login"
                  ? "Bienvenido de nuevo"
                  : "Crea tu cuenta"}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "login"
                  ? "Introduce tus credenciales para acceder"
                  : "Registrate para empezar a gestionar tus inversiones"}
              </p>
            </div>

            {/* Form */}
            {mode === "login" ? (
              <LoginForm onSuccess={onSuccess} />
            ) : (
              <RegisterForm onSuccess={onSuccess} />
            )}

            {/* Toggle login/register */}
            {ALLOW_REGISTRATION && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "login" ? (
                  <>
                    No tienes cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("register")}
                      className="font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Registrate
                    </button>
                  </>
                ) : (
                  <>
                    Ya tienes cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Inicia sesion
                    </button>
                  </>
                )}
              </p>
            )}

            {/* Demo button */}
            {IS_DEMO && (
              <div className="mt-8">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground font-mono tracking-wider">
                      o
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full h-10 gap-2"
                  disabled={demoLoading}
                  onClick={handleDemo}
                >
                  {demoLoading ? (
                    "Cargando demo..."
                  ) : (
                    <>
                      Probar Demo <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </Button>

                {demoError && (
                  <p className="mt-2 text-center text-sm text-destructive">
                    {demoError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-4 sm:px-8">
          <p className="text-center text-xs text-muted-foreground">
            Open Source &middot; Self-Hosted &middot; 100% Privado
          </p>
        </div>
      </div>
    </div>
  );
}
