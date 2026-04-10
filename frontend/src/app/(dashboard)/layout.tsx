import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { djangoFetch, ApiError } from "@/lib/api-server";
import { Providers } from "@/components/app/providers";
import { Sidebar } from "@/components/app/sidebar";
import { TopBar } from "@/components/app/top-bar";
import { MobileNav } from "@/components/app/mobile-nav";
import { getDictionary } from "@/i18n/config";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, COOKIE_ACCESS, isDemoToken } from "@/lib/constants";
import { DemoBanner } from "@/components/app/demo-banner";
import type { Locale } from "@/lib/constants";
import type { User } from "@/types";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: User;
  try {
    user = await djangoFetch<User>("/api/auth/me/", { revalidate: false });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login");
    }
    // Network error (e.g. no backend on Vercel demo) → send to login
    if (!(err instanceof ApiError)) {
      redirect("/login");
    }
    throw err;
  }

  const cookieStore = await cookies();
  const isDemo = isDemoToken(cookieStore.get(COOKIE_ACCESS)?.value);
  const langCookie = cookieStore.get("fintrack_lang")?.value ?? DEFAULT_LOCALE;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(langCookie)
    ? (langCookie as Locale)
    : DEFAULT_LOCALE;
  const dictionary = await getDictionary(locale);

  return (
    <Providers user={user} dictionary={dictionary}>
      {isDemo && <DemoBanner />}
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <TopBar />
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">{children}</main>
        </div>
      </div>
      <MobileNav />
    </Providers>
  );
}
