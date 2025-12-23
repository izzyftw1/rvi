import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { MachineUtilizationDashboard } from "@/components/MachineUtilizationDashboard";
import { ActionableBlockers } from "@/components/dashboard/ActionableBlockers";
import { BlockedWorkOrdersTable } from "@/components/dashboard/BlockedWorkOrdersTable";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Factory, 
  TrendingUp, 
  Users, 
  AlertTriangle, 
  Clock, 
  ArrowRight,
  Zap,
  CheckCircle,
  XCircle,
  RefreshCw
} from "lucide-react";
import { differenceInHours, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const FloorDashboard = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [externalMoves, setExternalMoves] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [woResult, machinesResult, externalResult] = await Promise.all([
        supabase
          .from("work_orders")
          .select(`
            id,
            wo_id,
            display_id,
            customer,
            item_code,
            quantity,
            status,
            current_stage,
            due_date,
            created_at,
            stage_entered_at,
            qc_material_passed,
            qc_first_piece_passed,
            machine_id
          `)
          .in("status", ["pending", "in_progress"])
          .order("due_date", { ascending: true }),
        
        supabase
          .from("machines")
          .select("id, machine_id, name, status, current_wo_id")
          .order("machine_id", { ascending: true }),

        supabase
          .from("wo_external_moves")
          .select("id, work_order_id, process, status, expected_return_date")
          .eq("status", "sent")
      ]);

      if (woResult.error) throw woResult.error;
      if (machinesResult.error) throw machinesResult.error;
      if (externalResult.error) throw externalResult.error;

      setWorkOrders(woResult.data || []);
      setMachines(machinesResult.data || []);
      setExternalMoves(externalResult.data || []);
    } catch (error: any) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const refreshInterval = setInterval(loadData, 30000);

    let timeout: NodeJS.Timeout;
    const channel = supabase
      .channel("floor-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "machines" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wo_external_moves" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .subscribe();

    return () => {
      clearInterval(refreshInterval);
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  useEffect(() => {
    if (lastUpdate > 0) loadData();
  }, [lastUpdate, loadData]);

  // Calculate blocker stats
  const blockerStats = useMemo(() => {
    const total = workOrders.length;
    const materialQcBlocked = workOrders.filter(wo => !wo.qc_material_passed).length;
    const firstPieceBlocked = workOrders.filter(wo => wo.qc_material_passed && !wo.qc_first_piece_passed).length;
    const externalBlocked = externalMoves.length;
    const ready = total - materialQcBlocked - firstPieceBlocked - externalBlocked;
    
    const activeMachines = machines.filter(m => m.status === 'running' || m.current_wo_id).length;
    const idleMachines = machines.filter(m => m.status === 'idle' && !m.current_wo_id).length;

    return {
      total,
      materialQcBlocked,
      firstPieceBlocked,
      externalBlocked,
      ready: Math.max(0, ready),
      activeMachines,
      idleMachines,
      totalMachines: machines.length,
      blockedTotal: materialQcBlocked + firstPieceBlocked + externalBlocked
    };
  }, [workOrders, externalMoves, machines]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header with Action Focus */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              Floor Dashboard
              {blockerStats.blockedTotal > 0 && (
                <Badge variant="destructive" className="text-sm">
                  {blockerStats.blockedTotal} Blocked
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Action-focused: What's blocked, why, and who owns it
            </p>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadData}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Quick Stats Strip - Blocker Focused */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className={cn(
            "border-l-4",
            blockerStats.materialQcBlocked > 0 ? "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Material QC</span>
                <XCircle className={cn("h-4 w-4", blockerStats.materialQcBlocked > 0 ? "text-amber-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", blockerStats.materialQcBlocked > 0 && "text-amber-700 dark:text-amber-400")}>
                {blockerStats.materialQcBlocked}
              </p>
              <p className="text-[10px] text-muted-foreground">Owner: Quality</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            blockerStats.firstPieceBlocked > 0 ? "border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">First Piece QC</span>
                <XCircle className={cn("h-4 w-4", blockerStats.firstPieceBlocked > 0 ? "text-orange-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", blockerStats.firstPieceBlocked > 0 && "text-orange-700 dark:text-orange-400")}>
                {blockerStats.firstPieceBlocked}
              </p>
              <p className="text-[10px] text-muted-foreground">Owner: QC / Production</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            blockerStats.externalBlocked > 0 ? "border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">At External</span>
                <Clock className={cn("h-4 w-4", blockerStats.externalBlocked > 0 ? "text-purple-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", blockerStats.externalBlocked > 0 && "text-purple-700 dark:text-purple-400")}>
                {blockerStats.externalBlocked}
              </p>
              <p className="text-[10px] text-muted-foreground">Owner: External Ops</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ready to Run</span>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-xl font-bold text-green-700 dark:text-green-400">
                {blockerStats.ready}
              </p>
              <p className="text-[10px] text-muted-foreground">Owner: Production</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            blockerStats.idleMachines > 0 && blockerStats.ready > 0 ? "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Idle Machines</span>
                <Factory className={cn("h-4 w-4", blockerStats.idleMachines > 0 ? "text-blue-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", blockerStats.idleMachines > 0 && "text-blue-700 dark:text-blue-400")}>
                {blockerStats.idleMachines} / {blockerStats.totalMachines}
              </p>
              <p className="text-[10px] text-muted-foreground">Action: Assign Work</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-muted">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total Active</span>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold">{blockerStats.total}</p>
              <p className="text-[10px] text-muted-foreground">Work Orders</p>
            </CardContent>
          </Card>
        </div>

        {/* Priority Action Alert */}
        {blockerStats.idleMachines > 0 && blockerStats.ready > 0 && (
          <Card className="border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200">
                      {blockerStats.idleMachines} machine{blockerStats.idleMachines > 1 ? 's' : ''} idle with {blockerStats.ready} ready WOs
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Assign machines to start production
                    </p>
                  </div>
                </div>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => navigate('/production-progress?status=ready')}
                  className="gap-1"
                >
                  Assign Now <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content */}
        <Tabs defaultValue="blockers" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-4">
            <TabsTrigger value="blockers" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Blockers
              {blockerStats.blockedTotal > 0 && (
                <Badge variant="destructive" className="h-5 text-[10px] px-1.5">
                  {blockerStats.blockedTotal}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="actions" className="gap-2">
              <Zap className="h-4 w-4" />
              Quick Actions
            </TabsTrigger>
            <TabsTrigger value="machines" className="gap-2">
              <Factory className="h-4 w-4" />
              Machines
            </TabsTrigger>
            <TabsTrigger value="operators" className="gap-2">
              <Users className="h-4 w-4" />
              Operators
            </TabsTrigger>
          </TabsList>

          {/* Blockers Tab - Priority */}
          <TabsContent value="blockers" className="mt-6 space-y-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-60 w-full" />
              </div>
            ) : (
              <>
                {/* Top Priority Actions */}
                <ActionableBlockers />

                {/* Full Blocked Orders Table */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        All Blocked Work Orders
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">
                        Each row has one primary action
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <BlockedWorkOrdersTable 
                      workOrders={workOrders}
                      externalMoves={externalMoves}
                      machines={machines}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Quick Actions Tab */}
          <TabsContent value="actions" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Material QC Action */}
              <Card className={cn(
                "transition-all hover:shadow-md cursor-pointer",
                blockerStats.materialQcBlocked > 0 && "ring-2 ring-amber-500/50"
              )} onClick={() => navigate('/qc/incoming')}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-amber-500 text-amber-700">
                      Quality
                    </Badge>
                    {blockerStats.materialQcBlocked > 0 && (
                      <Badge variant="destructive">{blockerStats.materialQcBlocked} pending</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold mb-1">Approve Material QC</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Inspect and approve incoming materials to unblock production
                  </p>
                  <Button size="sm" className="w-full gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Open QC Incoming
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              {/* First Piece QC Action */}
              <Card className={cn(
                "transition-all hover:shadow-md cursor-pointer",
                blockerStats.firstPieceBlocked > 0 && "ring-2 ring-orange-500/50"
              )} onClick={() => navigate('/quality?tab=first-piece')}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-orange-500 text-orange-700">
                      QC / Production
                    </Badge>
                    {blockerStats.firstPieceBlocked > 0 && (
                      <Badge variant="destructive">{blockerStats.firstPieceBlocked} pending</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold mb-1">Approve First Piece</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Perform first piece inspection to release production
                  </p>
                  <Button size="sm" className="w-full gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Open First Piece
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              {/* Assign Machine Action */}
              <Card className={cn(
                "transition-all hover:shadow-md cursor-pointer",
                blockerStats.idleMachines > 0 && blockerStats.ready > 0 && "ring-2 ring-blue-500/50"
              )} onClick={() => navigate('/production-progress')}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-blue-500 text-blue-700">
                      Production Planning
                    </Badge>
                    {blockerStats.ready > 0 && (
                      <Badge className="bg-green-500">{blockerStats.ready} ready</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold mb-1">Assign Machines</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Assign work orders to available machines
                  </p>
                  <Button size="sm" className="w-full gap-2">
                    <Factory className="h-4 w-4" />
                    Open Production Progress
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              {/* External Status Action */}
              <Card className={cn(
                "transition-all hover:shadow-md cursor-pointer",
                blockerStats.externalBlocked > 0 && "ring-2 ring-purple-500/50"
              )} onClick={() => navigate('/external-efficiency')}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-purple-500 text-purple-700">
                      External Ops
                    </Badge>
                    {blockerStats.externalBlocked > 0 && (
                      <Badge variant="secondary">{blockerStats.externalBlocked} at external</Badge>
                    )}
                  </div>
                  <h3 className="font-semibold mb-1">Check External Status</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Track and expedite items at external vendors
                  </p>
                  <Button size="sm" variant="outline" className="w-full gap-2">
                    <Clock className="h-4 w-4" />
                    View External Jobs
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              {/* Issue Material Action */}
              <Card className="transition-all hover:shadow-md cursor-pointer" 
                onClick={() => navigate('/material-requirements')}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-green-500 text-green-700">
                      Procurement
                    </Badge>
                  </div>
                  <h3 className="font-semibold mb-1">Issue Material</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Issue materials to work orders ready for production
                  </p>
                  <Button size="sm" variant="outline" className="w-full gap-2">
                    <Zap className="h-4 w-4" />
                    Material Requirements
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>

              {/* Maintenance Action */}
              <Card className="transition-all hover:shadow-md cursor-pointer"
                onClick={() => navigate('/cnc')}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className="border-red-500 text-red-700">
                      Maintenance
                    </Badge>
                  </div>
                  <h3 className="font-semibold mb-1">Call Maintenance</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Report machine issues or schedule maintenance
                  </p>
                  <Button size="sm" variant="destructive" className="w-full gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Machine Status
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="machines" className="mt-6">
            <MachineUtilizationDashboard />
          </TabsContent>

          <TabsContent value="operators" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Operator Efficiency Tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 space-y-4">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <div>
                    <p className="text-sm text-muted-foreground mb-3">
                      View detailed operator performance metrics from the Operator Production Ledger
                    </p>
                    <Button
                      onClick={() => navigate('/operator-efficiency')}
                      className="gap-2"
                    >
                      <TrendingUp className="h-4 w-4" />
                      Open Operator Efficiency Report
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default FloorDashboard;
