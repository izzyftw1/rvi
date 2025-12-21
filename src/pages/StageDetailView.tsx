import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Clock, User } from "lucide-react";

export default function StageDetailView() {
  const { stage } = useParams<{ stage: string }>();
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStageData();
  }, [stage]);

  const loadStageData = async () => {
    try {
      // Get all WOs in this stage
      const { data: wos } = await supabase
        .from("work_orders")
        .select("*")
        .eq("current_stage", stage as any)
        .order("created_at", { ascending: false });

      if (!wos) {
        setWorkOrders([]);
        setLoading(false);
        return;
      }

      // Get stage history for each WO to find when they entered this stage
      const enrichedWOs = await Promise.all(
        wos.map(async (wo) => {
          const { data: history } = await supabase
            .from("wo_stage_history")
            .select("changed_at, changed_by")
            .eq("wo_id", wo.id)
            .eq("to_stage", stage as any)
            .order("changed_at", { ascending: false })
            .limit(1)
            .single();

          // Get user name separately
          let userName = "System";
          if (history?.changed_by) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("id", history.changed_by)
              .single();
            userName = profile?.full_name || "Unknown";
          }

          return {
            ...wo,
            entered_at: history?.changed_at,
            entered_by: userName,
          };
        })
      );

      setWorkOrders(enrichedWOs);
    } catch (error) {
      console.error("Error loading stage data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStageName = () => {
    return stage?.replace('_', ' ').toUpperCase() || 'STAGE';
  };

  const getTimeInStage = (enteredAt: string) => {
    if (!enteredAt) return "N/A";
    const hours = Math.round((Date.now() - new Date(enteredAt).getTime()) / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-center min-h-[50vh]">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Work Orders in {getStageName()}</CardTitle>
          </CardHeader>
          <CardContent>
            {workOrders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No work orders in this stage</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Entered At</TableHead>
                    <TableHead>Time in Stage</TableHead>
                    <TableHead>Moved By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workOrders.map((wo) => (
                    <TableRow key={wo.id}>
                      <TableCell className="font-medium">{wo.wo_id}</TableCell>
                      <TableCell>{wo.customer}</TableCell>
                      <TableCell>{wo.item_code}</TableCell>
                      <TableCell>{wo.quantity} pcs</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {wo.entered_at 
                              ? new Date(wo.entered_at).toLocaleString()
                              : "N/A"
                            }
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {getTimeInStage(wo.entered_at)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{wo.entered_by}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={wo.priority <= 2 ? "destructive" : "secondary"}>
                          P{wo.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/work-orders/${wo.id}`)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
