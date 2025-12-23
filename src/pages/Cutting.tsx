import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Scissors, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";

interface CuttingRecord {
  id: string;
  work_order_id: string;
  item_code: string;
  qty_required: number;
  qty_cut: number;
  start_date: string | null;
  end_date: string | null;
  operator_id: string | null;
  remarks: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  work_orders: {
    wo_number: string;
    customer: string;
  };
}

export default function Cutting() {
  const [cuttingRecords, setCuttingRecords] = useState<CuttingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<CuttingRecord | null>(null);
  const [qtyCut, setQtyCut] = useState("");
  const [remarks, setRemarks] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadCuttingRecords();

    const channel = supabase
      .channel('cutting-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cutting_records' }, () => {
        loadCuttingRecords();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        loadCuttingRecords();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadCuttingRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('cutting_records')
        .select(`
          *,
          work_orders(wo_number, customer)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCuttingRecords(data as any || []);
    } catch (error: any) {
      toast({
        title: "Error loading cutting records",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartCutting = async (record: CuttingRecord) => {
    try {
      const { error } = await supabase
        .from('cutting_records')
        .update({
          status: 'in_progress',
          start_date: new Date().toISOString(),
        })
        .eq('id', record.id);

      if (error) throw error;

      toast({
        title: "Cutting started",
        description: `Started cutting for WO ${record.work_orders.wo_number}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRecordCutting = async () => {
    if (!selectedRecord) return;

    try {
      const cutQty = parseFloat(qtyCut);
      const totalCut = selectedRecord.qty_cut + cutQty;
      const isCompleted = totalCut >= selectedRecord.qty_required;

      const { error } = await supabase
        .from('cutting_records')
        .update({
          qty_cut: totalCut,
          status: isCompleted ? 'completed' : 'in_progress',
          end_date: isCompleted ? new Date().toISOString() : null,
          remarks: remarks || selectedRecord.remarks,
          operator_id: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq('id', selectedRecord.id);

      if (error) throw error;

      toast({
        title: isCompleted ? "Cutting completed" : "Progress recorded",
        description: `Recorded ${cutQty} kg cut. Total: ${totalCut}/${selectedRecord.qty_required} kg`,
      });

      setSelectedRecord(null);
      setQtyCut("");
      setRemarks("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'in_progress':
        return <Badge variant="secondary"><Scissors className="w-3 h-3 mr-1" />In Progress</Badge>;
      case 'completed':
        return <Badge variant="default"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="w-5 h-5" />
              Cutting Queue & Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cuttingRecords.length === 0 ? (
              <EmptyState
                icon="production"
                title="No Cutting Records"
                description="Cutting records appear here when work orders with cutting requirements are created. Material will be allocated for cutting before machining."
                hint="Create a work order with cutting in its operation route to see items here."
                size="md"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Qty Required (kg)</TableHead>
                    <TableHead>Qty Cut (kg)</TableHead>
                    <TableHead>Remaining (kg)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuttingRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.work_orders.wo_number}</TableCell>
                      <TableCell>{record.work_orders.customer}</TableCell>
                      <TableCell>{record.item_code}</TableCell>
                      <TableCell>{record.qty_required}</TableCell>
                      <TableCell>{record.qty_cut}</TableCell>
                      <TableCell>
                        <span className={record.qty_cut < record.qty_required ? "text-orange-600 font-semibold" : "text-green-600"}>
                          {(record.qty_required - record.qty_cut).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell>
                        {record.status === 'pending' && (
                          <Button size="sm" onClick={() => handleStartCutting(record)}>
                            Start Cutting
                          </Button>
                        )}
                        {record.status === 'in_progress' && (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" onClick={() => setSelectedRecord(record)}>
                                Record Progress
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Record Cutting Progress</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label>Work Order: {record.work_orders.wo_number}</Label>
                                  <p className="text-sm text-muted-foreground">
                                    Already cut: {record.qty_cut} / {record.qty_required} kg
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="qtyCut">Qty Cut Today (kg)</Label>
                                  <Input
                                    id="qtyCut"
                                    type="number"
                                    step="0.01"
                                    value={qtyCut}
                                    onChange={(e) => setQtyCut(e.target.value)}
                                    placeholder="Enter quantity cut"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="remarks">Remarks</Label>
                                  <Textarea
                                    id="remarks"
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    placeholder="Optional remarks"
                                  />
                                </div>
                                <Button onClick={handleRecordCutting} className="w-full">
                                  Save Progress
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        )}
                        {record.status === 'completed' && (
                          <span className="text-sm text-green-600">✓ Complete</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
