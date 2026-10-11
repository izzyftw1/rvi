const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below1000 = (n: number): string => {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
};

const western = (n: number): string => {
  if (n === 0) return 'Zero';
  const scales: [number, string][] = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
  const out: string[] = [];
  for (const [v, name] of scales) {
    if (n >= v) { out.push(`${below1000(Math.floor(n / v))} ${name}`); n %= v; }
  }
  if (n > 0) out.push(below1000(n));
  return out.join(' ');
};

const indian = (n: number): string => {
  if (n === 0) return 'Zero';
  const scales: [number, string][] = [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']];
  const out: string[] = [];
  for (const [v, name] of scales) {
    if (n >= v) { out.push(`${(v === 1e7 ? indian : below1000)(Math.floor(n / v))} ${name}`); n %= v; }
  }
  if (n > 0) out.push(below1000(n));
  return out.join(' ');
};

const UNITS: Record<string, { major: string; minor: string; prefix?: string; indian?: boolean }> = {
  GBP: { prefix: 'Pound Sterling', major: '', minor: 'Pence' },
  USD: { major: 'Dollars', minor: 'Cents', prefix: 'US' },
  EUR: { major: 'Euros', minor: 'Cents' },
  INR: { major: 'Rupees', minor: 'Paise', indian: true },
};

/** e.g. GBP 9081.66 → "Pound Sterling Nine Thousand Eighty One and Sixty Six Pence Only" */
export const amountInWords = (amount: number, currency: string): string => {
  const u = UNITS[currency] || { major: currency, minor: 'Cents' };
  const abs = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const conv = u.indian ? indian : western;
  let s = [u.prefix, conv(whole), u.major].filter(Boolean).join(' ');
  if (frac > 0) s += ` and ${conv(frac)} ${u.minor}`;
  return `${s} Only`;
};

export const currencySymbol = (c: string): string =>
  ({ USD: '$', EUR: '€', GBP: '£', INR: 'Rs. ' } as Record<string, string>)[c] || `${c} `;

/** Name used in "Rate DDP-Pound per pcs". */
export const currencyRateName = (c: string): string =>
  ({ USD: 'USD', EUR: 'Euro', GBP: 'Pound', INR: 'INR' } as Record<string, string>)[c] || c;
