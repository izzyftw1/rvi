import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Plus, Search, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NavigationHeader } from "@/components/NavigationHeader";
import { HistoricalDataDialog } from "@/components/HistoricalDataDialog";
import { useToast } from "@/hooks/use-toast";

const WorkOrders = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewOpen, setViewOpen] = useState(false);
  const [viewWO, setViewWO] = useState<any>(null);

  useEffect(() => {
    // Initial load
    loadWorkOrders();

    // Subscribe to realtime updates on work_orders
    const channel = supabase
      .channel('work_orders_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => {
          loadWorkOrders();
        }
      )
      .subscribe();

    // Refresh when window regains focus
    const onFocus = () => loadWorkOrders();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const loadWorkOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading work orders:", error);
        toast({ 
          variant: "destructive", 
          description: `Failed to load work orders: ${error.message}` 
        });
        setWorkOrders([]);
        return;
      }
      
      // Ensure all WOs have safe default values
      const safeData = (data || []).map(wo => ({
        ...wo,
        wo_id: wo.wo_id || 'N/A',
        customer: wo.customer || 'Unknown',
        item_code: wo.item_code || 'N/A',
        revision: wo.revision || '0',
        quantity: wo.quantity || 0,
        priority: wo.priority || 3,
        status: wo.status || 'pending',
        current_stage: wo.current_stage || 'goods_in',
      }));
      
      setWorkOrders(safeData);
    } catch (error: any) {
      console.error("Unexpected error loading work orders:", error);
      toast({ 
        variant: "destructive", 
        description: "Unexpected error loading work orders" 
      });
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredWOs = workOrders.filter((wo) => {
    const q = search.toLowerCase();
    const woId = (wo.wo_id?.toString()?.toLowerCase() || "");
    const customer = (wo.customer?.toLowerCase() || "");
    const itemCode = (wo.item_code?.toLowerCase() || "");
    return woId.includes(q) || customer.includes(q) || itemCode.includes(q);
  });

  const openView = (wo: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setViewWO(wo);
    setViewOpen(true);
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
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Loading work orders...</p>
            </CardContent>
          </Card>
        ) : workOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <p className="text-lg font-medium">No Work Orders Yet</p>
              <p className="text-sm text-muted-foreground">
                Work orders will appear here when sales orders are approved or create one manually
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
        ) : filteredWOs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No work orders match your search</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredWOs.map((wo) => {
              try {
                return (
                  <Card
                    key={wo.id || Math.random()}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/work-orders/${wo.id}`)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{wo.wo_id || 'N/A'}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {wo.customer || 'Unknown'} • {wo.item_code || 'N/A'}
                          </p>
                        </div>
                        <StatusBadge status={wo.status || 'pending'} />
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
                            {wo.due_date ? new Date(wo.due_date).toLocaleDateString() : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Priority</p>
                          <Badge variant={(wo.priority || 3) <= 2 ? "destructive" : "secondary"}>
                            P{wo.priority || 3}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Sales Order</p>
                          <p className="font-medium">{wo.sales_order || "—"}</p>
                        </div>
                        <div className="flex items-end">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={(e) => openView(wo, e)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Quick View
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              } catch (renderError) {
                console.error("Error rendering work order card:", renderError, wo);
                return null;
              }
            })}
          </div>
        )}

        <HistoricalDataDialog
          open={viewOpen}
          onOpenChange={setViewOpen}
          data={viewWO}
          type="work_order"
        />
      </div>
    </div>
  );
};

export default WorkOrders;
