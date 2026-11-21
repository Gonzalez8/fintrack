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
    // Android: Fintrack appears in "Share" for PDFs; public/sw.js receives them and opens the payroll import
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: { files: [{ name: "file", accept: ["application/pdf", ".pdf"] }] },
    },
    icons: [
      { src: "/pwa-icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
