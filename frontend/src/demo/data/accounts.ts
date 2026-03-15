import type { Account } from "@/types";

export const demoAccounts: Account[] = [
  {
    id: "b1b2c3d4-1111-4000-b000-000000000001",
    name: "BBVA Operativa",
    type: "OPERATIVA",
    currency: "EUR",
    balance: "5243.18",
    created_at: "2023-01-01T10:00:00Z",
    updated_at: "2025-12-01T10:00:00Z",
  },
  {
    id: "b1b2c3d4-2222-4000-b000-000000000002",
    name: "Interactive Brokers",
    type: "INVERSION",
    currency: "EUR",
    balance: "3215.40",
    created_at: "2023-01-15T10:00:00Z",
    updated_at: "2025-12-01T10:00:00Z",
  },
  {
    id: "b1b2c3d4-3333-4000-b000-000000000003",
    name: "Trade Republic",
    type: "INVERSION",
    currency: "EUR",
    balance: "842.60",
    created_at: "2023-06-01T10:00:00Z",
    updated_at: "2025-12-01T10:00:00Z",
  },
  {
    id: "b1b2c3d4-4444-4000-b000-000000000004",
    name: "Coinbase",
    type: "ALTERNATIVOS",
    currency: "EUR",
    balance: "185.00",
    created_at: "2023-06-01T10:00:00Z",
    updated_at: "2025-12-01T10:00:00Z",
  },
];
