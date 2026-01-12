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
import { useDispatchQCBatches, DispatchQCBatch } from "@/hooks/useDispatchQCBatches";

interface DispatchQCBatchSelectorProps {
  woId: string;
  selectedBatchId: string | null;
  onBatchSelect: (batchId: string | null, availableQty: number) => void;
  disabled?: boolean;
}

/**
 * Dispatch QC Batch Selector
 * 
 * Allows selection of QC-approved batches for packing.
 * Uses the useDispatchQCBatches hook for consistent data management.
 * 
 * QUANTITY-DRIVEN: Selection is based on available quantity, not WO status.
 */
export function DispatchQCBatchSelector({
  woId,
  selectedBatchId,
  onBatchSelect,
  disabled = false,
}: DispatchQCBatchSelectorProps) {
  const { batches, loading, totalAvailable } = useDispatchQCBatches(woId || undefined);

  // Filter to only show batches with available quantity
  const availableBatches = batches.filter(b => b.available_quantity > 0);

  const handleChange = (value: string) => {
    if (value === "none") {
      onBatchSelect(null, 0);
      return;
    }
    
    const batch = availableBatches.find(b => b.id === value);
    if (batch) {
      onBatchSelect(batch.id, batch.available_quantity);
    }
  };

  const selectedBatch = availableBatches.find(b => b.id === selectedBatchId);

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Dispatch QC Batch</Label>
        <div className="h-10 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (availableBatches.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-muted bg-muted/20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">No Dispatch QC Batches Available</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          QC-approved quantities will appear here after Dispatch QC approval. 
          Partial QC approval unlocks packing for approved quantities.
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
          {availableBatches.map((batch) => (
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
