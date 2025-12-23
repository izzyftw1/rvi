/**
 * CENTRALIZED DOWNTIME REASON CATEGORIES
 * =====================================
 * This is the SINGLE SOURCE OF TRUTH for all downtime reasons.
 * 
 * Each reason belongs to a parent category for analytics grouping.
 * Categories: Material, Machine, Power, QC, Operator, Tooling, Other
 */

export type DowntimeCategory = 
  | 'Material'
  | 'Machine'
  | 'Power'
  | 'QC'
  | 'Operator'
  | 'Tooling'
  | 'Other';

export interface DowntimeReason {
  reason: string;
  category: DowntimeCategory;
}

/**
 * All downtime reasons with their parent categories
 */
export const DOWNTIME_REASONS: DowntimeReason[] = [
  // Material-related
  { reason: "Material Not Available", category: "Material" },
  { reason: "Material Shortage", category: "Material" },
  { reason: "Wrong Material", category: "Material" },
  { reason: "Material Quality Issue", category: "Material" },
  
  // Machine-related
  { reason: "Machine Repair", category: "Machine" },
  { reason: "Machine Breakdown", category: "Machine" },
  { reason: "Machine Maintenance", category: "Machine" },
  { reason: "Machine Calibration", category: "Machine" },
  { reason: "Machine Warmup", category: "Machine" },
  
  // Power-related
  { reason: "No Power", category: "Power" },
  { reason: "Power Fluctuation", category: "Power" },
  { reason: "Compressor Issue", category: "Power" },
  
  // QC-related
  { reason: "Quality Problem", category: "QC" },
  { reason: "QC Hold", category: "QC" },
  { reason: "First Piece Approval", category: "QC" },
  { reason: "Inspection Delay", category: "QC" },
  { reason: "Rework", category: "QC" },
  
  // Operator-related
  { reason: "No Operator", category: "Operator" },
  { reason: "Operator Training", category: "Operator" },
  { reason: "Operator Shifted to Other Work", category: "Operator" },
  { reason: "Tea Break", category: "Operator" },
  { reason: "Lunch Break", category: "Operator" },
  { reason: "Operator Fatigue", category: "Operator" },
  
  // Tooling-related
  { reason: "Tool Change", category: "Tooling" },
  { reason: "Tool Not Available", category: "Tooling" },
  { reason: "Tool Damage", category: "Tooling" },
  { reason: "Tool Setup", category: "Tooling" },
  { reason: "Insert Change", category: "Tooling" },
  
  // Other/General
  { reason: "Job Setting", category: "Other" },
  { reason: "Setting Change", category: "Other" },
  { reason: "Cleaning", category: "Other" },
  { reason: "Program Upload", category: "Other" },
  { reason: "Shift Handover", category: "Other" },
  { reason: "Other", category: "Other" },
];

/**
 * Get just the reason strings for dropdowns
 */
export const DOWNTIME_REASON_LIST = DOWNTIME_REASONS.map(r => r.reason);

/**
 * Get category for a reason
 */
export const getCategoryForReason = (reason: string): DowntimeCategory => {
  const found = DOWNTIME_REASONS.find(r => r.reason.toLowerCase() === reason.toLowerCase());
  return found?.category || 'Other';
};

/**
 * Get all reasons for a category
 */
export const getReasonsForCategory = (category: DowntimeCategory): string[] => {
  return DOWNTIME_REASONS.filter(r => r.category === category).map(r => r.reason);
};

/**
 * Category colors for charts
 */
export const CATEGORY_COLORS: Record<DowntimeCategory, string> = {
  Material: '#f59e0b',    // amber
  Machine: '#ef4444',     // red
  Power: '#8b5cf6',       // violet
  QC: '#3b82f6',          // blue
  Operator: '#10b981',    // emerald
  Tooling: '#f97316',     // orange
  Other: '#6b7280',       // gray
};

/**
 * All categories
 */
export const DOWNTIME_CATEGORIES: DowntimeCategory[] = [
  'Material',
  'Machine',
  'Power',
  'QC',
  'Operator',
  'Tooling',
  'Other',
];
