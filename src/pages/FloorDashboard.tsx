import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

const FloorDashboard = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkOrders();

    const channel = supabase
      .channel("work-orders-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => loadWorkOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadWorkOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("work_orders")
        .select(`
          *,
          sales_order:sales_orders(so_id, customer, po_number)
        `)
        .in("status", ["pending", "in_progress"])
        .order("due_date", { ascending: true });

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (error: any) {
      console.error("Error loading work orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      goods_in: "bg-blue-500",
      material_prep: "bg-purple-500",
      production: "bg-orange-500",
      qc: "bg-yellow-500",
      packing: "bg-green-500",
      dispatch: "bg-indigo-500",
    };
    return colors[stage] || "bg-gray-500";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pending: "secondary",
      in_progress: "default",
      completed: "success",
      on_hold: "destructive",
    };
    return variants[status] || "secondary";
  };

  const groupByStage = (wos: any[]) => {
    const stages = [
      "goods_in",
      "material_prep",
      "production",
      "qc",
      "packing",
      "dispatch",
    ];

    return stages.map((stage) => ({
      stage,
      label: stage.replace(/_/g, " ").toUpperCase(),
      orders: wos.filter((wo) => wo.current_stage === stage),
    }));
  };

  const stageGroups = groupByStage(workOrders);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Live Floor Dashboard" 
        subtitle="Real-time view of all work orders by stage" 
      />

      <div className="p-6 space-y-6">
        <Tabs defaultValue="kanban" className="w-full">
          <TabsList>
            <TabsTrigger value="kanban">Kanban View</TabsTrigger>
            <TabsTrigger value="table">Table View</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban" className="mt-6">
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                {stageGroups.map((group) => (
                  <Card key={group.stage} className="flex flex-col">
                    <CardHeader className={`${getStageColor(group.stage)} text-white`}>
                      <CardTitle className="text-sm font-medium">
                        {group.label}
                        <Badge variant="secondary" className="ml-2 bg-white text-black">
                          {group.orders.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 p-2 space-y-2">
                      {group.orders.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-4">
                          No orders
                        </div>
                      ) : (
                        group.orders.map((wo) => (
                          <Card
                            key={wo.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => navigate(`/work-order/${wo.id}`)}
                          >
                            <CardContent className="p-3">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-semibold truncate">
                                    {wo.display_id || wo.wo_id}
                                  </p>
                                  <Badge variant={getStatusBadge(wo.status)} className="text-xs">
                                    {wo.status}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                  {wo.sales_order?.customer || wo.customer}
                                </p>
                                <p className="text-xs font-mono truncate">
                                  {wo.item_code}
                                </p>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    Qty: {wo.quantity}
                                  </span>
                                  {wo.due_date && (
                                    <span className="text-muted-foreground">
                                      {format(new Date(wo.due_date), "MMM dd")}
                                    </span>
                                  )}
                                </div>
                                {wo.sales_order && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    PO: {wo.sales_order.po_number}
                                  </p>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="table" className="mt-6">
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : workOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No active work orders
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left text-sm font-medium">WO ID</th>
                          <th className="p-3 text-left text-sm font-medium">Customer</th>
                          <th className="p-3 text-left text-sm font-medium">Item</th>
                          <th className="p-3 text-left text-sm font-medium">Qty</th>
                          <th className="p-3 text-left text-sm font-medium">Stage</th>
                          <th className="p-3 text-left text-sm font-medium">Status</th>
                          <th className="p-3 text-left text-sm font-medium">Due Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workOrders.map((wo) => (
                          <tr
                            key={wo.id}
                            className="border-b hover:bg-muted/30 cursor-pointer"
                            onClick={() => navigate(`/work-order/${wo.id}`)}
                          >
                            <td className="p-3 text-sm font-mono">
                              {wo.display_id || wo.wo_id}
                            </td>
                            <td className="p-3 text-sm">
                              {wo.sales_order?.customer || wo.customer}
                            </td>
                            <td className="p-3 text-sm font-mono">{wo.item_code}</td>
                            <td className="p-3 text-sm">{wo.quantity}</td>
                            <td className="p-3">
                              <Badge className={getStageColor(wo.current_stage)}>
                                {wo.current_stage.replace(/_/g, " ")}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge variant={getStatusBadge(wo.status)}>
                                {wo.status}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm">
                              {wo.due_date ? format(new Date(wo.due_date), "MMM dd, yyyy") : "N/A"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default FloorDashboard;
