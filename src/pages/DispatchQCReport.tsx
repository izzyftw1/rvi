import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const DispatchQCReport = () => {
  const { woId } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [qcData, setQcData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (woId) {
      loadReportData();
    }
  }, [woId]);

  const loadReportData = async () => {
    try {
      // Load work order
      const { data: woData, error: woError } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", woId)
        .single();

      if (woError) throw woError;
      setWorkOrder(woData);

      // Load all hourly QC checks for this WO
      const { data: checks, error: checksError } = await supabase
        .from("hourly_qc_checks")
        .select("*")
        .eq("wo_id", woId);

      if (checksError) throw checksError;

      if (!checks || checks.length === 0) {
        toast.warning("No QC checks found for this work order");
        setLoading(false);
        return;
      }

      // Calculate min, max, avg for each dimension
      const dimensions = ["a", "b", "c", "d", "e", "f", "g"];
      const dimensionStats: any = {};

      dimensions.forEach((dim) => {
        const values = checks
          .map((c) => c[`dimension_${dim}`])
          .filter((v) => v !== null && v !== undefined);

        if (values.length > 0) {
          dimensionStats[dim.toUpperCase()] = {
            min: Math.min(...values),
            max: Math.max(...values),
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            count: values.length,
          };
        }
      });

      setQcData({
        checks,
        dimensionStats,
        totalChecks: checks.length,
        passedChecks: checks.filter((c) => c.status === "pass").length,
        failedChecks: checks.filter((c) => c.status === "fail").length,
      });
    } catch (error: any) {
      toast.error("Failed to load report data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = () => {
    toast.info("PDF export functionality coming soon");
  };

  const exportToExcel = () => {
    toast.info("Excel export functionality coming soon");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">Loading report...</div>
        </div>
      </div>
    );
  }

  if (!workOrder || !qcData) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="text-center py-12">No data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Final Dispatch QC Report</h1>
              <p className="text-sm text-muted-foreground">Work Order: {workOrder.wo_id}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel}>
              <FileText className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button onClick={exportToPDF}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Report Header</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Customer</div>
                <div className="font-medium">{workOrder.customer}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Work Order</div>
                <div className="font-medium">{workOrder.wo_id}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Item Code</div>
                <div className="font-medium">{workOrder.item_code}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Quantity</div>
                <div className="font-medium">{workOrder.quantity} pcs</div>
              </div>
              <div>
                <div className="text-muted-foreground">Report Date</div>
                <div className="font-medium">{new Date().toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Total Checks</div>
                <div className="font-medium">{qcData.totalChecks}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Passed</div>
                <div className="font-medium text-green-600">{qcData.passedChecks}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Failed</div>
                <div className="font-medium text-red-600">{qcData.failedChecks}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dimensional Analysis (A-G)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dimension</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Max</TableHead>
                  <TableHead className="text-right">Average</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(qcData.dimensionStats).map(([dim, stats]: [string, any]) => (
                  <TableRow key={dim}>
                    <TableCell className="font-medium">Dimension {dim}</TableCell>
                    <TableCell className="text-right">{stats.min.toFixed(3)}</TableCell>
                    <TableCell className="text-right">{stats.max.toFixed(3)}</TableCell>
                    <TableCell className="text-right">{stats.avg.toFixed(3)}</TableCell>
                    <TableCell className="text-right">{stats.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QC Supervisor Sign-Off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-b pb-4">
              <div className="text-sm text-muted-foreground mb-2">Signature:</div>
              <div className="h-20 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                Digital signature area
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Name:</div>
                <div className="border-b mt-2"></div>
              </div>
              <div>
                <div className="text-muted-foreground">Date:</div>
                <div className="border-b mt-2"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent QC Checks History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-auto">
              {qcData.checks.map((check: any) => (
                <div
                  key={check.id}
                  className={`p-3 rounded border ${
                    check.status === "pass" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">
                        {new Date(check.check_datetime).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Status: {check.status === "pass" ? "PASS" : "FAIL"}
                        {check.out_of_tolerance_dimensions?.length > 0 &&
                          ` - OOT: ${check.out_of_tolerance_dimensions.join(", ")}`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DispatchQCReport;
