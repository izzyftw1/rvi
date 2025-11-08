import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Package, Building2, Factory, TruckIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface MaterialMovement {
  id: string;
  process_type: string;
  movement_type: 'out' | 'in';
  qty: number;
  weight: number;
  partner_id: string | null;
  timestamp: string;
  remarks: string | null;
  partner?: {
    name: string;
  };
}

interface MaterialMovementTimelineProps {
  workOrderId: string;
}

export const MaterialMovementTimeline = ({ workOrderId }: MaterialMovementTimelineProps) => {
  const [movements, setMovements] = useState<MaterialMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMovements();

    // Set up real-time subscription
    const channel = supabase
      .channel('material_movements_timeline')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'material_movements',
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
      const { data, error } = await supabase
        .from("material_movements")
        .select(`
          *,
          partner:external_partners(name)
        `)
        .eq("work_order_id", workOrderId)
        .order("timestamp", { ascending: true });

      if (error) throw error;

      setMovements((data as any) || []);
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
    if (movement.movement_type === 'out') {
      return <TruckIcon className="h-4 w-4" />;
    }
    return <Factory className="h-4 w-4" />;
  };

  const getLocationLabel = (movement: MaterialMovement) => {
    if (movement.movement_type === 'out') {
      return movement.partner?.name || 'External Partner';
    }
    return 'Factory';
  };

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
            const isOut = movement.movement_type === 'out';
            const nextMovement = movements[index + 1];
            const hasNext = !!nextMovement;

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
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(movement.timestamp), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {movement.process_type}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          <span>{getLocationLabel(movement)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-medium">
                            {movement.qty} pcs
                          </span>
                          {movement.weight && (
                            <span className="text-muted-foreground">
                              {movement.weight.toFixed(2)} kg
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
                      <span className="text-xs">In transit</span>
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
              {movements[movements.length - 1]?.movement_type === 'out'
                ? 'Awaiting return from external processing...'
                : 'Material available at factory'}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
