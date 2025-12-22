/**
 * Display Utilities
 * Ensures consistent formatting across all dashboard components
 * 
 * Rules:
 * - Zero or null values display as "—"
 * - Numbers are formatted with locale-aware separators
 * - Percentages show appropriate decimal places
 */

/**
 * Format a number for display. Returns "—" for zero, null, or undefined values.
 * @param value - The number to format
 * @param options - Formatting options
 */
export const formatDisplayValue = (
  value: number | null | undefined,
  options: {
    fallback?: string;
    suffix?: string;
    decimals?: number;
    showZero?: boolean;
  } = {}
): string => {
  const { fallback = "—", suffix = "", decimals, showZero = false } = options;
  
  if (value === null || value === undefined) {
    return fallback;
  }
  
  if (value === 0 && !showZero) {
    return fallback;
  }
  
  let formatted: string;
  
  if (decimals !== undefined) {
    formatted = value.toFixed(decimals);
  } else {
    formatted = value.toLocaleString();
  }
  
  return suffix ? `${formatted}${suffix}` : formatted;
};

/**
 * Format a count (integer). Returns "—" for zero/null.
 */
export const formatCount = (
  value: number | null | undefined,
  showZero = false
): string => {
  return formatDisplayValue(value, { showZero });
};

/**
 * Format a percentage. Returns "—" for zero/null.
 */
export const formatPercent = (
  value: number | null | undefined,
  decimals = 0,
  showZero = false
): string => {
  return formatDisplayValue(value, { suffix: "%", decimals, showZero });
};

/**
 * Format weight in kg. Returns "—" for zero/null.
 */
export const formatWeight = (
  value: number | null | undefined,
  decimals = 1,
  showZero = false
): string => {
  return formatDisplayValue(value, { suffix: " kg", decimals, showZero });
};

/**
 * Format hours. Returns "—" for zero/null.
 */
export const formatHours = (
  value: number | null | undefined,
  decimals = 1,
  showZero = false
): string => {
  return formatDisplayValue(value, { suffix: " hrs", decimals, showZero });
};

/**
 * Format days. Returns "—" for zero/null.
 */
export const formatDays = (
  value: number | null | undefined,
  showZero = false
): string => {
  if (value === null || value === undefined || (value === 0 && !showZero)) {
    return "—";
  }
  return `${Math.round(value)}d`;
};

/**
 * Format pieces. Returns "—" for zero/null.
 */
export const formatPcs = (
  value: number | null | undefined,
  showZero = false
): string => {
  if (value === null || value === undefined || (value === 0 && !showZero)) {
    return "—";
  }
  return `${value.toLocaleString()} pcs`;
};

/**
 * Check if a value should be considered "empty" for display purposes
 */
export const isEmpty = (value: number | null | undefined): boolean => {
  return value === null || value === undefined || value === 0;
};

/**
 * Get a numeric value or 0 for calculations (different from display)
 */
export const safeNumber = (value: number | null | undefined): number => {
  return value ?? 0;
};