import { memo, useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Factory, 
  CheckCircle2, 
  Box, 
  Truck, 
  Warehouse,
  TrendingUp,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WOQuantityProgressProps {
  woId: string;
  orderedQty: number;
  itemCode?: string;
  className?: string;
}

interface StageQuantities {
  produced: number;
  qcApproved: number;
  packed: number;
  dispatched: number;
  inInventory: number;
}

interface StageConfig {
  key: keyof StageQuantities;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}

const STAGES: StageConfig[] = [
  { 
    key: 'produced', 
    label: 'Produced', 
    icon: Factory, 
    color: 'text-blue-600',
    bgColor: 'bg-blue-500',
    description: 'Total quantity produced across all batches'
  },
  { 
    key: 'qcApproved', 
    label: 'QC Approved', 
    icon: CheckCircle2, 
    color: 'text-green-600',
    bgColor: 'bg-green-500',
    description: 'Quantity passed Dispatch QC inspection'
  },
  { 
    key: 'packed', 
    label: 'Packed', 
    icon: Box, 
    color: 'text-amber-600',
    bgColor: 'bg-amber-500',
    description: 'Quantity packed in cartons, ready for dispatch'
  },
  { 
    key: 'dispatched', 
    label: 'Dispatched', 
    icon: Truck, 
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500',
    description: 'Quantity shipped to customer'
  },
  { 
    key: 'inInventory', 
    label: 'In Inventory', 
    icon: Warehouse, 
    color: 'text-purple-600',
    bgColor: 'bg-purple-500',
    description: 'Excess quantity stored as finished goods'
  },
];

export const WOQuantityProgress = memo(function WOQuantityProgress({
  woId,
  orderedQty,
  itemCode,
  className,
}: WOQuantityProgressProps) {
  const [quantities, setQuantities] = useState<StageQuantities>({
    produced: 0,
    qcApproved: 0,
    packed: 0,
    dispatched: 0,
    inInventory: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadQuantities = useCallback(async () => {
    try {
      // Fetch batch-level data
      const { data: batches } = await supabase
        .from('production_batches')
        .select('produced_qty, qc_approved_qty, dispatched_qty')
        .eq('wo_id', woId);

      // Fetch packed quantity from cartons
      const { data: cartons } = await supabase
        .from('cartons')
        .select('quantity')
        .eq('wo_id', woId);

      // Fetch inventory quantity (excess/overproduction)
      const { data: inventory } = await supabase
        .from('finished_goods_inventory')
        .select('quantity_available')
        .eq('work_order_id', woId);

      // Also check by item_code for general inventory
      let inventoryByItem = 0;
      if (itemCode) {
        const { data: itemInventory } = await supabase
          .from('finished_goods_inventory')
          .select('quantity_available')
          .eq('item_code', itemCode)
          .is('work_order_id', null);
        
        inventoryByItem = itemInventory?.reduce((sum, i) => sum + (i.quantity_available || 0), 0) || 0;
      }

      const produced = batches?.reduce((sum, b) => sum + (b.produced_qty || 0), 0) || 0;
      const qcApproved = batches?.reduce((sum, b) => sum + (b.qc_approved_qty || 0), 0) || 0;
      const packed = cartons?.reduce((sum, c) => sum + (c.quantity || 0), 0) || 0;
      const dispatched = batches?.reduce((sum, b) => sum + (b.dispatched_qty || 0), 0) || 0;
      const inInventory = (inventory?.reduce((sum, i) => sum + (i.quantity_available || 0), 0) || 0) + inventoryByItem;

      setQuantities({
        produced,
        qcApproved,
        packed,
        dispatched,
        inInventory,
      });
    } catch (error) {
      console.error('Error loading WO quantities:', error);
    } finally {
      setLoading(false);
    }
  }, [woId, itemCode]);

  useEffect(() => {
    loadQuantities();

    // Real-time subscriptions
    const channel = supabase
      .channel(`wo_qty_progress_${woId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches', filter: `wo_id=eq.${woId}` }, loadQuantities)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons', filter: `wo_id=eq.${woId}` }, loadQuantities)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatches', filter: `wo_id=eq.${woId}` }, loadQuantities)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadQuantities]);

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Calculate percentages for each stage (independent, not cumulative)
  const getPercentage = (qty: number) => orderedQty > 0 ? Math.min(100, (qty / orderedQty) * 100) : 0;
  
  // Remaining to fulfill = ordered - dispatched
  const remaining = Math.max(0, orderedQty - quantities.dispatched);
  const fulfillmentPct = getPercentage(quantities.dispatched);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Quantity Progress
          <Badge variant="outline" className="ml-auto font-normal">
            {fulfillmentPct.toFixed(0)}% Fulfilled
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stage Bars - Independent quantities */}
        <TooltipProvider delayDuration={200}>
          <div className="space-y-3">
            {STAGES.map((stage) => {
              const qty = quantities[stage.key];
              const pct = getPercentage(qty);
              const Icon = stage.icon;
              
              // Don't show inventory if zero
              if (stage.key === 'inInventory' && qty === 0) return null;

              return (
                <Tooltip key={stage.key}>
                  <TooltipTrigger asChild>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", stage.color)} />
                          <span className="font-medium">{stage.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("font-bold", stage.color)}>
                            {qty.toLocaleString()}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            / {orderedQty.toLocaleString()}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-xs px-1.5 min-w-[45px] justify-center",
                              pct >= 100 && "bg-green-500/10 text-green-600 border-green-500/20"
                            )}
                          >
                            {pct.toFixed(0)}%
                          </Badge>
                        </div>
                      </div>
                      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
                            stage.bgColor
                          )}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                        {/* Overflow indicator for > 100% */}
                        {pct > 100 && (
                          <div 
                            className="absolute inset-y-0 right-0 bg-purple-500/50 rounded-r-full"
                            style={{ width: `${Math.min(20, pct - 100)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <p className="font-medium">{stage.label}</p>
                    <p className="text-xs text-muted-foreground">{stage.description}</p>
                    <p className="text-xs mt-1">
                      {qty.toLocaleString()} of {orderedQty.toLocaleString()} ({pct.toFixed(1)}%)
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Summary Footer */}
        <div className="pt-3 border-t flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-muted-foreground">Ordered: </span>
              <span className="font-bold">{orderedQty.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Remaining: </span>
              <span className={cn(
                "font-bold",
                remaining === 0 ? "text-green-600" : "text-amber-600"
              )}>
                {remaining.toLocaleString()}
              </span>
            </div>
          </div>
          {remaining === 0 && (
            <Badge className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Order Complete
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
