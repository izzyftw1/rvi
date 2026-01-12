/**
 * Utility functions for safe numeric value handling to prevent database overflow errors.
 * 
 * PostgreSQL numeric fields have precision/scale limits. This module provides
 * functions to safely clamp values before database insertion.
 */

/**
 * Clamps a numeric value to fit within a specified precision and scale.
 * 
 * @param value - The numeric value to clamp
 * @param precision - Total number of digits (e.g., 7 for numeric(7,2))
 * @param scale - Number of decimal places (e.g., 2 for numeric(7,2))
 * @returns Clamped value that fits within the specified precision/scale
 * 
 * @example
 * clampNumeric(99999.999, 7, 2) // Returns 99999.99
 * clampNumeric(1500.5, 5, 2) // Returns 999.99 (capped to max for 5,2)
 */
export function clampNumeric(
  value: number | null | undefined,
  precision: number,
  scale: number
): number {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }

  // Calculate max value based on precision and scale
  // For numeric(7,2), max is 99999.99 (7 total digits, 2 after decimal)
  const integerDigits = precision - scale;
  const maxValue = Math.pow(10, integerDigits) - Math.pow(10, -scale);
  const minValue = -maxValue;

  // Clamp to valid range
  let clamped = Math.max(minValue, Math.min(maxValue, value));

  // Round to scale decimal places
  const factor = Math.pow(10, scale);
  clamped = Math.round(clamped * factor) / factor;

  return clamped;
}

/**
 * Clamps a percentage value to fit within numeric(7,2) which allows up to 99999.99%
 * This is the standard precision for efficiency/percentage fields.
 */
export function clampPercentage(value: number | null | undefined): number {
  return clampNumeric(value, 7, 2);
}

/**
 * Clamps a decimal weight value to fit within numeric(12,3)
 * Standard precision for weight fields like net_weight, gross_weight
 */
export function clampWeight(value: number | null | undefined): number {
  return clampNumeric(value, 12, 3);
}

/**
 * Clamps a currency/amount value to fit within numeric(14,2)
 * Standard precision for monetary fields
 */
export function clampAmount(value: number | null | undefined): number {
  return clampNumeric(value, 14, 2);
}

/**
 * Clamps a rate/unit price value to fit within numeric(12,4)
 * Standard precision for rate fields with more decimal places
 */
export function clampRate(value: number | null | undefined): number {
  return clampNumeric(value, 12, 4);
}

/**
 * Ensures a value is a valid integer (no overflow for INT4)
 * PostgreSQL INT4 range: -2147483648 to 2147483647
 */
export function clampInteger(value: number | null | undefined): number {
  if (value === null || value === undefined || isNaN(value)) {
    return 0;
  }
  const INT_MAX = 2147483647;
  const INT_MIN = -2147483648;
  return Math.max(INT_MIN, Math.min(INT_MAX, Math.round(value)));
}

/**
 * Safe parse and clamp of string to percentage
 */
export function parseAndClampPercentage(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return clampPercentage(numValue);
}

/**
 * Validates if a value would cause overflow for a given precision/scale
 */
export function wouldOverflow(
  value: number,
  precision: number,
  scale: number
): boolean {
  if (isNaN(value)) return true;
  
  const integerDigits = precision - scale;
  const maxValue = Math.pow(10, integerDigits) - Math.pow(10, -scale);
  
  return Math.abs(value) > maxValue;
}
