import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { djangoFetch, ApiError } from "@/lib/api-server";
import { Providers } from "@/components/app/providers";
import { Sidebar } from "@/components/app/sidebar";
import { TopBar } from "@/components/app/top-bar";
import { MobileNav } from "@/components/app/mobile-nav";
import { getDictionary } from "@/i18n/config";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/constants";
import type { Locale } from "@/lib/constants";
import type { User } from "@/types";

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
    throw err;
  }

  const cookieStore = await cookies();
  const langCookie = cookieStore.get("fintrack_lang")?.value ?? DEFAULT_LOCALE;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(langCookie)
    ? (langCookie as Locale)
    : DEFAULT_LOCALE;
  const dictionary = await getDictionary(locale);

  return (
    <Providers user={user} dictionary={dictionary}>
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
