import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { getDictionary } from "@/i18n/config";
import { COOKIE_LANG, DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/constants";
import { generateMetadata as generateSeoMetadata, type SeoMessages } from "@/lib/seo";
import type { Locale } from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get(COOKIE_LANG)?.value ?? DEFAULT_LOCALE;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(langCookie)
    ? (langCookie as Locale)
    : DEFAULT_LOCALE;

  const dictionary = await getDictionary(locale);
  return generateSeoMetadata(dictionary as unknown as SeoMessages, locale);
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = (await cookies()).get(COOKIE_LANG)?.value || DEFAULT_LOCALE;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
