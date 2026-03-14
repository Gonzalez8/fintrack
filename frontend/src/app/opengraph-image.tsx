import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Fintrack — Seguimiento de inversiones";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          padding: "60px 80px",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: "-200px",
            left: "-100px",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-200px",
            right: "-100px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%)",
          }}
        />

        {/* Top: Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 30px rgba(59,130,246,0.4)",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <span style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "4px", color: "rgba(255,255,255,0.9)", textTransform: "uppercase" as const }}>
            Fintrack
          </span>
        </div>

        {/* Center: Title */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <h1
            style={{
              fontSize: "56px",
              fontWeight: 800,
              lineHeight: 1.1,
              margin: 0,
              color: "white",
            }}
          >
            Todas tus inversiones,{" "}
            <span
              style={{
                background: "linear-gradient(90deg, #60a5fa, #818cf8)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              un unico panel.
            </span>
          </h1>
          <p style={{ fontSize: "22px", color: "rgba(255,255,255,0.5)", margin: 0, maxWidth: "700px" }}>
            Cartera, operaciones, dividendos, intereses y fiscalidad. Self-hosted, open source, 100% privado.
          </p>
        </div>

        {/* Bottom: Stats preview + tech */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: "40px" }}>
            {[
              { label: "Patrimonio", value: "127.450 \u20ac" },
              { label: "P&L", value: "+12.340 \u20ac" },
              { label: "Dividendos", value: "3.210 \u20ac" },
            ].map((stat) => (
              <div key={stat.label} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "11px", textTransform: "uppercase" as const, letterSpacing: "2px", color: "rgba(255,255,255,0.3)" }}>
                  {stat.label}
                </span>
                <span style={{ fontSize: "24px", fontWeight: 700, color: "rgba(255,255,255,0.85)", fontVariantNumeric: "tabular-nums" }}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {["Django", "Next.js", "PostgreSQL"].map((tech) => (
              <span
                key={tech}
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.4)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "6px",
                  padding: "4px 10px",
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
