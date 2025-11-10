import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, FileText, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface FinalDispatchReportGeneratorProps {
  woId: string;
  woNumber: string;
  customer: string;
  itemCode: string;
  quantity: number;
}

export const FinalDispatchReportGenerator = ({
  woId,
  woNumber,
  customer,
  itemCode,
  quantity
}: FinalDispatchReportGeneratorProps) => {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<{
    fileUrl: string;
    filePath: string;
    reportId: string;
  } | null>(null);

  useEffect(() => {
    loadReportData();
  }, [woId]);

  const loadReportData = async () => {
    try {
      setLoading(true);

      // Load hourly QC data grouped by operation
      const { data: hourlyData } = await supabase
        .from('hourly_qc_checks')
        .select('*')
        .eq('wo_id', woId);

      // Load QC records
      const { data: qcRecords } = await supabase
        .from('qc_records')
        .select(`
          *,
          approver:approved_by(full_name)
        `)
        .eq('wo_id', woId);

      // Load work order details
      const { data: woData } = await supabase
        .from('work_orders')
        .select('*, sales_orders(so_id)')
        .eq('id', woId)
        .single();

      // Load first operator name
      const { data: operatorData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', hourlyData?.[0]?.operator_id)
        .single();

      setReportData({
        hourly: hourlyData || [],
        qcRecords: qcRecords || [],
        workOrder: woData,
        operatorName: operatorData?.full_name || 'N/A'
      });
    } catch (error: any) {
      console.error('Error loading report data:', error);
      toast.error('Failed to load dispatch report data');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!reportData) return;

    try {
      setGenerating(true);
      
      const doc = new jsPDF();
      let yPos = 20;

      // Branded Header
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148); // Company blue
      doc.text('R.V. Industries', 105, yPos, { align: 'center' });
      yPos += 6;
      
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text('Final QC Dispatch Report', 105, yPos, { align: 'center' });
      yPos += 12;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Report Metadata Box
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(245, 247, 250);
      doc.rect(15, yPos, 180, 40, 'FD');
      yPos += 8;

      doc.setFont('helvetica', 'bold');
      doc.text('Work Order:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(woNumber, 55, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Customer:', 110, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(customer.substring(0, 35), 140, yPos);
      yPos += 7;

      doc.setFont('helvetica', 'bold');
      doc.text('Part No:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(itemCode, 55, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Quantity:', 110, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(quantity.toString() + ' pcs', 140, yPos);
      yPos += 7;

      doc.setFont('helvetica', 'bold');
      doc.text('Report Date:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date().toLocaleDateString(), 55, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Operator:', 110, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(reportData.operatorName, 140, yPos);
      
      yPos += 15;

      // Group hourly data by operation
      const operationGroups = ['A', 'B', 'C', 'D'];
      
      operationGroups.forEach((op) => {
        const opData = reportData.hourly.filter((h: any) => h.operation === op);
        if (opData.length === 0) return;

        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(28, 63, 148);
        doc.text(`Operation ${op}`, 20, yPos);
        yPos += 8;
        doc.setTextColor(0, 0, 0);

        // Calculate dimension stats
        const dimensionStats: Record<string, { values: number[]; min: number; max: number; samples: number }> = {};

        opData.forEach((check: any) => {
          if (check.dimensions) {
            Object.entries(check.dimensions).forEach(([dim, value]: [string, any]) => {
              if (typeof value === 'number') {
                if (!dimensionStats[dim]) {
                  dimensionStats[dim] = { values: [], min: value, max: value, samples: 0 };
                }
                dimensionStats[dim].values.push(value);
                dimensionStats[dim].min = Math.min(dimensionStats[dim].min, value);
                dimensionStats[dim].max = Math.max(dimensionStats[dim].max, value);
                dimensionStats[dim].samples += 1;
              }
            });
          }
        });

        // Dimensional Data Table
        if (Object.keys(dimensionStats).length > 0) {
          const dimData = Object.entries(dimensionStats).map(([dim, stats]) => {
            const avg = stats.values.reduce((a, b) => a + b, 0) / stats.values.length;
            return [
              dim,
              stats.min.toFixed(2),
              stats.max.toFixed(2),
              avg.toFixed(2),
              stats.samples.toString()
            ];
          });

          autoTable(doc, {
            startY: yPos,
            head: [['Dimension', 'Min', 'Max', 'Average', 'Samples']],
            body: dimData,
            theme: 'grid',
            headStyles: { fillColor: [28, 63, 148], fontSize: 9 },
            styles: { fontSize: 8, cellPadding: 2 }
          });

          yPos = (doc as any).lastAutoTable.finalY + 5;
        }

        // Binary QC Table (Visual, Thread, Plating)
        const binaryChecks = {
          'Visual': { ok: 0, notOk: 0 },
          'Thread': { ok: 0, notOk: 0 },
          'Plating': { ok: 0, notOk: 0 },
          'Plating Thickness': { ok: 0, notOk: 0 }
        };

        opData.forEach((check: any) => {
          if (check.visual_applicable) {
            check.visual_status === 'pass' ? binaryChecks['Visual'].ok++ : binaryChecks['Visual'].notOk++;
          }
          if (check.thread_applicable) {
            check.thread_status === 'pass' ? binaryChecks['Thread'].ok++ : binaryChecks['Thread'].notOk++;
          }
          if (check.plating_applicable) {
            check.plating_status === 'pass' ? binaryChecks['Plating'].ok++ : binaryChecks['Plating'].notOk++;
          }
          if (check.plating_thickness_applicable) {
            check.plating_thickness_status === 'pass' ? binaryChecks['Plating Thickness'].ok++ : binaryChecks['Plating Thickness'].notOk++;
          }
        });

        const binaryData = Object.entries(binaryChecks)
          .filter(([_, counts]) => counts.ok + counts.notOk > 0)
          .map(([check, counts]) => {
            const total = counts.ok + counts.notOk;
            const okPercent = total > 0 ? ((counts.ok / total) * 100).toFixed(1) : '0';
            return [check, `${okPercent}%`, counts.ok.toString(), counts.notOk.toString()];
          });

        if (binaryData.length > 0) {
          autoTable(doc, {
            startY: yPos,
            head: [['Check Type', '% OK', 'OK Count', 'Not OK Count']],
            body: binaryData,
            theme: 'striped',
            headStyles: { fillColor: [67, 160, 71], fontSize: 9 },
            styles: { fontSize: 8, cellPadding: 2 }
          });

          yPos = (doc as any).lastAutoTable.finalY + 10;
        }
      });

      // Footer - QC Sign-off
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      const finalQC = reportData.qcRecords.find((r: any) => r.qc_type === 'final');
      const qcSupervisor = finalQC?.approver?.full_name || 'QC Supervisor';

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('QC Supervisor Sign-Off', 20, yPos);
      yPos += 15;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Name:', 20, yPos);
      doc.line(40, yPos, 100, yPos);
      doc.text(qcSupervisor, 42, yPos);
      
      doc.text('Signature:', 110, yPos);
      doc.line(135, yPos, 190, yPos);
      
      yPos += 10;
      doc.text('Date:', 20, yPos);
      doc.line(40, yPos, 100, yPos);
      doc.text(new Date().toLocaleDateString(), 42, yPos);

      // Generate PDF blob
      const pdfBlob = doc.output('blob');
      const fileName = `Dispatch_QC_Report_${woNumber}_${customer.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      const filePath = `${woId}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('qc-reports')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('qc-reports')
        .getPublicUrl(filePath);

      const { data: { user } } = await supabase.auth.getUser();

      // Get existing reports count for version number
      const { count } = await supabase
        .from('qc_final_reports')
        .select('*', { count: 'exact', head: true })
        .eq('work_order_id', woId);

      // Save record to database
      const { data: reportRecord, error: dbError } = await supabase
        .from('qc_final_reports')
        .insert({
          work_order_id: woId,
          generated_by: user?.id,
          file_url: publicUrl,
          file_path: filePath,
          version_number: (count || 0) + 1,
          remarks: 'Final Dispatch QC Report',
          report_data: {
            operations: operationGroups.filter(op => reportData.hourly.some((h: any) => h.operation === op)),
            total_checks: reportData.hourly.length
          }
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setGeneratedReport({
        fileUrl: publicUrl,
        filePath: filePath,
        reportId: reportRecord.id
      });
      setShowSuccessModal(true);
      toast.success('Final Dispatch Report generated successfully');

    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate dispatch report: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const downloadPDF = () => {
    if (generatedReport) {
      window.open(generatedReport.fileUrl, '_blank');
    }
  };

  const viewPDF = () => {
    if (generatedReport) {
      window.open(generatedReport.fileUrl, '_blank');
    }
  };

  // Check if hourly QC data exists
  const hasHourlyData = reportData?.hourly && reportData.hourly.length > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Final Dispatch QC Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate comprehensive dispatch report with dimensional data, binary QC checks, and sign-off.
            </p>

            {reportData && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground">Hourly Checks:</span>
                  <span className="ml-2 font-semibold">{reportData.hourly.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Operator:</span>
                  <span className="ml-2 font-semibold">{reportData.operatorName}</span>
                </div>
              </div>
            )}

            <Button
              onClick={generatePDF}
              disabled={loading || generating || !reportData || !hasHourlyData}
              className="w-full"
            >
              {loading || generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {generating ? 'Generating Report...' : 'Loading...'}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate Final Dispatch Report (PDF)
                </>
              )}
            </Button>

            {!hasHourlyData && reportData && (
              <p className="text-xs text-amber-600">
                At least one hourly QC check is required before generating the dispatch report.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              Dispatch Report Generated
            </DialogTitle>
            <DialogDescription>
              Your Final Dispatch QC Report has been compiled and saved.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <p className="text-sm">
                <span className="font-semibold">Report:</span> Dispatch_QC_Report_{woNumber}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Generated:</span> {new Date().toLocaleString()}
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={viewPDF}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View PDF
            </Button>
            <Button onClick={downloadPDF}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};