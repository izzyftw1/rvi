import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { 
  FileText, 
  Activity, 
  Clock, 
  Wrench, 
  Factory as FactoryIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricData {
  label: string;
  value: string | number;
  subValue?: string;
  icon: React.ElementType;
  onClick: () => void;
  color: string;
}

export const SmartSummaryHeader = () => {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<MetricData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();

    const channel = supabase
      .channel('summary-metrics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, loadMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadMetrics)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMetrics = async () => {
    try {
      const [wos, machines, externalMoves, externalReceipts, maintenanceLogs] = await Promise.all([
        supabase.from('work_orders').select('*'),
        supabase.from('machines').select('*'),
        supabase.from('wo_external_moves' as any).select('*'),
        supabase.from('wo_external_receipts' as any).select('*'),
        supabase.from('maintenance_logs').select('*')
      ]);

      const workOrders = wos.data || [];
      const machineList = machines.data || [];
      const moves: any[] = externalMoves.data || [];
      const receipts: any[] = externalReceipts.data || [];
      const maintenance = maintenanceLogs.data || [];

      // Active Work Orders
      const activeWOs = workOrders.filter(wo => 
        wo.status !== 'completed'
      );

      // Running Machines
      const runningMachines = machineList.filter(m => m.status === 'running');

      // Avg Order Cycle Time (in days)
      const completedWOs = workOrders.filter(wo => wo.status === 'completed');
      let avgCycleTime = 0;
      if (completedWOs.length > 0) {
        const totalDays = completedWOs.reduce((sum, wo) => {
          const start = new Date(wo.created_at);
          const end = new Date(wo.updated_at);
          const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0);
        avgCycleTime = totalDays / completedWOs.length;
      }

      // Maintenance Due (machines with no recent maintenance)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentMaintenance = new Set(
        maintenance
          .filter(m => new Date(m.created_at) > sevenDaysAgo)
          .map(m => m.machine_id)
      );
      const maintenanceDue = machineList.filter(m => !recentMaintenance.has(m.id)).length;

      // External Work Pending
      const externalPending = moves.reduce((sum, move) => {
        const received = receipts
          .filter(r => r.move_id === move.id)
          .reduce((s, r) => s + (r.qty_received || 0), 0);
        return sum + ((move.qty_sent || 0) - received);
      }, 0);

      const metricsData: MetricData[] = [
        {
          label: "Active Work Orders",
          value: activeWOs.length,
          icon: FileText,
          onClick: () => navigate('/work-orders'),
          color: "text-blue-600"
        },
        {
          label: "Running Machines",
          value: runningMachines.length,
          subValue: `of ${machineList.length}`,
          icon: Activity,
          onClick: () => navigate('/machine-status'),
          color: "text-green-600"
        },
        {
          label: "Avg Cycle Time",
          value: `${avgCycleTime.toFixed(1)}`,
          subValue: "days",
          icon: Clock,
          onClick: () => navigate('/reports'),
          color: "text-purple-600"
        },
        {
          label: "Maintenance Due",
          value: maintenanceDue,
          subValue: "machines",
          icon: Wrench,
          onClick: () => navigate('/maintenance'),
          color: maintenanceDue > 0 ? "text-red-600" : "text-gray-600"
        },
        {
          label: "External Work Pending",
          value: externalPending,
          subValue: "pcs",
          icon: FactoryIcon,
          onClick: () => navigate('/logistics'),
          color: "text-amber-600"
        }
      ];

      setMetrics(metricsData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading summary metrics:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {metrics.map((metric, idx) => {
        const Icon = metric.icon;
        return (
          <Card
            key={idx}
            className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
            onClick={metric.onClick}
          >
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground font-medium mb-1">
                    {metric.label}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <p className={cn("text-3xl font-bold", metric.color)}>
                      {metric.value}
                    </p>
                    {metric.subValue && (
                      <p className="text-xs text-muted-foreground">
                        {metric.subValue}
                      </p>
                    )}
                  </div>
                </div>
                <Icon className={cn("h-5 w-5", metric.color)} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
