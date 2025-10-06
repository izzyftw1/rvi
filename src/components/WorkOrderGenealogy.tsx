import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle, Clock, User, Package, FileText, Clipboard } from "lucide-react";
import { format } from "date-fns";

interface WorkOrderGenealogyProps {
  workOrderId: string;
}

interface ActionLog {
  id: string;
  action_type: string;
  department: string;
  performed_by: string;
  created_at: string;
  action_details: any;
  user_name?: string;
}

export const WorkOrderGenealogy = ({ workOrderId }: WorkOrderGenealogyProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [stageHistory, setStageHistory] = useState<any[]>([]);

  useEffect(() => {
    loadGenealogy();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`wo-genealogy-${workOrderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_actions_log', filter: `wo_id=eq.${workOrderId}` }, () => {
        loadGenealogy();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_stage_history', filter: `wo_id=eq.${workOrderId}` }, () => {
        loadGenealogy();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  const loadGenealogy = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch action logs
      const { data: logsData, error: logsError } = await supabase
        .from("wo_actions_log")
        .select(`
          *,
          profiles:performed_by(full_name)
        `)
        .eq("wo_id", workOrderId)
        .order("created_at", { ascending: true });

      if (logsError) throw logsError;

      // Fetch stage history
      const { data: stageData, error: stageError } = await supabase
        .from("wo_stage_history")
        .select(`
          *,
          profiles:changed_by(full_name)
        `)
        .eq("wo_id", workOrderId)
        .order("changed_at", { ascending: true });

      if (stageError) throw stageError;

      const enrichedLogs = (logsData || []).map((log: any) => ({
        ...log,
        user_name: log.profiles?.full_name || "Unknown User"
      }));

      setActionLogs(enrichedLogs);
      setStageHistory(stageData || []);
    } catch (err: any) {
      console.error("Error loading genealogy:", err);
      setError(err.message || "Failed to load work order history");
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case "material_issued":
        return <Package className="h-4 w-4" />;
      case "qc_incoming":
      case "qc_in_process":
      case "qc_final":
      case "hourly_qc_check":
        return <CheckCircle className="h-4 w-4" />;
      case "carton_built":
        return <Clipboard className="h-4 w-4" />;
      case "design_uploaded":
        return <FileText className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getActionColor = (actionType: string) => {
    if (actionType.includes("qc")) return "text-green-600";
    if (actionType.includes("material")) return "text-blue-600";
    if (actionType.includes("carton")) return "text-purple-600";
    return "text-gray-600";
  };

  const formatActionType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Loading history...</p>
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
            <p className="font-medium">Error loading history</p>
          </div>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (actionLogs.length === 0 && stageHistory.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <p className="text-lg font-medium">No History Yet</p>
          <p className="text-sm text-muted-foreground">
            Actions and stage changes will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Work Order Genealogy / History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stage History */}
        {stageHistory.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">Stage Transitions</h3>
            <div className="space-y-2">
              {stageHistory.map((stage: any) => (
                <div key={stage.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="mt-1">
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="capitalize">
                        {stage.from_stage?.replace(/_/g, " ") || "Start"}
                      </Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge className="capitalize">
                        {stage.to_stage?.replace(/_/g, " ")}
                      </Badge>
                      {stage.is_override && (
                        <Badge variant="destructive">Override</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{stage.profiles?.full_name || "System"}</span>
                      <span>•</span>
                      <span>{format(new Date(stage.changed_at), "PPp")}</span>
                    </div>
                    {stage.remarks && (
                      <p className="text-sm mt-1">{stage.remarks}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {stageHistory.length > 0 && actionLogs.length > 0 && <Separator />}

        {/* Action Logs */}
        {actionLogs.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">Actions Log</h3>
            <div className="space-y-2">
              {actionLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className={`mt-1 ${getActionColor(log.action_type)}`}>
                    {getActionIcon(log.action_type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{formatActionType(log.action_type)}</span>
                      <Badge variant="outline">{log.department}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{log.user_name}</span>
                      <span>•</span>
                      <span>{format(new Date(log.created_at), "PPp")}</span>
                    </div>
                    {log.action_details && Object.keys(log.action_details).length > 0 && (
                      <div className="mt-2 text-sm space-y-1">
                        {Object.entries(log.action_details).map(([key, value]) => {
                          if (typeof value === "object") return null;
                          return (
                            <div key={key} className="flex gap-2">
                              <span className="text-muted-foreground capitalize">
                                {key.replace(/_/g, " ")}:
                              </span>
                              <span className="font-medium">{String(value)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
