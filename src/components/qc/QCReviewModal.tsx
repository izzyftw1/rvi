import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FirstPieceQCForm } from "./FirstPieceQCForm";
import { QCActionDrawer } from "./QCActionDrawer";

interface QCReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  woId: string;
  qcType: 'incoming' | 'first_piece' | 'in_process' | 'final';
  itemCode: string;
  qcRecordId: string;
  currentStatus: string;
  currentRemarks?: string;
  onComplete: () => void;
}

export const QCReviewModal = ({
  open,
  onOpenChange,
  woId,
  qcType,
  itemCode,
  qcRecordId,
  currentStatus,
  currentRemarks,
  onComplete
}: QCReviewModalProps) => {
  const stageLabels = {
    'incoming': 'Raw Material QC',
    'first_piece': 'First Piece QC',
    'in_process': 'In-Process QC',
    'final': 'Final Dispatch QC'
  };

  const handleComplete = () => {
    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{stageLabels[qcType]}</DialogTitle>
        </DialogHeader>

        {qcType === 'first_piece' ? (
          <FirstPieceQCForm
            workOrderId={woId}
            itemCode={itemCode}
            qcRecordId={qcRecordId}
            onComplete={handleComplete}
          />
        ) : (
          <QCActionDrawer
            woId={woId}
            qcType={qcType}
            currentStatus={currentStatus}
            currentRemarks={currentRemarks}
            onUpdate={handleComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};