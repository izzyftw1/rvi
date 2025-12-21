import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { NCRFormDialog } from './NCRFormDialog';

interface NCRLinkFromQCProps {
  qcRecordId: string;
  workOrderId: string;
  qcType: string;
  qcResult: string;
  issueDescription?: string;
}

export function NCRLinkFromQC({ 
  qcRecordId, 
  workOrderId, 
  qcType, 
  qcResult, 
  issueDescription 
}: NCRLinkFromQCProps) {
  const [showDialog, setShowDialog] = useState(false);

  // Only show for failed QC
  if (qcResult !== 'failed') {
    return null;
  }

  return (
    <>
      <Button 
        variant="destructive" 
        size="sm" 
        onClick={() => setShowDialog(true)}
        className="gap-2"
      >
        <AlertTriangle className="h-4 w-4" />
        Create NCR
      </Button>
      
      <NCRFormDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        onSuccess={() => setShowDialog(false)}
        prefillData={{
          workOrderId,
          qcRecordId,
          issueDescription: issueDescription || `QC Failed - ${qcType}`,
          sourceReference: `QC Record - ${qcType}`,
        }}
      />
    </>
  );
}
