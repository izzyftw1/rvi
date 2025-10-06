import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, AlertCircle } from "lucide-react";
import { NavigationHeader } from "@/components/NavigationHeader";

const WorkOrders = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const { data, error: queryError } = await supabase
        .from("work_orders")
        .select("*")
        .order("created_at", { ascending: false });

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
                onClick={() => navigate(`/work-orders/${wo.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {wo.wo_id || "—"}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {wo.customer || "—"} • {wo.item_code || "—"}
                      </p>
                    </div>
                    <Badge variant={getStatusVariant(wo.status || "pending")}>
                      {getStatusLabel(wo.status || "pending")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
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