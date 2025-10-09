import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Upload } from "lucide-react";
import { format } from "date-fns";

interface ShipmentDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  onUpdate: () => void;
}

export function ShipmentDetailsDialog({ open, onOpenChange, shipmentId, onUpdate }: ShipmentDetailsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    transporter_name: "",
    lr_no: "",
    boxes: 0,
    gross_weight_kg: 0,
    net_weight_kg: 0,
    delivered_date: undefined as Date | undefined,
    ship_to_address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      country: "",
      postal_code: ""
    }
  });

  const handleSubmit = async () => {
    setLoading(true);
    try {
      // Note: Extended shipment fields will be available after migration approval
      toast({ 
        description: "⚠️ Extended shipment details require database migration approval",
        variant: "destructive" 
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Shipment Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Transporter Name</Label>
              <Input
                value={formData.transporter_name}
                onChange={(e) => setFormData({ ...formData, transporter_name: e.target.value })}
                placeholder="Enter transporter name"
              />
            </div>
            <div>
              <Label>LR Number</Label>
              <Input
                value={formData.lr_no}
                onChange={(e) => setFormData({ ...formData, lr_no: e.target.value })}
                placeholder="Enter LR number"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Boxes/Cartons</Label>
              <Input
                type="number"
                value={formData.boxes}
                onChange={(e) => setFormData({ ...formData, boxes: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Gross Weight (kg)</Label>
              <Input
                type="number"
                step="0.001"
                value={formData.gross_weight_kg}
                onChange={(e) => setFormData({ ...formData, gross_weight_kg: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Net Weight (kg)</Label>
              <Input
                type="number"
                step="0.001"
                value={formData.net_weight_kg}
                onChange={(e) => setFormData({ ...formData, net_weight_kg: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <Label>Delivery Date (POD)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.delivered_date ? format(formData.delivered_date, "PPP") : "Select delivery date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={formData.delivered_date}
                  onSelect={(date) => setFormData({ ...formData, delivered_date: date })}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <Label>Ship-To Address</Label>
            <div className="space-y-2 mt-2">
              <Input
                placeholder="Address Line 1"
                value={formData.ship_to_address.line1}
                onChange={(e) => setFormData({
                  ...formData,
                  ship_to_address: { ...formData.ship_to_address, line1: e.target.value }
                })}
              />
              <Input
                placeholder="Address Line 2"
                value={formData.ship_to_address.line2}
                onChange={(e) => setFormData({
                  ...formData,
                  ship_to_address: { ...formData.ship_to_address, line2: e.target.value }
                })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="City"
                  value={formData.ship_to_address.city}
                  onChange={(e) => setFormData({
                    ...formData,
                    ship_to_address: { ...formData.ship_to_address, city: e.target.value }
                  })}
                />
                <Input
                  placeholder="State"
                  value={formData.ship_to_address.state}
                  onChange={(e) => setFormData({
                    ...formData,
                    ship_to_address: { ...formData.ship_to_address, state: e.target.value }
                  })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Country"
                  value={formData.ship_to_address.country}
                  onChange={(e) => setFormData({
                    ...formData,
                    ship_to_address: { ...formData.ship_to_address, country: e.target.value }
                  })}
                />
                <Input
                  placeholder="Postal Code"
                  value={formData.ship_to_address.postal_code}
                  onChange={(e) => setFormData({
                    ...formData,
                    ship_to_address: { ...formData.ship_to_address, postal_code: e.target.value }
                  })}
                />
              </div>
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={loading} className="w-full">
            Update Shipment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
