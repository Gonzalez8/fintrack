"use client";

import { ThemeProvider } from "next-themes";
import { DictionaryContext } from "@/i18n/use-translations";

export function AuthProviders({
  children,
  dictionary,
}: {
  children: React.ReactNode;
  dictionary: Record<string, string>;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <DictionaryContext value={dictionary}>
        {children}
      </DictionaryContext>
    </ThemeProvider>
  );
}
