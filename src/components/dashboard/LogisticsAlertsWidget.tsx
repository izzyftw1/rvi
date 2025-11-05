import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Truck, Calendar, Package } from "lucide-react";

interface LogisticsAlert {
  id: string;
  wo_display_id: string;
  process_type: string;
  partner_name: string;
  days_overdue: number;
  pcs_pending: number;
}

export const LogisticsAlertsWidget = () => {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<LogisticsAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogisticsAlerts();

    const channel = supabase
      .channel('logistics-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadLogisticsAlerts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadLogisticsAlerts)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadLogisticsAlerts = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [movesResult, receiptsResult, workOrdersResult] = await Promise.all([
        supabase.from('wo_external_moves' as any).select('*'),
        supabase.from('wo_external_receipts' as any).select('*'),
        supabase.from('work_orders').select('id, display_id, wo_id')
      ]);

      const moves: any[] = movesResult.data || [];
      const receipts: any[] = receiptsResult.data || [];
      const workOrders: any[] = workOrdersResult.data || [];

      const overdueList: LogisticsAlert[] = [];

      moves.forEach(move => {
        if (move.expected_return_date && move.expected_return_date < today && !move.returned_date) {
          const moveReceipts = receipts.filter(r => r.move_id === move.id);
          const totalReceived = moveReceipts.reduce((sum, r) => sum + (r.qty_received || 0), 0);
          const pending = (move.qty_sent || 0) - totalReceived;

          if (pending > 0) {
            const wo = workOrders.find(w => w.id === move.wo_id);
            const daysOverdue = Math.floor(
              (new Date().getTime() - new Date(move.expected_return_date).getTime()) / (1000 * 60 * 60 * 24)
            );

            overdueList.push({
              id: move.id,
              wo_display_id: wo?.display_id || wo?.wo_id || 'N/A',
              process_type: move.process_type,
              partner_name: move.partner_name || 'Unknown',
              days_overdue: daysOverdue,
              pcs_pending: pending
            });
          }
        }
      });

      setAlerts(overdueList.sort((a, b) => b.days_overdue - a.days_overdue).slice(0, 5));
      setLoading(false);
    } catch (error) {
      console.error('Error loading logistics alerts:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Overdue Returns Alert</CardTitle>
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
            <Package className="h-5 w-5 text-green-600" />
            Overdue Returns Alert
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-green-700 dark:text-green-300">
            All external returns are on track! No overdue items.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-500">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Overdue Returns Alert
          </CardTitle>
          <Badge variant="destructive">{alerts.length} overdue</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 rounded-lg cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
              onClick={() => navigate('/logistics')}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Truck className="h-3 w-3 text-muted-foreground" />
                  <span className="font-semibold text-sm">{alert.wo_display_id}</span>
                  <Badge variant="outline" className="text-xs">{alert.process_type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {alert.partner_name} · {alert.pcs_pending} pcs pending
                </p>
              </div>
              <Badge variant="destructive" className="ml-2">
                {alert.days_overdue}d
              </Badge>
            </div>
          ))}
          <div
            className="text-center text-sm text-primary hover:underline cursor-pointer pt-2"
            onClick={() => navigate('/logistics')}
          >
            View all overdue returns →
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
