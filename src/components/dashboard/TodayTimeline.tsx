import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Truck, DollarSign, ClipboardCheck, AlertTriangle, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  time: string;
  type: 'wo_due' | 'shipment' | 'payment' | 'qc_inspection' | 'late' | 'ready';
  title: string;
  count?: number;
  priority: 'high' | 'medium' | 'low';
}

interface TodayTimelineProps {
  events: TimelineEvent[];
}

export const TodayTimeline = ({ events }: TodayTimelineProps) => {
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'wo_due': return Clock;
      case 'shipment': return Truck;
      case 'payment': return DollarSign;
      case 'qc_inspection': return ClipboardCheck;
      case 'late': return AlertTriangle;
      case 'ready': return Package;
      default: return Clock;
    }
  };

  const getEventColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 bg-red-50 dark:bg-red-950';
      case 'medium': return 'text-orange-600 bg-orange-50 dark:bg-orange-950';
      case 'low': return 'text-green-600 bg-green-50 dark:bg-green-950';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high': return <Badge variant="destructive" className="text-xs">Urgent</Badge>;
      case 'medium': return <Badge variant="secondary" className="text-xs bg-orange-500 text-white">Today</Badge>;
      case 'low': return <Badge variant="secondary" className="text-xs">Scheduled</Badge>;
      default: return null;
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Today at a Glance - Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.map((event, idx) => {
            const EventIcon = getEventIcon(event.type);
            return (
              <div 
                key={idx} 
                className={cn(
                  "flex items-center gap-4 p-3 rounded-lg border-l-4 transition-all hover:shadow-md cursor-pointer",
                  getEventColor(event.priority)
                )}
              >
                <EventIcon className="h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{event.title}</p>
                    {event.count && (
                      <Badge variant="outline" className="text-xs">{event.count}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{event.time}</p>
                </div>
                {getPriorityBadge(event.priority)}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
