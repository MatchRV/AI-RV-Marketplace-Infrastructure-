import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DealScore } from "@workspace/api-client-react/src/generated/api.schemas";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

export function getDealScoreInfo(score: DealScore | undefined) {
  switch (score) {
    case "great_deal":
      return { label: "Great Deal", colorClass: "bg-[hsl(var(--deal-great))] text-white", textColor: "text-[hsl(var(--deal-great))]" };
    case "good_deal":
      return { label: "Good Deal", colorClass: "bg-[hsl(var(--deal-good))] text-white", textColor: "text-[hsl(var(--deal-good))]" };
    case "fair_deal":
      return { label: "Fair Deal", colorClass: "bg-[hsl(var(--deal-fair))] text-foreground", textColor: "text-[hsl(var(--deal-fair))]" };
    case "high_price":
      return { label: "High Price", colorClass: "bg-[hsl(var(--deal-high))] text-white", textColor: "text-[hsl(var(--deal-high))]" };
    case "overpriced":
      return { label: "Overpriced", colorClass: "bg-[hsl(var(--deal-overpriced))] text-white", textColor: "text-[hsl(var(--deal-overpriced))]" };
    default:
      return { label: "Evaluating", colorClass: "bg-muted text-muted-foreground", textColor: "text-muted-foreground" };
  }
}

export function formatRvType(type: string | undefined): string {
  if (!type) return "RV";
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
