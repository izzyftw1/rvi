/**
 * Deprecation Configuration for Production and Quality Pages
 * 
 * This file tracks which pages are deprecated and should be hidden from navigation.
 * Routes remain accessible for verification until functional parity is confirmed.
 * 
 * STATUS LEVELS:
 * - 'active': Page is fully operational and visible in navigation
 * - 'deprecated': Page hidden from navigation but route remains accessible
 * - 'verified': Functional parity confirmed, ready for hard deletion
 * 
 * IMPORTANT: Only change status to 'verified' after confirming all data and 
 * actions from this page exist elsewhere (see docs/FEATURE_INVENTORY.md)
 */

export type DeprecationStatus = 'active' | 'deprecated' | 'verified';

export interface PageDeprecation {
  path: string;
  status: DeprecationStatus;
  deprecatedDate?: string;
  verifiedDate?: string;
  replacedBy?: string;
  notes?: string;
}

/**
 * Production Pages Deprecation Status
 * Paths must match exactly what's in navigationConfig.ts
 */
export const productionPagesStatus: PageDeprecation[] = [
  { path: '/work-orders', status: 'active' },
  { path: '/daily-production-log', status: 'active' },
  { path: '/cnc-programmer-activity', status: 'active' },
  { path: '/cutting', status: 'active' },
  { path: '/forging', status: 'active' },
  { path: '/floor-dashboard', status: 'active' },
  { path: '/cnc-dashboard', status: 'active' },
  { path: '/production-progress', status: 'active' },
  { path: '/machine-utilisation', status: 'deprecated', deprecatedDate: '2026-01-10', replacedBy: '/production-performance', notes: 'Merged into Production Performance Dashboard' },
  { path: '/operator-efficiency', status: 'deprecated', deprecatedDate: '2026-01-10', replacedBy: '/production-performance', notes: 'Merged into Production Performance Dashboard' },
  { path: '/setter-efficiency', status: 'active', notes: 'Restored - Essential for CNC programmer activity data entry and setter analytics' },
  { path: '/downtime-analytics', status: 'deprecated', deprecatedDate: '2026-01-10', replacedBy: '/production-performance', notes: 'Merged into Production Performance Dashboard' },
  { path: '/machine-status', status: 'active' },
  { path: '/gantt', status: 'active' },
  { path: '/factory-calendar', status: 'active' },
];

/**
 * Quality Pages Deprecation Status
 * Paths must match exactly what's in navigationConfig.ts
 */
export const qualityPagesStatus: PageDeprecation[] = [
  { path: '/quality', status: 'active' },
  { path: '/qc/incoming', status: 'active' },
  { path: '/hourly-qc', status: 'active' },
  { path: '/final-qc', status: 'active' },
  { path: '/final-qc-list', status: 'active' },
  { path: '/ncr', status: 'active' },
  { path: '/ncr/:id', status: 'active' },
  { path: '/quality/traceability', status: 'active' },
  { path: '/quality/documents', status: 'active' },
  { path: '/quality/analytics', status: 'active' },
  { path: '/tolerance-setup', status: 'active' },
  { path: '/instruments', status: 'active' },
];

/**
 * Combined deprecation registry
 */
export const allPagesStatus: PageDeprecation[] = [
  ...productionPagesStatus,
  ...qualityPagesStatus,
];

/**
 * Check if a page should be hidden from navigation
 */
export function isHiddenFromNav(path: string): boolean {
  const page = allPagesStatus.find(p => p.path === path);
  return page?.status === 'deprecated' || page?.status === 'verified';
}

/**
 * Check if a page is deprecated (for showing deprecation notice)
 */
export function isDeprecated(path: string): boolean {
  const page = allPagesStatus.find(p => p.path === path);
  return page?.status === 'deprecated';
}

/**
 * Get deprecation info for a page
 */
export function getDeprecationInfo(path: string): PageDeprecation | undefined {
  return allPagesStatus.find(p => p.path === path);
}

/**
 * Get all deprecated pages
 */
export function getDeprecatedPages(): PageDeprecation[] {
  return allPagesStatus.filter(p => p.status === 'deprecated');
}

/**
 * Get all pages ready for hard deletion
 */
export function getVerifiedPages(): PageDeprecation[] {
  return allPagesStatus.filter(p => p.status === 'verified');
}
