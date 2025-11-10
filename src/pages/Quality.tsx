import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CheckCircle2, XCircle, AlertTriangle, FileText, Package, Clock, TrendingUp, FlaskConical, Eye, Settings, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const QC_STATUS_CONFIG = {
  pending: { label: 'Awaiting', icon: Clock, color: 'hsl(38 92% 50%)', variant: 'outline' as const },
  in_progress: { label: 'In Progress', icon: Settings, color: 'hsl(210 90% 42%)', variant: 'default' as const },
  passed: { label: 'Passed', icon: CheckCircle2, color: 'hsl(142 76% 36%)', variant: 'default' as const },
  failed: { label: 'Failed', icon: XCircle, color: 'hsl(0 84% 60%)', variant: 'destructive' as const },
  blocked: { label: 'Blocked', icon: AlertTriangle, color: 'hsl(0 84% 60%)', variant: 'destructive' as const },
};

// Memoized QC Action Card
const QCActionCard = memo(({ item, onNavigate }: { item: any; onNavigate: (id: string) => void }) => {
  const isOverdue = item.expected_date && new Date(item.expected_date) < new Date();
  
  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-all duration-300 group animate-fade-in"
      onClick={() => onNavigate(item.wo_id)}
    >
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <HoverCard>
              <HoverCardTrigger>
                <p className="text-sm font-semibold hover:text-primary transition-colors">
                  {item.wo_display_id || item.wo_id}
                </p>
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-semibold">QC Action Required</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Type:</div>
                    <div className="font-medium">{item.qc_type}</div>
                    <div className="text-muted-foreground">Customer:</div>
                    <div className="font-medium">{item.customer}</div>
                    <div className="text-muted-foreground">Item:</div>
                    <div className="font-medium">{item.item_code}</div>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
            <Badge
              variant={isOverdue ? 'destructive' : 'secondary'}
              className="gap-1"
            >
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              {item.qc_type}
            </Badge>
          </div>
          
          <p className="text-xs text-muted-foreground">
            {item.customer} • {item.item_code}
          </p>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Waiting since {new Date(item.created_at).toLocaleDateString()}</span>
          </div>
          
          {item.remarks && (
            <p className="text-xs text-muted-foreground italic truncate">
              {item.remarks}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

QCActionCard.displayName = "QCActionCard";

const Quality = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [qcRecords, setQcRecords] = useState<any[]>([]);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [qcResult, pendingResult] = await Promise.all([
        supabase
          .from("qc_records")
          .select(`
            *,
            work_orders(id, wo_id, display_id, customer, item_code, quantity)
          `)
          .order("created_at", { ascending: false })
          .limit(100),
        
        supabase
          .from("qc_records")
          .select(`
            *,
            work_orders(id, wo_id, display_id, customer, item_code, quantity)
          `)
          .eq("result", "pending")
          .order("created_at", { ascending: true })
      ]);

      if (qcResult.error) throw qcResult.error;
      if (pendingResult.error) throw pendingResult.error;

      setQcRecords(qcResult.data || []);
      setPendingActions(pendingResult.data || []);
    } catch (error: any) {
      console.error("Error loading QC data:", error);
      toast({
        variant: "destructive",
        title: "Error loading QC data",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();

    let timeout: NodeJS.Timeout;
    const channel = supabase
      .channel("qc-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "qc_records" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "hourly_qc_checks" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .subscribe();

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  useEffect(() => {
    if (lastUpdate > 0) {
      loadData();
    }
  }, [lastUpdate, loadData]);

  // Memoized filtered records
  const filteredRecords = useMemo(() => {
    if (statusFilter === 'all') return qcRecords;
    return qcRecords.filter(r => r.result === statusFilter);
  }, [qcRecords, statusFilter]);

  // Memoized stats
  const stats = useMemo(() => {
    const total = qcRecords.length;
    const passed = qcRecords.filter(r => r.result === 'pass').length;
    const failed = qcRecords.filter(r => r.result === 'fail').length;
    const pending = qcRecords.filter(r => r.result === 'pending').length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    
    return { total, passed, failed, pending, passRate };
  }, [qcRecords]);

  // Memoized status counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: qcRecords.length };
    
    Object.keys(QC_STATUS_CONFIG).forEach(status => {
      counts[status] = qcRecords.filter(r => r.result === status).length;
    });
    
    return counts;
  }, [qcRecords]);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-success to-accent bg-clip-text text-transparent">
              Quality Control Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Real-time inspection tracking and quality metrics
            </p>
          </div>
          <Button onClick={() => navigate("/hourly-qc")} variant="default">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Start Hourly QC
          </Button>
        </div>

        {/* Summary Ribbon */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-muted/30 to-muted/10">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Inspections</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pass Rate</p>
                  <p className="text-2xl font-bold text-success">{stats.passRate}%</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-success/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
                </div>
                <XCircle className="h-8 w-8 text-destructive/60" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-warning">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-warning/60" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Filter Chips - Sticky */}
        <div className="sticky top-16 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-4 px-4 py-4 border-b">
          <Card className="shadow-lg">
            <CardContent className="pt-6 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical className="h-4 w-4 text-success" />
                <p className="text-sm font-semibold text-foreground">Filter by Status</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  className="cursor-pointer hover:bg-primary/80 transition-colors px-3 py-2"
                  onClick={() => setStatusFilter('all')}
                >
                  All Inspections ({statusCounts.all || 0})
                </Badge>
                {Object.entries(QC_STATUS_CONFIG).map(([status, config]) => {
                  const Icon = config.icon;
                  return (
                    <Badge
                      key={status}
                      variant={statusFilter === status ? config.variant : 'outline'}
                      className={cn(
                        "cursor-pointer transition-all duration-300 hover:scale-105 px-3 py-2 gap-1.5",
                        statusFilter === status && "shadow-md"
                      )}
                      style={statusFilter === status ? { backgroundColor: config.color, color: 'white' } : {}}
                      onClick={() => setStatusFilter(status)}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="font-medium">{config.label}</span>
                      <span className={cn(
                        "ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold",
                        statusFilter === status ? "bg-background/20" : "bg-muted"
                      )}>
                        {statusCounts[status] || 0}
                      </span>
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3">
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending Actions
              {pendingActions.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                  {pendingActions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="hourly" className="gap-2">
              <Eye className="h-4 w-4" />
              Hourly QC Checks
            </TabsTrigger>
            <TabsTrigger value="final" className="gap-2">
              <Package className="h-4 w-4" />
              Final Inspection
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-6">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-2">
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : pendingActions.length === 0 ? (
              <Card className="animate-fade-in">
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-success mb-4" />
                  <p className="text-lg font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    No pending QC actions at this time
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Materials Awaiting Lab Report */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FlaskConical className="h-5 w-5 text-warning" />
                      Materials Awaiting Lab Report (Pre-Production)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {pendingActions
                        .filter(a => a.qc_type === 'first_piece')
                        .map((item) => (
                          <QCActionCard
                            key={item.id}
                            item={{ ...item, wo_display_id: item.work_orders?.display_id, customer: item.work_orders?.customer, item_code: item.work_orders?.item_code }}
                            onNavigate={(id) => navigate(`/work-orders/${item.work_orders?.id}`)}
                          />
                        ))}
                      {pendingActions.filter(a => a.qc_type === 'first_piece').length === 0 && (
                        <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                          No materials pending lab reports
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* First Piece Approvals */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      First Piece Approvals Pending (Production Start)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {pendingActions
                        .filter(a => a.qc_type === 'in_process')
                        .map((item) => (
                          <QCActionCard
                            key={item.id}
                            item={{ ...item, wo_display_id: item.work_orders?.display_id, customer: item.work_orders?.customer, item_code: item.work_orders?.item_code }}
                            onNavigate={(id) => navigate(`/work-orders/${item.work_orders?.id}`)}
                          />
                        ))}
                      {pendingActions.filter(a => a.qc_type === 'in_process').length === 0 && (
                        <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                          No first piece approvals pending
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Final Inspections */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Package className="h-5 w-5 text-success" />
                      Final Inspection Pending (Before Packing/Dispatch)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {pendingActions
                        .filter(a => a.qc_type === 'final')
                        .map((item) => (
                          <QCActionCard
                            key={item.id}
                            item={{ ...item, wo_display_id: item.work_orders?.display_id, customer: item.work_orders?.customer, item_code: item.work_orders?.item_code }}
                            onNavigate={(id) => navigate(`/work-orders/${item.work_orders?.id}`)}
                          />
                        ))}
                      {pendingActions.filter(a => a.qc_type === 'final').length === 0 && (
                        <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                          No final inspections pending
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="hourly" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Hourly QC Checks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Hourly QC check interface coming soon</p>
                  <p className="text-xs mt-2">
                    Real-time inputs with operation selector (A/B/C/D), measured dimensions, and tolerances
                  </p>
                  <Button variant="outline" className="mt-4" onClick={() => navigate("/hourly-qc")}>
                    Go to Hourly QC
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="final" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Final Inspection Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredRecords.filter(r => r.qc_type === 'final').length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-sm">No final inspection records found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredRecords
                      .filter(r => r.qc_type === 'final')
                      .map((record) => {
                        const StatusIcon = QC_STATUS_CONFIG[record.result as keyof typeof QC_STATUS_CONFIG]?.icon || FileText;
                        const statusConfig = QC_STATUS_CONFIG[record.result as keyof typeof QC_STATUS_CONFIG];
                        
                        return (
                          <Card
                            key={record.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => record.work_orders && navigate(`/work-orders/${record.work_orders.id}`)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <StatusIcon className="h-4 w-4" style={{ color: statusConfig?.color }} />
                                    <span className="font-semibold text-sm">
                                      {record.qc_id}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {record.work_orders?.display_id || record.work_orders?.wo_id}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {record.work_orders?.customer} • {record.work_orders?.item_code}
                                  </p>
                                </div>
                                <Badge variant={statusConfig?.variant} style={record.result === 'passed' || record.result === 'failed' ? { backgroundColor: statusConfig?.color, color: 'white' } : {}}>
                                  {statusConfig?.label || record.result}
                                </Badge>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Quality;
