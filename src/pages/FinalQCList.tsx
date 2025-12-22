import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { FileText, Search, ClipboardCheck, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface WorkOrderWithQC {
  id: string;
  wo_number: string | null;
  display_id: string | null;
  customer: string | null;
  item_code: string | null;
  quantity: number | null;
  status: string;
  current_stage: string | null;
  qc_check_count: number;
}

const FinalQCList = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrderWithQC[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get work orders that have QC checks or are in QC/packing/dispatch stages
      const { data: woData, error: woError } = await supabase
        .from("work_orders")
        .select("id, wo_number, display_id, customer, item_code, quantity, status, current_stage")
        .in("current_stage", ["qc", "packing", "dispatch"])
        .order("updated_at", { ascending: false })
        .limit(100);

      if (woError) throw woError;

      // Get QC check counts for each work order
      const woIds = (woData || []).map((wo) => wo.id);
      
      const { data: qcCounts, error: qcError } = await supabase
        .from("hourly_qc_checks")
        .select("wo_id")
        .in("wo_id", woIds.length > 0 ? woIds : ["00000000-0000-0000-0000-000000000000"]);

      if (qcError) throw qcError;

      // Count QC checks per WO
      const qcCountMap: Record<string, number> = {};
      (qcCounts || []).forEach((qc: any) => {
        qcCountMap[qc.wo_id] = (qcCountMap[qc.wo_id] || 0) + 1;
      });

      // Also fetch WOs with hourly QC checks regardless of stage
      const { data: woWithQC, error: woQcError } = await supabase
        .from("hourly_qc_checks")
        .select("wo_id")
        .order("check_datetime", { ascending: false });

      if (woQcError) throw woQcError;

      const woIdsWithQC = [...new Set((woWithQC || []).map((qc: any) => qc.wo_id))];
      
      // Fetch those WOs
      const { data: additionalWOs, error: addError } = await supabase
        .from("work_orders")
        .select("id, wo_number, display_id, customer, item_code, quantity, status, current_stage")
        .in("id", woIdsWithQC.length > 0 ? woIdsWithQC : ["00000000-0000-0000-0000-000000000000"])
        .not("id", "in", `(${woIds.join(",")})`);

      if (addError && addError.code !== "PGRST116") throw addError;

      // Merge and deduplicate
      const allWOs = [...(woData || []), ...(additionalWOs || [])];
      const uniqueWOs = allWOs.filter((wo, index, self) => 
        index === self.findIndex((w) => w.id === wo.id)
      );

      // Recount QC checks for all
      const allWoIds = uniqueWOs.map((wo) => wo.id);
      const { data: allQcCounts } = await supabase
        .from("hourly_qc_checks")
        .select("wo_id")
        .in("wo_id", allWoIds.length > 0 ? allWoIds : ["00000000-0000-0000-0000-000000000000"]);

      const finalQcCountMap: Record<string, number> = {};
      (allQcCounts || []).forEach((qc: any) => {
        finalQcCountMap[qc.wo_id] = (finalQcCountMap[qc.wo_id] || 0) + 1;
      });

      const result: WorkOrderWithQC[] = uniqueWOs.map((wo: any) => ({
        ...wo,
        qc_check_count: finalQcCountMap[wo.id] || 0,
      }));

      // Sort by QC check count descending
      result.sort((a, b) => b.qc_check_count - a.qc_check_count);

      setWorkOrders(result);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load work orders");
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkOrders = workOrders.filter((wo) => {
    const search = searchTerm.toLowerCase();
    return (
      (wo.display_id?.toLowerCase() || "").includes(search) ||
      (wo.wo_number?.toLowerCase() || "").includes(search) ||
      (wo.customer?.toLowerCase() || "").includes(search) ||
      (wo.item_code?.toLowerCase() || "").includes(search)
    );
  });

  const getStageColor = (stage: string | null) => {
    switch (stage) {
      case "qc": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case "packing": return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      case "dispatch": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Final QC Reports"
        description="Generate final QC reports for work orders with inspection data"
        icon={<ClipboardCheck className="h-6 w-6" />}
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by WO number, customer, or item code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredWorkOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No work orders with QC data found.</p>
              <p className="text-sm">Work orders need hourly QC checks before generating final reports.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">QC Checks</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWorkOrders.map((wo) => (
                  <TableRow key={wo.id}>
                    <TableCell className="font-medium">
                      {wo.display_id || wo.wo_number || wo.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{wo.customer || "-"}</TableCell>
                    <TableCell>{wo.item_code || "-"}</TableCell>
                    <TableCell className="text-right">{wo.quantity?.toLocaleString() || "-"}</TableCell>
                    <TableCell>
                      <Badge className={getStageColor(wo.current_stage)}>
                        {wo.current_stage || "Unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {wo.qc_check_count > 0 ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          {wo.qc_check_count}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={wo.qc_check_count > 0 ? "default" : "outline"}
                        onClick={() => navigate(`/dispatch-qc-report/${wo.id}`)}
                        disabled={wo.qc_check_count === 0}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        View Report
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default FinalQCList;
