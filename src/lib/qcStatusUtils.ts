/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QC STATUS UTILITIES - System-Wide Authoritative Source Definitions
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module defines the single source of truth for QC status resolution.
 * All components should use these utilities to ensure consistent behavior.
 * 
 * QC TYPES AND THEIR AUTHORITATIVE SOURCES:
 * 
 * 1. Raw Material QC
 *    - Status field: work_orders.qc_material_status
 *    - Boolean field: work_orders.qc_material_passed (derived from status)
 *    - If status is null/pending → NOT passed
 *    - If status is 'passed' or 'waived' → passed
 * 
 * 2. First Piece QC
 *    - Status field: work_orders.qc_first_piece_status
 *    - Boolean field: work_orders.qc_first_piece_passed (derived from status)
 *    - BLOCKED if Raw Material QC is not complete
 *    - If status is null/pending → NOT passed
 *    - If status is 'passed' or 'waived' → passed
 * 
 * 3. In-Process QC (Hourly Checks)
 *    - Source: hourly_qc_checks table
 *    - Status: Based on latest check result
 *    - No blocking dependency
 * 
 * 4. Final QC
 *    - Source: qc_final_reports table
 *    - Status: Based on report existence and result
 *    - Should only be possible after production complete
 * 
 * KEY RULES:
 * - NEVER show green/passed if status is null, undefined, or 'pending'
 * - 'pending' means ready for action (amber)
 * - 'blocked' means cannot act due to dependency (gray)
 * - Use status strings as source of truth, not booleans
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type QCStatusValue = 
  | 'passed' 
  | 'pass' 
  | 'failed' 
  | 'fail' 
  | 'pending' 
  | 'blocked' 
  | 'waived' 
  | 'hold' 
  | 'not_started' 
  | null 
  | undefined;

/**
 * Normalize any status string to a standard QCStatusValue
 */
export const normalizeQCStatus = (status: string | null | undefined): QCStatusValue => {
  if (!status) return 'pending';
  const s = status.toLowerCase().trim();
  
  if (s === 'pass' || s === 'passed') return 'passed';
  if (s === 'fail' || s === 'failed') return 'failed';
  if (s === 'hold') return 'hold';
  if (s === 'waived' || s === 'waive') return 'waived';
  if (s === 'blocked') return 'blocked';
  if (s === 'not_started' || s === 'not started') return 'not_started';
  
  return 'pending';
};

/**
 * Check if a QC gate is complete (passed or waived)
 * ONLY these statuses should show green indicators
 */
export const isQCGateComplete = (status: QCStatusValue): boolean => {
  const normalized = normalizeQCStatus(status as string);
  return normalized === 'passed' || normalized === 'waived';
};

/**
 * Check if a QC gate has failed
 */
export const isQCGateFailed = (status: QCStatusValue): boolean => {
  const normalized = normalizeQCStatus(status as string);
  return normalized === 'failed';
};

/**
 * Check if a QC gate is on hold
 */
export const isQCGateOnHold = (status: QCStatusValue): boolean => {
  const normalized = normalizeQCStatus(status as string);
  return normalized === 'hold';
};

/**
 * Check if a QC gate is pending (can be acted upon)
 */
export const isQCGatePending = (status: QCStatusValue): boolean => {
  const normalized = normalizeQCStatus(status as string);
  return normalized === 'pending' || normalized === 'not_started' || normalized === null;
};

/**
 * Resolve the display status for a QC gate, considering dependencies
 * 
 * @param status - The raw status value
 * @param isBlocked - Whether this gate is blocked by a dependency
 * @returns The resolved display status
 */
export const resolveQCDisplayStatus = (
  status: QCStatusValue,
  isBlocked: boolean = false
): QCStatusValue => {
  const normalized = normalizeQCStatus(status as string);
  
  // If blocked and not yet completed, show as blocked
  if (isBlocked && isQCGatePending(normalized)) {
    return 'blocked';
  }
  
  return normalized;
};

/**
 * Get the First Piece QC display status considering Material QC dependency
 * 
 * @param firstPieceStatus - The First Piece QC status
 * @param materialStatus - The Material QC status
 * @returns The resolved display status for First Piece QC
 */
export const getFirstPieceDisplayStatus = (
  firstPieceStatus: QCStatusValue,
  materialStatus: QCStatusValue
): QCStatusValue => {
  const materialComplete = isQCGateComplete(materialStatus);
  return resolveQCDisplayStatus(firstPieceStatus, !materialComplete);
};

/**
 * Determine the overall QC gates status for a work order
 * 
 * @returns 'complete' | 'blocked' | 'pending' | 'failed'
 */
export const getOverallQCGatesStatus = (
  materialStatus: QCStatusValue,
  firstPieceStatus: QCStatusValue
): 'complete' | 'blocked' | 'pending' | 'failed' => {
  const materialNorm = normalizeQCStatus(materialStatus as string);
  const firstPieceNorm = normalizeQCStatus(firstPieceStatus as string);
  
  // Check for failures first
  if (isQCGateFailed(materialNorm) || isQCGateFailed(firstPieceNorm)) {
    return 'failed';
  }
  
  // Check if all gates are complete
  if (isQCGateComplete(materialNorm) && isQCGateComplete(firstPieceNorm)) {
    return 'complete';
  }
  
  // Check if material is blocking first piece
  if (isQCGatePending(materialNorm)) {
    return 'blocked';
  }
  
  // Material complete but first piece pending
  return 'pending';
};

/**
 * Helper to get appropriate indicator color class based on QC status
 * For use with Tailwind CSS classes
 */
export const getQCStatusColorClass = (status: QCStatusValue): {
  bg: string;
  text: string;
  border: string;
} => {
  const normalized = normalizeQCStatus(status as string);
  
  switch (normalized) {
    case 'passed':
    case 'waived':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/30',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800'
      };
    case 'failed':
      return {
        bg: 'bg-red-50 dark:bg-red-950/30',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800'
      };
    case 'hold':
      return {
        bg: 'bg-orange-50 dark:bg-orange-950/30',
        text: 'text-orange-600 dark:text-orange-400',
        border: 'border-orange-200 dark:border-orange-800'
      };
    case 'pending':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/30',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-200 dark:border-amber-800'
      };
    case 'blocked':
      return {
        bg: 'bg-slate-100 dark:bg-slate-900/30',
        text: 'text-slate-500 dark:text-slate-400',
        border: 'border-slate-200 dark:border-slate-700'
      };
    default:
      return {
        bg: 'bg-muted/30',
        text: 'text-muted-foreground',
        border: 'border-muted'
      };
  }
};
