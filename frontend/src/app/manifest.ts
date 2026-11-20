import type { MetadataRoute } from "next";

// Makes Fintrack installable as an app (Android "Install app", desktop Chrome/Edge).
// Served at /manifest.webmanifest and linked automatically by Next.js.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Fintrack",
    short_name: "Fintrack",
    description: "Portfolio, transactions, dividends, interests and tax tracking",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0f18",
    theme_color: "#0b0f18",
    categories: ["finance"],
    icons: [
      { src: "/pwa-icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
