import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}

const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ className, title, description, icon, actions, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("pb-1", className)} {...props}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2.5">
              {icon && <span className="text-primary shrink-0">{icon}</span>}
              {title}
            </h1>
            {description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {actions}
            </div>
          )}
        </div>
      </div>
    );
  }
);
PageHeader.displayName = "PageHeader";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
}

const PageContainer = React.forwardRef<HTMLDivElement, PageContainerProps>(
  ({ className, children, maxWidth = "full", ...props }, ref) => {
    const maxWidthClasses = {
      sm: "max-w-2xl",
      md: "max-w-4xl",
      lg: "max-w-5xl",
      xl: "max-w-6xl",
      "2xl": "max-w-7xl",
      full: "max-w-full",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "mx-auto w-full px-4 py-5 sm:px-6 lg:px-8",
          maxWidthClasses[maxWidth],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
PageContainer.displayName = "PageContainer";

interface PageSectionProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageSection = React.forwardRef<HTMLElement, PageSectionProps>(
  ({ className, children, title, description, actions, ...props }, ref) => {
    return (
      <section ref={ref} className={cn("space-y-4", className)} {...props}>
        {(title || actions) && (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              {title && (
                <h2 className="text-sm font-semibold text-foreground/90 tracking-tight">{title}</h2>
              )}
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
            </div>
            {actions && (
              <div className="flex items-center gap-2 shrink-0">{actions}</div>
            )}
          </div>
        )}
        {(title || description) && <div className="border-t border-border/50" />}
        {children}
      </section>
    );
  }
);
PageSection.displayName = "PageSection";

interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const FormActions = React.forwardRef<HTMLDivElement, FormActionsProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5 pt-4 border-t border-border/50 mt-5",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
FormActions.displayName = "FormActions";

export { PageHeader, PageContainer, PageSection, FormActions };
