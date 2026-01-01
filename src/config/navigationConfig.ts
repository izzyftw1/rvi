/**
 * CENTRALIZED NAVIGATION CONFIGURATION
 * =====================================
 * This is the SINGLE SOURCE OF TRUTH for all navigation items.
 * 
 * IMPORTANT: When adding a new route to App.tsx, you MUST also add it here!
 * Both App.tsx routes and UnifiedNavigation.tsx use this config.
 * 
 * Each nav item defines:
 * - label: Display name in navigation
 * - path: Route path (must match App.tsx route)
 * - icon: Lucide icon component
 * - pageKey: Key used in department_defaults table for permission checks
 * 
 * DEPRECATION: Pages can be deprecated via src/config/deprecationConfig.ts
 * Deprecated pages are hidden from navigation but routes remain accessible.
 * 
 * PERMISSIONS: Navigation visibility is now controlled by department_defaults table.
 * Admin & Finance roles bypass all permission checks.
 */

import { isHiddenFromNav } from "./deprecationConfig";

import {
  FileText,
  Truck,
  Activity,
  ClipboardCheck,
  DollarSign,
  PackageCheck,
  Users,
  Box,
  Boxes,
  BarChart3,
  Search,
  Package,
  AlertCircle,
  FileSpreadsheet,
  Handshake,
  Settings,
  Gauge,
  CheckCircle,
  XCircle,
  FileCheck,
  GitBranch,
  CreditCard,
  Receipt,
  Clock,
  Wrench,
  Timer,
  ArrowDownToLine,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  pageKey: string; // Key for permission lookup in department_defaults
}

export interface NavGroup {
  title: string;
  icon: LucideIcon;
  allowedRoles: string[]; // Legacy - kept for backwards compatibility
  items: NavItem[];
}

/**
 * All navigation groups and their items.
 * Add new pages here to make them appear in navigation.
 * 
 * pageKey must match the page_key in department_defaults table.
 */
export const navigationGroups: NavGroup[] = [
  {
    title: "Sales & Customers",
    icon: FileText,
    allowedRoles: ['admin', 'sales'],
    items: [
      { label: "Sales Orders", path: "/sales", icon: FileText, pageKey: "sales-orders" },
      { label: "Customers", path: "/customers", icon: Users, pageKey: "customers" },
      { label: "Items", path: "/items", icon: Box, pageKey: "items" },
    ]
  },
  {
    title: "Procurement",
    icon: Truck,
    allowedRoles: ['admin', 'procurement', 'purchase'],
    items: [
      { label: "Raw PO", path: "/purchase/raw-po", icon: Truck, pageKey: "raw-po" },
      { label: "Material Inwards", path: "/materials/inwards", icon: ArrowDownToLine, pageKey: "material-inwards" },
      { label: "Material Requirements", path: "/material-requirements", icon: Boxes, pageKey: "material-requirements" },
      { label: "Purchase Dashboard", path: "/purchase/dashboard", icon: BarChart3, pageKey: "purchase-dashboard" },
    ]
  },
  {
    title: "Production",
    icon: Activity,
    allowedRoles: ['admin', 'production', 'ops_manager'],
    items: [
      { label: "Work Orders", path: "/work-orders", icon: Search, pageKey: "work-orders" },
      { label: "Daily Production Log", path: "/daily-production-log", icon: FileSpreadsheet, pageKey: "daily-production-log" },
      { label: "Floor Dashboard", path: "/floor-dashboard", icon: Activity, pageKey: "floor-dashboard" },
      { label: "CNC Dashboard", path: "/cnc-dashboard", icon: Activity, pageKey: "cnc-dashboard" },
      { label: "Production Progress", path: "/production-progress", icon: Activity, pageKey: "production-progress" },
      { label: "Machine Utilisation", path: "/machine-utilisation", icon: Gauge, pageKey: "machine-utilisation" },
      { label: "Operator Efficiency", path: "/operator-efficiency", icon: Users, pageKey: "operator-efficiency" },
      { label: "Setter Efficiency", path: "/setter-efficiency", icon: Wrench, pageKey: "setter-efficiency" },
      { label: "Downtime Analytics", path: "/downtime-analytics", icon: Timer, pageKey: "downtime-analytics" },
    ]
  },
  {
    title: "Quality",
    icon: ClipboardCheck,
    allowedRoles: ['admin', 'production', 'quality'],
    items: [
      { label: "Quality Dashboard", path: "/quality", icon: ClipboardCheck, pageKey: "quality-dashboard" },
      { label: "Incoming QC", path: "/qc/incoming", icon: Box, pageKey: "qc-incoming" },
      { label: "Hourly QC", path: "/hourly-qc", icon: Clock, pageKey: "hourly-qc" },
      { label: "Final QC", path: "/final-qc", icon: CheckCircle, pageKey: "final-qc" },
      { label: "NCR Management", path: "/ncr", icon: XCircle, pageKey: "ncr" },
      { label: "Traceability", path: "/quality/traceability", icon: GitBranch, pageKey: "traceability" },
      { label: "Quality Documents", path: "/quality/documents", icon: FileCheck, pageKey: "quality-documents" },
      { label: "Quality Analytics", path: "/quality/analytics", icon: BarChart3, pageKey: "quality-analytics" },
      { label: "Tolerances", path: "/tolerance-setup", icon: Gauge, pageKey: "tolerances" },
      { label: "Instruments", path: "/instruments", icon: Wrench, pageKey: "instruments" },
    ]
  },
  {
    title: "Finance",
    icon: DollarSign,
    allowedRoles: ['admin', 'finance', 'finance_admin', 'finance_user', 'accounts', 'sales'],
    items: [
      { label: "Finance Dashboard", path: "/finance/dashboard", icon: DollarSign, pageKey: "finance-dashboard" },
      { label: "Invoices", path: "/finance/invoices", icon: Receipt, pageKey: "invoices" },
      { label: "Customer Receipts", path: "/finance/receipts", icon: Receipt, pageKey: "receipts" },
      { label: "Supplier Payments", path: "/finance/supplier-payments", icon: CreditCard, pageKey: "supplier-payments" },
      { label: "Customer Adjustments", path: "/finance/adjustments", icon: AlertCircle, pageKey: "adjustments" },
      { label: "TDS Report", path: "/finance/tds", icon: FileSpreadsheet, pageKey: "tds-report" },
      { label: "Aging", path: "/finance/aging", icon: Clock, pageKey: "aging" },
      { label: "Reconciliations", path: "/reports/reconciliation", icon: AlertCircle, pageKey: "reconciliations" },
      { label: "All Reports", path: "/finance/reports", icon: FileSpreadsheet, pageKey: "finance-reports" },
      { label: "Settings", path: "/finance/settings", icon: Settings, pageKey: "finance-settings" },
    ]
  },
  {
    title: "Logistics",
    icon: PackageCheck,
    allowedRoles: ['admin', 'production', 'procurement', 'logistics', 'stores', 'packing'],
    items: [
      { label: "Gate Register", path: "/gate-register", icon: ArrowDownToLine, pageKey: "gate-register" },
      { label: "Logistics Dashboard", path: "/logistics", icon: PackageCheck, pageKey: "logistics-dashboard" },
      { label: "Finished Goods", path: "/finished-goods", icon: Package, pageKey: "finished-goods" },
      { label: "Packing", path: "/packing", icon: Package, pageKey: "packing" },
      { label: "Dispatch", path: "/dispatch", icon: Truck, pageKey: "dispatch" },
    ]
  },
  {
    title: "External Processes",
    icon: Handshake,
    allowedRoles: ['admin', 'production', 'logistics', 'ops_manager'],
    items: [
      { label: "Partner Dashboard", path: "/partner-dashboard", icon: Handshake, pageKey: "partner-dashboard" },
      { label: "External Analytics", path: "/external-efficiency", icon: BarChart3, pageKey: "external-analytics" },
    ]
  }
];

/**
 * Helper to get all paths from navigation config
 * Useful for validating routes exist
 */
export const getAllNavigationPaths = (): string[] => {
  return navigationGroups.flatMap(group => group.items.map(item => item.path));
};

/**
 * Helper to find which group a path belongs to
 */
export const findGroupByPath = (path: string): NavGroup | undefined => {
  return navigationGroups.find(group => 
    group.items.some(item => item.path === path || path.startsWith(item.path + '/'))
  );
};

/**
 * Get navigation groups with deprecated items filtered out
 * Use this in navigation components to hide deprecated pages
 */
export const getActiveNavigationGroups = (): NavGroup[] => {
  return navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => !isHiddenFromNav(item.path))
  })).filter(group => group.items.length > 0);
};

/**
 * Get page key from route path
 */
export const getPageKeyFromPath = (path: string): string | null => {
  for (const group of navigationGroups) {
    const item = group.items.find(item => 
      item.path === path || path.startsWith(item.path + '/')
    );
    if (item) return item.pageKey;
  }
  return null;
};
