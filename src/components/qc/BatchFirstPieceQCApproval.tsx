import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Target, AlertTriangle } from "lucide-react";
import { submitBatchQC, BatchQCData } from "@/hooks/useBatchQC";

interface BatchFirstPieceQCApprovalProps {
  batch: BatchQCData;
  onApproved: () => void;
}

export const BatchFirstPieceQCApproval = ({ batch, onApproved }: BatchFirstPieceQCApprovalProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'pass' | 'fail' | 'waived'>('pass');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await submitBatchQC(batch.batchId, 'first_piece', result, {
        remarks,
        waiveReason: result === 'waived' ? remarks : undefined,
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      toast.success(`Batch #${batch.batchNumber} First Piece QC: ${result.toUpperCase()}`);
      onApproved();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit QC approval');
    } finally {
      setLoading(false);
    }
  };

  // Material QC must pass first
  const materialBlocked = !['passed', 'waived'].includes(batch.materialStatus);
  
  if (['passed', 'waived'].includes(batch.firstPieceStatus)) {
    return null;
  }

  return (
    <Card className={`border-warning/50 ${materialBlocked ? 'opacity-60' : 'bg-warning/5'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-4 w-4 text-warning" />
            First Piece QC Required
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Batch #{batch.batchNumber}
          </Badge>
        </div>
        <CardDescription>
          {batch.batchQuantity.toLocaleString()} pcs • {batch.woNumber}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {materialBlocked ? (
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
            <AlertTriangle className="h-4 w-4 inline mr-2 text-amber-500" />
            Material QC must pass before First Piece QC
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>QC Result</Label>
              <RadioGroup value={result} onValueChange={(v) => setResult(v as 'pass' | 'fail' | 'waived')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="pass" id={`fp-pass-${batch.batchId}`} />
                  <Label htmlFor={`fp-pass-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Pass - First piece meets dimensional requirements
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="fail" id={`fp-fail-${batch.batchId}`} />
                  <Label htmlFor={`fp-fail-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                    <XCircle className="w-4 h-4 text-destructive" />
                    Fail - First piece does not meet requirements
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="waived" id={`fp-waived-${batch.batchId}`} />
                  <Label htmlFor={`fp-waived-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Waived - Proceed with documented deviation
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {(result === 'fail' || result === 'waived') && (
              <div className="space-y-2">
                <Label htmlFor={`fp-remarks-${batch.batchId}`}>
                  {result === 'waived' ? 'Waiver Reason (required)' : 'Failure Remarks'}
                </Label>
                <Textarea
                  id={`fp-remarks-${batch.batchId}`}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={result === 'waived' ? 'Document the reason for waiving...' : 'Describe the failure...'}
                  className="min-h-[80px]"
                />
              </div>
            )}

            <Button 
              onClick={handleSubmit} 
              disabled={loading || (result === 'waived' && !remarks.trim())} 
              className="w-full"
              variant={result === 'pass' ? 'default' : result === 'fail' ? 'destructive' : 'outline'}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit: {result.toUpperCase()}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
