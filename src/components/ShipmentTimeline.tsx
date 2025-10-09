import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Package, Truck, MapPin, CheckCircle, AlertTriangle } from "lucide-react";

interface ShipmentTimelineProps {
  shipmentId: string;
}

export function ShipmentTimeline({ shipmentId }: ShipmentTimelineProps) {
  const { toast } = useToast();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({
    event_type: "picked",
    details: ""
  });

  useEffect(() => {
    loadEvents();
  }, [shipmentId]);

  const loadEvents = async () => {
    // Note: shipment_events table will be available after migration approval
    // For now, using placeholder data
    setEvents([]);
  };

  const handleAddEvent = async () => {
    setLoading(true);
    try {
      // Note: This will work after the logistics migration is approved
      toast({ 
        description: "⚠️ Shipment events require database migration approval",
        variant: "destructive" 
      });
      setShowAddEvent(false);
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case "picked": return <Package className="h-4 w-4" />;
      case "in_transit": return <Truck className="h-4 w-4" />;
      case "out_for_delivery": return <MapPin className="h-4 w-4" />;
      case "delivered": return <CheckCircle className="h-4 w-4" />;
      case "exception": return <AlertTriangle className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "picked": return "bg-blue-500";
      case "in_transit": return "bg-yellow-500";
      case "out_for_delivery": return "bg-purple-500";
      case "delivered": return "bg-green-500";
      case "exception": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Shipment Timeline</CardTitle>
          <Button size="sm" onClick={() => setShowAddEvent(!showAddEvent)}>
            {showAddEvent ? "Cancel" : "Add Event"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showAddEvent && (
          <div className="space-y-4 mb-6 p-4 border rounded-lg bg-muted/50">
            <div>
              <Label>Event Type</Label>
              <Select value={newEvent.event_type} onValueChange={(value) => setNewEvent({ ...newEvent, event_type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="picked">Picked</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="out_for_delivery">Out for Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="exception">Exception</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Details / Notes</Label>
              <Textarea
                placeholder="Enter event details..."
                value={newEvent.details}
                onChange={(e) => setNewEvent({ ...newEvent, details: e.target.value })}
              />
            </div>
            <Button onClick={handleAddEvent} disabled={loading} className="w-full">
              Add Event
            </Button>
          </div>
        )}

        <div className="space-y-4">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No events recorded yet
            </p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`rounded-full p-2 ${getEventColor(event.event_type)} text-white`}>
                    {getEventIcon(event.event_type)}
                  </div>
                  <div className="w-px bg-border h-full mt-2" />
                </div>
                <div className="flex-1 pb-4">
                  <p className="font-medium capitalize">{event.event_type.replace(/_/g, " ")}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.event_time).toLocaleString()}
                  </p>
                  {event.details?.note && (
                    <p className="text-sm mt-2">{event.details.note}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
