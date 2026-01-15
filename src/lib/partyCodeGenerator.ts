/**
 * Deterministic Party Code Generator
 * 
 * Generates party codes following the exact offline logic:
 * - Domestic: D + StateCode + SalesCode + Serial (e.g., DGU2325)
 * - Export: E + SalesCode + Serial (e.g., E2325)
 */

// State code mapping for Indian states
export const STATE_CODES: Record<string, string> = {
  'andhra pradesh': 'AP',
  'arunachal pradesh': 'AR',
  'assam': 'AS',
  'bihar': 'BR',
  'chhattisgarh': 'CG',
  'goa': 'GA',
  'gujarat': 'GU',
  'haryana': 'HR',
  'himachal pradesh': 'HP',
  'jharkhand': 'JH',
  'karnataka': 'KA',
  'kerala': 'KL',
  'madhya pradesh': 'MP',
  'maharashtra': 'MH',
  'manipur': 'MN',
  'meghalaya': 'ML',
  'mizoram': 'MZ',
  'nagaland': 'NL',
  'odisha': 'OD',
  'punjab': 'PB',
  'rajasthan': 'RJ',
  'sikkim': 'SK',
  'tamil nadu': 'TN',
  'telangana': 'TS',
  'tripura': 'TR',
  'uttar pradesh': 'UP',
  'uttarakhand': 'UK',
  'west bengal': 'WB',
  // Union Territories
  'andaman and nicobar islands': 'AN',
  'chandigarh': 'CH',
  'dadra and nagar haveli': 'DN',
  'daman and diu': 'DD',
  'delhi': 'DL',
  'jammu and kashmir': 'JK',
  'ladakh': 'LA',
  'lakshadweep': 'LD',
  'puducherry': 'PY',
};

// Salesperson email to code mapping
export const SALESPERSON_CODES: Record<string, string> = {
  'sales@brasspartsindia.net': '0',
  'abhi@brasspartsindia.net': '2',
  'ronak@brasspartsindia.net': '3',
  'amit@brasspartsindia.net': '4',
  'mitul@brasspartsindia.net': '6',
  'nitish@brasspartsindia.net': '9',
  'harsha@brasspartsindia.net': '7',
  'sahil@brasspartsindia.net': '8',
  'atulkumar@brasspartsindia.net': '10',
  'marcin@brasspartsindia.net': '11',
  'dhaval@brasspartsindia.net': '12',
};

// Salesperson name to code mapping (fallback when email not available)
export const SALESPERSON_NAME_CODES: Record<string, string> = {
  'sales': '0',
  'abhi': '2',
  'ronak': '3',
  'amit': '4',
  'mitul': '6',
  'nitish': '9',
  'harsha': '7',
  'sahil': '8',
  'atulkumar': '10',
  'atul kumar': '10',
  'atul': '10',
  'marcin': '11',
  'dhaval': '12',
};

/**
 * Get state code from state name
 */
export function getStateCode(state: string | null | undefined): string {
  if (!state) return 'ZZ';
  const normalizedState = state.toLowerCase().trim();
  return STATE_CODES[normalizedState] || 'ZZ';
}

/**
 * Get salesperson code from email
 */
export function getSalespersonCodeFromEmail(email: string | null | undefined): string {
  if (!email) return 'XX';
  const normalizedEmail = email.toLowerCase().trim();
  return SALESPERSON_CODES[normalizedEmail] || 'XX';
}

/**
 * Get salesperson code from name (fallback)
 */
export function getSalespersonCodeFromName(name: string | null | undefined): string {
  if (!name) return 'XX';
  const normalizedName = name.toLowerCase().trim();
  
  // Try exact match first
  if (SALESPERSON_NAME_CODES[normalizedName]) {
    return SALESPERSON_NAME_CODES[normalizedName];
  }
  
  // Try first name only
  const firstName = normalizedName.split(' ')[0];
  return SALESPERSON_NAME_CODES[firstName] || 'XX';
}

/**
 * Determine business type from country
 */
export function getBusinessType(country: string | null | undefined): 'domestic' | 'export' {
  if (!country) return 'export';
  const normalizedCountry = country.toLowerCase().trim();
  return normalizedCountry === 'india' ? 'domestic' : 'export';
}

/**
 * Extract serial number from existing party codes
 * Returns the numeric portion if found
 */
export function extractSerialFromPartyCode(partyCode: string | null | undefined): number | null {
  if (!partyCode) return null;
  
  // Match the last 3 digits in the party code
  const match = partyCode.match(/(\d{3})$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  
  // Also try to find any trailing numbers
  const numMatch = partyCode.match(/(\d+)$/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    // Only return if it's a reasonable serial
    if (num > 0 && num < 10000) {
      return num;
    }
  }
  
  return null;
}

/**
 * Calculate next serial number from existing party codes
 * Minimum start is 325, finds max and adds 1
 */
export function calculateNextSerial(existingPartyCodes: (string | null)[]): number {
  const MIN_SERIAL = 325;
  let maxSerial = MIN_SERIAL - 1;
  
  for (const code of existingPartyCodes) {
    const serial = extractSerialFromPartyCode(code);
    if (serial !== null && serial > maxSerial) {
      maxSerial = serial;
    }
  }
  
  return maxSerial + 1;
}

/**
 * Format serial number to 3 digits with left padding
 */
export function formatSerial(serial: number): string {
  return serial.toString().padStart(3, '0');
}

interface PartyCodeParams {
  country: string | null | undefined;
  state: string | null | undefined;
  salespersonEmail?: string | null;
  salespersonName?: string | null;
  existingPartyCodes: (string | null)[];
}

/**
 * Generate a deterministic party code
 * 
 * @param params - Parameters for code generation
 * @returns Generated party code
 * 
 * Format:
 * - Domestic: D + StateCode(2) + SalesCode(1-2) + Serial(3)
 * - Export: E + SalesCode(1-2) + Serial(3)
 */
export function generatePartyCode(params: PartyCodeParams): string {
  const { country, state, salespersonEmail, salespersonName, existingPartyCodes } = params;
  
  const businessType = getBusinessType(country);
  const prefix = businessType === 'domestic' ? 'D' : 'E';
  
  // Get salesperson code (prefer email, fallback to name)
  let salesCode = salespersonEmail 
    ? getSalespersonCodeFromEmail(salespersonEmail)
    : getSalespersonCodeFromName(salespersonName);
  
  // Calculate serial
  const serial = calculateNextSerial(existingPartyCodes);
  const serialStr = formatSerial(serial);
  
  if (businessType === 'domestic') {
    const stateCode = getStateCode(state);
    return `${prefix}${stateCode}${salesCode}${serialStr}`;
  } else {
    return `${prefix}${salesCode}${serialStr}`;
  }
}

/**
 * Validate if a party code matches the expected format
 */
export function isValidPartyCodeFormat(partyCode: string): boolean {
  // Domestic format: D + 2 letter state + 1-2 digit sales code + 3 digit serial
  const domesticPattern = /^D[A-Z]{2}\d{1,2}\d{3}$/;
  // Export format: E + 1-2 digit sales code + 3 digit serial
  const exportPattern = /^E\d{1,2}\d{3}$/;
  
  return domesticPattern.test(partyCode) || exportPattern.test(partyCode);
}
