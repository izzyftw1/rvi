import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { submitBatchQC, BatchQCData } from "@/hooks/useBatchQC";
import { format } from "date-fns";

interface BatchPostExternalQCApprovalProps {
  batch: BatchQCData;
  onApproved: () => void;
}

export const BatchPostExternalQCApproval = ({ batch, onApproved }: BatchPostExternalQCApprovalProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'pass' | 'fail' | 'waived'>('pass');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const response = await submitBatchQC(batch.batchId, 'post_external', result, {
        remarks,
        waiveReason: result === 'waived' ? remarks : undefined,
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      toast.success(`Batch #${batch.batchNumber} Post-External QC: ${result.toUpperCase()}`);
      onApproved();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit QC approval');
    } finally {
      setLoading(false);
    }
  };

  // Only show if batch requires QC after external return
  if (!batch.requiresQCOnReturn || batch.postExternalStatus !== 'pending') {
    return null;
  }

  return (
    <Card className="border-blue-500/50 bg-blue-50/30 dark:bg-blue-950/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-blue-600" />
            Post-External Processing QC
          </CardTitle>
          <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
            Returned Batch #{batch.batchNumber}
          </Badge>
        </div>
        <CardDescription>
          {batch.batchQuantity.toLocaleString()} pcs returned from external processing
          {batch.externalReturnedAt && (
            <span className="ml-2 text-xs">
              (Returned: {format(new Date(batch.externalReturnedAt), 'dd MMM yyyy')})
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md text-sm">
          <AlertTriangle className="h-4 w-4 inline mr-2 text-blue-600" />
          This batch returned from external processing and requires fresh QC inspection.
          Previous QC approvals do not carry over.
        </div>
        
        <div className="space-y-2">
          <Label>QC Result</Label>
          <RadioGroup value={result} onValueChange={(v) => setResult(v as 'pass' | 'fail' | 'waived')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pass" id={`ext-pass-${batch.batchId}`} />
              <Label htmlFor={`ext-pass-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                Pass - External processing meets requirements
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="fail" id={`ext-fail-${batch.batchId}`} />
              <Label htmlFor={`ext-fail-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                <XCircle className="w-4 h-4 text-destructive" />
                Fail - External processing defects found
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="waived" id={`ext-waived-${batch.batchId}`} />
              <Label htmlFor={`ext-waived-${batch.batchId}`} className="flex items-center gap-2 cursor-pointer">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Waived - Accept with documented deviation
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`ext-remarks-${batch.batchId}`}>
            {result === 'waived' ? 'Waiver Details (required)' : 'Inspection Notes'}
          </Label>
          <Textarea
            id={`ext-remarks-${batch.batchId}`}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={result === 'waived' ? 'Document the deviation acceptance...' : 'Describe post-external inspection findings...'}
            className="min-h-[80px]"
          />
        </div>

        <Button 
          onClick={handleSubmit} 
          disabled={loading || (result === 'waived' && !remarks.trim())} 
          className="w-full"
          variant={result === 'pass' ? 'default' : result === 'fail' ? 'destructive' : 'outline'}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Post-External QC: {result.toUpperCase()}
        </Button>
      </CardContent>
    </Card>
  );
};
