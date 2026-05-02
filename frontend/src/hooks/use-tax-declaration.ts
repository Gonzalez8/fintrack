import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import type { TaxDeclaration } from "@/types";

export function useTaxDeclaration(year: number | string) {
  return useQuery({
    queryKey: ["tax-declaration", String(year)],
    queryFn: () =>
      api.get<TaxDeclaration>(`/reports/tax-declaration/?year=${year}`),
  });
}
