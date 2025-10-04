import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

      // Group checks by operation and calculate stats per operation
      const operationStats: any = {};

      // Get unique operations
      const operations = Array.from(new Set(checks.map(c => c.operation))).sort();

      operations.forEach((op) => {
        const opChecks = checks.filter(c => c.operation === op);
        const opDimensionStats: any = {};

        // Get all unique dimension numbers from all checks
        const allDimNums = new Set<string>();
        opChecks.forEach(check => {
          const dims = check.dimensions as any;
          if (dims) {
            Object.keys(dims).forEach(dimNum => allDimNums.add(dimNum));
          }
        });

        // Calculate stats for each dimension
        allDimNums.forEach((dimNum) => {
          const values = opChecks
            .map((c) => {
              const dims = c.dimensions as any;
              return dims ? dims[dimNum] : null;
            })
            .filter((v) => v !== null && v !== undefined);

          if (values.length > 0) {
            opDimensionStats[dimNum] = {
              min: Math.min(...values),
              max: Math.max(...values),
              avg: values.reduce((a: number, b: number) => a + b, 0) / values.length,
              count: values.length,
            };
          }
        });

        operationStats[op] = {
          dimensions: opDimensionStats,
          totalChecks: opChecks.length,
          passedChecks: opChecks.filter((c) => c.status === "pass").length,
          failedChecks: opChecks.filter((c) => c.status === "fail").length,
        };
      });

      setQcData({
        checks,
        operationStats,
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
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.text("Final Dispatch QC Report", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Customer: ${workOrder.customer}`, 14, 30);
    doc.text(`Work Order: ${workOrder.wo_id}`, 14, 36);
    doc.text(`Part Number: ${workOrder.item_code}`, 14, 42);
    doc.text(`Quantity: ${workOrder.quantity} pcs`, 14, 48);
    doc.text(`Report Date: ${new Date().toLocaleDateString()}`, 14, 54);
    doc.text(`Total Checks: ${qcData.totalChecks} | Passed: ${qcData.passedChecks} | Failed: ${qcData.failedChecks}`, 14, 60);

    let yPos = 70;

    // For each operation
    Object.entries(qcData.operationStats).forEach(([op, opStats]: [string, any]) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(12);
      doc.text(`Operation ${op}`, 14, yPos);
      yPos += 5;

      // Create table data
      const tableData = Object.entries(opStats.dimensions).map(([dim, stats]: [string, any]) => [
        `Dimension ${dim}`,
        stats.min.toFixed(3),
        stats.max.toFixed(3),
        stats.avg.toFixed(3),
        stats.count.toString(),
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Dimension', 'Min', 'Max', 'Average', 'Samples']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 139, 202] },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;
    });

    // Signature section
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    
    doc.setFontSize(12);
    doc.text("QC Supervisor Sign-Off", 14, yPos);
    yPos += 10;
    doc.setFontSize(10);
    doc.text("Signature: _______________________", 14, yPos);
    doc.text("Name: _______________________", 14, yPos + 10);
    doc.text("Date: _______________________", 14, yPos + 20);

    doc.save(`Dispatch_QC_Report_${workOrder.wo_id}_${new Date().toISOString().split('T')[0]}.pdf`);
    toast.success("PDF report generated successfully");
  };

  const exportToExcel = () => {
    const headers = [
      "Operation",
      "Dimension",
      "Min",
      "Max",
      "Average",
      "Samples",
    ];

    const rows: string[][] = [];
    
    Object.entries(qcData.operationStats).forEach(([op, opStats]: [string, any]) => {
      Object.entries(opStats.dimensions).forEach(([dim, stats]: [string, any]) => {
        rows.push([
          `Operation ${op}`,
          `Dimension ${dim}`,
          stats.min.toFixed(3),
          stats.max.toFixed(3),
          stats.avg.toFixed(3),
          stats.count.toString(),
        ]);
      });
    });

    const csvContent = [
      `Final Dispatch QC Report - ${workOrder.wo_id}`,
      `Customer: ${workOrder.customer}`,
      `Part Number: ${workOrder.item_code}`,
      `Quantity: ${workOrder.quantity} pcs`,
      `Report Date: ${new Date().toLocaleDateString()}`,
      `Total Checks: ${qcData.totalChecks} | Passed: ${qcData.passedChecks} | Failed: ${qcData.failedChecks}`,
      "",
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Dispatch_QC_Report_${workOrder.wo_id}_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Excel report exported successfully");
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

        {Object.entries(qcData.operationStats).map(([op, opStats]: [string, any]) => (
          <Card key={op}>
            <CardHeader>
              <CardTitle>Operation {op} - Dimensional Analysis</CardTitle>
              <div className="text-sm text-muted-foreground">
                Total: {opStats.totalChecks} | Passed: {opStats.passedChecks} | Failed: {opStats.failedChecks}
              </div>
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
                  {Object.entries(opStats.dimensions).map(([dim, stats]: [string, any]) => (
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
        ))}

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
                        {new Date(check.check_datetime).toLocaleString()} - Operation {check.operation}
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