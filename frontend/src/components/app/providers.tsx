"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { createContext, useContext, useState } from "react";
import { DictionaryContext } from "@/i18n/use-translations";
import { PrivacyProvider } from "@/lib/privacy";
import type { User } from "@/types";

// ── React Query ──────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,        // 2 min — data stays fresh longer
        gcTime: 10 * 60 * 1000,           // 10 min — keep unused cache longer
        refetchOnWindowFocus: false,
        retry: 1,                          // 1 retry on network errors
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

// ── User Context ─────────────────────────────────────────────────
const UserContext = createContext<User | null>(null);

export function useUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used within Providers");
  return user;
}

// ── Combined Providers ───────────────────────────────────────────
export function Providers({
  children,
  user,
  dictionary,
  initialPrivacy = false,
}: {
  children: React.ReactNode;
  user: User;
  dictionary: Record<string, string>;
  /** Privacy mode from the cookie, read on the server */
  initialPrivacy?: boolean;
}) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <UserContext value={user}>
          <DictionaryContext value={dictionary}>
            <PrivacyProvider initial={initialPrivacy}>
              {children}
            </PrivacyProvider>
          </DictionaryContext>
        </UserContext>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
