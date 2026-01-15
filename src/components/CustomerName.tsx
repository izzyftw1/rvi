/**
 * CustomerName Component
 * 
 * A reusable component that displays customer name or party code
 * based on user permissions. Automatically handles the privacy rules.
 * 
 * Usage:
 * <CustomerName customerName="ABC Corp" partyCode="DGU2325" />
 * <CustomerName customerName={customer.customer_name} partyCode={customer.party_code} showBoth />
 */

import { useCanViewCustomerName } from '@/hooks/useCustomerDisplay';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CustomerNameProps {
  customerName?: string | null;
  partyCode?: string | null;
  /** Show both party code and name (for privileged users) */
  showBoth?: boolean;
  /** Format: 'code-name' or 'name-code' when showBoth=true */
  format?: 'code-name' | 'name-code';
  /** Optional className */
  className?: string;
  /** Fallback text when both are empty */
  fallback?: string;
  /** Show skeleton while loading */
  showLoadingSkeleton?: boolean;
}

export function CustomerName({
  customerName,
  partyCode,
  showBoth = false,
  format = 'code-name',
  className,
  fallback = 'N/A',
  showLoadingSkeleton = false,
}: CustomerNameProps) {
  const { canView, loading } = useCanViewCustomerName();
  
  if (loading && showLoadingSkeleton) {
    return <Skeleton className={cn("h-4 w-24", className)} />;
  }
  
  const code = partyCode || '';
  const name = customerName || '';
  
  // No data available
  if (!code && !name) {
    return <span className={className}>{fallback}</span>;
  }
  
  // User cannot view customer names - show party code only
  if (!canView) {
    return <span className={className}>{code || fallback}</span>;
  }
  
  // User can view names
  if (showBoth && code && name) {
    const display = format === 'code-name' 
      ? `${code} - ${name}`
      : `${name} (${code})`;
    return <span className={className}>{display}</span>;
  }
  
  // Show name if available, otherwise code
  return <span className={className}>{name || code || fallback}</span>;
}

/**
 * CustomerNameBadge - Similar to CustomerName but styled as a badge
 */
interface CustomerNameBadgeProps extends CustomerNameProps {
  variant?: 'default' | 'secondary' | 'outline';
}

export function CustomerNameBadge({
  customerName,
  partyCode,
  showBoth = false,
  format = 'code-name',
  className,
  fallback = 'N/A',
  variant = 'secondary',
}: CustomerNameBadgeProps) {
  const { canView, loading } = useCanViewCustomerName();
  
  if (loading) {
    return <Skeleton className={cn("h-5 w-20 rounded-full", className)} />;
  }
  
  const code = partyCode || '';
  const name = customerName || '';
  
  let displayText = fallback;
  
  if (!canView) {
    displayText = code || fallback;
  } else if (showBoth && code && name) {
    displayText = format === 'code-name' ? `${code} - ${name}` : `${name} (${code})`;
  } else {
    displayText = name || code || fallback;
  }
  
  const variantClasses = {
    default: 'bg-primary text-primary-foreground',
    secondary: 'bg-secondary text-secondary-foreground',
    outline: 'border border-input bg-background',
  };
  
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
      variantClasses[variant],
      className
    )}>
      {displayText}
    </span>
  );
}

/**
 * Hook-based utility for getting display text (for use in callbacks, maps, etc.)
 */
export function useCustomerDisplayText() {
  const { canView, loading } = useCanViewCustomerName();
  
  const getDisplayText = (
    customerName: string | null | undefined,
    partyCode: string | null | undefined,
    showBoth = false
  ): string => {
    const code = partyCode || '';
    const name = customerName || '';
    
    if (!canView) {
      return code || 'N/A';
    }
    
    if (showBoth && code && name) {
      return `${code} - ${name}`;
    }
    
    return name || code || 'N/A';
  };
  
  return { getDisplayText, canView, loading };
}
