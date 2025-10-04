import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: 'pending' | 'in_progress' | 'qc' | 'packing' | 'completed' | 'shipped';
  className?: string;
}

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const statusConfig = {
    pending: {
      label: 'Pending',
      variant: 'secondary' as const,
    },
    in_progress: {
      label: 'In Progress',
      variant: 'default' as const,
      className: 'bg-primary',
    },
    qc: {
      label: 'QC',
      variant: 'default' as const,
      className: 'bg-warning',
    },
    packing: {
      label: 'Packing',
      variant: 'default' as const,
      className: 'bg-accent',
    },
    completed: {
      label: 'Completed',
      variant: 'default' as const,
      className: 'bg-success',
    },
    shipped: {
      label: 'Shipped',
      variant: 'default' as const,
      className: 'bg-success',
    },
  };

  const config = statusConfig[status];

  return (
    <Badge 
      variant={config.variant}
      className={cn('className' in config ? config.className : '', className)}
    >
      {config.label}
    </Badge>
  );
};
