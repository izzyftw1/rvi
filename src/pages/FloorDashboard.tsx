import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NavigationHeader } from "@/components/NavigationHeader";
import { MachineUtilizationDashboard } from "@/components/MachineUtilizationDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { Factory, TrendingUp, Users, CheckCircle2, AlertTriangle, Clock, Hammer, Package, Inbox } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

const OPERATIONS = ['A', 'B', 'C', 'D'] as const;

// Stage configuration with modern colors
const STAGE_CONFIG = {
  goods_in: { label: 'Goods In', icon: Inbox, color: 'hsl(var(--muted))' },
  cutting_queue: { label: 'Cutting', icon: Package, color: 'hsl(210 90% 52%)' },
  forging_queue: { label: 'Forging', icon: Hammer, color: 'hsl(38 92% 50%)' },
  production: { label: 'Production', icon: Factory, color: 'hsl(210 90% 42%)' },
  qc: { label: 'QC', icon: CheckCircle2, color: 'hsl(142 76% 36%)' },
  packing: { label: 'Packing', icon: Package, color: 'hsl(210 70% 40%)' },
  dispatch: { label: 'Dispatch', icon: Package, color: 'hsl(142 76% 40%)' },
};

// Memoized WO Card Component
const WorkOrderCard = memo(({ wo, onClick }: { wo: any; onClick: () => void }) => {
  const stage = STAGE_CONFIG[wo.current_stage as keyof typeof STAGE_CONFIG];
  const Icon = stage?.icon || Factory;
  const isOverdue = wo.due_date && new Date(wo.due_date) < new Date();
  const daysUntilDue = wo.due_date ? differenceInDays(new Date(wo.due_date), new Date()) : null;
  
  const getProgressPercent = () => {
    if (!wo.quantity || wo.quantity === 0) return 0;
    const completed = wo.qty_completed || 0;
    return Math.min(100, Math.round((completed / wo.quantity) * 100));
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all duration-300 group animate-fade-in"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <HoverCard>
              <HoverCardTrigger>
                <p className="text-sm font-semibold truncate hover:text-primary transition-colors">
                  {wo.display_id || wo.wo_id}
                </p>
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-semibold">Work Order Details</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Customer:</div>
                    <div className="font-medium">{wo.customer}</div>
                    <div className="text-muted-foreground">Item:</div>
                    <div className="font-medium">{wo.item_code}</div>
                    <div className="text-muted-foreground">Quantity:</div>
                    <div>{wo.quantity?.toLocaleString()}</div>
                    <div className="text-muted-foreground">Progress:</div>
                    <div className="flex items-center gap-2">
                      <Progress value={getProgressPercent()} className="h-2 flex-1" />
                      <span className="text-xs font-medium">{getProgressPercent()}%</span>
                    </div>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
            <Badge
              variant={wo.status === 'in_progress' ? 'default' : 'secondary'}
              className="text-xs"
            >
              {wo.status}
            </Badge>
          </div>
          
          <p className="text-xs text-muted-foreground truncate">
            {wo.customer}
          </p>
          
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" style={{ color: stage?.color }} />
            <span className="text-xs font-medium" style={{ color: stage?.color }}>
              {stage?.label || wo.current_stage}
            </span>
          </div>
          
          <p className="text-xs font-mono truncate text-muted-foreground">
            {wo.item_code}
          </p>
          
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Qty: {wo.quantity?.toLocaleString()}
            </span>
            {wo.due_date && (
              <div className={cn(
                "flex items-center gap-1",
                isOverdue && "text-destructive font-semibold"
              )}>
                {isOverdue && <AlertTriangle className="h-3 w-3" />}
                <Clock className="h-3 w-3" />
                <span>
                  {daysUntilDue !== null && daysUntilDue >= 0 
                    ? `${daysUntilDue}d` 
                    : daysUntilDue !== null && daysUntilDue < 0 
                      ? `${Math.abs(daysUntilDue)}d overdue`
                      : format(new Date(wo.due_date), "MMM dd")}
                </span>
              </div>
            )}
          </div>
          
          {wo.sales_order && (
            <p className="text-xs text-muted-foreground truncate">
              PO: {wo.sales_order.po_number}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

WorkOrderCard.displayName = "WorkOrderCard";

const FloorDashboard = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [woResult, machinesResult, operatorsResult] = await Promise.all([
        supabase
          .from("work_orders")
          .select(`
            *,
            sales_order:sales_orders(so_id, customer, po_number)
          `)
          .in("status", ["pending", "in_progress"])
          .order("due_date", { ascending: true }),
        
        supabase
          .from("machines")
          .select("*")
          .order("machine_id", { ascending: true }),
        
        supabase
          .from("profiles")
          .select("id, full_name, department_id")
          .order("full_name", { ascending: true })
      ]);

      if (woResult.error) throw woResult.error;
      if (machinesResult.error) throw machinesResult.error;
      if (operatorsResult.error) throw operatorsResult.error;

      setWorkOrders(woResult.data || []);
      setMachines(machinesResult.data || []);
      setOperators(operatorsResult.data || []);
    } catch (error: any) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
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
      .on("postgres_changes", { event: "*", schema: "public", table: "production_logs" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wo_machine_assignments" }, () => {
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
    if (lastUpdate > 0) {
      loadData();
    }
  }, [lastUpdate, loadData]);

  // Memoized stage groups
  const stageGroups = useMemo(() => {
    return Object.entries(STAGE_CONFIG).map(([stage, config]) => ({
      stage,
      ...config,
      orders: workOrders.filter((wo) => wo.current_stage === stage),
    }));
  }, [workOrders]);

  // Memoized stats
  const stats = useMemo(() => {
    const totalWOs = workOrders.length;
    const totalPartsTarget = workOrders.reduce((sum, wo) => sum + (wo.quantity || 0), 0);
    const totalPartsCompleted = workOrders.reduce((sum, wo) => sum + (wo.qty_completed || 0), 0);
    const avgEfficiency = totalPartsTarget > 0 ? Math.round((totalPartsCompleted / totalPartsTarget) * 100) : 0;
    const idleMachines = machines.filter(m => m.status === 'idle').length;
    
    return {
      totalWOs,
      avgEfficiency,
      idleMachines,
      totalPartsCompleted: totalPartsCompleted.toLocaleString(),
    };
  }, [workOrders, machines]);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Production Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Real-time production monitoring and machine utilization
          </p>
        </div>

        {/* Summary Ribbon */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">WOs in Progress</p>
                  <p className="text-2xl font-bold text-primary">{stats.totalWOs}</p>
                </div>
                <Factory className="h-8 w-8 text-primary/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Efficiency</p>
                  <p className="text-2xl font-bold text-success">{stats.avgEfficiency}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-success/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Idle Machines</p>
                  <p className="text-2xl font-bold text-accent">{stats.idleMachines}</p>
                </div>
                <Clock className="h-8 w-8 text-accent/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-muted/30 to-muted/10">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Parts Completed</p>
                  <p className="text-2xl font-bold">{stats.totalPartsCompleted}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-muted-foreground/60" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3">
            <TabsTrigger value="overview" className="gap-2">
              <Factory className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="machines" className="gap-2">
              <Package className="h-4 w-4" />
              Machine Utilization
            </TabsTrigger>
            <TabsTrigger value="operators" className="gap-2">
              <Users className="h-4 w-4" />
              Operator Efficiency
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-3 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stageGroups.map((group) => {
                  const Icon = group.icon;
                  return (
                    <div key={group.stage} className="space-y-3">
                      <div className="flex items-center gap-2 px-2">
                        <Icon className="h-4 w-4" style={{ color: group.color }} />
                        <h3 className="font-semibold text-sm" style={{ color: group.color }}>
                          {group.label}
                        </h3>
                        <Badge
                          variant="secondary"
                          className="ml-auto"
                          style={{
                            backgroundColor: `${group.color}20`,
                            color: group.color,
                            borderColor: `${group.color}40`
                          }}
                        >
                          {group.orders.length}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        {group.orders.length === 0 ? (
                          <Card className="bg-muted/30">
                            <CardContent className="py-8 text-center">
                              <p className="text-xs text-muted-foreground">
                                No orders in {group.label.toLowerCase()}
                              </p>
                            </CardContent>
                          </Card>
                        ) : (
                          group.orders.map((wo) => (
                            <WorkOrderCard
                              key={wo.id}
                              wo={wo}
                              onClick={() => navigate(`/work-orders/${wo.id}`)}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Operator efficiency metrics coming soon</p>
                  <p className="text-xs mt-2">
                    Track daily/weekly output vs targets, downtime logs, and average piece time
                  </p>
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
