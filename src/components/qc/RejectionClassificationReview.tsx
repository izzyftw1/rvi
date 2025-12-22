import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Loader2
} from "lucide-react";
import { NCRFormDialog } from "@/components/ncr/NCRFormDialog";

interface RejectionReason {
  key: string;
  label: string;
  productionCount: number;
  qcVerified?: 'confirmed' | 'challenged' | null;
  qcNotes?: string;
}

interface RejectionClassificationReviewProps {
  workOrderId: string;
  productionLogId: string;
  rejectionBreakdown: RejectionReason[];
  totalRejection: number;
  onUpdate?: () => void;
}

/**
 * Component for QC to review and confirm/challenge rejection classifications from Production.
 * Quality can:
 * - Confirm rejection classifications are accurate
 * - Challenge classifications if they disagree
 * - Add notes explaining their assessment
 * - Raise NCRs if patterns or mismatches are detected
 * 
 * Quality CANNOT edit the actual rejection quantities - those are read-only from Production.
 */
export function RejectionClassificationReview({
  workOrderId,
  productionLogId,
  rejectionBreakdown,
  totalRejection,
  onUpdate
}: RejectionClassificationReviewProps) {
  const [verifications, setVerifications] = useState<Record<string, { status: 'confirmed' | 'challenged' | null; notes: string }>>({});
  const [saving, setSaving] = useState(false);
  const [showNCRDialog, setShowNCRDialog] = useState(false);
  const [ncrDescription, setNcrDescription] = useState("");

  // Initialize verifications from rejection breakdown
  useEffect(() => {
    const initial: Record<string, { status: 'confirmed' | 'challenged' | null; notes: string }> = {};
    rejectionBreakdown.forEach(r => {
      initial[r.key] = { status: r.qcVerified || null, notes: r.qcNotes || '' };
    });
    setVerifications(initial);
  }, [rejectionBreakdown]);

  const handleVerificationChange = (key: string, status: 'confirmed' | 'challenged') => {
    setVerifications(prev => ({
      ...prev,
      [key]: { ...prev[key], status }
    }));
  };

  const handleNotesChange = (key: string, notes: string) => {
    setVerifications(prev => ({
      ...prev,
      [key]: { ...prev[key], notes }
    }));
  };

  const getChallengedCount = () => {
    return Object.values(verifications).filter(v => v.status === 'challenged').length;
  };

  const getConfirmedCount = () => {
    return Object.values(verifications).filter(v => v.status === 'confirmed').length;
  };

  const handleRaiseNCR = () => {
    const challengedReasons = rejectionBreakdown
      .filter(r => verifications[r.key]?.status === 'challenged')
      .map(r => `${r.label}: ${r.productionCount} pcs (${verifications[r.key]?.notes || 'Classification disputed'})`)
      .join('\n');
    
    setNcrDescription(`Rejection Classification Mismatch Detected\n\nChallenged Classifications:\n${challengedReasons}`);
    setShowNCRDialog(true);
  };

  const handleSaveVerifications = async () => {
    setSaving(true);
    try {
      // Store QC verification data in qc_records or a dedicated table
      // For now, we'll create a QC record to track this review
      const { data: { user } } = await supabase.auth.getUser();
      
      const qcId = `RCR-${Date.now().toString(36).toUpperCase()}`;
      
      const { error } = await supabase
        .from('qc_records')
        .insert([{
          qc_id: qcId,
          wo_id: workOrderId,
          qc_type: 'in_process' as const,
          result: getChallengedCount() > 0 ? 'fail' as const : 'pass' as const,
          measurements: verifications as any,
          remarks: `Rejection classification review. Confirmed: ${getConfirmedCount()}, Challenged: ${getChallengedCount()}`,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          qc_date_time: new Date().toISOString(),
        }]);

      if (error) throw error;
      
      toast.success("Rejection classification review saved");
      onUpdate?.();
    } catch (error: any) {
      console.error("Error saving verification:", error);
      toast.error(error.message || "Failed to save verification");
    } finally {
      setSaving(false);
    }
  };

  if (rejectionBreakdown.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm">No rejections recorded in production - no classification review needed</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Rejection Classification Review
            </div>
            <Badge variant="outline" className="text-xs">
              {totalRejection} total rejections
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Verify Production's rejection classifications. You can confirm or challenge each category (read-only quantities).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {rejectionBreakdown.map((reason) => (
            <div key={reason.key} className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="font-medium">{reason.label}</span>
                  <Badge variant="destructive" className="text-xs">
                    {reason.productionCount} pcs
                  </Badge>
                </div>
                
                <RadioGroup
                  value={verifications[reason.key]?.status || ''}
                  onValueChange={(v) => handleVerificationChange(reason.key, v as 'confirmed' | 'challenged')}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="confirmed" id={`${reason.key}-confirm`} />
                    <Label htmlFor={`${reason.key}-confirm`} className="flex items-center gap-1 text-xs cursor-pointer">
                      <ThumbsUp className="h-3 w-3 text-emerald-600" />
                      Confirm
                    </Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="challenged" id={`${reason.key}-challenge`} />
                    <Label htmlFor={`${reason.key}-challenge`} className="flex items-center gap-1 text-xs cursor-pointer">
                      <ThumbsDown className="h-3 w-3 text-amber-600" />
                      Challenge
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {verifications[reason.key]?.status === 'challenged' && (
                <div className="pl-6">
                  <Label className="text-xs text-muted-foreground">Reason for challenge</Label>
                  <Textarea
                    placeholder="Explain why this classification is disputed..."
                    value={verifications[reason.key]?.notes || ''}
                    onChange={(e) => handleNotesChange(reason.key, e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              )}
            </div>
          ))}

          {/* Summary & Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {getConfirmedCount()} confirmed
              </span>
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                {getChallengedCount()} challenged
              </span>
            </div>
            
            <div className="flex gap-2">
              {getChallengedCount() > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRaiseNCR}
                >
                  <MessageSquare className="h-3.5 w-3.5 mr-1" />
                  Raise NCR
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSaveVerifications}
                disabled={saving}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                Save Review
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <NCRFormDialog
        open={showNCRDialog}
        onOpenChange={setShowNCRDialog}
        onSuccess={() => {
          setShowNCRDialog(false);
          onUpdate?.();
        }}
        prefillData={{
          workOrderId,
          issueDescription: ncrDescription,
          sourceReference: `Production Log - Rejection Classification Review`,
        }}
      />
    </>
  );
}
