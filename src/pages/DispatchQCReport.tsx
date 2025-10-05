import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { NavigationHeader } from "@/components/NavigationHeader";

const DispatchQCReport = () => {
  const { woId } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [qcData, setQcData] = useState<any>(null);
  const [tolerances, setTolerances] = useState<any>({});
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

      // Load tolerances for this item_code
      const { data: toleranceData, error: toleranceError } = await supabase
        .from("dimension_tolerances")
        .select("*")
        .eq("item_code", woData.item_code);

      if (toleranceError) {
        console.error("Error loading tolerances:", toleranceError);
      }

      // Build a map of tolerances by operation
      const toleranceMap: any = {};
      (toleranceData || []).forEach((tol: any) => {
        toleranceMap[tol.operation] = tol.dimensions || {};
      });
      setTolerances(toleranceMap);

      // Group checks by operation and calculate stats per operation
      const operationStats: any = {};

      // Get unique operations
      const operations = Array.from(new Set(checks.map(c => c.operation))).sort();

      operations.forEach((op) => {
        const opChecks = checks.filter(c => c.operation === op);
        const opDimensionStats: any = {};
        
        // Calculate binary QC stats
        const threadOK = opChecks.filter(c => c.thread_status === "OK").length;
        const visualOK = opChecks.filter(c => c.visual_status === "OK").length;
        const platingOK = opChecks.filter(c => c.plating_status === "OK").length;
        const platingThicknessOK = opChecks.filter(c => c.plating_thickness_status === "OK").length;
        const totalOp = opChecks.length;

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
          binaryChecks: {
            thread: { ok: threadOK, notOk: totalOp - threadOK, okPercent: ((threadOK / totalOp) * 100).toFixed(1) },
            visual: { ok: visualOK, notOk: totalOp - visualOK, okPercent: ((visualOK / totalOp) * 100).toFixed(1) },
            plating: { ok: platingOK, notOk: totalOp - platingOK, okPercent: ((platingOK / totalOp) * 100).toFixed(1) },
            platingThickness: { ok: platingThicknessOK, notOk: totalOp - platingThicknessOK, okPercent: ((platingThicknessOK / totalOp) * 100).toFixed(1) },
          },
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

    // Helper function to check if value is within tolerance
    const checkTolerance = (op: string, dim: string, value: number): boolean => {
      if (!tolerances[op] || !tolerances[op][dim]) return true;
      const { min, max } = tolerances[op][dim];
      return value >= min && value <= max;
    };

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

      // Create table data with color coding
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
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index > 0 && data.column.index < 4) {
            const rowIndex = data.row.index;
            const dimEntries = Object.entries(opStats.dimensions);
            if (rowIndex < dimEntries.length) {
              const [dim, stats] = dimEntries[rowIndex] as [string, any];
              let value: number;
              if (data.column.index === 1) value = stats.min;
              else if (data.column.index === 2) value = stats.max;
              else value = stats.avg;
              
              const inTolerance = checkTolerance(op, dim, value);
              data.cell.styles.textColor = inTolerance ? [0, 128, 0] : [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Add binary QC summary table
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(10);
      doc.text(`Binary QC Checks - Operation ${op}`, 14, yPos);
      yPos += 5;

      const binaryData = [
        ['Thread', opStats.binaryChecks.thread.okPercent + '%', opStats.binaryChecks.thread.ok, opStats.binaryChecks.thread.notOk],
        ['Visual', opStats.binaryChecks.visual.okPercent + '%', opStats.binaryChecks.visual.ok, opStats.binaryChecks.visual.notOk],
        ['Plating', opStats.binaryChecks.plating.okPercent + '%', opStats.binaryChecks.plating.ok, opStats.binaryChecks.plating.notOk],
        ['Plating Thickness', opStats.binaryChecks.platingThickness.okPercent + '%', opStats.binaryChecks.platingThickness.ok, opStats.binaryChecks.platingThickness.notOk],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['Check Type', '% OK', 'OK Count', 'Not OK Count']],
        body: binaryData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [34, 139, 34] },
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
    
    // Helper to check tolerance for Excel export (text indicator)
    const getTolerance = (op: string, dim: string, value: number): string => {
      if (!tolerances[op] || !tolerances[op][dim]) return "";
      const { min, max } = tolerances[op][dim];
      return value >= min && value <= max ? "✓" : "✗";
    };

    Object.entries(qcData.operationStats).forEach(([op, opStats]: [string, any]) => {
      Object.entries(opStats.dimensions).forEach(([dim, stats]: [string, any]) => {
        const minStatus = getTolerance(op, dim, stats.min);
        const maxStatus = getTolerance(op, dim, stats.max);
        const avgStatus = getTolerance(op, dim, stats.avg);
        rows.push([
          `Operation ${op}`,
          `Dimension ${dim}`,
          `${stats.min.toFixed(3)} ${minStatus}`,
          `${stats.max.toFixed(3)} ${maxStatus}`,
          `${stats.avg.toFixed(3)} ${avgStatus}`,
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

  // Helper function to check if value is within tolerance
  const checkTolerance = (op: string, dim: string, value: number): boolean => {
    if (!tolerances[op] || !tolerances[op][dim]) return true;
    const { min, max } = tolerances[op][dim];
    return value >= min && value <= max;
  };

  if (!workOrder || !qcData) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="max-w-6xl mx-auto p-4">
          <div className="text-center py-12">No data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Final Dispatch QC Report</h1>
            <p className="text-sm text-muted-foreground">Work Order: {workOrder.wo_id}</p>
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
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-3">Dimensional Data</h3>
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
                    {Object.entries(opStats.dimensions).map(([dim, stats]: [string, any]) => {
                      const minInTolerance = checkTolerance(op, dim, stats.min);
                      const maxInTolerance = checkTolerance(op, dim, stats.max);
                      const avgInTolerance = checkTolerance(op, dim, stats.avg);
                      
                      return (
                        <TableRow key={dim}>
                          <TableCell className="font-medium">Dimension {dim}</TableCell>
                          <TableCell className={`text-right font-bold ${minInTolerance ? "text-green-600" : "text-red-600"}`}>
                            {stats.min.toFixed(3)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${maxInTolerance ? "text-green-600" : "text-red-600"}`}>
                            {stats.max.toFixed(3)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${avgInTolerance ? "text-green-600" : "text-red-600"}`}>
                            {stats.avg.toFixed(3)}
                          </TableCell>
                          <TableCell className="text-right">{stats.count}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Binary QC Checks Summary</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check Type</TableHead>
                      <TableHead className="text-right">% OK</TableHead>
                      <TableHead className="text-right">OK Count</TableHead>
                      <TableHead className="text-right">Not OK Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Thread</TableCell>
                      <TableCell className="text-right">{opStats.binaryChecks.thread.okPercent}%</TableCell>
                      <TableCell className="text-right text-green-600">{opStats.binaryChecks.thread.ok}</TableCell>
                      <TableCell className="text-right text-red-600">{opStats.binaryChecks.thread.notOk}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Visual</TableCell>
                      <TableCell className="text-right">{opStats.binaryChecks.visual.okPercent}%</TableCell>
                      <TableCell className="text-right text-green-600">{opStats.binaryChecks.visual.ok}</TableCell>
                      <TableCell className="text-right text-red-600">{opStats.binaryChecks.visual.notOk}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Plating</TableCell>
                      <TableCell className="text-right">{opStats.binaryChecks.plating.okPercent}%</TableCell>
                      <TableCell className="text-right text-green-600">{opStats.binaryChecks.plating.ok}</TableCell>
                      <TableCell className="text-right text-red-600">{opStats.binaryChecks.plating.notOk}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Plating Thickness</TableCell>
                      <TableCell className="text-right">{opStats.binaryChecks.platingThickness.okPercent}%</TableCell>
                      <TableCell className="text-right text-green-600">{opStats.binaryChecks.platingThickness.ok}</TableCell>
                      <TableCell className="text-right text-red-600">{opStats.binaryChecks.platingThickness.notOk}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
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