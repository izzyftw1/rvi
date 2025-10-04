import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NavigationHeader } from "@/components/NavigationHeader";

const WorkOrders = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (error) {
      console.error("Error loading work orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredWOs = workOrders.filter(wo =>
    wo.wo_id.toLowerCase().includes(search.toLowerCase()) ||
    wo.customer.toLowerCase().includes(search.toLowerCase()) ||
    wo.item_code.toLowerCase().includes(search.toLowerCase())
  );

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
            New WO
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search by WO ID, customer, or item code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="grid gap-4">
            {filteredWOs.map((wo) => (
              <Card
                key={wo.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/work-orders/${wo.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{wo.wo_id}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {wo.customer} • {wo.item_code}
                      </p>
                    </div>
                    <StatusBadge status={wo.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Quantity</p>
                      <p className="font-medium">{wo.quantity} pcs</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Due Date</p>
                      <p className="font-medium">
                        {new Date(wo.due_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Priority</p>
                      <Badge variant={wo.priority <= 2 ? "destructive" : "secondary"}>
                        P{wo.priority}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Sales Order</p>
                      <p className="font-medium">{wo.sales_order || "—"}</p>
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
