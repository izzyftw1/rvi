import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface DispatchQCBatch {
  id: string;
  qc_batch_id: string;
  qc_approved_quantity: number;
  consumed_quantity: number;
  available_quantity: number;
  status: string;
  qc_date: string;
}

interface DispatchQCBatchSelectorProps {
  woId: string;
  selectedBatchId: string | null;
  onBatchSelect: (batchId: string | null, availableQty: number) => void;
  disabled?: boolean;
}

export function DispatchQCBatchSelector({
  woId,
  selectedBatchId,
  onBatchSelect,
  disabled = false,
}: DispatchQCBatchSelectorProps) {
  const [batches, setBatches] = useState<DispatchQCBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!woId) {
      setBatches([]);
      setLoading(false);
      return;
    }

    const loadBatches = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("dispatch_qc_batches")
        .select("*")
        .eq("work_order_id", woId)
        .neq("status", "consumed")
        .order("qc_date", { ascending: true });

      if (!error && data) {
        const enriched = data.map(b => ({
          ...b,
          available_quantity: b.qc_approved_quantity - b.consumed_quantity,
        }));
        setBatches(enriched);
      }
      setLoading(false);
    };

    loadBatches();
  }, [woId]);

  const handleChange = (value: string) => {
    if (value === "none") {
      onBatchSelect(null, 0);
      return;
    }
    
    const batch = batches.find(b => b.id === value);
    if (batch) {
      onBatchSelect(batch.id, batch.available_quantity);
    }
  };

  const selectedBatch = batches.find(b => b.id === selectedBatchId);
  const totalAvailable = batches.reduce((sum, b) => sum + b.available_quantity, 0);

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Dispatch QC Batch</Label>
        <div className="h-10 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">No Dispatch QC Approval</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          A Dispatch QC batch must be approved before packing. Complete Final QC to create a dispatch-eligible batch.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Dispatch QC Batch</Label>
        <Badge variant="outline" className="text-xs">
          {totalAvailable} pcs available
        </Badge>
      </div>
      
      <Select
        value={selectedBatchId || "none"}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select QC batch..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">-- Select Batch --</SelectItem>
          {batches.map((batch) => (
            <SelectItem 
              key={batch.id} 
              value={batch.id}
              disabled={batch.available_quantity === 0}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{batch.qc_batch_id}</span>
                <span className="text-muted-foreground">
                  ({batch.available_quantity} available)
                </span>
                {batch.status === 'partially_consumed' && (
                  <Badge variant="secondary" className="text-xs">Partial</Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedBatch && (
        <div className="p-3 rounded-lg border bg-muted/30 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="font-medium">{selectedBatch.qc_batch_id}</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Approved</p>
              <p className="font-medium">{selectedBatch.qc_approved_quantity} pcs</p>
            </div>
            <div>
              <p className="text-muted-foreground">Consumed</p>
              <p className="font-medium">{selectedBatch.consumed_quantity} pcs</p>
            </div>
            <div>
              <p className="text-muted-foreground">Available</p>
              <p className="font-bold text-green-600">{selectedBatch.available_quantity} pcs</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            QC Date: {new Date(selectedBatch.qc_date).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}
