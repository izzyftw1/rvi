import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { workOrderSchema } from "@/lib/validationSchemas";

const NewWorkOrder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [createdWO, setCreatedWO] = useState<any>(null);

  const [formData, setFormData] = useState({
    wo_id: "",
    customer: "",
    item_code: "",
    revision: "",
    quantity: "",
    due_date: "",
    priority: "3",
    sales_order: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate input data
      const validationResult = workOrderSchema.safeParse(formData);
      if (!validationResult.success) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: validationResult.error.errors[0].message,
        });
        setLoading(false);
        return;
      }

      const { data: woData, error } = await supabase.from("work_orders").insert({
        wo_id: formData.wo_id,
        customer: formData.customer,
        item_code: formData.item_code,
        revision: formData.revision || null,
        quantity: parseInt(formData.quantity),
        due_date: formData.due_date,
        priority: parseInt(formData.priority),
        sales_order: formData.sales_order || null,
        status: "pending",
      }).select().single();

      if (error) throw error;

      toast({
        title: "Work order created",
        description: `WO ${formData.wo_id} created successfully`,
      });

      setCreatedWO(woData);
      setShowQR(true);
      
      setTimeout(() => navigate("/work-orders"), 3000);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create work order",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="New Work Order" subtitle="Create a new production order" />
      
      <div className="max-w-3xl mx-auto p-4 space-y-6">

        <Card>
          <CardHeader>
            <CardTitle>Work Order Details</CardTitle>
            <CardDescription>Enter order information</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="wo_id">WO ID *</Label>
                  <Input
                    id="wo_id"
                    value={formData.wo_id}
                    onChange={(e) => setFormData({ ...formData, wo_id: e.target.value })}
                    placeholder="WO-2025-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customer">Customer *</Label>
                  <Input
                    id="customer"
                    value={formData.customer}
                    onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                    placeholder="Customer name"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="item_code">Item Code *</Label>
                  <Input
                    id="item_code"
                    value={formData.item_code}
                    onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                    placeholder="ITEM-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="revision">Revision</Label>
                  <Input
                    id="revision"
                    value={formData.revision}
                    onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
                    placeholder="Rev. A"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="due_date">Due Date *</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">P1 - Critical</SelectItem>
                      <SelectItem value="2">P2 - High</SelectItem>
                      <SelectItem value="3">P3 - Normal</SelectItem>
                      <SelectItem value="4">P4 - Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sales_order">Sales Order</Label>
                <Input
                  id="sales_order"
                  value={formData.sales_order}
                  onChange={(e) => setFormData({ ...formData, sales_order: e.target.value })}
                  placeholder="SO-2025-001"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                Create Work Order
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Work Order Created!</DialogTitle>
          </DialogHeader>
          {createdWO && (
            <div className="flex justify-center">
              <QRCodeDisplay 
                value={createdWO.wo_id}
                title="Work Order Traveler"
                entityInfo={`${createdWO.customer} | ${createdWO.item_code} | ${createdWO.quantity} pcs`}
                size={250}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NewWorkOrder;
