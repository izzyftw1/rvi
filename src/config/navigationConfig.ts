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
 * - iconName: Lucide icon name (kebab-case)
 */

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
  Scissors,
  Flame,
  Cpu,
  Wrench,
  Timer,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  icon: LucideIcon;
  allowedRoles: string[];
  items: NavItem[];
}

/**
 * All navigation groups and their items.
 * Add new pages here to make them appear in navigation.
 */
export const navigationGroups: NavGroup[] = [
  {
    title: "Sales & Customers",
    icon: FileText,
    allowedRoles: ['admin', 'sales'],
    items: [
      { label: "Sales Orders", path: "/sales", icon: FileText },
      { label: "Customers", path: "/customers", icon: Users },
      { label: "Items", path: "/items", icon: Box },
    ]
  },
  {
    title: "Procurement",
    icon: Truck,
    allowedRoles: ['admin', 'procurement', 'purchase'],
    items: [
      { label: "Raw PO", path: "/purchase/raw-po", icon: Truck },
      { label: "Material Requirements", path: "/material-requirements", icon: Boxes },
      { label: "Purchase Dashboard", path: "/purchase/dashboard", icon: BarChart3 },
    ]
  },
  {
    title: "Production",
    icon: Activity,
    allowedRoles: ['admin', 'production', 'ops_manager'],
    items: [
      // === Entry Points (Data Sources) ===
      { label: "Work Orders", path: "/work-orders", icon: Search },
      { label: "Daily Production Log", path: "/daily-production-log", icon: FileSpreadsheet },
      { label: "CNC Programmer Activity", path: "/cnc-programmer-activity", icon: Cpu },
      { label: "Cutting", path: "/cutting", icon: Scissors },
      { label: "Forging", path: "/forging", icon: Flame },
      // === Dashboards (Read-Only Views) ===
      { label: "Floor Dashboard", path: "/floor-dashboard", icon: Activity },
      { label: "CNC Dashboard", path: "/cnc-dashboard", icon: Activity },
      { label: "Production Progress", path: "/production-progress", icon: Activity },
      // === Analytics (Derived from Production Log) ===
      { label: "Machine Utilisation", path: "/machine-utilisation", icon: Gauge },
      { label: "Operator Efficiency", path: "/operator-efficiency", icon: Users },
      { label: "Setter Efficiency", path: "/setter-efficiency", icon: Wrench },
      { label: "Downtime Analytics", path: "/downtime-analytics", icon: Timer },
    ]
  },
  {
    title: "Quality",
    icon: ClipboardCheck,
    allowedRoles: ['admin', 'production', 'quality'],
    items: [
      { label: "Quality Dashboard", path: "/quality", icon: ClipboardCheck },
      { label: "Incoming QC", path: "/qc/incoming", icon: Box },
      { label: "Hourly QC", path: "/hourly-qc", icon: Clock },
      { label: "Final QC", path: "/final-qc", icon: CheckCircle },
      { label: "NCR Management", path: "/ncr", icon: XCircle },
      { label: "Traceability", path: "/quality/traceability", icon: GitBranch },
      { label: "Quality Documents", path: "/quality/documents", icon: FileCheck },
      { label: "Quality Analytics", path: "/quality/analytics", icon: BarChart3 },
      { label: "Tolerances", path: "/tolerance-setup", icon: Gauge },
      { label: "Instruments", path: "/instruments", icon: Wrench },
    ]
  },
  {
    title: "Finance",
    icon: DollarSign,
    allowedRoles: ['admin', 'finance', 'finance_admin', 'finance_user', 'accounts', 'sales'],
    items: [
      { label: "Finance Dashboard", path: "/finance/dashboard", icon: DollarSign },
      { label: "Invoices", path: "/finance/invoices", icon: Receipt },
      { label: "Payments", path: "/finance/payments", icon: CreditCard },
      { label: "Aging", path: "/finance/aging", icon: Clock },
      { label: "Reconciliations", path: "/reports/reconciliation", icon: AlertCircle },
      { label: "All Reports", path: "/finance/reports", icon: FileSpreadsheet },
      { label: "Settings", path: "/finance/settings", icon: Settings },
    ]
  },
  {
    title: "Logistics",
    icon: PackageCheck,
    allowedRoles: ['admin', 'production', 'procurement', 'logistics', 'stores', 'packing'],
    items: [
      { label: "Goods Inwards", path: "/materials/inwards", icon: Box },
      { label: "Logistics Dashboard", path: "/logistics", icon: PackageCheck },
      { label: "Packing", path: "/packing", icon: Package },
      { label: "Dispatch", path: "/dispatch", icon: Truck },
      { label: "RPO vs Inventory", path: "/reports/rpo-inventory", icon: FileSpreadsheet },
    ]
  },
  {
    title: "External Processes",
    icon: Handshake,
    allowedRoles: ['admin', 'production', 'logistics', 'ops_manager'],
    items: [
      { label: "External Partners", path: "/partners", icon: Handshake },
      { label: "External Efficiency", path: "/external-efficiency", icon: BarChart3 },
      { label: "External Moves", path: "/logistics", icon: Truck },
      { label: "Partner Performance", path: "/partner-performance", icon: PackageCheck },
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
