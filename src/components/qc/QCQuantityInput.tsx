import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAvailableQCQuantity, AvailableQCData } from "@/hooks/useAvailableQCQuantity";
import { AlertTriangle, CheckCircle2, Package } from "lucide-react";

interface QCQuantityInputProps {
  woId: string;
  qcType: 'first_piece' | 'final' | 're_qc';
  value: number;
  onChange: (qty: number, batchId: string | null) => void;
  selectedBatchId: string | null;
  onBatchChange: (batchId: string | null) => void;
  disabled?: boolean;
}

export function QCQuantityInput({
  woId,
  qcType,
  value,
  onChange,
  selectedBatchId,
  onBatchChange,
  disabled = false
}: QCQuantityInputProps) {
  const { batches, totalAvailableForQC, loading } = useAvailableQCQuantity(woId);
  const [error, setError] = useState<string | null>(null);

  // Find the selected batch
  const selectedBatch = batches.find(b => b.batchId === selectedBatchId);
  const maxQty = selectedBatch?.availableForQC || 0;

  // Auto-select first batch with available quantity if none selected
  useEffect(() => {
    if (!selectedBatchId && batches.length > 0) {
      const batchWithQty = batches.find(b => b.availableForQC > 0);
      if (batchWithQty) {
        onBatchChange(batchWithQty.batchId);
      }
    }
  }, [batches, selectedBatchId, onBatchChange]);

  const handleQuantityChange = (newValue: string) => {
    const qty = parseInt(newValue) || 0;
    
    if (qty > maxQty) {
      setError(`Cannot QC more than ${maxQty} pcs available for this batch`);
    } else if (qty <= 0) {
      setError('Quantity must be greater than 0');
    } else {
      setError(null);
    }
    
    onChange(qty, selectedBatchId);
  };

  const handleBatchChange = (batchId: string) => {
    onBatchChange(batchId);
    setError(null);
    // Reset quantity when batch changes
    const batch = batches.find(b => b.batchId === batchId);
    if (batch) {
      onChange(Math.min(value, batch.availableForQC), batchId);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm">Loading batch data...</div>;
  }

  if (batches.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No production batches found. Production must be logged before QC can be performed.
        </AlertDescription>
      </Alert>
    );
  }

  if (totalAvailableForQC === 0) {
    return (
      <Alert className="border-green-500 bg-green-50 dark:bg-green-900/20">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800 dark:text-green-300">
          All produced quantity has been QC'd. No additional quantity available for inspection.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Batch Selector */}
      <div className="space-y-2">
        <Label className="font-semibold">Select Batch for QC</Label>
        <Select
          value={selectedBatchId || ''}
          onValueChange={handleBatchChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a batch" />
          </SelectTrigger>
          <SelectContent>
            {batches.map(batch => (
              <SelectItem 
                key={batch.batchId} 
                value={batch.batchId || ''}
                disabled={batch.availableForQC === 0}
              >
                <div className="flex items-center gap-2">
                  <span>Batch #{batch.batchNumber}</span>
                  <Badge variant={batch.availableForQC > 0 ? "default" : "secondary"} className="text-xs">
                    {batch.availableForQC} available
                  </Badge>
                  {batch.qcFinalStatus === 'passed' && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                      QC Passed
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selected Batch Summary */}
      {selectedBatch && (
        <div className="p-3 bg-muted/50 rounded-lg grid grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Produced:</span>
            <span className="ml-2 font-semibold">{selectedBatch.producedQty.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Approved:</span>
            <span className="ml-2 font-semibold text-green-600">{selectedBatch.qcApprovedQty.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Rejected:</span>
            <span className="ml-2 font-semibold text-red-600">{selectedBatch.qcRejectedQty.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Available:</span>
            <span className="ml-2 font-bold text-primary">{selectedBatch.availableForQC.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Quantity Input */}
      <div className="space-y-2">
        <Label className="font-semibold flex items-center gap-2">
          <Package className="h-4 w-4" />
          QC Quantity (pcs)
        </Label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={maxQty}
            value={value || ''}
            onChange={(e) => handleQuantityChange(e.target.value)}
            disabled={disabled || !selectedBatchId || maxQty === 0}
            className={error ? 'border-destructive' : ''}
            placeholder={`Max: ${maxQty}`}
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            / {maxQty.toLocaleString()} available
          </span>
        </div>
        {error && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>

      {/* QC Type Info */}
      <div className="text-xs text-muted-foreground">
        {qcType === 'first_piece' && (
          <p>First Piece QC validates the initial production setup before bulk production.</p>
        )}
        {qcType === 'final' && (
          <p>Final QC approves the specified quantity for packing and dispatch.</p>
        )}
        {qcType === 're_qc' && (
          <p>Re-QC is performed on previously rejected or questionable items.</p>
        )}
      </div>
    </div>
  );
}
