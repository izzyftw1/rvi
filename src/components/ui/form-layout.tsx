import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORM LAYOUT COMPONENTS - Standard patterns for forms and modals
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Use these components to create consistent form layouts:
 * - FormSection: Groups related fields with a heading
 * - FormRow: Horizontal layout for related fields
 * - FormActions: Standardized button placement at form bottom
 * 
 * STANDARD PATTERNS:
 * - Primary action (submit) is always on the right, uses primary style
 * - Cancel/secondary action is always on the left, uses outline style
 * - Destructive actions use destructive variant
 * - Loading states show on primary button only
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Form Section ───────────────────────────────────────────────────────────
// Groups related fields under a heading. Reduces perceived form length.

interface FormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Adds a separator line above the section (except first) */
  withSeparator?: boolean;
}

export const FormSection = ({ 
  title, 
  description, 
  children, 
  className,
  withSeparator = false 
}: FormSectionProps) => (
  <div className={cn("space-y-3", className)}>
    {withSeparator && <div className="border-t border-border/50 my-1" />}
    <div className="space-y-0.5">
      <h4 className="text-sm font-medium text-foreground/90">{title}</h4>
      {description && (
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      )}
    </div>
    <div className="space-y-3">
      {children}
    </div>
  </div>
);

// ─── Form Row ───────────────────────────────────────────────────────────────
// Horizontal layout for related fields. Responsive: stacks on mobile.

interface FormRowProps {
  children: ReactNode;
  /** Number of columns (2, 3, or 4). Defaults to 2. */
  cols?: 2 | 3 | 4;
  className?: string;
}

export const FormRow = ({ children, cols = 2, className }: FormRowProps) => {
  const colsClass = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-3", colsClass[cols], className)}>
      {children}
    </div>
  );
};

// ─── Form Field ─────────────────────────────────────────────────────────────
// Single field wrapper with consistent spacing

interface FormFieldProps {
  children: ReactNode;
  /** Span multiple columns in a grid */
  colSpan?: 1 | 2 | 3 | 4 | "full";
  className?: string;
}

export const FormField = ({ children, colSpan, className }: FormFieldProps) => {
  const spanClass = colSpan === "full" 
    ? "col-span-full" 
    : colSpan 
      ? `sm:col-span-${colSpan}` 
      : "";

  return (
    <div className={cn("space-y-2", spanClass, className)}>
      {children}
    </div>
  );
};

// ─── Form Actions ───────────────────────────────────────────────────────────
// Standardized button placement at form bottom

interface FormActionsProps {
  children: ReactNode;
  className?: string;
  /** Alignment: 'end' (default), 'between', 'center' */
  align?: "end" | "between" | "center";
}

export const FormActions = ({ children, className, align = "end" }: FormActionsProps) => {
  const alignClass = {
    end: "justify-end",
    between: "justify-between",
    center: "justify-center",
  };

  return (
    <div className={cn(
      "flex gap-2.5 pt-5 border-t border-border/50 mt-5",
      alignClass[align],
      className
    )}>
      {children}
    </div>
  );
};

// ─── Standard Button Labels ─────────────────────────────────────────────────
// Use these labels consistently across all forms:
// 
// PRIMARY ACTIONS:
// - "Save" - For updating existing records
// - "Create" / "Add [Entity]" - For creating new records
// - "Submit" - For submitting forms for review/approval
// - "Confirm" - For confirming an action
// 
// SECONDARY ACTIONS:
// - "Cancel" - For closing without saving
// - "Back" - For multi-step forms
// - "Reset" - For clearing the form
// 
// DESTRUCTIVE ACTIONS:
// - "Delete" - For permanent deletion
// - "Remove" - For removing from a list/association
// 
// LOADING STATES:
// - "Saving..." / "Creating..." / "Submitting..."
// - Never show loading on Cancel button

// ─── Form Container ─────────────────────────────────────────────────────────
// Wrapper for modal/dialog forms with consistent padding

interface FormContainerProps {
  children: ReactNode;
  className?: string;
  /** onSubmit handler for form */
  onSubmit?: (e: React.FormEvent) => void;
}

export const FormContainer = ({ children, className, onSubmit }: FormContainerProps) => (
  <form 
    onSubmit={onSubmit} 
    className={cn("space-y-5", className)}
  >
    {children}
  </form>
);

// ─── Form Hint ──────────────────────────────────────────────────────────────
// Helper text below a field

interface FormHintProps {
  children: ReactNode;
  variant?: "default" | "error" | "warning";
}

export const FormHint = ({ children, variant = "default" }: FormHintProps) => {
  const variantClass = {
    default: "text-muted-foreground",
    error: "text-destructive",
    warning: "text-amber-600 dark:text-amber-400",
  };

  return (
    <p className={cn("text-xs mt-1", variantClass[variant])}>
      {children}
    </p>
  );
};

// ─── Required Indicator ─────────────────────────────────────────────────────
// Consistent "required" indicator for labels

export const RequiredIndicator = () => (
  <span className="text-destructive ml-0.5">*</span>
);
