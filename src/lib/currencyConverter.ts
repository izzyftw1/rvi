// Exchange rates to INR (Indian Rupee)
// These can be updated daily or fetched from an API
const EXCHANGE_RATES: Record<string, number> = {
  'INR': 1,
  'USD': 83.50,
  'EUR': 91.20,
  'GBP': 106.80,
  'JPY': 0.56,
  'AUD': 54.30,
  'CAD': 60.50,
  'CHF': 94.70,
  'CNY': 11.50,
  'SGD': 62.40,
  'AED': 22.75
};

export const convertToINR = (amount: number, fromCurrency: string): number => {
  const rate = EXCHANGE_RATES[fromCurrency.toUpperCase()] || 1;
  return amount * rate;
};

export const formatINR = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export const getExchangeRate = (currency: string): number => {
  return EXCHANGE_RATES[currency.toUpperCase()] || 1;
};

export const getSupportedCurrencies = (): string[] => {
  return Object.keys(EXCHANGE_RATES);
};

// Format with original currency and INR equivalent
export const formatWithINR = (amount: number, currency: string): string => {
  if (currency.toUpperCase() === 'INR') {
    return formatINR(amount);
  }
  
  const inrAmount = convertToINR(amount, currency);
  return `${currency} ${amount.toLocaleString()} (${formatINR(inrAmount)})`;
};