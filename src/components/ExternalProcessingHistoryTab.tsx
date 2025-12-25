import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ExternalLink } from "lucide-react";

interface ExternalMove {
  id: string;
  process: string;
  partner_id: string;
  quantity_sent: number;
  expected_return_date: string | null;
  dispatch_date: string;
  challan_no: string;
  remarks: string | null;
  receipts?: ExternalReceipt[];
}

interface ExternalReceipt {
  id: string;
  move_id: string;
  qty_received: number;
  receipt_date: string;
  grn_no: string | null;
}

interface ExternalPartner {
  id: string;
  partner_name: string;
}

interface ExternalProcessingHistoryTabProps {
  workOrderId: string;
}

export const ExternalProcessingHistoryTab = ({ workOrderId }: ExternalProcessingHistoryTabProps) => {
  const [moves, setMoves] = useState<ExternalMove[]>([]);
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('external_processing_history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves', filter: `work_order_id=eq.${workOrderId}` }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  const loadData = async () => {
    try {
      const [movesRes, receiptsRes, partnersRes] = await Promise.all([
        supabase
          .from("wo_external_moves" as any)
          .select("*")
          .eq("work_order_id", workOrderId)
          .order("dispatch_date", { ascending: false }),
        supabase
          .from("wo_external_receipts" as any)
          .select("*")
          .order("receipt_date", { ascending: false }),
        supabase
          .from("external_partners" as any)
          .select("id, partner_name"),
      ]);

      const movesData = (movesRes.data || []) as unknown as ExternalMove[];
      const receiptsData = (receiptsRes.data || []) as unknown as ExternalReceipt[];
      const partnersData = (partnersRes.data || []) as unknown as ExternalPartner[];

      // Aggregate receipts per move
      const movesWithReceipts = movesData.map(m => {
        const moveReceipts = receiptsData.filter(r => r.move_id === m.id);
        return { ...m, receipts: moveReceipts };
      });

      setMoves(movesWithReceipts);
      setPartners(partnersData);
    } catch (error) {
      console.error("Error loading external processing history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getPartnerName = (partnerId: string) => {
    return partners.find(p => p.id === partnerId)?.partner_name || "Unknown";
  };

  const calculateTotalReceived = (move: ExternalMove) => {
    return move.receipts?.reduce((sum, r) => sum + (r.qty_received || 0), 0) || 0;
  };

  const getStatusInfo = (move: ExternalMove) => {
    const totalReceived = calculateTotalReceived(move);
    const progress = (move.quantity_sent || 0) > 0 ? (totalReceived / (move.quantity_sent || 1)) * 100 : 0;
    const isOverdue = move.expected_return_date && new Date(move.expected_return_date) < new Date() && progress < 100;

    if (progress >= 100) {
      return { label: "Completed", variant: "default" as const, color: "text-green-600" };
    } else if (isOverdue) {
      return { label: "Overdue", variant: "destructive" as const, color: "text-red-600" };
    } else if (progress > 0) {
      return { label: "Partial", variant: "secondary" as const, color: "text-orange-600" };
    } else {
      return { label: "In Progress", variant: "outline" as const, color: "text-blue-600" };
    }
  };

  const totalOutstanding = moves.reduce((sum, move) => {
    const received = calculateTotalReceived(move);
    return sum + ((move.quantity_sent || 0) - received);
  }, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading external processing history...</div>
      </div>
    );
  }

  if (moves.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No external processing history found
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>External Processing History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Qty Sent</TableHead>
                <TableHead className="text-right">Qty Received</TableHead>
                <TableHead>Expected Return</TableHead>
                <TableHead>Challan No</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.map((move) => {
                const totalReceived = calculateTotalReceived(move);
                const statusInfo = getStatusInfo(move);

                return (
                  <TableRow key={move.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium capitalize">
                      {move.process.replace("_", " ")}
                    </TableCell>
                    <TableCell>{getPartnerName(move.partner_id)}</TableCell>
                    <TableCell className="text-right">{move.quantity_sent || 0}</TableCell>
                    <TableCell className="text-right">{totalReceived}</TableCell>
                    <TableCell>
                      {move.expected_return_date 
                        ? format(new Date(move.expected_return_date), "MMM d, yyyy")
                        : "—"
                      }
                    </TableCell>
                    <TableCell>
                      <a 
                        href={`/work-orders/${workOrderId}?tab=external`}
                        className="flex items-center gap-1 text-primary hover:underline"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {move.challan_no}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusInfo.variant} className={statusInfo.color}>
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {move.remarks || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {totalOutstanding > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Outstanding Quantity</span>
              <span className="text-2xl font-bold text-primary">{totalOutstanding} pcs</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
