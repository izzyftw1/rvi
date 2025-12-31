/**
 * Shared Material Master Constants
 * 
 * SINGLE SOURCE OF TRUTH for all material-related dropdown options.
 * These values MUST be used consistently across:
 * - Sales
 * - Production
 * - Procurement
 * - Logistics
 * - External Processes
 * - Inventory
 * - Finance
 * - Dashboards & Reports
 * 
 * DO NOT duplicate these values in components.
 * Import from this file instead.
 */

/**
 * External Processing Types
 * Used by: Partners, SendToExternalDialog, GateRegister, ExternalPartnersManagement
 */
export const PROCESS_TYPES = [
  "Cutting",
  "Forging", 
  "Heat Treatment",
  "Plating",
  "Job Work",
  "Buffing",
  "Blasting"
] as const;

export type ProcessType = typeof PROCESS_TYPES[number];

/**
 * Process Options with metadata
 * Used by: SendToExternalDialog for enhanced process selection
 */
export const PROCESS_OPTIONS = [
  { value: "Cutting", label: "Cutting (Internal)", prefix: "CT", preProduction: true, internal: true },
  { value: "Forging", label: "Forging", prefix: "FG", preProduction: true, internal: false },
  { value: "Heat Treatment", label: "Heat Treatment", prefix: "HT", preProduction: true, internal: false },
  { value: "Plating", label: "Plating", prefix: "PL", preProduction: false, internal: false },
  { value: "Job Work", label: "Job Work", prefix: "JW", preProduction: false, internal: false },
  { value: "Buffing", label: "Buffing", prefix: "BF", preProduction: false, internal: false },
  { value: "Blasting", label: "Blasting", prefix: "BL", preProduction: false, internal: false },
] as const;

/**
 * Pre-production processes (can be done before production release)
 */
export const PRE_PRODUCTION_PROCESSES = ["Forging", "Heat Treatment", "Cutting"] as const;

/**
 * Internal processes (don't require external partner)
 */
export const INTERNAL_PROCESSES = ["Cutting"] as const;

/**
 * Gate Register Direction Types
 */
export const GATE_DIRECTIONS = ["in", "out"] as const;
export type GateDirection = typeof GATE_DIRECTIONS[number];

/**
 * Movement Types for Gate Register
 */
export const MOVEMENT_TYPES = [
  { value: "raw_material", label: "Raw Material Receipt" },
  { value: "external_return", label: "External Processing Return" },
  { value: "customer_return", label: "Customer Return" },
  { value: "transfer_in", label: "Inter-Site Transfer In" },
  { value: "production_out", label: "Production Output" },
  { value: "external_send", label: "External Processing Send" },
  { value: "dispatch", label: "Customer Dispatch" },
  { value: "transfer_out", label: "Inter-Site Transfer Out" },
] as const;

export type MovementType = typeof MOVEMENT_TYPES[number]["value"];
