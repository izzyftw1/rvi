import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, ClipboardCheck, AlertTriangle } from "lucide-react";
import { submitBatchQC, BatchQCData } from "@/hooks/useBatchQC";

interface BatchFinalQCApprovalProps {
  batch: BatchQCData;
  onApproved: () => void;
}

export const BatchFinalQCApproval = ({ batch, onApproved }: BatchFinalQCApprovalProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'pass' | 'fail' | 'waived'>('pass');
  const [remarks, setRemarks] = useState('');
  const [inspectedQty, setInspectedQty] = useState(batch.batchQuantity);

  const handleSubmit = async () => {
    if (inspectedQty <= 0 || inspectedQty > batch.batchQuantity) {
      toast.error('Invalid inspected quantity');
      return;
    }
    
    setLoading(true);
    try {
      const response = await submitBatchQC(batch.batchId, 'final', result, {
        remarks,
        inspectedQuantity: inspectedQty,
        waiveReason: result === 'waived' ? remarks : undefined,
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      toast.success(`Batch #${batch.batchNumber} Final QC: ${result.toUpperCase()} (${inspectedQty.toLocaleString()} pcs)`);
      onApproved();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit QC approval');
    } finally {
      setLoading(false);
    }
  };

  // Prerequisites check
  const materialOk = ['passed', 'waived'].includes(batch.materialStatus);
  const firstPieceOk = ['passed', 'waived'].includes(batch.firstPieceStatus);
  const canProceed = materialOk && firstPieceOk;
  
  if (['passed', 'waived'].includes(batch.finalStatus)) {
    return null;
  }

  return (
    <Card className={`border-primary/50 ${!canProceed ? 'opacity-60' : 'bg-primary/5'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Final QC Required
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Batch #{batch.batchNumber}
          </Badge>
        </div>
        <CardDescription>
          {batch.batchQuantity.toLocaleString()} pcs available • {batch.woNumber}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canProceed ? (
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md space-y-1">
            <AlertTriangle className="h-4 w-4 inline mr-2 text-amber-500" />
            Prerequisites not met:
            {!materialOk && <div className="ml-6">• Material QC: {batch.materialStatus}</div>}
            {!firstPieceOk && <div className="ml-6">• First Piece QC: {batch.firstPieceStatus}</div>}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor={`final-qty-${batch.batchId}`}>Inspected Quantity</Label>
              <Input
                id={`final-qty-${batch.batchId}`}
                type="number"
                min={1}
                max={batch.batchQuantity}
                value={inspectedQty}
                onChange={(e) => setInspectedQty(parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                Max: {batch.batchQuantity.toLocaleString()} pcs
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>QC Result</Label>
              <RadioGroup value={result} onValueChange={(v) => setResult(v as 'pass' | 'fail' | 'waived')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pass" id={`final-pass-${batch.batchId}`} />
                  <Label htmlFor={`final-pass-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Pass - Ready for dispatch
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="fail" id={`final-fail-${batch.batchId}`} />
                  <Label htmlFor={`final-fail-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                    <XCircle className="w-4 h-4 text-destructive" />
                    Fail - Reject batch
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="waived" id={`final-waived-${batch.batchId}`} />
                  <Label htmlFor={`final-waived-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Waived - Proceed with concession
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`final-remarks-${batch.batchId}`}>
                {result === 'waived' ? 'Waiver/Concession Details (required)' : 'Remarks (optional)'}
              </Label>
              <Textarea
                id={`final-remarks-${batch.batchId}`}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={result === 'waived' ? 'Document concession details...' : 'Add inspection notes...'}
                className="min-h-[80px]"
              />
            </div>

            <Button 
              onClick={handleSubmit} 
              disabled={loading || (result === 'waived' && !remarks.trim()) || inspectedQty <= 0} 
              className="w-full"
              variant={result === 'pass' ? 'default' : result === 'fail' ? 'destructive' : 'outline'}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Final QC: {result.toUpperCase()}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
