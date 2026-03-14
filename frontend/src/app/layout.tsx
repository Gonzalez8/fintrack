import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://fintrack-quintela.vercel.app";

export const metadata: Metadata = {
  title: "Fintrack — Seguimiento de inversiones",
  description:
    "Controla tu cartera, operaciones, dividendos, intereses y fiscalidad desde un unico panel. Self-hosted, open source, 100% privado.",
  metadataBase: new URL(SITE_URL),
  openGraph: {
    title: "Fintrack — Seguimiento de inversiones",
    description:
      "Controla tu cartera, operaciones, dividendos, intereses y fiscalidad desde un unico panel.",
    url: SITE_URL,
    siteName: "Fintrack",
    locale: "es_ES",
    type: "website",
    // Image auto-detected from opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    // Image auto-detected from twitter-image.tsx
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
