import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, XCircle, AlertTriangle, Clock, Beaker, Package } from "lucide-react";

interface MaterialTraceabilityBadgeProps {
  materialGrade?: string;
  heatNo?: string;
  supplier?: string;
  qcStatus?: string | null;
  size?: 'sm' | 'md';
  showDetails?: boolean;
}

export function MaterialTraceabilityBadge({
  materialGrade,
  heatNo,
  supplier,
  qcStatus,
  size = 'md',
  showDetails = false,
}: MaterialTraceabilityBadgeProps) {
  const getStatusIcon = () => {
    switch (qcStatus) {
      case 'passed':
        return <CheckCircle2 className="h-3 w-3 text-emerald-600" />;
      case 'failed':
        return <XCircle className="h-3 w-3 text-destructive" />;
      case 'hold':
        return <AlertTriangle className="h-3 w-3 text-amber-500" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const getStatusClass = () => {
    switch (qcStatus) {
      case 'passed':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400';
      case 'failed':
        return 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400';
      case 'hold':
        return 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };

  if (!materialGrade && !heatNo) {
    return null;
  }

  const content = (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs ${getStatusClass()}`}>
      {getStatusIcon()}
      <Beaker className="h-3 w-3" />
      <span className="font-medium">{materialGrade}</span>
      {heatNo && (
        <>
          <span className="text-muted-foreground">•</span>
          <span>{heatNo}</span>
        </>
      )}
    </div>
  );

  if (!showDetails) {
    return content;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-1 text-sm">
            <p><strong>Material Grade:</strong> {materialGrade || 'N/A'}</p>
            <p><strong>Heat/Lot No:</strong> {heatNo || 'N/A'}</p>
            {supplier && <p><strong>Supplier:</strong> {supplier}</p>}
            <p><strong>IQC Status:</strong> {qcStatus ? qcStatus.charAt(0).toUpperCase() + qcStatus.slice(1) : 'Pending'}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
