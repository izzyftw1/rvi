import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Package, AlertTriangle } from "lucide-react";
import { submitBatchQC, BatchQCData } from "@/hooks/useBatchQC";

interface BatchMaterialQCApprovalProps {
  batch: BatchQCData;
  onApproved: () => void;
}

export const BatchMaterialQCApproval = ({ batch, onApproved }: BatchMaterialQCApprovalProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'pass' | 'fail' | 'waived'>('pass');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await submitBatchQC(batch.batchId, 'material', result, {
        remarks,
        waiveReason: result === 'waived' ? remarks : undefined,
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      toast.success(`Batch #${batch.batchNumber} Material QC: ${result.toUpperCase()}`);
      onApproved();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit QC approval');
    } finally {
      setLoading(false);
    }
  };

  if (['passed', 'waived'].includes(batch.materialStatus)) {
    return null;
  }

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-warning" />
            Material QC Required
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
        <div className="space-y-2">
          <Label>QC Result</Label>
          <RadioGroup value={result} onValueChange={(v) => setResult(v as 'pass' | 'fail' | 'waived')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pass" id={`pass-${batch.batchId}`} />
              <Label htmlFor={`pass-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Pass - Material meets specifications
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="fail" id={`fail-${batch.batchId}`} />
              <Label htmlFor={`fail-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                <XCircle className="w-4 h-4 text-destructive" />
                Fail - Material does not meet specifications
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="waived" id={`waived-${batch.batchId}`} />
              <Label htmlFor={`waived-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Waived - Proceed with documented deviation
              </Label>
            </div>
          </RadioGroup>
        </div>

        {(result === 'fail' || result === 'waived') && (
          <div className="space-y-2">
            <Label htmlFor={`remarks-${batch.batchId}`}>
              {result === 'waived' ? 'Waiver Reason (required)' : 'Failure Remarks'}
            </Label>
            <Textarea
              id={`remarks-${batch.batchId}`}
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
      </CardContent>
    </Card>
  );
};
