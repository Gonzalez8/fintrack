import { ImageResponse } from "next/og";

export const runtime = "edge";

// Same artwork as app/icon.tsx at the sizes the web app manifest needs.
// "maskable" fills the whole square (the launcher crops it) and keeps the
// glyph inside the 80 % safe zone.
const ICONS: Record<string, { size: number; maskable: boolean }> = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
};

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const icon = ICONS[(await params).name];
  if (!icon) return new Response("Not found", { status: 404 });

  const { size, maskable } = icon;
  const glyph = Math.round(size * (maskable ? 0.4 : 0.5));
  return new ImageResponse(
    (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: maskable ? 0 : `${Math.round(size * 0.22)}px`,
          background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
