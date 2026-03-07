"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { createContext, useContext, useState } from "react";
import { DictionaryContext } from "@/i18n/use-translations";
import type { User } from "@/types";

// ── React Query ──────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
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
}: {
  children: React.ReactNode;
  user: User;
  dictionary: Record<string, string>;
}) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <UserContext value={user}>
          <DictionaryContext value={dictionary}>
            {children}
          </DictionaryContext>
        </UserContext>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
