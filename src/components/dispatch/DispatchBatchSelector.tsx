import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Package, CheckCircle, AlertCircle, Box } from "lucide-react";

interface Batch {
  id: string;
  batch_number: number;
  qc_approved_qty: number;
  qc_final_status: string;
  packed_qty: number;
  dispatched_qty: number;
  dispatchable_qty: number; // packed_qty - dispatched_qty
}

interface DispatchBatchSelectorProps {
  workOrderId: string;
  onBatchSelect: (batchId: string | null, dispatchableQty: number) => void;
}

export function DispatchBatchSelector({ workOrderId, onBatchSelect }: DispatchBatchSelectorProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workOrderId) {
      loadBatches();
    } else {
      setBatches([]);
      setSelectedBatchId(null);
      onBatchSelect(null, 0);
    }
  }, [workOrderId]);

  const loadBatches = async () => {
    setLoading(true);
    try {
      // Get batches
      const { data: batchData, error } = await supabase
        .from("production_batches")
        .select("id, batch_number, qc_approved_qty, dispatched_qty, qc_final_status")
        .eq("wo_id", workOrderId)
        .order("batch_number", { ascending: true });

      if (error) throw error;

      // Get packed quantities per batch from cartons
      const { data: cartonData } = await supabase
        .from("cartons")
        .select("batch_id, quantity")
        .eq("wo_id", workOrderId);

      // Aggregate packed qty per batch
      const packedByBatch: Record<string, number> = {};
      (cartonData || []).forEach(c => {
        if (c.batch_id) {
          packedByBatch[c.batch_id] = (packedByBatch[c.batch_id] || 0) + c.quantity;
        }
      });

      // Calculate dispatchable as packed_qty - dispatched_qty
      const batchesWithDispatchable = (batchData || []).map(b => {
        const packed_qty = packedByBatch[b.id] || 0;
        const dispatched_qty = b.dispatched_qty || 0;
        return {
          ...b,
          packed_qty,
          dispatched_qty,
          dispatchable_qty: Math.max(0, packed_qty - dispatched_qty)
        };
      });

      setBatches(batchesWithDispatchable);
      
      // Auto-select first batch with dispatchable qty
      const firstDispatchable = batchesWithDispatchable.find(b => b.dispatchable_qty > 0);
      if (firstDispatchable) {
        setSelectedBatchId(firstDispatchable.id);
        onBatchSelect(firstDispatchable.id, firstDispatchable.dispatchable_qty);
      } else {
        setSelectedBatchId(null);
        onBatchSelect(null, 0);
      }
    } catch (error) {
      console.error("Error loading batches:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchChange = (batchId: string) => {
    setSelectedBatchId(batchId);
    const batch = batches.find(b => b.id === batchId);
    onBatchSelect(batchId, batch?.dispatchable_qty || 0);
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Loading batches...
      </div>
    );
  }

  if (!workOrderId) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Select a Work Order first</p>
        </CardContent>
      </Card>
    );
  }

  if (batches.length === 0) {
    return (
      <Card className="border-dashed border-orange-300 bg-orange-50 dark:bg-orange-950/20">
        <CardContent className="py-6 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-orange-500" />
          <p className="font-medium text-orange-700 dark:text-orange-400">No Production Batches</p>
          <p className="text-sm text-muted-foreground">Production must be logged before dispatch</p>
        </CardContent>
      </Card>
    );
  }

  const totalDispatchable = batches.reduce((sum, b) => sum + b.dispatchable_qty, 0);
  const totalPacked = batches.reduce((sum, b) => sum + b.packed_qty, 0);
  const dispatchableBatches = batches.filter(b => b.dispatchable_qty > 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Select Batch</Label>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">
            <Box className="h-3 w-3 mr-1" />
            Packed: {totalPacked} pcs
          </Badge>
          <Badge variant="default" className="text-xs bg-green-600">
            Ready: {totalDispatchable} pcs
          </Badge>
        </div>
      </div>

      {dispatchableBatches.length > 0 ? (
        <Select value={selectedBatchId || undefined} onValueChange={handleBatchChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a batch..." />
          </SelectTrigger>
          <SelectContent>
            {batches.map(batch => (
              <SelectItem 
                key={batch.id} 
                value={batch.id}
                disabled={batch.dispatchable_qty === 0}
              >
                Batch #{batch.batch_number} - {batch.dispatchable_qty} pcs ready 
                {batch.packed_qty === 0 && " (not packed)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="py-4 text-center">
            <p className="text-orange-700 dark:text-orange-400 text-sm font-medium">
              No packed quantity available for dispatch
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalPacked === 0 
                ? "Cartons must be packed before dispatch" 
                : "All packed cartons have been dispatched"}
            </p>
          </CardContent>
        </Card>
      )}

      {selectedBatch && (
        <Card className="bg-muted/50">
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="font-medium">Batch #{selectedBatch.batch_number}</span>
              {selectedBatch.qc_final_status === "passed" ? (
                <Badge variant="default" className="bg-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Final QC Passed
                </Badge>
              ) : (
                <Badge variant="secondary">{selectedBatch.qc_final_status || "pending"}</Badge>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">QC Approved</p>
                <p className="font-medium">{selectedBatch.qc_approved_qty || 0} pcs</p>
              </div>
              <div>
                <p className="text-muted-foreground">Packed</p>
                <p className="font-medium text-blue-600">{selectedBatch.packed_qty} pcs</p>
              </div>
              <div>
                <p className="text-muted-foreground">Dispatched</p>
                <p className="font-medium">{selectedBatch.dispatched_qty || 0} pcs</p>
              </div>
              <div>
                <p className="text-muted-foreground">Available</p>
                <p className="font-medium text-green-600">{selectedBatch.dispatchable_qty} pcs</p>
              </div>
            </div>
            
            {selectedBatch.packed_qty < selectedBatch.qc_approved_qty && (
              <div className="flex items-center gap-2 text-amber-600 text-xs pt-1">
                <AlertCircle className="h-3 w-3" />
                <span>
                  {selectedBatch.qc_approved_qty - selectedBatch.packed_qty} pcs approved but not yet packed
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
