import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  Wrench, 
  AlertTriangle, 
  ClipboardCheck,
  Clock,
  Truck,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface QuickMetrics {
  materialWaitingQC: number;
  maintenanceOverdue: number;
  workOrdersDelayed: number;
  qcPendingApproval: number;
  lateDeliveries: number;
  dueToday: number;
  ordersInProduction: number;
  externalWipPcs: number;
}

interface QuickActionCardsProps {
  metrics: QuickMetrics;
}

export const QuickActionCards = ({ metrics }: QuickActionCardsProps) => {
  const navigate = useNavigate();

  const actionCards = [
    {
      label: 'Material Waiting QC',
      value: metrics.materialWaitingQC,
      icon: Package,
      route: '/qc/incoming',
      isCritical: false,
      tooltip: 'Material lots pending QC approval'
    },
    {
      label: 'Maintenance Overdue',
      value: metrics.maintenanceOverdue,
      icon: Wrench,
      route: '/machine-status',
      isCritical: true,
      tooltip: 'Machines requiring maintenance'
    },
    {
      label: 'WO Delayed',
      value: metrics.workOrdersDelayed,
      icon: AlertTriangle,
      route: '/work-orders?status=delayed',
      isCritical: true,
      tooltip: 'Work orders past due date'
    },
    {
      label: 'QC Pending',
      value: metrics.qcPendingApproval,
      icon: ClipboardCheck,
      route: '/quality',
      isCritical: false,
      tooltip: 'QC checks awaiting approval'
    },
    {
      label: 'Due Today',
      value: metrics.dueToday,
      icon: Calendar,
      route: '/work-orders?due=today',
      isCritical: false,
      isWarning: true,
      tooltip: 'Orders due for delivery today'
    },
    {
      label: 'Late Deliveries',
      value: metrics.lateDeliveries,
      icon: Truck,
      route: '/logistics',
      isCritical: true,
      tooltip: 'Shipments past due date'
    }
  ];

  const getCardStyle = (card: typeof actionCards[0]) => {
    if (card.value === 0) {
      return 'opacity-50 border-transparent';
    }
    if (card.isCritical && card.value > 0) {
      return 'border-destructive/50 bg-destructive/5';
    }
    if (card.isWarning && card.value > 0) {
      return 'border-amber-500/50 bg-amber-500/5';
    }
    return 'border-primary/30 bg-primary/5';
  };

  const getTextColor = (card: typeof actionCards[0]) => {
    if (card.value === 0) return 'text-muted-foreground';
    if (card.isCritical && card.value > 0) return 'text-destructive';
    if (card.isWarning && card.value > 0) return 'text-amber-600 dark:text-amber-400';
    return 'text-foreground';
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {actionCards.map((card) => (
          <Tooltip key={card.label}>
            <TooltipTrigger asChild>
              <Card
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 border-2",
                  getCardStyle(card)
                )}
                onClick={() => navigate(card.route)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <card.icon className={cn("h-4 w-4", getTextColor(card))} />
                    {card.isCritical && card.value > 0 && (
                      <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                    )}
                  </div>
                  <div className={cn("text-xl font-bold", getTextColor(card))}>
                    {card.value}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {card.label}
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent>
              <p>{card.tooltip}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};
