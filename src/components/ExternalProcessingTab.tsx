import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { ExternalReceiptDialog } from "./ExternalReceiptDialog";
import { format, isPast } from "date-fns";
import { Package, TrendingUp, Calendar, AlertCircle } from "lucide-react";

interface ExternalProcessingTabProps {
  workOrderId: string;
}

export const ExternalProcessingTab = ({ workOrderId }: ExternalProcessingTabProps) => {
  const [moves, setMoves] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [selectedMove, setSelectedMove] = useState<any>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('external_processing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves', filter: `work_order_id=eq.${workOrderId}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  const loadData = async () => {
    const [movesRes, receiptsRes, partnersRes] = await Promise.all([
      supabase
        .from("wo_external_moves")
        .select("*")
        .eq("work_order_id", workOrderId)
        .order("dispatch_date", { ascending: false }),
      supabase
        .from("wo_external_receipts")
        .select("*")
        .order("receipt_date", { ascending: false }),
      supabase
        .from("external_partners")
        .select("*"),
    ]);

    const movesData = movesRes.data || [];
    const receiptsData = receiptsRes.data || [];
    const partnersData = partnersRes.data || [];

    // Aggregate receipts per move
    const movesWithReceipts = movesData.map(m => {
      const moveReceipts = receiptsData.filter(r => r.move_id === m.id);
      const totalReceived = moveReceipts.reduce((sum, r) => sum + (r.qty_received || 0), 0);
      return { ...m, receipts: moveReceipts, total_received: totalReceived };
    });

    setMoves(movesWithReceipts);
    setReceipts(receiptsData);
    setPartners(partnersData);
  };

  const getPartnerName = (partnerId: string) => {
    return partners.find(p => p.id === partnerId)?.name || "Unknown";
  };

  const getStatusBadge = (move: any) => {
    const progress = move.qty_sent > 0 ? (move.total_received / move.qty_sent) * 100 : 0;
    if (progress >= 100) {
      return <Badge variant="default">Received Full</Badge>;
    } else if (progress > 0) {
      return <Badge variant="secondary">Received Partial</Badge>;
    } else {
      return <Badge variant="outline">In Transit</Badge>;
    }
  };

  const isOverdue = (move: any) => {
    return move.expected_return_date && isPast(new Date(move.expected_return_date)) && move.status !== 'received_full';
  };

  const groupByProcess = () => {
    const grouped: Record<string, any[]> = {};
    moves.forEach(m => {
      if (!grouped[m.process]) grouped[m.process] = [];
      grouped[m.process].push(m);
    });
    return grouped;
  };

  const processGroups = groupByProcess();

  if (moves.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No external processing records yet
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(processGroups).map(([process, processMove]) => (
        <Card key={process}>
          <CardHeader>
            <CardTitle className="text-lg capitalize">{process.replace("_", " ")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {processMove.map((move: any) => {
              const progress = move.qty_sent > 0 ? (move.total_received / move.qty_sent) * 100 : 0;
              const overdue = isOverdue(move);

              return (
                <div key={move.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{move.challan_no}</span>
                        {getStatusBadge(move)}
                        {overdue && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Overdue
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Partner: {getPartnerName(move.partner_id)}
                      </div>
                    </div>
                    {move.status !== 'received_full' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedMove(move);
                          setReceiptDialogOpen(true);
                        }}
                      >
                        Add Receipt
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span>Sent: {move.qty_sent}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span>Received: {move.total_received || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {move.expected_return_date 
                          ? format(new Date(move.expected_return_date), "MMM d, yyyy")
                          : "No date"
                        }
                      </span>
                    </div>
                  </div>

                  <Progress value={progress} className="h-2" />
                  
                  {move.remarks && (
                    <p className="text-xs text-muted-foreground italic">{move.remarks}</p>
                  )}

                  {move.receipts && move.receipts.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-xs font-medium mb-2">Receipt History:</div>
                      <div className="space-y-1">
                        {move.receipts.map((r: any) => (
                          <div key={r.id} className="text-xs text-muted-foreground flex justify-between">
                            <span>{format(new Date(r.receipt_date), "MMM d, yyyy HH:mm")} - {r.qty_received} pcs</span>
                            {r.grn_no && <span className="font-mono">GRN: {r.grn_no}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {selectedMove && (
        <ExternalReceiptDialog
          open={receiptDialogOpen}
          onOpenChange={setReceiptDialogOpen}
          move={selectedMove}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};
