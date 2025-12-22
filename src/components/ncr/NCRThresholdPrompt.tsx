import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, FileWarning } from 'lucide-react';

export interface RejectionExceedance {
  key: string;
  label: string;
  count: number;
  threshold: number;
}

interface NCRThresholdPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exceedances: RejectionExceedance[];
  onRaiseNCR: (rejections: RejectionExceedance[]) => void;
  onSkip: () => void;
}

export function NCRThresholdPrompt({
  open,
  onOpenChange,
  exceedances,
  onRaiseNCR,
  onSkip,
}: NCRThresholdPromptProps) {
  const [selectedRejections, setSelectedRejections] = useState<string[]>(
    exceedances.map(e => e.key)
  );

  const toggleSelection = (key: string) => {
    setSelectedRejections(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const handleRaiseNCR = () => {
    const selected = exceedances.filter(e => selectedRejections.includes(e.key));
    onRaiseNCR(selected);
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            High Rejection Alert
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              The following rejection types exceed threshold limits and may require a Non-Conformance Report (NCR):
            </p>
            
            <div className="space-y-2 mt-3">
              {exceedances.map((e) => (
                <div
                  key={e.key}
                  onClick={() => toggleSelection(e.key)}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedRejections.includes(e.key)
                      ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700'
                      : 'bg-muted/30 border-muted hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileWarning className={`h-4 w-4 ${
                      selectedRejections.includes(e.key) ? 'text-amber-600' : 'text-muted-foreground'
                    }`} />
                    <span className="font-medium">{e.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive" className="text-xs">
                      {e.count} pcs
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      (threshold: {e.threshold})
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-sm text-muted-foreground mt-4">
              Would you like to raise an NCR for the selected rejections? This will help track quality issues and trigger corrective actions.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleSkip}>
            Skip for Now
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRaiseNCR}
            disabled={selectedRejections.length === 0}
            className="bg-amber-600 hover:bg-amber-700"
          >
            Raise NCR ({selectedRejections.length})
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
