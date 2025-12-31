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

  // Generate a unique QC ID
  const generateQCId = (type: string): string => {
    const prefixes: Record<string, string> = {
      'incoming': 'QC-MAT',
      'first_piece': 'QC-FP',
      'in_process': 'QC-IP',
      'final': 'QC-FIN'
    };
    const prefix = prefixes[type] || 'QC';
    const timestamp = Date.now().toString(36).toUpperCase();
    return `${prefix}-${timestamp}`;
  };

  const handleQCAction = async (action: 'passed' | 'failed' | 'waived') => {
    if (action === 'waived' && !waiveReason.trim()) {
      toast.error('Please provide a reason for waiving this QC stage');
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();

      // Find existing QC record - filter by batch_id IS NULL to match constraint
      const { data: existingQC, error: fetchError } = await supabase
        .from('qc_records')
        .select('id, qc_id')
        .eq('wo_id', woId)
        .eq('qc_type', qcType)
        .is('batch_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      // Map action to database value - waived should store as 'pass' with waive_reason populated
      const dbResult = action === 'failed' ? 'fail' as const : 'pass' as const;

      const timestamp = new Date().toISOString();

      if (existingQC) {
        // Update existing record
        const { error } = await supabase
          .from('qc_records')
          .update({
            result: dbResult,
            remarks: remarks || null,
            waive_reason: action === 'waived' ? waiveReason : null,
            approved_by: user?.id || null,
            approved_at: timestamp,
            tested_on: timestamp,
            file_upload_url: uploadedFileUrl || null,
            digital_signature: {
              user_id: user?.id,
              timestamp: timestamp,
              action: action
            }
          })
          .eq('id', existingQC.id);
        
        if (error) throw error;
      } else {
        // Create new record with generated qc_id
        const newQcId = generateQCId(qcType);
        const { error } = await supabase
          .from('qc_records')
          .insert([{
            qc_id: newQcId,
            wo_id: woId,
            qc_type: qcType,
            result: dbResult,
            remarks: remarks || null,
            waive_reason: action === 'waived' ? waiveReason : null,
            approved_by: user?.id || null,
            approved_at: timestamp,
            tested_on: timestamp,
            file_upload_url: uploadedFileUrl || null,
            digital_signature: {
              user_id: user?.id,
              timestamp: timestamp,
              action: action
            }
          }]);
        
        if (error) throw error;
      }

      // Also update work_order QC status fields for consistency
      const statusValue = action === 'waived' ? 'waived' : action === 'passed' ? 'passed' : 'failed';
      const woUpdateData: Record<string, any> = {};
      
      if (qcType === 'incoming') {
        woUpdateData.qc_material_status = statusValue;
        woUpdateData.qc_material_passed = action === 'passed' || action === 'waived';
        woUpdateData.qc_material_approved_by = user?.id;
        woUpdateData.qc_material_approved_at = timestamp;
        woUpdateData.qc_material_remarks = remarks || null;
        // Also update legacy field
        woUpdateData.qc_raw_material_status = statusValue;
        woUpdateData.qc_raw_material_approved_by = user?.id;
        woUpdateData.qc_raw_material_approved_at = timestamp;
        woUpdateData.qc_raw_material_remarks = remarks || null;
      } else if (qcType === 'first_piece') {
        woUpdateData.qc_first_piece_status = statusValue;
        woUpdateData.qc_first_piece_passed = action === 'passed' || action === 'waived';
        woUpdateData.qc_first_piece_approved_by = user?.id;
        woUpdateData.qc_first_piece_approved_at = timestamp;
        woUpdateData.qc_first_piece_remarks = remarks || null;
      } else if (qcType === 'final') {
        woUpdateData.qc_final_status = statusValue;
        woUpdateData.qc_final_approved_by = user?.id;
        woUpdateData.qc_final_approved_at = timestamp;
        woUpdateData.qc_final_remarks = remarks || null;
      }

      if (Object.keys(woUpdateData).length > 0) {
        const { error: woError } = await supabase
          .from('work_orders')
          .update(woUpdateData)
          .eq('id', woId);
        
        if (woError) {
          console.error('Failed to update work order QC status:', woError);
        }
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