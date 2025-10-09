import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, TrendingUp, Target, CheckCircle2 } from "lucide-react";

interface OEEMetrics {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
}

interface OEEWidgetProps {
  metrics: {
    today: OEEMetrics;
    week: OEEMetrics;
    month: OEEMetrics;
  };
  title?: string;
  compact?: boolean;
}

const getOEEVariant = (value: number): "default" | "secondary" | "destructive" => {
  if (value >= 80) return "default";
  if (value >= 60) return "secondary";
  return "destructive";
};

const OEEBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
    <span className="text-sm font-medium">{label}</span>
    <Badge variant={getOEEVariant(value)}>
      {value.toFixed(1)}%
    </Badge>
  </div>
);

export function OEEWidget({ metrics, title = "OEE Metrics", compact = false }: OEEWidgetProps) {
  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gauge className="h-4 w-4" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <p className="text-muted-foreground mb-1">Today</p>
              <Badge variant={getOEEVariant(metrics.today.oee)} className="w-full">
                {metrics.today.oee.toFixed(0)}%
              </Badge>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground mb-1">Week</p>
              <Badge variant={getOEEVariant(metrics.week.oee)} className="w-full">
                {metrics.week.oee.toFixed(0)}%
              </Badge>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground mb-1">Month</p>
              <Badge variant={getOEEVariant(metrics.month.oee)} className="w-full">
                {metrics.month.oee.toFixed(0)}%
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>Overall Equipment Effectiveness</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Today */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Today</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Availability" value={metrics.today.availability} />
              </div>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Performance" value={metrics.today.performance} />
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Quality" value={metrics.today.quality} />
              </div>
              <div className="mt-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">OEE</span>
                  <Badge variant={getOEEVariant(metrics.today.oee)} className="text-base px-3 py-1">
                    {metrics.today.oee.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* This Week */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">This Week</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Availability" value={metrics.week.availability} />
              </div>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Performance" value={metrics.week.performance} />
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Quality" value={metrics.week.quality} />
              </div>
              <div className="mt-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">OEE</span>
                  <Badge variant={getOEEVariant(metrics.week.oee)} className="text-base px-3 py-1">
                    {metrics.week.oee.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          {/* Month to Date */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Month to Date</h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Availability" value={metrics.month.availability} />
              </div>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Performance" value={metrics.month.performance} />
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <OEEBadge label="Quality" value={metrics.month.quality} />
              </div>
              <div className="mt-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">OEE</span>
                  <Badge variant={getOEEVariant(metrics.month.oee)} className="text-base px-3 py-1">
                    {metrics.month.oee.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>OEE Formula:</strong> Availability × Performance × Quality
            <br />
            <span className="text-success">■ Green ≥ 80%</span> • 
            <span className="text-secondary ml-2">■ Amber 60-80%</span> • 
            <span className="text-destructive ml-2">■ Red &lt; 60%</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
