import type { OtherIncome } from "@/types";

const RENT_MONTHS = ["2025-06", "2025-05", "2025-04", "2025-03", "2025-02", "2025-01"];
const RENT_AMOUNTS = ["390.00", "400.00", "360.00", "390.00", "395.00", "390.00"];

export const demoOtherIncomes: OtherIncome[] = [
  ...RENT_MONTHS.map((month, i) => ({
    id: `f1000000-0001-4000-f000-00000000000${i + 1}`,
    date: `${month}-01`,
    category: "RENTAL" as const,
    description: "Alquiler piso",
    amount: RENT_AMOUNTS[i],
    account: "b1b2c3d4-1111-4000-b000-000000000001",
    account_name: "BBVA Operativa",
    lease: "f2000000-0001-4000-f000-000000000001",
    property_name: "Piso en Madrid Centro",
    notes: "",
    created_at: `${month}-01T10:00:00Z`,
    updated_at: `${month}-01T10:00:00Z`,
  })),
  {
    id: "f1000000-0001-4000-f000-000000000010",
    date: "2025-04-12",
    category: "SIDE_JOB",
    description: "Diseño web freelance",
    amount: "650.00",
    account: null,
    account_name: null,
    lease: null,
    property_name: null,
    notes: "Factura 2025-004",
    created_at: "2025-04-12T10:00:00Z",
    updated_at: "2025-04-12T10:00:00Z",
  },
];
