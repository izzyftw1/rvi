import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Package, Building2, Factory, TruckIcon, Inbox, Send, Scale } from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface MaterialMovement {
  id: string;
  direction: 'in' | 'out';
  material_type: string;
  process_type: string | null;
  net_weight_kg: number;
  estimated_pcs: number | null;
  partner_name: string | null;
  challan_no: string | null;
  entry_time: string;
  remarks: string | null;
  gate_entry_no: string;
}

interface MaterialMovementTimelineProps {
  workOrderId: string;
}

export const MaterialMovementTimeline = ({ workOrderId }: MaterialMovementTimelineProps) => {
  const [movements, setMovements] = useState<MaterialMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovements();

    // Set up real-time subscription to gate_register
    const channel = supabase
      .channel(`material_movements_timeline_${workOrderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gate_register',
          filter: `work_order_id=eq.${workOrderId}`,
        },
        () => {
          loadMovements();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  const loadMovements = async () => {
    try {
      setLoading(true);
      
      // Fetch from gate_register which is the source of truth for goods movements
      const { data, error } = await supabase
        .from("gate_register")
        .select(`
          id,
          gate_entry_no,
          direction,
          material_type,
          process_type,
          net_weight_kg,
          estimated_pcs,
          challan_no,
          entry_time,
          remarks,
          partner_id
        `)
        .eq("work_order_id", workOrderId)
        .order("entry_time", { ascending: true });

      if (error) throw error;

      // Fetch partner names
      const partnerIds = [...new Set((data || []).map((e: any) => e.partner_id).filter(Boolean))];
      let partnersMap: Record<string, string> = {};
      
      if (partnerIds.length > 0) {
        const { data: partnersData } = await supabase
          .from("external_partners")
          .select("id, name")
          .in("id", partnerIds);
        
        (partnersData || []).forEach((p: any) => {
          partnersMap[p.id] = p.name;
        });
      }

      const mapped: MaterialMovement[] = (data || []).map((e: any) => ({
        id: e.id,
        direction: (e.direction || 'in').toLowerCase() as 'in' | 'out',
        material_type: e.material_type,
        process_type: e.process_type,
        net_weight_kg: e.net_weight_kg || 0,
        estimated_pcs: e.estimated_pcs,
        partner_name: e.partner_id ? partnersMap[e.partner_id] || null : null,
        challan_no: e.challan_no,
        entry_time: e.entry_time,
        remarks: e.remarks,
        gate_entry_no: e.gate_entry_no,
      }));

      setMovements(mapped);
    } catch (error) {
      console.error("Error loading material movements:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Material Movement Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (movements.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Material Movement Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No material movements recorded yet
          </p>
        </CardContent>
      </Card>
    );
  }

  const getIcon = (movement: MaterialMovement) => {
    if (movement.direction === 'out') {
      return <Send className="h-4 w-4" />;
    }
    return <Inbox className="h-4 w-4" />;
  };

  const getLocationLabel = (movement: MaterialMovement) => {
    if (movement.direction === 'out') {
      return movement.partner_name || 'External Partner';
    }
    return 'Factory';
  };

  // Calculate running totals
  let runningIn = 0;
  let runningOut = 0;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Package className="h-4 w-4" />
          Material Movement Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative space-y-4">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          {movements.map((movement, index) => {
            const isOut = movement.direction === 'out';
            const hasNext = index < movements.length - 1;
            
            // Update running totals
            if (isOut) {
              runningOut += movement.net_weight_kg;
            } else {
              runningIn += movement.net_weight_kg;
            }

            return (
              <div key={movement.id} className="relative pl-10">
                {/* Timeline dot */}
                <div
                  className={cn(
                    "absolute left-2 w-4 h-4 rounded-full border-2 border-background z-10",
                    isOut
                      ? "bg-amber-500"
                      : "bg-green-500"
                  )}
                />

                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={isOut ? "outline" : "default"}
                          className={cn(
                            "gap-1",
                            isOut
                              ? "border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/30"
                              : "bg-green-600 text-white"
                          )}
                        >
                          {getIcon(movement)}
                          {isOut ? 'Sent Out' : 'Received'}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {movement.gate_entry_no}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(movement.entry_time), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-medium capitalize">
                          {movement.process_type?.replace(/_/g, ' ') || movement.material_type?.replace(/_/g, ' ')}
                        </p>
                        {movement.partner_name && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>{getLocationLabel(movement)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-medium flex items-center gap-1">
                            <Scale className="h-3 w-3" />
                            {movement.net_weight_kg.toFixed(2)} kg
                          </span>
                          {movement.estimated_pcs && (
                            <span className="text-muted-foreground">
                              ~{movement.estimated_pcs.toLocaleString()} pcs
                            </span>
                          )}
                          {movement.challan_no && (
                            <span className="text-muted-foreground">
                              DC: {movement.challan_no}
                            </span>
                          )}
                        </div>
                        {movement.remarks && (
                          <p className="text-xs text-muted-foreground italic mt-1">
                            {movement.remarks}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Arrow to next movement */}
                  {hasNext && (
                    <div className="flex items-center gap-2 ml-4 my-2 text-muted-foreground">
                      <ArrowRight className="h-3 w-3" />
                      <span className="text-xs">
                        {isOut ? 'At external partner...' : 'Processing...'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Current status indicator */}
          <div className="relative pl-10 opacity-50">
            <div className="absolute left-2 w-4 h-4 rounded-full border-2 border-dashed border-muted-foreground bg-background z-10" />
            <div className="text-xs text-muted-foreground">
              {movements[movements.length - 1]?.direction === 'out'
                ? 'Awaiting return from external processing...'
                : 'Material available at factory'}
            </div>
          </div>
          
          {/* Summary */}
          <div className="mt-4 pt-4 border-t flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <Inbox className="h-3 w-3 text-green-600" />
              <span>Total In: <strong>{runningIn.toFixed(2)} kg</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <Send className="h-3 w-3 text-amber-600" />
              <span>Total Out: <strong>{runningOut.toFixed(2)} kg</strong></span>
            </div>
            <div className="flex items-center gap-1">
              <Scale className="h-3 w-3 text-blue-600" />
              <span>Net: <strong>{(runningIn - runningOut).toFixed(2)} kg</strong></span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
