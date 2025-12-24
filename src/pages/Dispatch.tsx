import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Truck, ClipboardCheck, Package, Send } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DispatchBatchSelector } from "@/components/dispatch/DispatchBatchSelector";

interface WorkOrder {
  id: string;
  wo_id: string;
  customer: string;
  item_code: string;
  quantity: number;
}

interface Dispatch {
  id: string;
  quantity: number;
  dispatched_at: string;
  batch_id: string;
  wo_id: string;
  remarks: string | null;
  work_orders?: { wo_id: string; customer: string; item_code: string } | null;
  production_batches?: { batch_number: number } | null;
  shipments?: { ship_id: string } | null;
}

export default function Dispatch() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null);
  
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [dispatchableQty, setDispatchableQty] = useState(0);
  
  const [dispatchQty, setDispatchQty] = useState<number>(0);
  const [remarks, setRemarks] = useState("");
  
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadWorkOrders();
    loadDispatches();
  }, []);

  const loadWorkOrders = async () => {
    const { data } = await supabase
      .from("work_orders")
      .select("id, wo_id, customer, item_code, quantity")
      .in("status", ["in_progress", "qc", "packing"])
      .order("created_at", { ascending: false });
    
    if (data) setWorkOrders(data);
  };

  const loadDispatches = async () => {
    const { data } = await supabase
      .from("dispatches")
      .select(`
        *,
        work_orders(wo_id, customer, item_code),
        production_batches(batch_number),
        shipments(ship_id)
      `)
      .order("dispatched_at", { ascending: false })
      .limit(20);
    
    if (data) setDispatches(data);
  };

  const handleWoChange = (woId: string) => {
    setSelectedWoId(woId);
    setSelectedBatchId(null);
    setDispatchableQty(0);
    setDispatchQty(0);
  };

  const handleBatchSelect = (batchId: string | null, availableQty: number) => {
    setSelectedBatchId(batchId);
    setDispatchableQty(availableQty);
    setDispatchQty(Math.min(dispatchQty, availableQty));
  };

  const handleCreateDispatch = async () => {
    if (!selectedWoId || !selectedBatchId || dispatchQty <= 0) {
      toast({ variant: "destructive", description: "Please select WO, batch and enter quantity" });
      return;
    }

    if (dispatchQty > dispatchableQty) {
      toast({ variant: "destructive", description: `Cannot dispatch more than ${dispatchableQty} pcs` });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("dispatches")
        .insert({
          wo_id: selectedWoId,
          batch_id: selectedBatchId,
          quantity: dispatchQty,
          dispatched_by: user?.id,
          remarks: remarks || null
        });

      if (error) throw error;

      toast({ description: `Dispatched ${dispatchQty} pcs successfully` });
      
      setDispatchQty(0);
      setRemarks("");
      setSelectedBatchId(null);
      setDispatchableQty(0);
      
      loadDispatches();
      
      const woId = selectedWoId;
      setSelectedWoId(null);
      setTimeout(() => setSelectedWoId(woId), 100);
      
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const selectedWo = workOrders.find(wo => wo.id === selectedWoId);

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="2xl">
        <div className="space-y-6">
          <PageHeader
            title="Goods Dispatch"
            description="Create batch-based dispatches for work orders"
            icon={<Truck className="h-6 w-6" />}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Create Dispatch
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Work Order</Label>
                  <Select value={selectedWoId || undefined} onValueChange={handleWoChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Work Order..." />
                    </SelectTrigger>
                    <SelectContent>
                      {workOrders.map(wo => (
                        <SelectItem key={wo.id} value={wo.id}>
                          {wo.wo_id} - {wo.customer} ({wo.item_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedWo && (
                  <Card className="bg-muted/50">
                    <CardContent className="py-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Customer</p>
                          <p className="font-medium">{selectedWo.customer}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Item Code</p>
                          <p className="font-medium">{selectedWo.item_code}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Order Qty</p>
                          <p className="font-medium">{selectedWo.quantity} pcs</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <DispatchBatchSelector
                  workOrderId={selectedWoId || ""}
                  onBatchSelect={handleBatchSelect}
                />

                {selectedBatchId && dispatchableQty > 0 && (
                  <div className="space-y-4 border-t pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Quantity to Dispatch</Label>
                        <Badge variant="outline">Max: {dispatchableQty} pcs</Badge>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={dispatchableQty}
                        value={dispatchQty || ""}
                        onChange={(e) => setDispatchQty(parseInt(e.target.value) || 0)}
                        placeholder={`Enter qty (max ${dispatchableQty})`}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Remarks (optional)</Label>
                      <Input
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        placeholder="e.g., Shipment reference, transporter..."
                      />
                    </div>

                    <Button 
                      onClick={handleCreateDispatch} 
                      disabled={loading || dispatchQty <= 0 || dispatchQty > dispatchableQty}
                      className="w-full"
                    >
                      <Truck className="mr-2 h-4 w-4" />
                      Dispatch {dispatchQty > 0 ? `${dispatchQty} pcs` : ""}
                    </Button>
                  </div>
                )}

                {selectedBatchId && dispatchableQty === 0 && (
                  <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
                    <CardContent className="py-4 text-center">
                      <p className="text-orange-700 dark:text-orange-400 font-medium">
                        No quantity available for dispatch
                      </p>
                      <p className="text-sm text-muted-foreground">
                        All QC-approved quantity has been dispatched
                      </p>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Recent Dispatches</h2>
              {dispatches.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
                    <div>
                      <p className="text-lg font-medium">No Dispatches Yet</p>
                      <p className="text-sm text-muted-foreground">
                        Dispatches will appear here after creating them
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {dispatches.map((dispatch) => (
                    <Card key={dispatch.id}>
                      <CardContent className="py-4">
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">
                                {dispatch.work_orders?.wo_id || "N/A"}
                              </p>
                              <Badge variant="outline">
                                Batch #{dispatch.production_batches?.batch_number || "?"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {dispatch.work_orders?.customer} - {dispatch.work_orders?.item_code}
                            </p>
                            <p className="text-sm">
                              <span className="font-medium text-green-600">{dispatch.quantity} pcs</span>
                              {" dispatched on "}
                              {new Date(dispatch.dispatched_at).toLocaleDateString()}
                            </p>
                            {dispatch.remarks && (
                              <p className="text-xs text-muted-foreground">{dispatch.remarks}</p>
                            )}
                            {dispatch.shipments && (
                              <Badge variant="secondary" className="mt-1">
                                {dispatch.shipments.ship_id}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/work-orders/${dispatch.wo_id}`)}
                          >
                            <ClipboardCheck className="h-4 w-4 mr-1" />
                            View WO
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
