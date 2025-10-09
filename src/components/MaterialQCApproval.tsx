import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface MaterialQCApprovalProps {
  workOrder: any;
  onApproved: () => void;
}

export const MaterialQCApproval = ({ workOrder, onApproved }: MaterialQCApprovalProps) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<'pass' | 'fail'>('pass');

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('work_orders')
        .update({
          qc_material_passed: result === 'pass',
          qc_material_approved_by: user?.id,
          qc_material_approved_at: new Date().toISOString(),
        })
        .eq('id', workOrder.id);

      if (error) throw error;

      toast.success(`Material QC ${result === 'pass' ? 'Passed' : 'Failed'}`);
      onApproved();
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit QC approval');
    } finally {
      setLoading(false);
    }
  };

  if (workOrder.qc_material_passed) {
    return null;
  }

  return (
    <Card className="border-warning">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-warning">⚠️</span> Material QC Approval Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>QC Result</Label>
          <RadioGroup value={result} onValueChange={(v) => setResult(v as 'pass' | 'fail')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="pass" id="pass" />
              <Label htmlFor="pass" className="flex items-center gap-2 cursor-pointer">
                <CheckCircle2 className="w-4 h-4 text-success" />
                Pass - Material meets specifications
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="fail" id="fail" />
              <Label htmlFor="fail" className="flex items-center gap-2 cursor-pointer">
                <XCircle className="w-4 h-4 text-destructive" />
                Fail - Material does not meet specifications
              </Label>
            </div>
          </RadioGroup>
        </div>

        <Button onClick={handleSubmit} disabled={loading} className="w-full">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit QC Result: {result.toUpperCase()}
        </Button>
      </CardContent>
    </Card>
  );
};
