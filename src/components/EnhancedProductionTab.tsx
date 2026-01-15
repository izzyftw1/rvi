/**
 * EnhancedProductionTab
 * 
 * VISIBILITY ONLY - shows production log entries for this work order.
 * No analytics calculations. Analytics belong in dedicated efficiency pages.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import { format } from "date-fns";

interface ProductionLog {
  id: string;
  log_timestamp: string;
  machine_id: string;
  operator_id: string | null;
  run_state: string;
  quantity_completed: number;
  quantity_scrap: number;
  shift: string | null;
  remarks: string | null;
  machines?: { machine_id: string; name: string } | null;
  profiles?: { full_name: string } | null;
}

interface EnhancedProductionTabProps {
  woId: string;
  workOrder: any;
}

export function EnhancedProductionTab({ woId, workOrder }: EnhancedProductionTabProps) {
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProducing, setIsProducing] = useState(false);

  useEffect(() => {
    loadLogs();
    
    // Real-time subscription
    const channel = supabase
      .channel('production-logs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_production_logs',
          filter: `wo_id=eq.${woId}`
        },
        () => {
          loadLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId]);

  const loadLogs = async () => {
    try {
      // Query daily_production_logs which is the actual data source
      const { data: logsData, error: logsError } = await supabase
        .from('daily_production_logs')
        .select('*')
        .eq('wo_id', woId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (logsError) throw logsError;

      // Then enrich with machine and operator data
      const machineIds = Array.from(new Set(logsData?.map(l => l.machine_id).filter(Boolean)));
      const operatorIds = Array.from(new Set(logsData?.map(l => l.operator_id).filter(Boolean)));

      const { data: machines } = machineIds.length > 0 ? await supabase
        .from('machines')
        .select('id, machine_id, name')
        .in('id', machineIds) : { data: [] };

      const { data: profiles } = operatorIds.length > 0 ? await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', operatorIds as string[]) : { data: [] };

      const enriched = (logsData || []).map(log => ({
        id: log.id,
        log_timestamp: log.created_at,
        machine_id: log.machine_id,
        operator_id: log.operator_id,
        run_state: 'production',
        quantity_completed: log.ok_quantity || log.actual_quantity || 0,
        quantity_scrap: log.total_rejection_quantity || 0,
        shift: log.shift,
        remarks: log.product_description || null,
        machines: machines?.find(m => m.id === log.machine_id),
        profiles: log.operator_id ? profiles?.find(p => p.id === log.operator_id) : null
      }));

      setLogs(enriched as any);
    } catch (error: any) {
      console.error('Error loading production logs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-4">Loading production data...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Info Notice */}
      <div className="bg-muted/50 border rounded-lg p-3 flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <span>
          This tab shows production log entries for visibility. For analytics (efficiency %, scrap rates), 
          see the dedicated Operator Efficiency, Machine Utilisation, and Quality Analytics pages.
        </span>
      </div>

      {/* Production Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Live Production Log</span>
            <Badge variant="secondary" className="animate-pulse">
              Real-time
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No production logs recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="outline">
                          {log.machines?.machine_id || 'N/A'}
                        </Badge>
                        <span className="text-sm font-medium">
                          {log.machines?.name || 'Unknown Machine'}
                        </span>
                        <Badge 
                          variant={log.run_state === 'running' ? 'default' : 'secondary'}
                        >
                          {log.run_state.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Operator:</span>
                          <p className="font-medium">{log.profiles?.full_name || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Completed:</span>
                          <p className="font-medium text-green-600">{log.quantity_completed} pcs</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Scrap:</span>
                          <p className="font-medium text-red-600">{log.quantity_scrap} pcs</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Shift:</span>
                          <p className="font-medium">{log.shift || 'N/A'}</p>
                        </div>
                      </div>

                      {log.remarks && (
                        <p className="text-sm text-muted-foreground italic">
                          💬 {log.remarks}
                        </p>
                      )}
                    </div>
                    
                    <div className="text-right text-xs text-muted-foreground">
                      {format(new Date(log.log_timestamp), 'dd MMM yyyy, hh:mm a')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
