import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Hammer, CheckCircle2, Clock, XCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface ForgingRecord {
  id: string;
  work_order_id: string;
  forging_vendor: string | null;
  sample_sent: boolean;
  qc_approved: boolean;
  forging_start_date: string | null;
  forging_end_date: string | null;
  qty_required: number;
  qty_forged: number;
  remarks: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  work_orders: {
    display_id: string;
    customer: string;
    item_code: string;
  };
}

interface Supplier {
  id: string;
  name: string;
}

export default function Forging() {
  const [forgingRecords, setForgingRecords] = useState<ForgingRecord[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<ForgingRecord | null>(null);
  const [vendor, setVendor] = useState("");
  const [sampleSent, setSampleSent] = useState(false);
  const [qcApproved, setQcApproved] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [qtyForged, setQtyForged] = useState("");
  const [remarks, setRemarks] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadForgingRecords();
    loadSuppliers();

    const channel = supabase
      .channel('forging-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forging_records' }, () => {
        loadForgingRecords();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        loadForgingRecords();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadForgingRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('forging_records')
        .select(`
          *,
          work_orders(display_id, customer, item_code)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setForgingRecords(data as any || []);
    } catch (error: any) {
      toast({
        title: "Error loading forging records",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error: any) {
      console.error("Error loading suppliers:", error);
    }
  };

  const handleUpdateForging = async () => {
    if (!selectedRecord) return;

    try {
      const forgedQty = qtyForged ? parseFloat(qtyForged) : selectedRecord.qty_forged;
      const isCompleted = forgedQty >= selectedRecord.qty_required && qcApproved;

      const { error } = await supabase
        .from('forging_records')
        .update({
          forging_vendor: vendor || selectedRecord.forging_vendor,
          sample_sent: sampleSent,
          qc_approved: qcApproved,
          forging_start_date: startDate || selectedRecord.forging_start_date,
          forging_end_date: endDate || selectedRecord.forging_end_date,
          qty_forged: forgedQty,
          status: isCompleted ? 'completed' : 'in_progress',
          remarks: remarks || selectedRecord.remarks,
        })
        .eq('id', selectedRecord.id);

      if (error) throw error;

      toast({
        title: isCompleted ? "Forging completed" : "Progress updated",
        description: `Updated forging record for WO ${selectedRecord.work_orders.display_id}`,
      });

      setSelectedRecord(null);
      resetForm();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setVendor("");
    setSampleSent(false);
    setQcApproved(false);
    setStartDate("");
    setEndDate("");
    setQtyForged("");
    setRemarks("");
  };

  const openEditDialog = (record: ForgingRecord) => {
    setSelectedRecord(record);
    setVendor(record.forging_vendor || "");
    setSampleSent(record.sample_sent);
    setQcApproved(record.qc_approved);
    setStartDate(record.forging_start_date || "");
    setEndDate(record.forging_end_date || "");
    setQtyForged(record.qty_forged.toString());
    setRemarks(record.remarks || "");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'in_progress':
        return <Badge variant="secondary"><Hammer className="w-3 h-3 mr-1" />In Progress</Badge>;
      case 'completed':
        return <Badge variant="default"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getQCBadge = (approved: boolean, sampleSent: boolean) => {
    if (approved) return <Badge variant="default"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
    if (sampleSent) return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending QC</Badge>;
    return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Not Sent</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Forging Department" />
        <div className="container mx-auto p-6">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Forging Department" />
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hammer className="w-5 h-5" />
              Forging Queue & Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            {forgingRecords.length === 0 ? (
              <EmptyState
                icon="production"
                title="No Forging Records"
                description="Forging records appear here when work orders with forging requirements are created. Items requiring forging will be sent to external partners."
                hint="Create a work order with forging in its operation route to see items here."
                size="md"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Qty Required</TableHead>
                    <TableHead>Qty Forged</TableHead>
                    <TableHead>QC Status</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forgingRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.work_orders.display_id}</TableCell>
                      <TableCell>{record.work_orders.customer}</TableCell>
                      <TableCell>{record.work_orders.item_code}</TableCell>
                      <TableCell>{record.forging_vendor || <span className="text-muted-foreground">Not assigned</span>}</TableCell>
                      <TableCell>{record.qty_required}</TableCell>
                      <TableCell>
                        <span className={record.qty_forged < record.qty_required ? "text-orange-600 font-semibold" : "text-green-600"}>
                          {record.qty_forged}
                        </span>
                      </TableCell>
                      <TableCell>{getQCBadge(record.qc_approved, record.sample_sent)}</TableCell>
                      <TableCell>{getStatusBadge(record.status)}</TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" onClick={() => openEditDialog(record)}>
                              {record.status === 'pending' ? 'Start' : 'Update'}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Update Forging Record</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Work Order</Label>
                                  <p className="text-sm font-medium">{record.work_orders.display_id}</p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Item Code</Label>
                                  <p className="text-sm font-medium">{record.work_orders.item_code}</p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="vendor">Forging Vendor</Label>
                                <Select value={vendor} onValueChange={setVendor}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select vendor" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {suppliers.map((supplier) => (
                                      <SelectItem key={supplier.id} value={supplier.name}>
                                        {supplier.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label htmlFor="startDate">Start Date</Label>
                                  <Input
                                    id="startDate"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="endDate">End Date</Label>
                                  <Input
                                    id="endDate"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="qtyForged">Qty Forged</Label>
                                <Input
                                  id="qtyForged"
                                  type="number"
                                  step="0.01"
                                  value={qtyForged}
                                  onChange={(e) => setQtyForged(e.target.value)}
                                  placeholder="Enter quantity forged"
                                />
                                <p className="text-sm text-muted-foreground">
                                  Required: {record.qty_required}
                                </p>
                              </div>

                              <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="sampleSent">Sample Sent for QC</Label>
                                <Switch
                                  id="sampleSent"
                                  checked={sampleSent}
                                  onCheckedChange={setSampleSent}
                                />
                              </div>

                              <div className="flex items-center justify-between space-x-2">
                                <Label htmlFor="qcApproved">QC Approved</Label>
                                <Switch
                                  id="qcApproved"
                                  checked={qcApproved}
                                  onCheckedChange={setQcApproved}
                                  disabled={!sampleSent}
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

                              <Button onClick={handleUpdateForging} className="w-full">
                                Save Progress
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
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
