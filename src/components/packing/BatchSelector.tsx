import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface ProductionBatch {
  id: string;
  batch_number: number;
  trigger_reason: string;
  started_at: string;
  ended_at: string | null;
  produced_qty: number;
  qc_approved_qty: number;
  qc_rejected_qty: number;
  qc_pending_qty: number;
  qc_material_status: string;
  qc_first_piece_status: string;
  qc_final_status: string;
  dispatch_allowed: boolean;
}

interface PackableQty {
  qc_approved_qty: number;
  already_packed_qty: number;
  available_to_pack: number;
}

interface BatchSelectorProps {
  woId: string;
  selectedBatchId: string | null;
  onBatchSelect: (batchId: string | null, packableQty: number) => void;
}

export function BatchSelector({ woId, selectedBatchId, onBatchSelect }: BatchSelectorProps) {
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [packableQty, setPackableQty] = useState<PackableQty | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (woId) {
      loadBatches();
    } else {
      setBatches([]);
      setPackableQty(null);
    }
  }, [woId]);

  useEffect(() => {
    if (selectedBatchId) {
      loadPackableQty(selectedBatchId);
    } else {
      setPackableQty(null);
    }
  }, [selectedBatchId]);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("production_batches")
        .select("*")
        .eq("wo_id", woId)
        .order("batch_number", { ascending: true });

      if (error) throw error;
      setBatches((data as unknown as ProductionBatch[]) || []);
    } catch (err) {
      console.error("Error loading batches:", err);
      setBatches([]);
    } finally {
      setLoading(false);
    }
  };

  const loadPackableQty = async (batchId: string) => {
    try {
      const { data, error } = await supabase.rpc("get_batch_packable_qty", {
        p_batch_id: batchId,
      });

      if (error) throw error;
      
      const result = data?.[0] as PackableQty | undefined;
      setPackableQty(result || null);
      onBatchSelect(batchId, result?.available_to_pack || 0);
    } catch (err) {
      console.error("Error loading packable qty:", err);
      setPackableQty(null);
      onBatchSelect(batchId, 0);
    }
  };

  const handleBatchChange = (value: string) => {
    if (value === "none") {
      onBatchSelect(null, 0);
      setPackableQty(null);
    } else {
      onBatchSelect(value, 0);
    }
  };

  const getQCStatusBadge = (batch: ProductionBatch) => {
    if (batch.qc_approved_qty > 0) {
      return (
        <Badge variant="default" className="bg-green-600">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {batch.qc_approved_qty} approved
        </Badge>
      );
    }
    
    if (batch.qc_final_status === "passed") {
      return <Badge variant="default">Final QC Passed</Badge>;
    }
    
    if (batch.qc_final_status === "pending") {
      return <Badge variant="secondary">Final QC Pending</Badge>;
    }
    
    return <Badge variant="destructive">No QC Approval</Badge>;
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Production Batch</Label>
        <div className="h-10 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2 text-amber-800">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">No production batches found</span>
        </div>
        <p className="text-sm text-amber-700 mt-1">
          Production must be logged before packing can begin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="batch_select">Production Batch *</Label>
        <Select value={selectedBatchId || "none"} onValueChange={handleBatchChange}>
          <SelectTrigger id="batch_select">
            <SelectValue placeholder="Select a batch..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" disabled>Select a batch...</SelectItem>
            {batches.map((batch) => (
              <SelectItem key={batch.id} value={batch.id}>
                <div className="flex items-center gap-2">
                  <span>Batch #{batch.batch_number}</span>
                  <span className="text-muted-foreground">
                    ({batch.trigger_reason})
                  </span>
                  {getQCStatusBadge(batch)}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedBatchId && packableQty && (
        <div className="p-3 bg-secondary rounded-lg space-y-2">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">QC Approved:</span>
              <p className="font-semibold text-green-600">{packableQty.qc_approved_qty} pcs</p>
            </div>
            <div>
              <span className="text-muted-foreground">Already Packed:</span>
              <p className="font-semibold text-blue-600">{packableQty.already_packed_qty} pcs</p>
            </div>
            <div>
              <span className="text-muted-foreground">Available to Pack:</span>
              <p className="font-bold text-primary">{packableQty.available_to_pack} pcs</p>
            </div>
          </div>
          
          {packableQty.available_to_pack === 0 && (
            <div className="flex items-center gap-2 text-amber-600 mt-2">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">No QC-approved quantity available for packing</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
