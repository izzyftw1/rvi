// Money helpers that never add different currencies together.
export const formatMoney = (amount: number, currency: string | null | undefined = "INR") => {
  const cur = (currency || "INR").toUpperCase();
  const symbol: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
  const value = Number(amount || 0).toLocaleString(cur === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return symbol[cur] ? `${symbol[cur]}${value}` : `${cur} ${value}`;
};

export type CurrencyTotals = Record<string, number>;

export const addToTotals = (totals: CurrencyTotals, currency: string | null | undefined, amount: number) => {
  const cur = (currency || "INR").toUpperCase();
  totals[cur] = (totals[cur] || 0) + Number(amount || 0);
  return totals;
};

export const sumByCurrency = <T,>(rows: T[], getCurrency: (r: T) => string | null | undefined, getAmount: (r: T) => number) =>
  rows.reduce((acc, r) => addToTotals(acc, getCurrency(r), getAmount(r)), {} as CurrencyTotals);

/** "₹1,20,000.00 · $4,500.00" — one entry per currency, never converted. */
export const formatTotals = (totals: CurrencyTotals) => {
  const entries = Object.entries(totals).filter(([, v]) => Math.abs(v) > 0.004).sort(([a], [b]) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b)));
  return entries.length ? entries.map(([c, v]) => formatMoney(v, c)).join(" · ") : formatMoney(0, "INR");
};
