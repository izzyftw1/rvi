import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useThrottledRealtime } from "@/hooks/useThrottledRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Sunrise, 
  Sun, 
  Sunset,
  CheckCircle2,
  Clock,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  id: string;
  time: string;
  title: string;
  description: string;
  type: 'dispatch' | 'qc' | 'return' | 'payment' | 'delivery';
  urgency: 'overdue' | 'due_soon' | 'cleared';
  onClick: () => void;
}

interface TimeSlot {
  label: string;
  icon: React.ElementType;
  events: TimelineEvent[];
}

interface TodayGlanceTimelineProps {
  limit?: number;
  showViewAll?: boolean;
}

export const TodayGlanceTimeline = ({ limit, showViewAll = false }: TodayGlanceTimelineProps) => {
  const navigate = useNavigate();
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [totalEventCount, setTotalEventCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTodayEvents();
  }, []);

  // Throttled realtime for Today's events - separate channel
  const loadTodayEventsCallback = useCallback(() => {
    loadTodayEvents();
  }, []);

  useThrottledRealtime({
    channelName: 'dashboard-today-timeline',
    tables: ['work_orders', 'qc_records', 'wo_external_moves', 'invoices'],
    onUpdate: loadTodayEventsCallback,
    throttleMs: 10000, // 10 seconds throttle
    cacheMs: 30000, // 30 seconds cache
  });

  const loadTodayEvents = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const events: TimelineEvent[] = [];

      // Fetch data
      const [workOrders, qcRecords, externalMoves, invoices] = await Promise.all([
        supabase.from('work_orders').select('*'),
        supabase.from('qc_records').select('*'),
        supabase.from('wo_external_moves' as any).select('*'),
        supabase.from('invoices').select('*')
      ]);

      const wos = workOrders.data || [];
      const qc = qcRecords.data || [];
      const moves: any[] = externalMoves.data || [];
      const invs = invoices.data || [];

      // Dispatches due today
      const dueTodayWOs = wos.filter(wo => wo.due_date === today && wo.dispatch_allowed);
      dueTodayWOs.forEach(wo => {
        events.push({
          id: `dispatch-${wo.id}`,
          time: '17:00',
          title: `Dispatch: ${wo.display_id || wo.wo_id}`,
          description: `${wo.quantity} pcs for ${wo.customer}`,
          type: 'dispatch',
          urgency: 'due_soon',
          onClick: () => navigate(`/work-orders/${wo.id}`)
        });
      });

      // Overdue dispatches
      const overdueWOs = wos.filter(wo => wo.due_date < today && wo.status !== 'completed');
      overdueWOs.forEach(wo => {
        events.push({
          id: `overdue-${wo.id}`,
          time: 'Overdue',
          title: `OVERDUE: ${wo.display_id || wo.wo_id}`,
          description: `Due ${wo.due_date}`,
          type: 'delivery',
          urgency: 'overdue',
          onClick: () => navigate(`/work-orders/${wo.id}`)
        });
      });

      // QC pending approval
      const pendingQC = qc.filter(q => q.result === 'pending');
      pendingQC.forEach(q => {
        events.push({
          id: `qc-${q.id}`,
          time: '10:00',
          title: `QC Approval: ${q.qc_id}`,
          description: 'Awaiting quality approval',
          type: 'qc',
          urgency: 'due_soon',
          onClick: () => navigate('/quality')
        });
      });

      // Expected returns today
      const returnsToday = moves.filter(m => m.expected_return_date === today);
      returnsToday.forEach(m => {
        events.push({
          id: `return-${m.id}`,
          time: '14:00',
          title: `Expected Return: ${m.challan_no || 'External'}`,
          description: `${m.quantity_sent ?? m.qty_sent ?? 0} pcs from ${m.process_type}`,
          type: 'return',
          urgency: 'due_soon',
          onClick: () => navigate('/logistics')
        });
      });

      // Payments expected
      const paymentsDue = invs.filter(inv => 
        inv.expected_payment_date === today && inv.status !== 'paid'
      );
      paymentsDue.forEach(inv => {
        events.push({
          id: `payment-${inv.id}`,
          time: '15:00',
          title: `Payment Expected: ${inv.invoice_no}`,
          description: `${inv.currency} ${inv.balance_amount}`,
          type: 'payment',
          urgency: 'due_soon',
          onClick: () => navigate(`/finance/invoices/${inv.id}`)
        });
      });

      // Organize by time of day
      const morning = events.filter(e => {
        const hour = parseInt(e.time.split(':')[0]);
        return !isNaN(hour) && hour < 12;
      });
      const afternoon = events.filter(e => {
        const hour = parseInt(e.time.split(':')[0]);
        return !isNaN(hour) && hour >= 12 && hour < 17;
      });
      const evening = events.filter(e => {
        const hour = parseInt(e.time.split(':')[0]);
        return !isNaN(hour) && hour >= 17;
      });
      const overdue = events.filter(e => e.urgency === 'overdue');

      setTotalEventCount(events.length);

      const slots: TimeSlot[] = [];
      
      if (overdue.length > 0) {
        slots.push({ label: 'Overdue', icon: AlertCircle, events: overdue });
      }
      if (morning.length > 0) {
        slots.push({ label: 'Morning', icon: Sunrise, events: morning });
      }
      if (afternoon.length > 0) {
        slots.push({ label: 'Afternoon', icon: Sun, events: afternoon });
      }
      if (evening.length > 0) {
        slots.push({ label: 'Evening', icon: Sunset, events: evening });
      }

      // Apply limit if specified
      if (limit && limit > 0) {
        let count = 0;
        const limitedSlots: TimeSlot[] = [];
        
        for (const slot of slots) {
          const remainingLimit = limit - count;
          if (remainingLimit <= 0) break;
          
          const limitedEvents = slot.events.slice(0, remainingLimit);
          limitedSlots.push({ ...slot, events: limitedEvents });
          count += limitedEvents.length;
        }
        
        setTimeSlots(limitedSlots);
      } else {
        setTimeSlots(slots);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading today events:', error);
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'overdue': return 'bg-red-100 border-l-red-500 dark:bg-red-950';
      case 'due_soon': return 'bg-yellow-100 border-l-yellow-500 dark:bg-yellow-950';
      default: return 'bg-green-100 border-l-green-500 dark:bg-green-950';
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'overdue': 
        return <Badge variant="destructive" className="text-xs">Overdue</Badge>;
      case 'due_soon': 
        return <Badge className="bg-yellow-500 text-white text-xs">Due Soon</Badge>;
      default: 
        return <Badge className="bg-green-500 text-white text-xs">On Track</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today at a Glance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (timeSlots.length === 0) {
    return (
      <Card className="bg-green-50 dark:bg-green-950 border-green-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Today at a Glance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-700 dark:text-green-300">
            No scheduled events for today. All caught up! 🎉
          </p>
        </CardContent>
      </Card>
    );
  }

  const displayedCount = timeSlots.reduce((sum, slot) => sum + slot.events.length, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Today at a Glance
          </CardTitle>
          {showViewAll && totalEventCount > displayedCount ? (
            <Badge 
              variant="secondary" 
              className="cursor-pointer hover:bg-secondary/80"
              onClick={() => navigate('/work-orders')}
            >
              View all ({totalEventCount})
            </Badge>
          ) : (
            <Badge variant="secondary">
              {displayedCount} events
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {timeSlots.map((slot, idx) => {
            const Icon = slot.icon;
            return (
              <div key={idx}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold text-muted-foreground">
                    {slot.label}
                  </h4>
                </div>
                <div className="space-y-2 ml-6">
                  {slot.events.map(event => (
                    <Card
                      key={event.id}
                      className={cn(
                        "cursor-pointer hover:shadow-md transition-all border-l-4",
                        getUrgencyColor(event.urgency)
                      )}
                      onClick={event.onClick}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-mono text-muted-foreground">
                                {event.time}
                              </p>
                              {getUrgencyBadge(event.urgency)}
                            </div>
                            <p className="font-semibold text-sm">{event.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {event.description}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
