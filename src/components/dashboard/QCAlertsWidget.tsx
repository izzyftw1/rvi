import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useThrottledRealtime } from "@/hooks/useThrottledRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

interface QCAlert {
  id: string;
  type: 'material_test' | 'first_piece' | 'qc_hold';
  title: string;
  description: string;
  urgency: 'high' | 'medium' | 'low';
  count: number;
  onClick: () => void;
}

export const QCAlertsWidget = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<QCAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQCAlerts();
  }, []);

  // Throttled realtime for QC alerts - separate channel
  const loadQCAlertsCallback = useCallback(() => {
    loadQCAlerts();
  }, []);

  useThrottledRealtime({
    channelName: 'dashboard-qc-alerts',
    tables: ['qc_records', 'work_orders'],
    onUpdate: loadQCAlertsCallback,
    throttleMs: 8000, // 8 seconds throttle
    cacheMs: 30000, // 30 seconds cache
  });

  const loadQCAlerts = async () => {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      // Material tests pending
      const { count: materialTests } = await supabase
        .from('qc_records')
        .select('*', { count: 'exact', head: true })
        .eq('qc_type', 'incoming')
        .eq('result', 'pending');

      // First-piece due within 24h
      const { data: firstPieceDue } = await supabase
        .from('qc_records')
        .select('*, work_orders!inner(due_date)')
        .eq('qc_type', 'first_piece')
        .eq('result', 'pending')
        .lte('work_orders.due_date', tomorrowStr);

      // QC holds (work orders blocked by QC)
      const { count: qcHolds } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('production_allowed', false)
        .neq('status', 'completed');

      const alertsList: QCAlert[] = [];

      if (materialTests && materialTests > 0) {
        alertsList.push({
          id: 'material-tests',
          type: 'material_test',
          title: 'Material Tests Pending',
          description: `${materialTests} incoming material lots awaiting OES testing`,
          urgency: materialTests > 5 ? 'high' : 'medium',
          count: materialTests,
          onClick: () => navigate('/qc/incoming')
        });
      }

      if (firstPieceDue && firstPieceDue.length > 0) {
        alertsList.push({
          id: 'first-piece',
          type: 'first_piece',
          title: 'First-Piece Due (24h)',
          description: `${firstPieceDue.length} first-piece approvals due within 24 hours`,
          urgency: 'high',
          count: firstPieceDue.length,
          onClick: () => navigate('/quality')
        });
      }

      if (qcHolds && qcHolds > 0) {
        alertsList.push({
          id: 'qc-holds',
          type: 'qc_hold',
          title: 'QC Holds',
          description: `${qcHolds} work orders blocked pending QC approval`,
          urgency: qcHolds > 3 ? 'high' : 'medium',
          count: qcHolds,
          onClick: () => navigate('/quality')
        });
      }

      setAlerts(alertsList);
      setLoading(false);
    } catch (error) {
      console.error('Error loading QC alerts:', error);
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'border-red-500 bg-red-50 dark:bg-red-950/30';
      case 'medium': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30';
      default: return 'border-blue-500 bg-blue-50 dark:bg-blue-950/30';
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'high': return <Badge variant="destructive">Urgent</Badge>;
      case 'medium': return <Badge className="bg-yellow-500 text-white">Medium</Badge>;
      default: return <Badge variant="secondary">Low</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>QC Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (alerts.length === 0) {
    return (
      <Card className="bg-green-50 dark:bg-green-950 border-green-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            QC Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-700 dark:text-green-300">
            All clear! No pending QC actions.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            QC Alerts
          </CardTitle>
          <Badge variant="secondary">{alerts.length} alerts</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {alerts.map(alert => (
            <Card
              key={alert.id}
              className={`cursor-pointer hover:shadow-md transition-all border-l-4 ${getUrgencyColor(alert.urgency)}`}
              onClick={alert.onClick}
            >
              <CardContent className="py-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      {getUrgencyBadge(alert.urgency)}
                    </div>
                    <p className="font-semibold text-sm">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.description}</p>
                  </div>
                  <div className="text-2xl font-bold text-primary ml-4">
                    {alert.count}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
