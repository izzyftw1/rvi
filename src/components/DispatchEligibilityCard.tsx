import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, Archive, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface DispatchSource {
  type: 'packing' | 'inventory';
  label: string;
  quantity: number;
  details?: string;
}

interface DispatchEligibilityCardProps {
  woId: string;
  itemCode: string;
  customerName?: string;
}

export function DispatchEligibilityCard({ woId, itemCode, customerName }: DispatchEligibilityCardProps) {
  const [loading, setLoading] = useState(true);
  const [packingQty, setPackingQty] = useState(0);
  const [inventoryQty, setInventoryQty] = useState(0);
  const [dispatchedQty, setDispatchedQty] = useState(0);
  const [packingBatches, setPackingBatches] = useState(0);

  useEffect(() => {
    loadDispatchEligibility();
  }, [woId, itemCode]);

  const loadDispatchEligibility = async () => {
    setLoading(true);
    try {
      // Get packed quantity from cartons (ready for dispatch)
      const { data: cartonData } = await supabase
        .from("cartons")
        .select("id, quantity, status")
        .eq("wo_id", woId)
        .eq("status", "ready_for_dispatch");

      const cartonIds = (cartonData || []).map(c => c.id);
      const packedTotal = (cartonData || []).reduce((sum, c) => sum + (c.quantity || 0), 0);
      setPackingBatches((cartonData || []).length);

      // Get already dispatched quantity from dispatches table (CANONICAL SOURCE)
      let dispatchedFromCartons = 0;
      if (cartonIds.length > 0) {
        const { data: cartonDispatches } = await supabase
          .from("dispatches")
          .select("quantity")
          .in("carton_id", cartonIds);
        
        dispatchedFromCartons = (cartonDispatches || []).reduce((sum, d) => sum + (d.quantity || 0), 0);
      }

      // Available from packing = packed - already dispatched from those cartons
      setPackingQty(Math.max(0, packedTotal - dispatchedFromCartons));

      // Get finished goods inventory for this item (overproduction/returns)
      const { data: inventoryData } = await supabase
        .from("finished_goods_inventory")
        .select("quantity_available")
        .eq("item_code", itemCode)
        .gt("quantity_available", 0);

      const inventoryTotal = (inventoryData || []).reduce((sum, i) => sum + (i.quantity_available || 0), 0);
      setInventoryQty(inventoryTotal);

      // Get total dispatched quantity for this WO from dispatches table (CANONICAL SOURCE)
      const { data: dispatchData } = await supabase
        .from("dispatches")
        .select("quantity")
        .eq("wo_id", woId);

      const dispatchedTotal = (dispatchData || []).reduce((sum, d) => sum + (d.quantity || 0), 0);
      setDispatchedQty(dispatchedTotal);
    } catch (error) {
      console.error("Error loading dispatch eligibility:", error);
    } finally {
      setLoading(false);
    }
  };

  const totalReadyForDispatch = packingQty + inventoryQty;
  const hasPackingSource = packingQty > 0;
  const hasInventorySource = inventoryQty > 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-16 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Dispatch Eligibility
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Ready for Dispatch Summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {totalReadyForDispatch > 0 ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <Clock className="h-5 w-5 text-muted-foreground" />
            )}
            <span className="font-medium">Ready for Dispatch:</span>
          </div>
          <div className="text-right">
            <span className={`text-2xl font-bold ${totalReadyForDispatch > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
              {totalReadyForDispatch.toLocaleString()}
            </span>
            <span className="text-sm text-muted-foreground ml-1">pcs</span>
          </div>
        </div>

        {/* Source Breakdown */}
        {totalReadyForDispatch > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Source Breakdown</p>
            
            {hasPackingSource && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">Packing Batches</span>
                  <Badge variant="outline" className="text-xs">{packingBatches} batch{packingBatches !== 1 ? 'es' : ''}</Badge>
                </div>
                <span className="font-semibold">{packingQty.toLocaleString()} pcs</span>
              </div>
            )}

            {hasInventorySource && (
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Archive className="h-4 w-4 text-amber-600" />
                  <span className="text-sm">Finished Goods Inventory</span>
                </div>
                <span className="font-semibold">{inventoryQty.toLocaleString()} pcs</span>
              </div>
            )}
          </div>
        )}

        {/* Already Dispatched */}
        {dispatchedQty > 0 && (
          <div className="flex items-center justify-between text-sm pt-2 border-t">
            <span className="text-muted-foreground">Already Dispatched:</span>
            <span className="font-medium">{dispatchedQty.toLocaleString()} pcs</span>
          </div>
        )}

        {/* Empty State */}
        {totalReadyForDispatch === 0 && (
          <div className="rounded-lg border border-dashed p-3 text-center">
            <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No quantity ready for dispatch yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Complete packing or check finished goods inventory.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
