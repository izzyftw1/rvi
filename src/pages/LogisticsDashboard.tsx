import { useEffect, useState, useCallback } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { ExternalReceiptDialog } from "@/components/ExternalReceiptDialog";
import { useNavigate } from "react-router-dom";
import { format, isPast, parseISO, differenceInDays } from "date-fns";
import { Package, AlertCircle, TrendingUp, FileText, ExternalLink, Download, CheckCircle, Clock, Truck, AlertTriangle } from "lucide-react";
import { downloadCSV } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";

interface ExtendedMove {
  id: string;
  work_order_id: string;
  process: string;
  partner_id: string;
  quantity_sent: number;
  status: string;
  expected_return_date: string | null;
  dispatch_date: string;
  challan_no: string;
  work_order?: any;
  partner?: any;
  total_received?: number;
}

interface BatchInfo {
  id: string;
  wo_id: string;
  batch_number: number;
  produced_qty: number;
  qc_approved_qty: number;
  qc_rejected_qty: number;
  qc_pending_qty: number;
  dispatched_qty: number;
  qc_material_status: string;
  qc_first_piece_status: string;
  qc_final_status: string;
  dispatch_allowed: boolean;
  work_order?: any;
  dispatchable_qty: number;
}

const LogisticsDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [moves, setMoves] = useState<ExtendedMove[]>([]);
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMove, setSelectedMove] = useState<any>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load all production batches with work order info
      const { data: batchesData } = await supabase
        .from("production_batches")
        .select(`
          id, wo_id, batch_number, produced_qty, qc_approved_qty, qc_rejected_qty, 
          qc_pending_qty, dispatched_qty, qc_material_status, qc_first_piece_status, 
          qc_final_status, dispatch_allowed
        `)
        .order("started_at", { ascending: false });

      // Get unique WO IDs from batches
      const batchWoIds = [...new Set((batchesData || []).map((b: any) => b.wo_id))];
      
      // Load work orders for batches
      const { data: batchWorkOrders } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code, quantity, due_date, status")
        .in("id", batchWoIds.length > 0 ? batchWoIds : ['00000000-0000-0000-0000-000000000000']);

      const batchWoMap = Object.fromEntries((batchWorkOrders || []).map((wo: any) => [wo.id, wo]));

      // Enrich batches with work order and calculate dispatchable qty
      const enrichedBatches = (batchesData || []).map((b: any) => ({
        ...b,
        work_order: batchWoMap[b.wo_id],
        dispatchable_qty: Math.max(0, (b.qc_approved_qty || 0) - (b.dispatched_qty || 0)),
      })) as BatchInfo[];

      setBatches(enrichedBatches);

      // Load all active moves
      const { data: movesData } = await supabase
        .from("wo_external_moves" as any)
        .select("id, work_order_id, process, partner_id, quantity_sent, status, expected_return_date, dispatch_date, challan_no")
        .neq("status", "cancelled")
        .order("dispatch_date", { ascending: false });

      // Load receipts
      const { data: receiptsData } = await supabase
        .from("wo_external_receipts" as any)
        .select("move_id, qty_received");

      // Aggregate receipts by move
      const receiptsMap: Record<string, number> = {};
      (receiptsData || []).forEach((r: any) => {
        receiptsMap[r.move_id] = (receiptsMap[r.move_id] || 0) + r.qty_received;
      });

      // Load work orders for moves
      const moveWoIds = [...new Set((movesData || []).map((m: any) => m.work_order_id))];
      const { data: moveWorkOrders } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code")
        .in("id", moveWoIds.length > 0 ? moveWoIds : ['00000000-0000-0000-0000-000000000000']);

      const moveWoMap = Object.fromEntries((moveWorkOrders || []).map((wo: any) => [wo.id, wo]));

      // Load partners
      const { data: partnersData } = await supabase
        .from("external_partners" as any)
        .select("id, name, process_types")
        .eq("active", true);

      const partnersMap = Object.fromEntries((partnersData || []).map((p: any) => [p.id, p]));
      setPartners(partnersData || []);

      // Combine data
      const enrichedMoves = (movesData || []).map((m: any) => ({
        ...m,
        work_order: moveWoMap[m.work_order_id],
        partner: partnersMap[m.partner_id],
        total_received: receiptsMap[m.id] || 0,
      })) as ExtendedMove[];

      setMoves(enrichedMoves);
    } catch (error) {
      console.error("Error loading logistics data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('logistics_batch_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Batch-based filtering
  const getDispatchReadyBatches = () => {
    return batches.filter(b => b.dispatchable_qty > 0 && b.dispatch_allowed);
  };

  const getPendingQCBatches = () => {
    return batches.filter(b => 
      (b.qc_material_status === 'pending' || 
       b.qc_first_piece_status === 'pending' || 
       b.qc_final_status === 'pending') &&
      b.produced_qty > 0
    );
  };

  const getPartiallyDispatchedBatches = () => {
    return batches.filter(b => 
      b.dispatched_qty > 0 && 
      b.dispatchable_qty > 0
    );
  };

  const getUrgentBatches = () => {
    const today = new Date();
    return batches.filter(b => {
      if (!b.work_order?.due_date) return false;
      const dueDate = parseISO(b.work_order.due_date);
      const daysUntilDue = differenceInDays(dueDate, today);
      return daysUntilDue <= 3 && b.dispatchable_qty > 0;
    });
  };

  const getOpenMoves = () => {
    return moves.filter(m => m.status !== 'received_full');
  };

  const getOverdueMoves = () => {
    return moves.filter(m => 
      m.expected_return_date && 
      isPast(parseISO(m.expected_return_date)) && 
      m.status !== 'received_full'
    );
  };

  const handleExportBatches = (batchList: BatchInfo[], filename: string) => {
    const exportData = batchList.map(b => ({
      'WO ID': b.work_order?.display_id || '',
      'Customer': b.work_order?.customer || '',
      'Item': b.work_order?.item_code || '',
      'Batch #': b.batch_number,
      'Produced': b.produced_qty || 0,
      'QC Approved': b.qc_approved_qty || 0,
      'Dispatched': b.dispatched_qty || 0,
      'Dispatchable': b.dispatchable_qty,
      'Material QC': b.qc_material_status,
      'First Piece QC': b.qc_first_piece_status,
      'Final QC': b.qc_final_status,
      'Due Date': b.work_order?.due_date || '',
    }));
    downloadCSV(exportData, filename);
    toast({ description: 'Batches exported successfully' });
  };

  const handleExportOpenMoves = () => {
    const openMoves = getOpenMoves();
    const exportData = openMoves.map(m => ({
      'WO ID': m.work_order?.display_id || '',
      'Customer': m.work_order?.customer || '',
      'Item': m.work_order?.item_code || '',
      'Process': m.process.replace('_', ' ').toUpperCase(),
      'Partner': m.partner?.name || '',
      'Qty Sent': m.quantity_sent,
      'Qty Received': m.total_received || 0,
      '% Complete': m.quantity_sent > 0 ? Math.round(((m.total_received || 0) / m.quantity_sent) * 100) : 0,
      'Expected Return': m.expected_return_date || 'N/A',
      'Challan No': m.challan_no,
    }));
    downloadCSV(exportData, 'open_external_moves');
    toast({ description: 'Open moves exported successfully' });
  };

  const getPartnerStats = () => {
    return partners.map(partner => {
      const partnerMoves = moves.filter(m => m.partner_id === partner.id);
      const activeMoves = partnerMoves.filter(m => m.status !== 'received_full');
      const overdueMoves = partnerMoves.filter(m => 
        m.expected_return_date && 
        isPast(parseISO(m.expected_return_date)) && 
        m.status !== 'received_full'
      );

      const recentMoves = partnerMoves.filter(m => {
        const dispatchDate = parseISO(m.dispatch_date);
        return differenceInDays(new Date(), dispatchDate) <= 90;
      });
      const completedOnTime = recentMoves.filter(m => 
        m.status === 'received_full' && 
        (!m.expected_return_date || !isPast(parseISO(m.expected_return_date)))
      );
      const onTimeRate = recentMoves.length > 0 
        ? Math.round((completedOnTime.length / recentMoves.length) * 100)
        : 0;

      return {
        ...partner,
        activeMoves: activeMoves.length,
        overdueMoves: overdueMoves.length,
        onTimeRate,
        totalMoves: partnerMoves.length,
      };
    });
  };

  const getBatchStatusBadge = (batch: BatchInfo) => {
    if (batch.qc_final_status === 'failed') {
      return <Badge variant="destructive">QC Failed</Badge>;
    }
    if (batch.dispatch_allowed && batch.dispatchable_qty > 0) {
      return <Badge className="bg-green-500">Ready to Dispatch</Badge>;
    }
    if (batch.dispatched_qty > 0 && batch.dispatchable_qty > 0) {
      return <Badge variant="secondary">Partially Dispatched</Badge>;
    }
    if (batch.qc_final_status === 'pending' && batch.produced_qty > 0) {
      return <Badge variant="outline">Pending Final QC</Badge>;
    }
    if (batch.qc_first_piece_status === 'pending') {
      return <Badge variant="outline">Pending First Piece</Badge>;
    }
    if (batch.qc_material_status === 'pending') {
      return <Badge variant="outline">Pending Material QC</Badge>;
    }
    if (batch.dispatched_qty > 0 && batch.dispatchable_qty === 0) {
      return <Badge className="bg-blue-500">Fully Dispatched</Badge>;
    }
    return <Badge variant="outline">In Progress</Badge>;
  };

  const renderBatchRow = (batch: BatchInfo, showUrgency: boolean = false) => {
    const daysUntilDue = batch.work_order?.due_date 
      ? differenceInDays(parseISO(batch.work_order.due_date), new Date())
      : null;

    return (
      <Card key={batch.id} className="hover:shadow-md transition-shadow">
        <CardContent className="py-4">
          <div className="grid grid-cols-7 gap-4 items-center">
            <div>
              <p className="font-medium text-sm">{batch.work_order?.display_id || "—"}</p>
              <p className="text-xs text-muted-foreground">
                Batch #{batch.batch_number}
              </p>
            </div>
            
            <div>
              <p className="text-sm">{batch.work_order?.customer || "—"}</p>
              <p className="text-xs text-muted-foreground">{batch.work_order?.item_code}</p>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium">{batch.produced_qty || 0}</p>
              <p className="text-xs text-muted-foreground">Produced</p>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium">{batch.qc_approved_qty || 0}</p>
              <p className="text-xs text-muted-foreground">QC Approved</p>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-primary">{batch.dispatchable_qty}</p>
              <p className="text-xs text-muted-foreground">Dispatchable</p>
            </div>

            <div className="flex items-center gap-2">
              {getBatchStatusBadge(batch)}
              {showUrgency && daysUntilDue !== null && daysUntilDue <= 3 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {daysUntilDue <= 0 ? 'Overdue' : `${daysUntilDue}d`}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/dispatch?wo=${batch.wo_id}&batch=${batch.id}`)}
                disabled={batch.dispatchable_qty === 0}
              >
                <Truck className="h-4 w-4 mr-1" />
                Dispatch
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/work-orders/${batch.wo_id}`)}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderMoveRow = (move: ExtendedMove) => {
    const progress = (move.quantity_sent || 0) > 0 ? ((move.total_received || 0) / (move.quantity_sent || 1)) * 100 : 0;
    const isOverdue = move.expected_return_date && isPast(parseISO(move.expected_return_date)) && move.status !== 'received_full';

    return (
      <Card key={move.id} className="hover:shadow-md transition-shadow">
        <CardContent className="py-4">
          <div className="grid grid-cols-6 gap-4 items-center">
            <div>
              <p className="font-medium text-sm">{move.work_order?.display_id || "—"}</p>
              <p className="text-xs text-muted-foreground">
                {move.work_order?.customer} • {move.work_order?.item_code}
              </p>
            </div>
            
            <div>
              <Badge variant="outline" className="capitalize">
                {move.process.replace('_', ' ')}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium">{move.partner?.name || "Unknown"}</p>
            </div>

            <div>
              <p className="text-sm">{move.total_received || 0} / {move.quantity_sent || 0} pcs</p>
              <Progress value={progress} className="h-1 mt-1" />
            </div>

            <div>
              {move.expected_return_date ? (
                <div className="flex items-center gap-2">
                  {isOverdue && <AlertCircle className="h-4 w-4 text-destructive" />}
                  <p className={`text-sm ${isOverdue ? 'text-destructive font-semibold' : ''}`}>
                    {format(parseISO(move.expected_return_date), 'MMM d, yyyy')}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No date</p>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedMove(move);
                  setReceiptDialogOpen(true);
                }}
                disabled={move.status === 'received_full'}
              >
                Add Receipt
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/work-orders/${move.work_order_id}?tab=external`)}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const dispatchReadyBatches = getDispatchReadyBatches();
  const pendingQCBatches = getPendingQCBatches();
  const partiallyDispatchedBatches = getPartiallyDispatchedBatches();
  const urgentBatches = getUrgentBatches();
  const openMoves = getOpenMoves();
  const overdueMoves = getOverdueMoves();
  const partnerStats = getPartnerStats();

  // Calculate totals for summary
  const totalDispatchableQty = dispatchReadyBatches.reduce((sum, b) => sum + b.dispatchable_qty, 0);
  const totalPendingQCQty = pendingQCBatches.reduce((sum, b) => sum + (b.produced_qty - (b.qc_approved_qty || 0) - (b.qc_rejected_qty || 0)), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto p-4">
          <p className="text-center text-muted-foreground">Loading logistics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Logistics Dashboard</h1>
            <p className="text-sm text-muted-foreground">Batch-based dispatch tracking & external processing</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/dispatch')}>
              <Truck className="h-4 w-4 mr-2" />
              Dispatch Console
            </Button>
            <Button onClick={() => navigate('/partners')}>
              Manage Partners
            </Button>
          </div>
        </div>

        {/* Batch Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Dispatch Ready
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-700">{dispatchReadyBatches.length}</p>
              <p className="text-xs text-muted-foreground">{totalDispatchableQty} pcs available</p>
            </CardContent>
          </Card>
          
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Pending QC
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-700">{pendingQCBatches.length}</p>
              <p className="text-xs text-muted-foreground">{totalPendingQCQty} pcs awaiting</p>
            </CardContent>
          </Card>
          
          <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Truck className="h-4 w-4 text-blue-600" />
                Partially Dispatched
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-700">{partiallyDispatchedBatches.length}</p>
              <p className="text-xs text-muted-foreground">batches in progress</p>
            </CardContent>
          </Card>
          
          <Card className={`${urgentBatches.length > 0 ? 'border-red-300 bg-red-50/50 dark:bg-red-950/20' : ''}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${urgentBatches.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
                Urgent (≤3 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${urgentBatches.length > 0 ? 'text-red-700' : ''}`}>
                {urgentBatches.length}
              </p>
              <p className="text-xs text-muted-foreground">need immediate dispatch</p>
            </CardContent>
          </Card>
        </div>

        {/* External Processing Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Open Moves</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{openMoves.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Overdue Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">{overdueMoves.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Partners</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{partners.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{batches.length}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="dispatch-ready" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="dispatch-ready">
              Dispatch Ready ({dispatchReadyBatches.length})
            </TabsTrigger>
            <TabsTrigger value="pending-qc">
              Pending QC ({pendingQCBatches.length})
            </TabsTrigger>
            <TabsTrigger value="partial">
              Partial ({partiallyDispatchedBatches.length})
            </TabsTrigger>
            <TabsTrigger value="urgent" className={urgentBatches.length > 0 ? 'text-destructive' : ''}>
              Urgent ({urgentBatches.length})
            </TabsTrigger>
            <TabsTrigger value="external">
              External ({openMoves.length})
            </TabsTrigger>
            <TabsTrigger value="partners">
              Partners
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dispatch-ready" className="space-y-3 mt-4">
            <div className="flex justify-end mb-4">
              <Button 
                onClick={() => handleExportBatches(dispatchReadyBatches, 'dispatch_ready_batches')} 
                variant="outline"
                disabled={dispatchReadyBatches.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
            {dispatchReadyBatches.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No batches ready for dispatch
                </CardContent>
              </Card>
            ) : (
              dispatchReadyBatches.map(b => renderBatchRow(b, true))
            )}
          </TabsContent>

          <TabsContent value="pending-qc" className="space-y-3 mt-4">
            <div className="flex justify-end mb-4">
              <Button 
                onClick={() => handleExportBatches(pendingQCBatches, 'pending_qc_batches')} 
                variant="outline"
                disabled={pendingQCBatches.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
            {pendingQCBatches.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No batches pending QC
                </CardContent>
              </Card>
            ) : (
              pendingQCBatches.map(b => renderBatchRow(b))
            )}
          </TabsContent>

          <TabsContent value="partial" className="space-y-3 mt-4">
            <div className="flex justify-end mb-4">
              <Button 
                onClick={() => handleExportBatches(partiallyDispatchedBatches, 'partially_dispatched_batches')} 
                variant="outline"
                disabled={partiallyDispatchedBatches.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
            {partiallyDispatchedBatches.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No partially dispatched batches
                </CardContent>
              </Card>
            ) : (
              partiallyDispatchedBatches.map(b => renderBatchRow(b))
            )}
          </TabsContent>

          <TabsContent value="urgent" className="space-y-3 mt-4">
            <div className="flex justify-end mb-4">
              <Button 
                onClick={() => handleExportBatches(urgentBatches, 'urgent_batches')} 
                variant="outline"
                disabled={urgentBatches.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
            {urgentBatches.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No urgent batches — all dispatches on track
                </CardContent>
              </Card>
            ) : (
              urgentBatches.map(b => renderBatchRow(b, true))
            )}
          </TabsContent>

          <TabsContent value="external" className="space-y-3 mt-4">
            <div className="flex justify-end mb-4">
              <Button onClick={handleExportOpenMoves} variant="outline" disabled={openMoves.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
            {openMoves.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No open external moves
                </CardContent>
              </Card>
            ) : (
              openMoves.map(renderMoveRow)
            )}
          </TabsContent>

          <TabsContent value="partners" className="space-y-3 mt-4">
            <div className="grid gap-4">
              {partnerStats.map(partner => (
                <Card key={partner.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{partner.name}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {partner.process_types?.map((p: string) => p.replace('_', ' ')).join(', ')}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => navigate('/partners')}>
                        View Details
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Active Moves</p>
                        <p className="text-xl font-bold">{partner.activeMoves}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Overdue</p>
                        <p className="text-xl font-bold text-destructive">{partner.overdueMoves}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Moves (90d)</p>
                        <p className="text-xl font-bold">{partner.totalMoves}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">On-Time Rate</p>
                        <p className="text-xl font-bold text-green-600">{partner.onTimeRate}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {selectedMove && (
        <ExternalReceiptDialog
          open={receiptDialogOpen}
          onOpenChange={setReceiptDialogOpen}
          move={selectedMove}
          onSuccess={() => {
            loadData();
            setReceiptDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default LogisticsDashboard;
