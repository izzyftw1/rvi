import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Package, ArrowLeftRight, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

interface ExternalMove {
  id: string;
  process: string;
  qty_sent: number;
  status: string;
  partner_id: string | null;
  expected_return_date: string | null;
  dispatch_date: string;
  challan_no: string;
  remarks: string | null;
}

interface ExternalReceipt {
  id: string;
  move_id: string;
  qty_received: number;
  receipt_date: string;
  remarks: string | null;
}

interface EnhancedExternalTabProps {
  workOrderId: string;
}

export function EnhancedExternalTab({ workOrderId }: EnhancedExternalTabProps) {
  const [moves, setMoves] = useState<ExternalMove[]>([]);
  const [receipts, setReceipts] = useState<Record<string, ExternalReceipt[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExternalData();
  }, [workOrderId]);

  const loadExternalData = async () => {
    try {
      const { data: movesData, error: movesError } = await (supabase as any)
        .from('wo_external_moves')
        .select('*')
        .eq('work_order_id', workOrderId)
        .order('dispatch_date', { ascending: false });

      if (movesError) throw movesError;
      setMoves(movesData || []);

      if (movesData && movesData.length > 0) {
        const moveIds = movesData.map((m: any) => m.id);
        const { data: receiptsData } = await (supabase as any)
          .from('wo_external_receipts')
          .select('*')
          .in('move_id', moveIds)
          .order('receipt_date', { ascending: false });

        const grouped: Record<string, ExternalReceipt[]> = {};
        (receiptsData || []).forEach((receipt: any) => {
          if (!grouped[receipt.move_id]) grouped[receipt.move_id] = [];
          grouped[receipt.move_id].push(receipt);
        });
        setReceipts(grouped);
      }
    } catch (error: any) {
      console.error('Error loading external data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProcessIcon = (process: string) => {
    const icons: Record<string, any> = {
      'job_work': Package,
      'plating': ArrowLeftRight,
      'buffing': ArrowLeftRight,
      'blasting': ArrowLeftRight,
      'forging': ArrowLeftRight,
    };
    const Icon = icons[process] || Package;
    return <Icon className="h-4 w-4" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'sent':
        return <Badge variant="secondary">Sent</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-500">Completed</Badge>;
      case 'returned':
        return <Badge className="bg-purple-500">Returned</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTotalReceived = (moveId: string) => {
    const moveReceipts = receipts[moveId] || [];
    return moveReceipts.reduce((sum, r) => sum + r.qty_received, 0);
  };

  if (loading) {
    return <div className="p-4">Loading external processing data...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{moves.length}</div>
            <p className="text-xs text-muted-foreground">Total Challans</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">
              {moves.reduce((sum, m) => sum + m.qty_sent, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total Qty Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {moves.reduce((sum, m) => sum + getTotalReceived(m.id), 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total Qty Received</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600">
              {moves.filter(m => m.status === 'completed' || m.status === 'returned').length}
            </div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* External Processing Records */}
      <Card>
        <CardHeader>
          <CardTitle>External Processing Challans</CardTitle>
        </CardHeader>
        <CardContent>
          {moves.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No external processing records
            </p>
          ) : (
            <div className="space-y-4">
              {moves.map((move) => {
                const moveReceipts = receipts[move.id] || [];
                const totalReceived = getTotalReceived(move.id);
                const pending = move.qty_sent - totalReceived;

                return (
                  <div
                    key={move.id}
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          {getProcessIcon(move.process)}
                          <div>
                            <p className="font-medium flex items-center gap-2">
                              Challan: {move.challan_no}
                              {getStatusBadge(move.status)}
                            </p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {move.process.replace('_', ' ')}
                            </p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Quantities */}
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Sent:</span>
                          <p className="font-medium text-blue-600">{move.qty_sent} pcs</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Received:</span>
                          <p className="font-medium text-green-600">{totalReceived} pcs</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Pending:</span>
                          <p className="font-medium text-orange-600">{pending} pcs</p>
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Dispatched: {format(new Date(move.dispatch_date), 'dd MMM yyyy')}</span>
                        </div>
                        {move.expected_return_date && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Expected: {format(new Date(move.expected_return_date), 'dd MMM yyyy')}</span>
                          </div>
                        )}
                      </div>

                      {/* Remarks */}
                      {move.remarks && (
                        <p className="text-sm text-muted-foreground italic">
                          💬 {move.remarks}
                        </p>
                      )}

                      {/* Receipts */}
                      {moveReceipts.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium mb-2 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            Receipts
                          </p>
                          <div className="space-y-2">
                            {moveReceipts.map((receipt) => (
                              <div
                                key={receipt.id}
                                className="p-2 bg-secondary rounded text-sm flex justify-between items-center"
                              >
                                <div>
                                  <span className="font-medium">{receipt.qty_received} pcs</span>
                                  <span className="text-muted-foreground ml-2">
                                    on {format(new Date(receipt.receipt_date), 'dd MMM yyyy')}
                                  </span>
                                </div>
                                {receipt.remarks && (
                                  <span className="text-xs text-muted-foreground italic">
                                    {receipt.remarks}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
