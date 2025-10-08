import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";

interface FirstPieceQCApprovalProps {
  workOrder: any;
  onApproved: () => void;
}

export const FirstPieceQCApproval = ({ workOrder, onApproved }: FirstPieceQCApprovalProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'approved' | 'failed'>('approved');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('work_orders')
        .update({
          first_piece_qc_status: result,
          first_piece_qc_approved_by: user?.id,
          first_piece_qc_approved_at: new Date().toISOString(),
          first_piece_qc_remarks: remarks || null,
        })
        .eq('id', workOrder.id);

      if (error) throw error;

      toast.success(`First Piece QC ${result === 'approved' ? 'Approved' : 'Failed'}`);
      onApproved();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit QC approval');
    } finally {
      setLoading(false);
    }
  };

  if (!workOrder.first_piece_ready_for_qc || workOrder.first_piece_qc_status !== 'pending') {
    return null;
  }

  return (
    <Card className="border-warning">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-warning">⚠️</span> First Piece QC Approval Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>QC Result</Label>
          <RadioGroup value={result} onValueChange={(v) => setResult(v as 'approved' | 'failed')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="approved" id="approved" />
              <Label htmlFor="approved" className="flex items-center gap-2 cursor-pointer">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Approve - First piece meets dimensional requirements
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="failed" id="failed" />
              <Label htmlFor="failed" className="flex items-center gap-2 cursor-pointer">
                <XCircle className="w-4 h-4 text-destructive" />
                Fail - First piece does not meet requirements
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="remarks">Dimensional Check Results & Remarks</Label>
          <Textarea
            id="remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Enter dimensional measurements, tolerances, and any remarks..."
            rows={4}
          />
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading ? 'Submitting...' : `Submit QC Result: ${result.toUpperCase()}`}
        </Button>
      </CardContent>
    </Card>
  );
};
