import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, DollarSign, Package, Factory, AlertTriangle, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPIMetric {
  label: string;
  value: string;
  target?: string;
  status: 'good' | 'warning' | 'critical';
  trend?: number;
  icon: React.ElementType;
  onClick?: () => void;
}

interface KPIBannerProps {
  metrics: KPIMetric[];
}

export const KPIBanner = ({ metrics }: KPIBannerProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good': return 'border-green-500 bg-green-50 dark:bg-green-950';
      case 'warning': return 'border-orange-500 bg-orange-50 dark:bg-orange-950';
      case 'critical': return 'border-red-500 bg-red-50 dark:bg-red-950';
      default: return 'border-muted';
    }
  };

  const getStatusIconColor = (status: string) => {
    switch (status) {
      case 'good': return 'text-green-600 dark:text-green-400';
      case 'warning': return 'text-orange-600 dark:text-orange-400';
      case 'critical': return 'text-red-600 dark:text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {metrics.map((metric, idx) => {
        const Icon = metric.icon;
        return (
          <Card 
            key={idx} 
            className={cn(
              "border-l-4 transition-all hover:shadow-lg",
              getStatusColor(metric.status),
              metric.onClick && "cursor-pointer hover:scale-105"
            )}
            onClick={metric.onClick}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <Icon className={cn("h-5 w-5", getStatusIconColor(metric.status))} />
                {metric.trend !== undefined && (
                  <div className={cn("flex items-center gap-1 text-xs font-medium",
                    metric.trend > 0 ? "text-green-600" : metric.trend < 0 ? "text-red-600" : "text-muted-foreground"
                  )}>
                    {metric.trend > 0 ? <TrendingUp className="h-3 w-3" /> : 
                     metric.trend < 0 ? <TrendingDown className="h-3 w-3" /> : 
                     <Minus className="h-3 w-3" />}
                    {Math.abs(metric.trend)}%
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-bold">{metric.value}</p>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                {metric.target && (
                  <p className="text-xs text-muted-foreground">Target: {metric.target}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
