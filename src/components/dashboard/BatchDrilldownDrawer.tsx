/**
 * BatchDrilldownDrawer - Batch-Level Stage Details
 * 
 * Shows all batches in a stage with:
 * - Batch ID
 * - Work Order link
 * - Quantity
 * - Partner (for external)
 * - Age in stage
 * 
 * SINGLE SOURCE OF TRUTH: All data from production_batches
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowRight, 
  Clock, 
  Package, 
  Factory, 
  Truck, 
  CheckCircle, 
  Scissors,
  AlertTriangle,
  Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInHours, differenceInDays, formatDistanceToNow } from "date-fns";

interface BatchRecord {
  id: string;
  wo_id: string;
  batch_number: number;
  batch_quantity: number;
  stage_type: string;
  batch_status: string;
  stage_entered_at: string | null;
  external_process_type: string | null;
  external_partner_id: string | null;
  work_order?: {
    wo_id: string;
    display_id: string;
    customer: string;
    item_code: string;
    due_date: string | null;
  };
  external_partner?: {
    id: string;
    name: string;
  } | null;
}

interface BatchDrilldownDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageType: string;
  stageLabel: string;
  processType?: string; // For external filtering
}

const STAGE_ICONS: Record<string, React.ElementType> = {
  cutting: Scissors,
  production: Factory,
  external: Truck,
  qc: CheckCircle,
  packing: Package,
};

const STATUS_COLORS: Record<string, string> = {
  in_queue: "bg-slate-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
};

export const BatchDrilldownDrawer = ({ 
  open, 
  onOpenChange, 
  stageType, 
  stageLabel,
  processType 
}: BatchDrilldownDrawerProps) => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBatches = useCallback(async () => {
    if (!open) return;
    
    try {
      setLoading(true);
      
      let query = supabase
        .from('production_batches')
        .select(`
          id,
          wo_id,
          batch_number,
          batch_quantity,
          stage_type,
          batch_status,
          stage_entered_at,
          external_process_type,
          external_partner_id,
          work_orders!production_batches_wo_id_fkey (
            wo_id,
            display_id,
            customer,
            item_code,
            due_date
          ),
          external_partners!production_batches_external_partner_id_fkey (
            id,
            name
          )
        `)
        .eq('stage_type', stageType as any)
        .is('ended_at', null)
        .order('stage_entered_at', { ascending: true });

      // Filter by process type for external
      if (stageType === 'external' && processType) {
        query = query.eq('external_process_type', processType);
      }

      const { data, error } = await query;

      if (error) throw error;

      const mapped: BatchRecord[] = (data || []).map((b: any) => ({
        id: b.id,
        wo_id: b.wo_id,
        batch_number: b.batch_number,
        batch_quantity: b.batch_quantity || 0,
        stage_type: b.stage_type,
        batch_status: b.batch_status || 'in_queue',
        stage_entered_at: b.stage_entered_at,
        external_process_type: b.external_process_type,
        external_partner_id: b.external_partner_id,
        work_order: b.work_orders,
        external_partner: b.external_partners,
      }));

      setBatches(mapped);
    } catch (error) {
      console.error('Error loading batch details:', error);
    } finally {
      setLoading(false);
    }
  }, [open, stageType, processType]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  // Calculate age in hours/days
  const getAge = (stageEnteredAt: string | null) => {
    if (!stageEnteredAt) return { hours: 0, label: 'Unknown' };
    const hours = differenceInHours(new Date(), new Date(stageEnteredAt));
    const days = differenceInDays(new Date(), new Date(stageEnteredAt));
    return {
      hours,
      label: days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`,
      isAging: hours > 24,
      isCritical: hours > 48
    };
  };

  const Icon = STAGE_ICONS[stageType] || Package;
  const totalQty = batches.reduce((sum, b) => sum + b.batch_quantity, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            {stageLabel}
            {processType && (
              <Badge variant="secondary" className="text-xs">
                {processType}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="flex items-center gap-4">
            <span>{batches.length} batches</span>
            <span className="text-foreground font-medium">{totalQty.toLocaleString()} pcs</span>
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-10rem)] mt-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No batches in this stage</p>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => {
                const age = getAge(batch.stage_entered_at);
                const isOverdue = batch.work_order?.due_date && 
                  new Date(batch.work_order.due_date) < new Date();

                return (
                  <div
                    key={batch.id}
                    className={cn(
                      "p-3 rounded-lg border transition-all hover:shadow-md cursor-pointer",
                      isOverdue && "border-destructive/40 bg-destructive/5",
                      age.isCritical && !isOverdue && "border-amber-500/40 bg-amber-500/5"
                    )}
                    onClick={() => navigate(`/work-orders/${batch.wo_id}`)}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={cn("text-[10px] px-1.5 py-0 text-white", STATUS_COLORS[batch.batch_status])}
                        >
                          B{batch.batch_number}
                        </Badge>
                        <span className="text-sm font-medium">
                          {batch.work_order?.display_id || batch.work_order?.wo_id || 'Unknown WO'}
                        </span>
                        {isOverdue && (
                          <Badge variant="destructive" className="text-[9px] px-1 py-0">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            Late
                          </Badge>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Qty:</span>
                        <span className="font-medium ml-1">{batch.batch_quantity.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Age:</span>
                        <span className={cn(
                          "font-medium ml-1",
                          age.isCritical && "text-destructive",
                          age.isAging && !age.isCritical && "text-amber-600"
                        )}>
                          {age.label}
                        </span>
                      </div>
                      <div className="text-right">
                        <Badge 
                          variant="outline" 
                          className="text-[9px] px-1 py-0 capitalize"
                        >
                          {batch.batch_status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>

                    {/* Customer & Item */}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate">{batch.work_order?.customer || 'Unknown'}</span>
                      <span>•</span>
                      <span className="truncate">{batch.work_order?.item_code || 'Unknown'}</span>
                    </div>

                    {/* External Partner (if applicable) */}
                    {stageType === 'external' && batch.external_partner && (
                      <div className="mt-2 flex items-center gap-1 text-[11px]">
                        <Building2 className="h-3 w-3 text-purple-500" />
                        <span className="text-purple-600 font-medium">
                          {batch.external_partner.name}
                        </span>
                        {batch.external_process_type && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                            {batch.external_process_type}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="absolute bottom-4 left-4 right-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              onOpenChange(false);
              navigate(`/work-orders?stage=${stageType}${processType ? `&process=${processType}` : ''}`);
            }}
          >
            View in Work Orders
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
