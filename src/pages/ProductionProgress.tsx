import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Search, TrendingUp, Package, AlertTriangle, CheckCircle2 } from "lucide-react";

interface WOProgress {
  id: string;
  wo_id: string;
  display_id: string;
  customer: string;
  customer_po: string;
  item_code: string;
  quantity: number;
  total_completed: number;
  total_scrap: number;
  net_completed: number;
  progress_percentage: number;
  remaining_quantity: number;
  status: string;
  due_date: string;
  cycle_time_seconds: number;
}

export default function ProductionProgress() {
  const [woProgress, setWoProgress] = useState<WOProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadWOProgress();

    const channel = supabase
      .channel("production_progress_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "production_logs",
        },
        () => {
          loadWOProgress();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadWOProgress = async () => {
    try {
      const { data: workOrders, error } = await supabase
        .from("work_orders")
        .select(`
          id,
          wo_id,
          display_id,
          customer,
          customer_po,
          item_code,
          quantity,
          status,
          due_date,
          cycle_time_seconds
        `)
        .in("status", ["in_progress", "pending"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      const progressData = await Promise.all(
        (workOrders || []).map(async (wo) => {
          const { data: progress } = await supabase.rpc("get_wo_progress", {
            _wo_id: wo.id,
          });

          const progressInfo = progress?.[0] || {
            total_completed: 0,
            total_scrap: 0,
            net_completed: 0,
            target_quantity: wo.quantity,
            progress_percentage: 0,
            remaining_quantity: wo.quantity,
          };

          return {
            ...wo,
            ...progressInfo,
          };
        })
      );

      setWoProgress(progressData);
    } catch (error: any) {
      toast.error(error.message || "Failed to load WO progress");
    } finally {
      setLoading(false);
    }
  };

  const filteredProgress = woProgress.filter(
    (wo) =>
      wo.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      wo.customer_po.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateETA = (wo: WOProgress) => {
    if (!wo.cycle_time_seconds || wo.remaining_quantity <= 0) return "Complete";
    
    const hoursNeeded = (wo.remaining_quantity * wo.cycle_time_seconds) / 3600;
    const daysNeeded = Math.ceil(hoursNeeded / 8); // Assuming 8-hour workday
    
    const etaDate = new Date();
    etaDate.setDate(etaDate.getDate() + daysNeeded);
    
    return etaDate.toLocaleDateString();
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return "bg-green-500";
    if (percentage >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const totalStats = {
    totalWOs: woProgress.length,
    onTrack: woProgress.filter(wo => wo.progress_percentage >= 50).length,
    behindSchedule: woProgress.filter(wo => wo.progress_percentage < 50 && wo.progress_percentage > 0).length,
    notStarted: woProgress.filter(wo => wo.progress_percentage === 0).length,
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">WO Progress Dashboard</h1>
            <p className="text-muted-foreground">Real-time production progress tracking</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total WOs</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStats.totalWOs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">On Track</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStats.onTrack}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Behind Schedule</CardTitle>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStats.behindSchedule}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Not Started</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStats.notStarted}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by WO, Customer, or PO..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO #</TableHead>
                  <TableHead>Customer PO</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Scrap</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Est. Completion</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredProgress.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center">
                      No work orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProgress.map((wo) => (
                    <TableRow key={wo.id}>
                      <TableCell className="font-medium">{wo.display_id}</TableCell>
                      <TableCell>{wo.customer_po}</TableCell>
                      <TableCell>{wo.item_code}</TableCell>
                      <TableCell className="text-right">{wo.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{wo.total_completed.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive">{wo.total_scrap.toLocaleString()}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {wo.net_completed.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">{wo.remaining_quantity.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Progress 
                            value={wo.progress_percentage} 
                            className="h-2"
                          />
                          <span className="text-xs font-medium">
                            {wo.progress_percentage.toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{calculateETA(wo)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/work-order/${wo.id}`)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
