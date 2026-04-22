import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = "GTQ") {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("es-GT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
}

export function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("es-GT", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export function getBudgetStatus(spent: number, budget: number) {
  if (budget === 0) return { pct: 0, color: "text-gray-500", bg: "bg-gray-200" }
  const pct = (spent / budget) * 100
  if (pct >= 100) return { pct, color: "text-red-600", bg: "bg-red-500" }
  if (pct >= 75) return { pct, color: "text-orange-600", bg: "bg-orange-500" }
  if (pct >= 50) return { pct, color: "text-yellow-600", bg: "bg-yellow-500" }
  return { pct, color: "text-green-600", bg: "bg-green-500" }
}
