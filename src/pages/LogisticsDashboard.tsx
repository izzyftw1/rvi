import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { ExternalReceiptDialog } from "@/components/ExternalReceiptDialog";
import { useNavigate } from "react-router-dom";
import { format, isPast, parseISO, differenceInDays } from "date-fns";
import { Package, AlertCircle, TrendingUp, FileText, ExternalLink, Download } from "lucide-react";
import { downloadCSV, downloadPDF } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";

interface ExtendedMove {
  id: string;
  work_order_id: string;
  process: string;
  partner_id: string;
  qty_sent: number;
  status: string;
  expected_return_date: string | null;
  dispatch_date: string;
  challan_no: string;
  work_order?: any;
  partner?: any;
  total_received?: number;
}

const LogisticsDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [moves, setMoves] = useState<ExtendedMove[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMove, setSelectedMove] = useState<any>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('logistics_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all active moves
      const { data: movesData } = await supabase
        .from("wo_external_moves" as any)
        .select("id, work_order_id, process, partner_id, qty_sent, status, expected_return_date, dispatch_date, challan_no")
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

      // Load work orders
      const woIds = [...new Set((movesData || []).map((m: any) => m.work_order_id))];
      const { data: workOrders } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code")
        .in("id", woIds);

      const woMap = Object.fromEntries((workOrders || []).map((wo: any) => [wo.id, wo]));

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
        work_order: woMap[m.work_order_id],
        partner: partnersMap[m.partner_id],
        total_received: receiptsMap[m.id] || 0,
      })) as ExtendedMove[];

      setMoves(enrichedMoves);
    } catch (error) {
      console.error("Error loading logistics data:", error);
    } finally {
      setLoading(false);
    }
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

  const getPendingQCMoves = () => {
    return moves.filter(m => 
      m.process === 'plating' && 
      m.status === 'received_full'
    );
  };

  const handleExportOpenMoves = () => {
    const openMoves = getOpenMoves();
    const exportData = openMoves.map(m => ({
      'WO ID': m.work_order?.display_id || '',
      'Customer': m.work_order?.customer || '',
      'Item': m.work_order?.item_code || '',
      'Process': m.process.replace('_', ' ').toUpperCase(),
      'Partner': m.partner?.name || '',
      'Qty Sent': m.qty_sent,
      'Qty Received': m.total_received || 0,
      '% Complete': Math.round(((m.total_received || 0) / m.qty_sent) * 100),
      'Expected Return': m.expected_return_date || 'N/A',
      'Challan No': m.challan_no,
    }));
    downloadCSV(exportData, 'open_external_moves');
    toast({ description: 'Open moves exported successfully' });
  };

  const handleExportOverdueMoves = () => {
    const overdueMoves = getOverdueMoves();
    const exportData = overdueMoves.map(m => ({
      'WO ID': m.work_order?.display_id || '',
      'Customer': m.work_order?.customer || '',
      'Item': m.work_order?.item_code || '',
      'Process': m.process.replace('_', ' ').toUpperCase(),
      'Partner': m.partner?.name || '',
      'Qty Sent': m.qty_sent,
      'Qty Received': m.total_received || 0,
      'Pending': m.qty_sent - (m.total_received || 0),
      'Expected Return': m.expected_return_date || '',
      'Days Overdue': m.expected_return_date ? differenceInDays(new Date(), parseISO(m.expected_return_date)) : 0,
      'Challan No': m.challan_no,
    }));
    downloadCSV(exportData, 'overdue_external_moves');
    toast({ description: 'Overdue moves exported successfully' });
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

  const renderMoveRow = (move: ExtendedMove) => {
    const progress = move.qty_sent > 0 ? ((move.total_received || 0) / move.qty_sent) * 100 : 0;
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
              <p className="text-sm">{move.total_received || 0} / {move.qty_sent} pcs</p>
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

  const openMoves = getOpenMoves();
  const overdueMoves = getOverdueMoves();
  const pendingQC = getPendingQCMoves();
  const partnerStats = getPartnerStats();

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
            <p className="text-sm text-muted-foreground">External processing tracking</p>
          </div>
          <Button onClick={() => navigate('/partners')}>
            Manage Partners
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Open Moves</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{openMoves.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Overdue Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">{overdueMoves.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pending QC</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{pendingQC.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Active Partners</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{partners.length}</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="open" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="open">
              All Open Moves ({openMoves.length})
            </TabsTrigger>
            <TabsTrigger value="overdue">
              Overdue Returns ({overdueMoves.length})
            </TabsTrigger>
            <TabsTrigger value="qc">
              Pending QC ({pendingQC.length})
            </TabsTrigger>
            <TabsTrigger value="partners">
              Partner Performance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="open" className="space-y-3 mt-4">
            <div className="flex justify-end mb-4">
              <Button onClick={handleExportOpenMoves} variant="outline">
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

          <TabsContent value="overdue" className="space-y-3 mt-4">
            <div className="flex justify-end mb-4">
              <Button onClick={handleExportOverdueMoves} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
            {overdueMoves.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No overdue returns
                </CardContent>
              </Card>
            ) : (
              overdueMoves.map(renderMoveRow)
            )}
          </TabsContent>

          <TabsContent value="qc" className="space-y-3 mt-4">
            {pendingQC.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No items pending QC
                </CardContent>
              </Card>
            ) : (
              pendingQC.map(renderMoveRow)
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
