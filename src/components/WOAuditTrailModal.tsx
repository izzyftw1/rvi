import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";

interface AuditEntry {
  created_at: string;
  action_type: string;
  department: string;
  performed_by?: string;
  performer_name?: string;
  action_details: any;
  reference_type?: string;
}

interface WOAuditTrailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  auditLog: AuditEntry[];
  woId: string;
}

export function WOAuditTrailModal({ 
  open, 
  onOpenChange, 
  auditLog,
  woId 
}: WOAuditTrailModalProps) {
  const exportAsJSON = () => {
    const dataStr = JSON.stringify(auditLog, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `WO_${woId}_Audit_Trail_${format(new Date(), 'yyyy-MM-dd')}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const getActionBadgeColor = (actionType: string) => {
    if (actionType.includes('qc')) return 'default';
    if (actionType.includes('production')) return 'secondary';
    if (actionType.includes('stage')) return 'outline';
    if (actionType.includes('material')) return 'default';
    return 'outline';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Full Audit Trail - WO {woId}</DialogTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={exportAsJSON}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export JSON
            </Button>
          </div>
        </DialogHeader>
        
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-3">
            {auditLog.map((entry, index) => (
              <div 
                key={index}
                className="border rounded-lg p-4 space-y-2 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={getActionBadgeColor(entry.action_type)}>
                      {entry.action_type.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                    <span className="text-sm font-medium">{entry.department}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.created_at), 'MMM dd, yyyy HH:mm:ss')}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Performed by:</span>
                  <span className="font-medium">{entry.performer_name || 'System'}</span>
                </div>
                
                {entry.reference_type && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Reference:</span>
                    <Badge variant="outline" className="text-xs">
                      {entry.reference_type}
                    </Badge>
                  </div>
                )}
                
                <details className="mt-2">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    View Details
                  </summary>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                    {JSON.stringify(entry.action_details, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
