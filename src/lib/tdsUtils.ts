// TDS (Tax Deducted at Source) utility functions

/**
 * Get TDS rate based on PAN entity type
 * P = Individual/Proprietorship = 1%
 * Others (C=Company, F=Firm, H=HUF, etc.) = 2%
 * Export customers = 0%
 */
export function getTdsRate(pan: string | null | undefined, isExport: boolean = false): number {
  // No TDS for export customers
  if (isExport) return 0;
  
  // Invalid PAN - default to higher rate
  if (!pan || pan.length < 4) return 2;
  
  // Get 4th character (entity type)
  const entityChar = pan.charAt(3).toUpperCase();
  
  // P = Individual/Proprietorship = 1%
  return entityChar === 'P' ? 1 : 2;
}

/**
 * Get entity type description from PAN
 */
export function getPanEntityType(pan: string | null | undefined): string {
  if (!pan || pan.length < 4) return 'Unknown';
  
  const entityChar = pan.charAt(3).toUpperCase();
  
  const types: Record<string, string> = {
    'P': 'Individual/Proprietorship',
    'C': 'Company',
    'H': 'HUF',
    'F': 'Firm',
    'A': 'AOP',
    'T': 'Trust',
    'B': 'BOI',
    'L': 'Local Authority',
    'J': 'Artificial Juridical Person',
    'G': 'Government'
  };
  
  return types[entityChar] || 'Other';
}

/**
 * Calculate TDS amounts from gross amount
 */
export function calculateTds(grossAmount: number, tdsRate: number): {
  grossAmount: number;
  tdsAmount: number;
  netAmount: number;
} {
  const tdsAmount = Math.round((grossAmount * tdsRate / 100) * 100) / 100; // Round to 2 decimals
  return {
    grossAmount,
    tdsAmount,
    netAmount: grossAmount - tdsAmount
  };
}

/**
 * Get financial year from date
 * FY runs April to March
 */
export function getFinancialYear(date: Date): string {
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();
  
  if (month >= 3) { // April onwards
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

/**
 * Get TDS quarter from date
 * Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar
 */
export function getTdsQuarter(date: Date): string {
  const month = date.getMonth(); // 0-11
  
  if (month >= 3 && month <= 5) return 'Q1';
  if (month >= 6 && month <= 8) return 'Q2';
  if (month >= 9 && month <= 11) return 'Q3';
  return 'Q4';
}

/**
 * Validate PAN format
 * PAN format: XXXXX0000X (5 letters, 4 digits, 1 letter)
 */
export function isValidPan(pan: string | null | undefined): boolean {
  if (!pan) return false;
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  return panRegex.test(pan.toUpperCase());
}

/**
 * Format PAN for display (uppercase)
 */
export function formatPan(pan: string | null | undefined): string {
  if (!pan) return '-';
  return pan.toUpperCase();
}
