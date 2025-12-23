import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  Package, 
  FileText, 
  Users, 
  Settings, 
  Search,
  Inbox,
  ClipboardList,
  Truck,
  Factory,
  FlaskConical,
  AlertTriangle,
  Calendar,
  DollarSign,
  BarChart3,
  ArrowRight,
  Wrench,
  LucideIcon
} from "lucide-react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EMPTY STATE COMPONENT - Actionable empty state messaging
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ALWAYS explain:
 * 1. WHY the page is empty (context)
 * 2. WHAT action creates data (trigger condition)
 * 3. HOW to take that action (button or link)
 * 
 * NO passive "No data" messages - every empty state must guide user action.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Preset icons for common empty states
export const EMPTY_STATE_ICONS = {
  workOrders: ClipboardList,
  invoices: FileText,
  customers: Users,
  items: Package,
  partners: Truck,
  production: Factory,
  quality: FlaskConical,
  search: Search,
  inbox: Inbox,
  settings: Settings,
  alerts: AlertTriangle,
  calendar: Calendar,
  finance: DollarSign,
  reports: BarChart3,
  operators: Users,
  machines: Wrench,
  default: Inbox,
} as const;

export type EmptyStateIconType = keyof typeof EMPTY_STATE_ICONS;

interface EmptyStateProps {
  /** Main headline explaining the empty state */
  title: string;
  /** Description explaining why it's empty and what will populate it */
  description: string;
  /** Icon type from presets, or a custom LucideIcon */
  icon?: EmptyStateIconType | LucideIcon;
  /** Optional action button - the KEY to making empty states actionable */
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "secondary";
  };
  /** Optional secondary action */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Additional hint text below the description */
  hint?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional className */
  className?: string;
}

export const EmptyState = ({
  title,
  description,
  icon = "default",
  action,
  secondaryAction,
  hint,
  size = "md",
  className,
}: EmptyStateProps) => {
  // Resolve icon - either from presets or custom
  const Icon = typeof icon === "string" 
    ? EMPTY_STATE_ICONS[icon] || EMPTY_STATE_ICONS.default
    : icon;

  const sizeConfig = {
    sm: {
      container: "py-6",
      icon: "h-8 w-8",
      title: "text-sm font-medium",
      description: "text-xs",
      hint: "text-xs",
    },
    md: {
      container: "py-10",
      icon: "h-10 w-10",
      title: "text-sm font-medium",
      description: "text-sm",
      hint: "text-xs",
    },
    lg: {
      container: "py-14",
      icon: "h-12 w-12",
      title: "text-base font-semibold",
      description: "text-sm",
      hint: "text-xs",
    },
  };

  const config = sizeConfig[size];

  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center",
      config.container,
      className
    )}>
      <div className="rounded-full bg-muted/60 p-3.5 mb-3">
        <Icon className={cn(config.icon, "text-muted-foreground/50")} />
      </div>
      
      <h3 className={cn(config.title, "text-foreground/90 mb-1")}>
        {title}
      </h3>
      
      <p className={cn(config.description, "text-muted-foreground max-w-sm leading-relaxed")}>
        {description}
      </p>

      {hint && (
        <p className={cn(config.hint, "text-muted-foreground/60 max-w-xs mt-2 italic")}>
          {hint}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-4">
          {action && (
            <Button
              variant={action.variant || "default"}
              size={size === "sm" ? "sm" : "default"}
              onClick={action.onClick}
              className="gap-2"
            >
              {action.label}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="ghost"
              size={size === "sm" ? "sm" : "default"}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Table Empty State ──────────────────────────────────────────────────────
// For use inside table bodies when no rows exist

interface TableEmptyStateProps {
  colSpan: number;
  title?: string;
  description: string;
  icon?: EmptyStateIconType | LucideIcon;
}

export const TableEmptyState = ({
  colSpan,
  title,
  description,
  icon = "default",
}: TableEmptyStateProps) => {
  const Icon = typeof icon === "string" 
    ? EMPTY_STATE_ICONS[icon] || EMPTY_STATE_ICONS.default
    : icon;

  return (
    <tr>
      <td colSpan={colSpan} className="py-10">
        <div className="flex flex-col items-center justify-center text-center">
          <Icon className="h-8 w-8 text-muted-foreground/40 mb-2.5" />
          {title && (
            <p className="text-sm font-medium text-foreground/90 mb-0.5">{title}</p>
          )}
          <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
            {description}
          </p>
        </div>
      </td>
    </tr>
  );
};

// ─── Card Empty State ───────────────────────────────────────────────────────
// Compact version for use inside cards

interface CardEmptyStateProps {
  message: string;
  hint?: string;
  icon?: EmptyStateIconType | LucideIcon;
}

export const CardEmptyState = ({
  message,
  hint,
  icon = "default",
}: CardEmptyStateProps) => {
  const Icon = typeof icon === "string" 
    ? EMPTY_STATE_ICONS[icon] || EMPTY_STATE_ICONS.default
    : icon;

  return (
    <div className="flex flex-col items-center justify-center py-5 text-center">
      <Icon className="h-7 w-7 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {hint && (
        <p className="text-xs text-muted-foreground/60 mt-1">{hint}</p>
      )}
    </div>
  );
};

// ─── Search Empty State ─────────────────────────────────────────────────────
// Specifically for search results with no matches

interface SearchEmptyStateProps {
  searchTerm: string;
  entityName?: string;
  onClear?: () => void;
}

export const SearchEmptyState = ({
  searchTerm,
  entityName = "results",
  onClear,
}: SearchEmptyStateProps) => (
  <EmptyState
    icon="search"
    title={`No ${entityName} found`}
    description={`No ${entityName} match "${searchTerm}". Try adjusting your search terms or filters.`}
    hint="Check for typos or try a broader search term."
    action={onClear ? {
      label: "Clear Search",
      onClick: onClear,
      variant: "outline",
    } : undefined}
    size="md"
  />
);

// ─── Filter Empty State ─────────────────────────────────────────────────────
// For when filters result in no data

interface FilterEmptyStateProps {
  entityName?: string;
  onClearFilters?: () => void;
}

export const FilterEmptyState = ({
  entityName = "items",
  onClearFilters,
}: FilterEmptyStateProps) => (
  <EmptyState
    icon="search"
    title={`No ${entityName} match your filters`}
    description={`Try adjusting or clearing your filters to see more ${entityName}.`}
    action={onClearFilters ? {
      label: "Clear All Filters",
      onClick: onClearFilters,
      variant: "outline",
    } : undefined}
    size="md"
  />
);

export default EmptyState;
