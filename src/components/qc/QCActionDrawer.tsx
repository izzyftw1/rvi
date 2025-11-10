import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Ban, Upload, FileText, Loader2 } from "lucide-react";
import { QCGateStatusBadge } from "@/components/QCGateStatusBadge";

interface QCActionDrawerProps {
  woId: string;
  qcType: 'incoming' | 'first_piece' | 'in_process' | 'final';
  currentStatus: string;
  currentRemarks?: string;
  onUpdate: () => void;
}

export const QCActionDrawer = ({ 
  woId, 
  qcType, 
  currentStatus, 
  currentRemarks,
  onUpdate 
}: QCActionDrawerProps) => {
  const [loading, setLoading] = useState(false);
  const [remarks, setRemarks] = useState(currentRemarks || '');
  const [waiveReason, setWaiveReason] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);

  const stageLabels = {
    'incoming': 'Raw Material QC',
    'first_piece': 'First Piece QC',
    'in_process': 'In-Process QC',
    'final': 'Final Dispatch QC'
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PDF, JPG, and PNG files are allowed');
      return;
    }

    try {
      setUploadingFile(true);
      const fileExt = file.name.split('.').pop();
      const filePath = `qc-reports/${woId}/${qcType}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('qc-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('qc-files')
        .getPublicUrl(filePath);

      setUploadedFileUrl(publicUrl);
      toast.success('File uploaded successfully');
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const handleQCAction = async (action: 'passed' | 'failed' | 'waived') => {
    if (action === 'waived' && !waiveReason.trim()) {
      toast.error('Please provide a reason for waiving this QC stage');
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      // Find existing QC record or create new one
      const { data: existingQC } = await supabase
        .from('qc_records')
        .select('id')
        .eq('wo_id', woId)
        .eq('qc_type', qcType)
        .single();

      // Map action to database value
      const dbResult = action === 'failed' ? 'fail' as const : action === 'passed' ? 'pass' as const : 'pending' as const;

      const qcData: any = {
        wo_id: woId,
        qc_type: qcType,
        result: dbResult,
        remarks: remarks || null,
        waive_reason: action === 'waived' ? waiveReason : null,
        approved_by: user?.id || null,
        approved_at: new Date().toISOString(),
        tested_on: new Date().toISOString(),
        file_upload_url: uploadedFileUrl || null,
        digital_signature: {
          user_id: user?.id,
          timestamp: new Date().toISOString()
        }
      };

      if (existingQC) {
        const { error } = await supabase
          .from('qc_records')
          .update(qcData)
          .eq('id', existingQC.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('qc_records')
          .insert([qcData]);
        
        if (error) throw error;
      }

      toast.success(`${stageLabels[qcType]} marked as ${action}`);
      onUpdate();
    } catch (error: any) {
      toast.error(`Failed to update QC status: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{stageLabels[qcType]}</h3>
        <QCGateStatusBadge status={currentStatus as any} />
      </div>

      <div className="space-y-4">
        {/* File Upload */}
        <div>
          <Label>Upload Report (PDF/Image)</Label>
          <div className="flex gap-2 mt-2">
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              disabled={uploadingFile}
              className="flex-1"
            />
            {uploadingFile && <Loader2 className="h-5 w-5 animate-spin" />}
          </div>
          {uploadedFileUrl && (
            <a 
              href={uploadedFileUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline mt-2 flex items-center gap-1"
            >
              <FileText className="h-4 w-4" />
              View uploaded file
            </a>
          )}
        </div>

        {/* Remarks */}
        <div>
          <Label>Remarks</Label>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Enter inspection remarks..."
            rows={3}
            className="mt-2"
          />
        </div>

        {/* Waive Reason (conditional) */}
        <div>
          <Label>Waiver Reason (if waiving)</Label>
          <Textarea
            value={waiveReason}
            onChange={(e) => setWaiveReason(e.target.value)}
            placeholder="Required if you choose to waive this stage..."
            rows={2}
            className="mt-2"
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <Button
            onClick={() => handleQCAction('passed')}
            disabled={loading}
            variant="default"
            className="bg-success hover:bg-success/90"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Pass
          </Button>
          <Button
            onClick={() => handleQCAction('failed')}
            disabled={loading}
            variant="destructive"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Fail
          </Button>
          <Button
            onClick={() => handleQCAction('waived')}
            disabled={loading || !waiveReason.trim()}
            variant="secondary"
          >
            <Ban className="h-4 w-4 mr-2" />
            Waive
          </Button>
        </div>

        {/* Helper Text */}
        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> Passing or waiving will unlock the next QC stage. 
          Failing will lock production until re-tested and passed.
        </p>
      </div>
    </div>
  );
};