/**
 * Select Dropdown Safety Utilities
 * 
 * These helpers ensure Select components never have empty/undefined values
 * which can cause silent crashes and rendering issues.
 */

/**
 * Returns a safe value for Select components
 * Falls back to first option or 'unassigned' if value is empty/invalid
 * 
 * @example
 * <Select value={getSafeSelectValue(myValue, options)} ... />
 */
export function getSafeSelectValue(
  value: string | undefined | null,
  options: Array<{ value: string; label?: string }>,
  fallback: string = 'unassigned'
): string {
  // If value exists and is in options, use it
  if (value && value.trim() !== '' && options.some(opt => opt.value === value)) {
    return value;
  }
  
  // Fall back to first valid option
  const firstOption = options.find(opt => opt.value && opt.value.trim() !== '');
  if (firstOption) {
    return firstOption.value;
  }
  
  // Last resort fallback
  return fallback;
}

/**
 * Sanitizes options array to remove any with empty values
 * Also adds optional 'unassigned' option
 * 
 * @example
 * const safeOptions = sanitizeSelectOptions(options, true);
 */
export function sanitizeSelectOptions<T extends { value: string; label: string }>(
  options: T[],
  includeUnassigned: boolean = false
): T[] {
  const sanitized = options.filter(opt => opt.value && opt.value.trim() !== '');
  
  if (includeUnassigned && !sanitized.some(opt => opt.value === 'unassigned')) {
    sanitized.unshift({ value: 'unassigned', label: 'Unassigned' } as T);
  }
  
  return sanitized;
}

/**
 * Validates that a Select value is not empty
 * Use in form validation or before submission
 */
export function isValidSelectValue(value: string | undefined | null): boolean {
  return Boolean(value && value.trim() !== '' && value !== 'unassigned');
}

/**
 * Gets a default value for a Select that requires a selection
 * Returns first option value or throws error if no options available
 */
export function getRequiredSelectDefault(
  options: Array<{ value: string }>,
  errorMessage: string = 'No valid options available for selection'
): string {
  const firstValid = options.find(opt => opt.value && opt.value.trim() !== '');
  
  if (!firstValid) {
    console.error(errorMessage, options);
    throw new Error(errorMessage);
  }
  
  return firstValid.value;
}
