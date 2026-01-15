import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, ChevronDown, User, Clock, ArrowRight, Factory, ClipboardCheck, Truck, Settings } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

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

type Category = 'production' | 'qc' | 'external' | 'system';

const categoryConfig: Record<Category, { label: string; icon: React.ReactNode; color: string }> = {
  production: { 
    label: 'Production', 
    icon: <Factory className="h-4 w-4" />, 
    color: 'bg-blue-500/10 text-blue-600 border-blue-200' 
  },
  qc: { 
    label: 'Quality Control', 
    icon: <ClipboardCheck className="h-4 w-4" />, 
    color: 'bg-green-500/10 text-green-600 border-green-200' 
  },
  external: { 
    label: 'External Processing', 
    icon: <Truck className="h-4 w-4" />, 
    color: 'bg-orange-500/10 text-orange-600 border-orange-200' 
  },
  system: { 
    label: 'System', 
    icon: <Settings className="h-4 w-4" />, 
    color: 'bg-gray-500/10 text-gray-600 border-gray-200' 
  },
};

function categorizeAction(actionType: string, department: string): Category {
  const lowerAction = actionType.toLowerCase();
  const lowerDept = department.toLowerCase();
  
  if (lowerAction.includes('qc') || lowerAction.includes('inspection') || 
      lowerAction.includes('quality') || lowerDept.includes('quality')) {
    return 'qc';
  }
  if (lowerAction.includes('external') || lowerAction.includes('challan') || 
      lowerAction.includes('partner') || lowerDept.includes('external')) {
    return 'external';
  }
  if (lowerAction.includes('production') || lowerAction.includes('log') || 
      lowerAction.includes('machine') || lowerAction.includes('stage') ||
      lowerDept.includes('production') || lowerDept.includes('cnc')) {
    return 'production';
  }
  return 'system';
}

function formatActionType(actionType: string): string {
  return actionType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function extractChanges(details: any): { field: string; from: string; to: string }[] {
  if (!details || typeof details !== 'object') return [];
  
  const changes: { field: string; from: string; to: string }[] = [];
  
  // Handle explicit old/new structure
  if (details.old_value !== undefined && details.new_value !== undefined) {
    changes.push({
      field: details.field || 'Value',
      from: formatValue(details.old_value),
      to: formatValue(details.new_value)
    });
  }
  
  // Handle status changes
  if (details.previous_status && details.new_status) {
    changes.push({
      field: 'Status',
      from: formatValue(details.previous_status),
      to: formatValue(details.new_status)
    });
  }
  
  // Handle stage changes
  if (details.previous_stage && details.new_stage) {
    changes.push({
      field: 'Stage',
      from: formatValue(details.previous_stage),
      to: formatValue(details.new_stage)
    });
  }
  
  // Handle quantity changes
  if (details.quantity !== undefined) {
    changes.push({
      field: 'Quantity',
      from: '—',
      to: formatValue(details.quantity)
    });
  }
  
  if (details.qty_ok !== undefined) {
    changes.push({
      field: 'OK Quantity',
      from: '—',
      to: formatValue(details.qty_ok)
    });
  }
  
  if (details.qty_rejected !== undefined) {
    changes.push({
      field: 'Rejected',
      from: '—',
      to: formatValue(details.qty_rejected)
    });
  }
  
  // Handle machine assignment
  if (details.machine_id || details.machine_name) {
    changes.push({
      field: 'Machine',
      from: '—',
      to: details.machine_name || details.machine_id || 'Unknown'
    });
  }
  
  // Handle operator assignment
  if (details.operator_name || details.operator_id) {
    changes.push({
      field: 'Operator',
      from: '—',
      to: details.operator_name || details.operator_id || 'Unknown'
    });
  }
  
  // Handle external partner
  if (details.partner_name || details.partner_id) {
    changes.push({
      field: 'Partner',
      from: '—',
      to: details.partner_name || details.partner_id || 'Unknown'
    });
  }
  
  // Handle process/operation
  if (details.process || details.operation) {
    changes.push({
      field: 'Operation',
      from: '—',
      to: details.process || details.operation || 'Unknown'
    });
  }
  
  return changes;
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'object') {
    // Format dates if detected
    if (value instanceof Date) return format(value, 'dd MMM yyyy, HH:mm');
    return JSON.stringify(value);
  }
  // Check if it's an ISO date string
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    try {
      return format(new Date(value), 'dd MMM yyyy, HH:mm');
    } catch {
      return value;
    }
  }
  return String(value);
}

function formatFieldName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/Id$/, 'ID')
    .replace(/Qty/, 'Quantity');
}

function formatDetailsAsReadable(details: any): React.ReactNode {
  if (!details || typeof details !== 'object') {
    return <p className="text-muted-foreground">No additional details</p>;
  }
  
  const entries = Object.entries(details).filter(([key, value]) => 
    value !== null && value !== undefined && value !== ''
  );
  
  if (entries.length === 0) {
    return <p className="text-muted-foreground">No additional details</p>;
  }
  
  return (
    <div className="grid gap-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-start gap-2">
          <span className="text-muted-foreground min-w-[100px] shrink-0">{formatFieldName(key)}:</span>
          <span className="font-medium break-words">
            {typeof value === 'object' && value !== null 
              ? JSON.stringify(value, null, 2)
              : formatValue(value)
            }
          </span>
        </div>
      ))}
    </div>
  );
}

function getSummary(entry: AuditEntry): string {
  const details = entry.action_details || {};
  const action = entry.action_type.toLowerCase();
  
  // Production log entries
  if (action.includes('production_log') || action.includes('log_created')) {
    const qty = details.qty_ok || details.quantity || details.actual_quantity;
    const machine = details.machine_name || details.machine_id;
    if (qty && machine) return `Logged ${qty} pcs on ${machine}`;
    if (qty) return `Logged ${qty} pcs`;
    return 'Production log entry created';
  }
  
  // QC entries
  if (action.includes('qc_approved') || action.includes('first_piece')) {
    return details.result === 'pass' ? 'QC Approved' : 'QC inspection recorded';
  }
  if (action.includes('material_approved')) {
    return 'Material QC approved';
  }
  
  // Stage changes
  if (action.includes('stage_change') || action.includes('stage_update')) {
    if (details.new_stage) return `Stage changed to ${formatValue(details.new_stage)}`;
    return 'Stage updated';
  }
  
  // External processing
  if (action.includes('external_sent') || action.includes('challan_created')) {
    const partner = details.partner_name;
    const qty = details.quantity_sent || details.quantity;
    if (partner && qty) return `Sent ${qty} pcs to ${partner}`;
    if (partner) return `Sent to ${partner}`;
    return 'Sent for external processing';
  }
  if (action.includes('external_received') || action.includes('challan_received')) {
    const qty = details.quantity_returned || details.quantity;
    if (qty) return `Received ${qty} pcs from external`;
    return 'Received from external processing';
  }
  
  // Machine assignment
  if (action.includes('machine_assign')) {
    const machine = details.machine_name;
    if (machine) return `Assigned to ${machine}`;
    return 'Machine assigned';
  }
  
  // Status changes
  if (action.includes('status')) {
    if (details.new_status) return `Status: ${formatValue(details.new_status)}`;
  }
  
  // Release actions
  if (action.includes('release') || action.includes('unlock')) {
    return 'Production logging unlocked';
  }
  
  return formatActionType(entry.action_type);
}

function AuditEntryCard({ entry, isExpanded, onToggle }: { 
  entry: AuditEntry; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const changes = extractChanges(entry.action_details);
  const summary = getSummary(entry);
  const hasDetails = Object.keys(entry.action_details || {}).length > 0;
  
  return (
    <Card className="p-3 hover:bg-accent/30 transition-colors">
      <div className="space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{summary}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              <span>{entry.performer_name || 'System'}</span>
              <span className="text-muted-foreground/50">•</span>
              <Clock className="h-3 w-3" />
              <span>{format(new Date(entry.created_at), 'MMM dd, HH:mm')}</span>
            </div>
          </div>
          <Badge variant="outline" className="text-xs shrink-0">
            {entry.department}
          </Badge>
        </div>
        
        {/* Changes display */}
        {changes.length > 0 && (
          <div className="bg-muted/50 rounded-md p-2 space-y-1">
            {changes.slice(0, 3).map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-20 shrink-0">{change.field}:</span>
                <span className="text-muted-foreground">{change.from}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-medium">{change.to}</span>
              </div>
            ))}
            {changes.length > 3 && (
              <p className="text-xs text-muted-foreground">+{changes.length - 3} more changes</p>
            )}
          </div>
        )}
        
        {/* Expandable full details */}
        {hasDetails && (
          <Collapsible open={isExpanded} onOpenChange={onToggle}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs w-full justify-start">
                <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                {isExpanded ? 'Hide' : 'Show'} full details
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-3 bg-muted rounded-md text-xs space-y-2 max-h-48 overflow-y-auto">
                {formatDetailsAsReadable(entry.action_details)}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </Card>
  );
}

export function WOAuditTrailModal({ 
  open, 
  onOpenChange, 
  auditLog,
  woId 
}: WOAuditTrailModalProps) {
  const [expandedEntries, setExpandedEntries] = useState<Set<number>>(new Set());
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  
  const exportAsJSON = () => {
    const dataStr = JSON.stringify(auditLog, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `WO_${woId}_Audit_Trail_${format(new Date(), 'yyyy-MM-dd')}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const toggleExpanded = (index: number) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Categorize and group entries
  const categorizedEntries = auditLog.map((entry, index) => ({
    ...entry,
    index,
    category: categorizeAction(entry.action_type, entry.department)
  }));

  const categoryCounts = categorizedEntries.reduce((acc, entry) => {
    acc[entry.category] = (acc[entry.category] || 0) + 1;
    return acc;
  }, {} as Record<Category, number>);

  const filteredEntries = activeCategory === 'all' 
    ? categorizedEntries 
    : categorizedEntries.filter(e => e.category === activeCategory);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle>Audit Trail — WO {woId}</DialogTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={exportAsJSON}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </DialogHeader>
        
        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2 pb-3 border-b shrink-0">
          <Button
            variant={activeCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveCategory('all')}
            className="h-8"
          >
            All ({auditLog.length})
          </Button>
          {(Object.keys(categoryConfig) as Category[]).map(cat => {
            const config = categoryConfig[cat];
            const count = categoryCounts[cat] || 0;
            if (count === 0) return null;
            return (
              <Button
                key={cat}
                variant={activeCategory === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(cat)}
                className={`h-8 gap-1.5 ${activeCategory !== cat ? config.color : ''}`}
              >
                {config.icon}
                {config.label} ({count})
              </Button>
            );
          })}
        </div>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-2 py-2">
            {filteredEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No events in this category
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <AuditEntryCard
                  key={entry.index}
                  entry={entry}
                  isExpanded={expandedEntries.has(entry.index)}
                  onToggle={() => toggleExpanded(entry.index)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
