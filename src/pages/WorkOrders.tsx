import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertCircle, Trash2 } from "lucide-react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { useToast } from "@/hooks/use-toast";

const WorkOrders = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadWorkOrders();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('work_orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        loadWorkOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadWorkOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load work orders
      const { data: workOrders, error: queryError } = await supabase
        .from("work_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      // Load related sales orders and line items
      const salesOrderIds = [...new Set(workOrders?.map(wo => wo.sales_order).filter(Boolean))] as string[];
      
      let salesOrdersMap: any = {};
      let lineItemsMap: any = {};

      if (salesOrderIds.length > 0) {
        const { data: salesOrders } = await supabase
          .from("sales_orders")
          .select("id, so_id, customer")
          .in("id", salesOrderIds);
        
        salesOrdersMap = Object.fromEntries((salesOrders || []).map(so => [so.id, so]));

        const { data: lineItems } = await supabase
          .from("sales_order_line_items" as any)
          .select("*")
          .in("sales_order_id", salesOrderIds);
        
        // Map line items by work_order_id
        lineItemsMap = Object.fromEntries(
          (lineItems || [])
            .filter((li: any) => li.work_order_id)
            .map((li: any) => [li.work_order_id, li])
        );
      }

      // Combine data
      const data = workOrders?.map(wo => ({
        ...wo,
        sales_order: wo.sales_order ? salesOrdersMap[wo.sales_order] : null,
        line_item: wo.id ? lineItemsMap[wo.id] : null
      }));

      if (queryError) {
        throw queryError;
      }

      setWorkOrders(data || []);
    } catch (err: any) {
      console.error("Error loading work orders:", err);
      setError(err.message || "Failed to load work orders");
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityVariant = (priority: number) => {
    if (priority <= 2) return "destructive";
    return "secondary";
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "in_progress":
        return "secondary";
      case "cancelled":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getStatusLabel = (status: string) => {
    // Map status values to display labels
    switch (status) {
      case "in_progress":
        return "In Progress";
      case "pending":
        return "Pending";
      case "completed":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  const handleDeleteWorkOrder = async (woId: string, displayId: string) => {
    if (!confirm(`Are you sure you want to delete Work Order ${displayId}? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("work_orders")
        .delete()
        .eq("id", woId);

      if (error) throw error;

      toast({ description: `Work Order ${displayId} deleted successfully` });
      await loadWorkOrders();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Delete failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Work Orders</h1>
            <p className="text-sm text-muted-foreground">Manage production orders</p>
          </div>
          <Button onClick={() => navigate("/work-orders/new")}>
            <Plus className="h-4 w-4 mr-2" />
            New Work Order
          </Button>
        </div>

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">Error loading Work Orders</p>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadWorkOrders}
                className="mt-4"
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {loading && !error && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Loading work orders...</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && workOrders.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <p className="text-lg font-medium">No Work Orders Yet</p>
              <p className="text-sm text-muted-foreground">
                Work orders will appear here when created
              </p>
              <Button 
                onClick={() => navigate("/work-orders/new")}
                className="mt-4"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create First Work Order
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && !error && workOrders.length > 0 && (
          <div className="grid gap-4">
            {workOrders.map((wo) => (
              <Card
                key={wo.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div onClick={() => navigate(`/work-orders/${wo.id}`)} className="flex-1 cursor-pointer">
                      <CardTitle className="text-lg">
                        {wo.display_id || wo.wo_id || "—"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {wo.customer || "—"} • {wo.item_code || "—"}
                        {wo.customer_po && ` • PO: ${wo.customer_po}`}
                      </p>
                      {wo.sales_order && (
                        <p className="text-xs text-muted-foreground mt-1">
                          From SO: {wo.sales_order.so_id}
                          {wo.line_item && ` • Line #${wo.line_item.line_number}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusVariant(wo.status || "pending")}>
                        {getStatusLabel(wo.status || "pending")}
                      </Badge>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteWorkOrder(wo.id, wo.display_id || wo.wo_id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent onClick={() => navigate(`/work-orders/${wo.id}`)} className="cursor-pointer">
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Quantity</p>
                      <p className="font-medium">{wo.quantity || 0} pcs</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Due Date</p>
                      <p className="font-medium">
                        {wo.due_date 
                          ? new Date(wo.due_date).toLocaleDateString() 
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Priority</p>
                      <Badge variant={getPriorityVariant(wo.priority || 3)}>
                        P{wo.priority || 3}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Stage</p>
                      <p className="font-medium capitalize">
                        {wo.current_stage?.replace(/_/g, " ") || "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkOrders;