import type { Lease, RentalExpense, RentalOverview } from "@/types";

const PROPERTY = "a1b2c3d4-e5f6-7890-abcd-111111111111";

export const demoLeases: Lease[] = [
  {
    id: "f2000000-0001-4000-f000-000000000001",
    property: PROPERTY,
    property_name: "Piso en Madrid Centro",
    tenant: "Laura M.",
    start_date: "2023-02-01",
    end_date: null,
    monthly_rent: "950.00",
    deposit: "1900.00",
    reduction: "PRE_2023",
    rented_share_pct: "100.00",
    notes: "",
    created_at: "2023-01-20T10:00:00Z",
    updated_at: "2023-01-20T10:00:00Z",
  },
];

const expense = (id: number, date: string, category: RentalExpense["category"], amount: string, description = ""): RentalExpense => ({
  id: `f3000000-0001-4000-f000-${String(id).padStart(12, "0")}`,
  property: PROPERTY,
  property_name: "Piso en Madrid Centro",
  date,
  category,
  amount,
  description,
  created_at: `${date}T10:00:00Z`,
});

export const demoRentalExpenses: RentalExpense[] = [
  expense(1, "2026-10-01", "COMMUNITY", "55.00", "Cuota octubre"),
  expense(2, "2026-06-12", "REPAIRS", "180.00", "Fontanero"),
  expense(3, "2026-03-20", "TAXES", "412.00", "IBI 2026"),
];

// Figures computed by the backend for the demo inputs (keep in sync if the rental maths change)
export const demoRentalOverview: RentalOverview = {
  "year": 2026,
  "other_general_base": "34200.00",
  "other_general_base_projected": true,
  "properties": [
    {
      "property": {
        "id": "a1b2c3d4-e5f6-7890-abcd-111111111111",
        "name": "Piso en Madrid Centro"
      },
      "leases": [
        {
          "id": "f2000000-0001-4000-f000-000000000001",
          "tenant": "Laura M.",
          "start_date": "2023-02-01",
          "end_date": null,
          "monthly_rent": "950.00",
          "reduction": "PRE_2023"
        }
      ],
      "missing_months": [],
      "to_date": {
        "inputs": {
          "year": 2026,
          "income": "9500",
          "days_rented": 321,
          "days_vacant": 0,
          "rented_share_pct": "100",
          "ownership_pct": "100",
          "financing": "2852.10",
          "repairs": "180",
          "taxes": "412",
          "community": "550",
          "insurance": "0",
          "utilities": "0",
          "services": "0",
          "other": "0",
          "acquisition_price": "220000",
          "acquisition_costs": "16500",
          "cadastral_value": "96000",
          "cadastral_construction_value": "57600",
          "cadastral_revised": true,
          "improvements": "0",
          "furniture_value": "6000",
          "reduction_pct": "60",
          "pending_excess": "0",
          "other_general_base": "34200",
          "period_days": 321
        },
        "result": {
          "income": "9500.00",
          "capped_expenses": "3032.10",
          "capped_applied": "3032.10",
          "excess_carry_forward": "0.00",
          "other_expenses": "962.00",
          "expenses_detail": {
            "financing": "2852.10",
            "repairs": "180.00",
            "pending_excess": "0.00",
            "taxes": "412.00",
            "community": "550.00",
            "insurance": "0.00",
            "utilities_services_other": "0.00"
          },
          "depreciation": "3743.83",
          "furniture_depreciation": "527.67",
          "net": "1234.40",
          "reduction_pct": "60",
          "reduction": "740.64",
          "net_reduced": "493.76",
          "imputation": "0.00",
          "taxable": "493.76",
          "other_general_base": "34200.00",
          "marginal_rate": "30",
          "estimated_tax": "148.13",
          "effective_rate_on_income": "1.56",
          "paid_expenses": "3994.10",
          "cash_result": "5357.77",
          "days_rented": 321,
          "days_vacant": 0,
          "warnings": []
        }
      },
      "projected": {
        "inputs": {
          "year": 2026,
          "income": "11400",
          "days_rented": 365,
          "days_vacant": 0,
          "rented_share_pct": "100",
          "ownership_pct": "100",
          "financing": "3108.62",
          "repairs": "180",
          "taxes": "412",
          "community": "660",
          "insurance": "238",
          "utilities": "0",
          "services": "0",
          "other": "0",
          "acquisition_price": "220000",
          "acquisition_costs": "16500",
          "cadastral_value": "96000",
          "cadastral_construction_value": "57600",
          "cadastral_revised": true,
          "improvements": "0",
          "furniture_value": "6000",
          "reduction_pct": "60",
          "pending_excess": "0",
          "other_general_base": "34200",
          "period_days": null
        },
        "estimated": [
          "community",
          "insurance",
          "financing",
          "income"
        ],
        "result": {
          "income": "11400.00",
          "capped_expenses": "3288.62",
          "capped_applied": "3288.62",
          "excess_carry_forward": "0.00",
          "other_expenses": "1310.00",
          "expenses_detail": {
            "financing": "3108.62",
            "repairs": "180.00",
            "pending_excess": "0.00",
            "taxes": "412.00",
            "community": "660.00",
            "insurance": "238.00",
            "utilities_services_other": "0.00"
          },
          "depreciation": "4257.00",
          "furniture_depreciation": "600.00",
          "net": "1944.38",
          "reduction_pct": "60",
          "reduction": "1166.63",
          "net_reduced": "777.75",
          "imputation": "0.00",
          "taxable": "777.75",
          "other_general_base": "34200.00",
          "marginal_rate": "30",
          "estimated_tax": "233.33",
          "effective_rate_on_income": "2.05",
          "paid_expenses": "4598.62",
          "cash_result": "6568.05",
          "days_rented": 365,
          "days_vacant": 0,
          "warnings": []
        }
      }
    }
  ]
};
