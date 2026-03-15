import { cookies } from "next/headers";
import { getDictionary } from "@/i18n/config";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/constants";
import type { Locale } from "@/lib/constants";
import { AuthProviders } from "./auth-providers";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get("fintrack_lang")?.value ?? DEFAULT_LOCALE;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(langCookie)
    ? (langCookie as Locale)
    : DEFAULT_LOCALE;
  const dictionary = await getDictionary(locale);

  return (
    <AuthProviders dictionary={dictionary}>
      {children}
    </AuthProviders>
  );
}
