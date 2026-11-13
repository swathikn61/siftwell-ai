const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** 124990 or "124990.00" → "₹1,24,990" */
export const formatINR = (value: number | string) => inr.format(Number(value))

/** Short form for chips: 150000 → "₹1.5L", 45000 → "₹45k" */
export function formatINRShort(value: number): string {
  if (value >= 100_000) return `₹${+(value / 100_000).toFixed(2)}L`
  if (value >= 1_000) return `₹${+(value / 1_000).toFixed(1)}k`
  return `₹${value}`
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}
