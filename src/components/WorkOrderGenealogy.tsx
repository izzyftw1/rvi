import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CheckCircle2, Clock, Package, FlaskConical, Box, Truck } from "lucide-react";
import { format } from "date-fns";

interface WorkOrderGenealogyProps {
  woId: string;
}

interface ActionLog {
  id: string;
  action_type: string;
  department: string;
  performed_by: string;
  action_details: any;
  created_at: string;
  user_name?: string;
}

export const WorkOrderGenealogy = ({ woId }: WorkOrderGenealogyProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [stageHistory, setStageHistory] = useState<any[]>([]);

  useEffect(() => {
    loadGenealogy();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`wo_genealogy_${woId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_actions_log', filter: `wo_id=eq.${woId}` }, () => {
        loadGenealogy();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_stage_history', filter: `wo_id=eq.${woId}` }, () => {
        loadGenealogy();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId]);

  const loadGenealogy = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load action logs
      const { data: logsData, error: logsError } = await supabase
        .from("wo_actions_log")
        .select("*")
        .eq("wo_id", woId)
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;

      // Load stage history
      const { data: historyData, error: historyError } = await supabase
        .from("wo_stage_history")
        .select("*")
        .eq("wo_id", woId)
        .order("changed_at", { ascending: false });

      if (historyError) throw historyError;

      // Get unique user IDs
      const userIds = [
        ...(logsData || []).map(log => log.performed_by).filter(Boolean),
        ...(historyData || []).map(h => h.changed_by).filter(Boolean)
      ];
      const uniqueUserIds = [...new Set(userIds)];

      // Fetch user profiles
      let userMap = new Map<string, string>();
      if (uniqueUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", uniqueUserIds);
        
        if (profiles) {
          profiles.forEach(p => userMap.set(p.id, p.full_name));
        }
      }

      setLogs((logsData || []).map(log => ({
        ...log,
        user_name: log.performed_by ? userMap.get(log.performed_by) || "Unknown User" : "System"
      })));
      
      setStageHistory((historyData || []).map(h => ({
        ...h,
        user_name: h.changed_by ? userMap.get(h.changed_by) || "Unknown User" : "System"
      })));
    } catch (err: any) {
      console.error("Error loading genealogy:", err);
      setError(err.message || "Failed to load workflow history");
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "material_issued":
        return <Package className="h-5 w-5 text-blue-500" />;
      case "qc_incoming":
      case "qc_in_process":
      case "qc_final":
        return <FlaskConical className="h-5 w-5 text-purple-500" />;
      case "hourly_qc_check":
        return <Clock className="h-5 w-5 text-orange-500" />;
      case "carton_built":
        return <Box className="h-5 w-5 text-green-500" />;
      case "design_uploaded":
        return <CheckCircle2 className="h-5 w-5 text-teal-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatActionType = (type: string) => {
    return type
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getDepartmentColor = (dept: string) => {
    const colors: Record<string, string> = {
      "Goods In": "bg-blue-100 text-blue-800 border-blue-300",
      "Quality": "bg-purple-100 text-purple-800 border-purple-300",
      "Production": "bg-orange-100 text-orange-800 border-orange-300",
      "Packing": "bg-green-100 text-green-800 border-green-300",
      "Design": "bg-teal-100 text-teal-800 border-teal-300",
    };
    return colors[dept] || "bg-gray-100 text-gray-800 border-gray-300";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Workflow History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p className="font-medium">Error loading workflow history</p>
          </div>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stage History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Stage Progression
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stageHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No stage changes recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {stageHistory.map((stage) => (
                <div key={stage.id} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {stage.from_stage?.replace(/_/g, " ") || "Start"}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge className="capitalize">
                        {stage.to_stage.replace(/_/g, " ")}
                      </Badge>
                      {stage.is_override && (
                        <Badge variant="destructive">Override</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Changed by {stage.user_name} •{" "}
                      {format(new Date(stage.changed_at), "PPp")}
                    </div>
                    {stage.remarks && (
                      <p className="text-sm mt-1">{stage.remarks}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Action Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Detailed Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No activities recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-shrink-0 mt-1">
                    {getActionIcon(log.action_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {formatActionType(log.action_type)}
                      </span>
                      <Badge variant="outline" className={getDepartmentColor(log.department)}>
                        {log.department}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      By {log.user_name} •{" "}
                      {format(new Date(log.created_at), "PPp")}
                    </div>
                    {log.action_details && Object.keys(log.action_details).length > 0 && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs space-y-1">
                        {Object.entries(log.action_details).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-[120px,1fr] gap-2">
                            <span className="text-muted-foreground capitalize">
                              {key.replace(/_/g, " ")}:
                            </span>
                            <span className="font-mono break-all">
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
