import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  Wrench, 
  Clock, 
  Truck, 
  ClipboardCheck,
  Bell
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Alert {
  id: string;
  type: 'material_qc' | 'maintenance' | 'external_delay' | 'wo_delay' | 'qc_pending';
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  icon: React.ElementType;
  onClick: () => void;
}

export const CriticalAlertsBar = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();

    const channel = supabase
      .channel('critical-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'material_lots' }, loadAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qc_records' }, loadAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadAlerts)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAlerts = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const [materialLots, qcRecords, workOrders, externalMoves, maintenanceLogs] = await Promise.all([
        supabase.from('material_lots').select('*'),
        supabase.from('qc_records').select('*'),
        supabase.from('work_orders').select('*'),
        supabase.from('wo_external_moves' as any).select('*'),
        supabase.from('maintenance_logs').select('machine_id, created_at')
      ]);

      const alertsList: Alert[] = [];

      // Material waiting for QC
      const pendingQCMaterial = (materialLots.data || []).filter(
        lot => lot.qc_status === 'pending'
      );
      if (pendingQCMaterial.length > 0) {
        alertsList.push({
          id: 'material-qc',
          type: 'material_qc',
          title: 'Material Waiting for QC',
          description: `${pendingQCMaterial.length} material lots pending QC testing`,
          severity: 'warning',
          icon: AlertTriangle,
          onClick: () => navigate('/qc/incoming')
        });
      }

      // Machine maintenance overdue (no maintenance in 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: machines } = await supabase.from('machines').select('*');
      const recentMaintenance = new Set(
        (maintenanceLogs.data || [])
          .filter(m => new Date(m.created_at) > thirtyDaysAgo)
          .map(m => m.machine_id)
      );
      const overdueCount = (machines || []).filter(m => !recentMaintenance.has(m.id)).length;
      if (overdueCount > 0) {
        alertsList.push({
          id: 'maintenance-overdue',
          type: 'maintenance',
          title: 'Maintenance Overdue',
          description: `${overdueCount} machines need maintenance check`,
          severity: 'critical',
          icon: Wrench,
          onClick: () => navigate('/machine-status')
        });
      }

      // External work delayed
      const delayedExternal = (externalMoves.data as any[] || []).filter(
        move => move.expected_return_date && move.expected_return_date < today && move.status !== 'returned'
      );
      if (delayedExternal.length > 0) {
        alertsList.push({
          id: 'external-delayed',
          type: 'external_delay',
          title: 'External Work Delayed',
          description: `${delayedExternal.length} external jobs past expected return`,
          severity: 'warning',
          icon: Clock,
          onClick: () => navigate('/partners')
        });
      }

      // Work Orders delayed > 3 days
      const delayedWOs = (workOrders.data || []).filter(wo => {
        if (wo.status === 'completed') return false;
        const dueDate = new Date(wo.due_date);
        return dueDate < threeDaysAgo;
      });
      if (delayedWOs.length > 0) {
        alertsList.push({
          id: 'wo-delayed',
          type: 'wo_delay',
          title: 'Work Orders Delayed',
          description: `${delayedWOs.length} work orders delayed > 3 days`,
          severity: 'critical',
          icon: Truck,
          onClick: () => navigate('/work-orders')
        });
      }

      // QC pending approval
      const pendingQC = (qcRecords.data || []).filter(
        qc => qc.result === 'pending'
      );
      if (pendingQC.length > 0) {
        alertsList.push({
          id: 'qc-pending',
          type: 'qc_pending',
          title: 'QC Pending Approval',
          description: `${pendingQC.length} quality checks awaiting approval`,
          severity: 'info',
          icon: ClipboardCheck,
          onClick: () => navigate('/quality')
        });
      }

      setAlerts(alertsList);
      setLoading(false);
    } catch (error) {
      console.error('Error loading alerts:', error);
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 border-red-500 dark:bg-red-950';
      case 'warning': return 'bg-yellow-100 border-yellow-500 dark:bg-yellow-950';
      default: return 'bg-blue-100 border-blue-500 dark:bg-blue-950';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'warning': return <Badge className="bg-yellow-500 text-white">Warning</Badge>;
      default: return <Badge variant="secondary">Info</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Critical Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="mb-6 bg-green-50 dark:bg-green-950 border-green-500">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
              <ClipboardCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-green-900 dark:text-green-100">
                All Clear!
              </p>
              <p className="text-sm text-green-700 dark:text-green-300">
                No critical alerts at this time
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 animate-pulse text-red-500" />
            Critical Alerts
          </CardTitle>
          <Badge variant="secondary">{alerts.length} active</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-4 pb-4">
            {alerts.map((alert) => {
              const Icon = alert.icon;
              return (
                <Card
                  key={alert.id}
                  className={cn(
                    "min-w-[300px] cursor-pointer hover:shadow-lg transition-all border-l-4",
                    getSeverityColor(alert.severity)
                  )}
                  onClick={alert.onClick}
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "h-10 w-10 rounded-full flex items-center justify-center",
                        alert.severity === 'critical' ? 'bg-red-500' :
                        alert.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                      )}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-sm">{alert.title}</p>
                          {getSeverityBadge(alert.severity)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {alert.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
