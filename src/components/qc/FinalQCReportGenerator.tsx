import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, FileText, Loader2, CheckCircle2, ExternalLink, History, Eye } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface FinalQCReportGeneratorProps {
  woId: string;
  woNumber: string;
  customer: string;
  itemCode: string;
  samplingPlanReference?: string;
  inspectorRemarks?: string;
}

interface ReportData {
  workOrder: any;
  hourlyQC: any[];
  qcRecords: any[];
  finalQCMeasurements: any[];
  tolerances: Record<string, any>;
  inspectorName: string;
  samplingPlan: string;
  hourlyQCAverages: Array<{
    dimension: string;
    operation: string;
    min: number;
    max: number;
    avg: number;
    count: number;
    tolerance?: { min: number; max: number };
    status: 'PASS' | 'FAIL' | 'N/A';
  }>;
  complianceSummary: {
    totalDimensions: number;
    inTolerance: number;
    outOfTolerance: number;
    complianceRate: number;
  };
  finalConclusion: 'PASS' | 'FAIL' | 'PENDING';
}

export const FinalQCReportGenerator = ({
  woId,
  woNumber,
  customer,
  itemCode,
  samplingPlanReference,
  inspectorRemarks
}: FinalQCReportGeneratorProps) => {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [existingReports, setExistingReports] = useState<any[]>([]);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<{
    fileUrl: string;
    filePath: string;
    reportId: string;
    version: number;
  } | null>(null);

  useEffect(() => {
    loadReportData();
    loadExistingReports();
  }, [woId]);

  const loadExistingReports = async () => {
    const { data } = await supabase
      .from('qc_final_reports')
      .select('*, generated_by_profile:generated_by(full_name)')
      .eq('work_order_id', woId)
      .order('version_number', { ascending: false });
    
    if (data) {
      setExistingReports(data);
    }
  };

  const loadReportData = async () => {
    try {
      setLoading(true);

      // Load work order details
      const { data: woData } = await supabase
        .from('work_orders')
        .select('*, sales_orders(so_id)')
        .eq('id', woId)
        .single();

      // Load hourly QC data
      const { data: hourlyData } = await supabase
        .from('hourly_qc_checks')
        .select('*')
        .eq('wo_id', woId)
        .order('check_datetime', { ascending: true });

      // Load QC records with approver names
      const { data: qcRecords } = await supabase
        .from('qc_records')
        .select(`
          *,
          approver:approved_by(full_name)
        `)
        .eq('wo_id', woId);

      // Load Final QC measurements from qc_measurements
      const finalQCRecord = qcRecords?.find((r: any) => r.qc_type === 'final');
      let finalQCMeasurements: any[] = [];
      if (finalQCRecord) {
        const { data: measurements } = await supabase
          .from('qc_measurements')
          .select('*')
          .eq('qc_record_id', finalQCRecord.id);
        finalQCMeasurements = measurements || [];
      }

      // Load tolerances for this item
      const { data: toleranceData } = await supabase
        .from('dimension_tolerances')
        .select('*')
        .eq('item_code', itemCode);

      // Build tolerance map by operation
      const toleranceMap: Record<string, any> = {};
      (toleranceData || []).forEach((tol: any) => {
        toleranceMap[tol.operation] = tol.dimensions || {};
      });

      // Get inspector name from final QC record
      let inspectorName = 'N/A';
      if (finalQCRecord?.approved_by) {
        const { data: inspectorData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', finalQCRecord.approved_by)
          .single();
        inspectorName = inspectorData?.full_name || 'N/A';
      }

      // Calculate hourly QC dimension averages
      const hourlyQCAverages: ReportData['hourlyQCAverages'] = [];
      const dimStatsByOp: Record<string, Record<string, { values: number[]; min: number; max: number }>> = {};
      
      (hourlyData || []).forEach((check: any) => {
        const op = check.operation;
        if (!dimStatsByOp[op]) dimStatsByOp[op] = {};
        
        if (check.dimensions) {
          Object.entries(check.dimensions).forEach(([dim, value]: [string, any]) => {
            if (typeof value === 'number') {
              if (!dimStatsByOp[op][dim]) {
                dimStatsByOp[op][dim] = { values: [], min: value, max: value };
              }
              dimStatsByOp[op][dim].values.push(value);
              dimStatsByOp[op][dim].min = Math.min(dimStatsByOp[op][dim].min, value);
              dimStatsByOp[op][dim].max = Math.max(dimStatsByOp[op][dim].max, value);
            }
          });
        }
      });

      // Convert to averages array
      Object.entries(dimStatsByOp).forEach(([op, dims]) => {
        const opTolerances = toleranceMap[op] || {};
        Object.entries(dims).forEach(([dim, stats]) => {
          const avg = stats.values.reduce((a, b) => a + b, 0) / stats.values.length;
          const tol = opTolerances[dim];
          let status: 'PASS' | 'FAIL' | 'N/A' = 'N/A';
          if (tol && tol.min !== undefined && tol.max !== undefined) {
            const allInTol = stats.values.every(v => v >= tol.min && v <= tol.max);
            status = allInTol ? 'PASS' : 'FAIL';
          }
          
          hourlyQCAverages.push({
            dimension: dim,
            operation: op,
            min: stats.min,
            max: stats.max,
            avg,
            count: stats.values.length,
            tolerance: tol ? { min: tol.min, max: tol.max } : undefined,
            status
          });
        });
      });

      // Calculate compliance summary
      let totalDimensions = 0;
      let inTolerance = 0;
      let outOfTolerance = 0;

      (hourlyData || []).forEach((check: any) => {
        const dims = check.dimensions || {};
        const operation = check.operation;
        const opTolerances = toleranceMap[operation] || {};
        
        Object.entries(dims).forEach(([dimKey, value]: [string, any]) => {
          if (typeof value === 'number') {
            totalDimensions++;
            const tol = opTolerances[dimKey];
            if (tol && tol.min !== undefined && tol.max !== undefined) {
              if (value >= tol.min && value <= tol.max) {
                inTolerance++;
              } else {
                outOfTolerance++;
              }
            } else {
              inTolerance++;
            }
          }
        });
      });

      // Determine final conclusion
      let finalConclusion: 'PASS' | 'FAIL' | 'PENDING' = 'PENDING';
      if (woData?.quality_released) {
        finalConclusion = 'PASS';
      } else if (woData?.final_qc_result === 'blocked') {
        finalConclusion = 'FAIL';
      }

      setReportData({
        workOrder: woData,
        hourlyQC: hourlyData || [],
        qcRecords: qcRecords || [],
        finalQCMeasurements,
        tolerances: toleranceMap,
        inspectorName,
        samplingPlan: samplingPlanReference || woData?.sampling_plan_reference || 'AQL 2.5, Level II',
        hourlyQCAverages,
        complianceSummary: {
          totalDimensions,
          inTolerance,
          outOfTolerance,
          complianceRate: totalDimensions > 0 ? (inTolerance / totalDimensions) * 100 : 100
        },
        finalConclusion
      });
    } catch (error: any) {
      console.error('Error loading report data:', error);
      toast.error('Failed to load QC report data');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!reportData) return;

    try {
      setGenerating(true);
      
      const doc = new jsPDF();
      let yPos = 15;

      // ===== COMPANY HEADER WITH LOGO =====
      try {
        const logoImg = new Image();
        logoImg.src = '/rv-logo.jpg';
        doc.addImage(logoImg, 'JPEG', 15, 10, 30, 15);
      } catch (e) {
        // Logo not available, skip
      }

      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('R.V. Industries', 105, yPos, { align: 'center' });
      yPos += 7;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('Precision Engineering & Manufacturing', 105, yPos, { align: 'center' });
      yPos += 5;
      doc.text('Quality Excellence Since 1985', 105, yPos, { align: 'center' });
      yPos += 10;

      // Document Title
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('FINAL QUALITY CONTROL REPORT', 105, yPos, { align: 'center' });
      yPos += 10;

      // ===== WORK ORDER DETAILS BOX =====
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(248, 250, 252);
      doc.rect(15, yPos, 180, 32, 'FD');
      yPos += 8;

      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Work Order No:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(woNumber, 55, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Customer:', 110, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(customer.substring(0, 35), 135, yPos);
      yPos += 7;

      doc.setFont('helvetica', 'bold');
      doc.text('Item Code:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(itemCode, 55, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Description:', 110, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text((reportData.workOrder?.description || itemCode).substring(0, 25), 140, yPos);
      yPos += 7;

      doc.setFont('helvetica', 'bold');
      doc.text('Sampling Plan:', 20, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(reportData.samplingPlan, 55, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Report Date:', 110, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(format(new Date(), 'dd MMM yyyy HH:mm'), 140, yPos);
      
      yPos += 18;

      // ===== SECTION 1: FINAL QC MEASUREMENTS =====
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('1. FINAL QC DIMENSIONAL MEASUREMENTS', 20, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      if (reportData.finalQCMeasurements.length > 0) {
        const measurementData = reportData.finalQCMeasurements.map((m: any, idx: number) => [
          (idx + 1).toString(),
          m.dimension_name || 'Dim ' + (idx + 1),
          `${m.lower_limit?.toFixed(3) || 'N/A'} - ${m.upper_limit?.toFixed(3) || 'N/A'}`,
          m.measured_value?.toFixed(3) || 'N/A',
          m.unit || 'mm',
          m.is_within_tolerance ? 'PASS' : 'FAIL'
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['#', 'Dimension', 'Tolerance Range', 'Measured', 'Unit', 'Status']],
          body: measurementData,
          theme: 'grid',
          headStyles: { fillColor: [28, 63, 148], fontSize: 9 },
          styles: { fontSize: 8, cellPadding: 2 },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 5) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = data.cell.raw === 'PASS' ? [34, 139, 34] : [220, 38, 38];
            }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('No Final QC dimensional measurements recorded.', 25, yPos);
        yPos += 10;
      }

      // ===== SECTION 2: HOURLY QC AVERAGES =====
      if (yPos > 200) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('2. HOURLY QC DIMENSION AVERAGES', 20, yPos);
      yPos += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Aggregated from ${reportData.hourlyQC.length} in-process checks`, 20, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      const operations = [...new Set(reportData.hourlyQCAverages.map(a => a.operation))].sort();
      
      for (const op of operations) {
        const opAverages = reportData.hourlyQCAverages.filter(a => a.operation === op);
        if (opAverages.length === 0) continue;

        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Operation ${op}`, 25, yPos);
        yPos += 6;

        const opData = opAverages.map(a => [
          a.dimension,
          a.tolerance ? `${a.tolerance.min.toFixed(3)} - ${a.tolerance.max.toFixed(3)}` : 'N/A',
          a.min.toFixed(3),
          a.max.toFixed(3),
          a.avg.toFixed(3),
          a.count.toString(),
          a.status
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Dimension', 'Tolerance', 'Min', 'Max', 'Average', 'Samples', 'Status']],
          body: opData,
          theme: 'grid',
          headStyles: { fillColor: [67, 160, 71], fontSize: 8 },
          styles: { fontSize: 7, cellPadding: 1.5 },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 6) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = data.cell.raw === 'PASS' ? [34, 139, 34] : 
                data.cell.raw === 'FAIL' ? [220, 38, 38] : [100, 100, 100];
            }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 8;
      }

      if (operations.length === 0) {
        doc.setFontSize(10);
        doc.text('No hourly QC data recorded.', 25, yPos);
        yPos += 10;
      }

      // ===== SECTION 3: COMPLIANCE SUMMARY & CONCLUSION =====
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('3. COMPLIANCE SUMMARY & CONCLUSION', 20, yPos);
      yPos += 10;
      doc.setTextColor(0, 0, 0);

      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(248, 250, 252);
      doc.rect(20, yPos, 170, 25, 'FD');
      yPos += 8;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Dimensions Checked: ${reportData.complianceSummary.totalDimensions}`, 25, yPos);
      doc.text(`Compliance Rate: ${reportData.complianceSummary.complianceRate.toFixed(1)}%`, 120, yPos);
      yPos += 7;
      doc.text(`In Tolerance: ${reportData.complianceSummary.inTolerance}`, 25, yPos);
      doc.text(`Out of Tolerance: ${reportData.complianceSummary.outOfTolerance}`, 120, yPos);
      yPos += 18;

      // PASS/FAIL CONCLUSION
      const conclusionColor = reportData.finalConclusion === 'PASS' ? [34, 139, 34] : 
        reportData.finalConclusion === 'FAIL' ? [220, 38, 38] : [150, 150, 150];
      
      doc.setDrawColor(...conclusionColor as [number, number, number]);
      doc.setLineWidth(2);
      doc.rect(60, yPos, 90, 20);
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...conclusionColor as [number, number, number]);
      doc.text(`FINAL RESULT: ${reportData.finalConclusion}`, 105, yPos + 13, { align: 'center' });
      yPos += 30;

      // ===== SECTION 4: INSPECTOR DETAILS & REMARKS =====
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('4. INSPECTOR SIGN-OFF', 20, yPos);
      yPos += 10;
      doc.setTextColor(0, 0, 0);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const remarksText = inspectorRemarks || reportData.workOrder?.qc_final_remarks || 'No remarks';
      doc.text('Remarks:', 20, yPos);
      yPos += 6;
      const splitRemarks = doc.splitTextToSize(remarksText, 170);
      doc.text(splitRemarks, 20, yPos);
      yPos += splitRemarks.length * 5 + 10;

      doc.text('Inspector Name:', 20, yPos);
      doc.text(reportData.inspectorName, 55, yPos);
      yPos += 7;
      
      doc.text('Inspection Date:', 20, yPos);
      doc.text(format(new Date(), 'dd MMM yyyy'), 55, yPos);
      yPos += 15;

      doc.line(20, yPos, 80, yPos);
      doc.line(110, yPos, 180, yPos);
      yPos += 5;
      doc.setFontSize(8);
      doc.text('QC Inspector Signature', 30, yPos);
      doc.text('Quality Manager Approval', 125, yPos);

      // Footer
      const pageCount = doc.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${pageCount}`, 105, 285, { align: 'center' });
        doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')} | Document ID: FQC-${woNumber}`, 105, 290, { align: 'center' });
      }

      // Generate PDF blob
      const pdfBlob = doc.output('blob');
      const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
      const fileName = `Final_QC_Report_${woNumber}_v${existingReports.length + 1}_${timestamp}.pdf`;
      const filePath = `${woId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('qc-reports')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('qc-reports')
        .getPublicUrl(filePath);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Save record to database
      const { data: reportRecord, error: dbError } = await supabase
        .from('qc_final_reports')
        .insert({
          work_order_id: woId,
          generated_by: user?.id,
          file_url: publicUrl,
          file_path: filePath,
          version_number: existingReports.length + 1,
          remarks: inspectorRemarks,
          report_data: {
            finalQCMeasurements: reportData.finalQCMeasurements.length,
            hourlyQCChecks: reportData.hourlyQC.length,
            complianceRate: reportData.complianceSummary.complianceRate,
            conclusion: reportData.finalConclusion,
            samplingPlan: reportData.samplingPlan
          }
        })
        .select()
        .single();

      if (dbError) {
        throw dbError;
      }

      setGeneratedReport({
        fileUrl: publicUrl,
        filePath: filePath,
        reportId: reportRecord.id,
        version: existingReports.length + 1
      });
      setShowSuccessModal(true);
      await loadExistingReports();
      toast.success('Final QC Report generated successfully');

    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate QC report: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const downloadReport = (url: string) => {
    window.open(url, '_blank');
  };

  const canGenerate = reportData && (
    reportData.finalConclusion !== 'PENDING' || 
    reportData.finalQCMeasurements.length > 0 || 
    reportData.hourlyQC.length > 0
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Final QC Report (PDF)
          </CardTitle>
          <CardDescription>
            Generate comprehensive inspection report with measurements, averages, and conclusion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {reportData && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground">Final QC Measurements:</span>
                  <span className="ml-2 font-semibold">{reportData.finalQCMeasurements.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Hourly QC Checks:</span>
                  <span className="ml-2 font-semibold">{reportData.hourlyQC.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Compliance Rate:</span>
                  <span className="ml-2 font-semibold">{reportData.complianceSummary.complianceRate.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Conclusion:</span>
                  <Badge 
                    className={`ml-2 ${
                      reportData.finalConclusion === 'PASS' ? 'bg-green-100 text-green-800' :
                      reportData.finalConclusion === 'FAIL' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {reportData.finalConclusion}
                  </Badge>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={generatePDF}
                disabled={loading || generating || !canGenerate}
                className="flex-1"
              >
                {loading || generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {generating ? 'Generating...' : 'Loading...'}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Generate Report (v{existingReports.length + 1})
                  </>
                )}
              </Button>
              
              {existingReports.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setShowHistoryDialog(true)}
                >
                  <History className="h-4 w-4 mr-2" />
                  History ({existingReports.length})
                </Button>
              )}
            </div>

            {existingReports.length > 0 && (
              <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded text-sm">
                <span className="text-green-800 dark:text-green-300">
                  Latest: v{existingReports[0].version_number}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => downloadReport(existingReports[0].file_url)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Report Generated Successfully
            </DialogTitle>
            <DialogDescription>
              Final QC Report has been created and saved.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 py-4">
            <div className="p-3 bg-muted/50 rounded-lg space-y-1 text-sm">
              <p><span className="font-semibold">Report:</span> Final_QC_Report_{woNumber}</p>
              <p><span className="font-semibold">Version:</span> {generatedReport?.version}</p>
              <p><span className="font-semibold">Generated:</span> {format(new Date(), 'dd MMM yyyy HH:mm')}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              This report is now attached to the work order and will be included in dispatch documentation.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSuccessModal(false)}>
              Close
            </Button>
            <Button onClick={() => generatedReport && downloadReport(generatedReport.fileUrl)}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report Version History</DialogTitle>
            <DialogDescription>
              All generated Final QC reports for this work order
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {existingReports.map((report) => (
              <div 
                key={report.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="text-sm">
                  <p className="font-medium">Version {report.version_number}</p>
                  <p className="text-muted-foreground text-xs">
                    {format(new Date(report.generated_at || report.created_at), 'dd MMM yyyy HH:mm')}
                  </p>
                  {report.generated_by_profile?.full_name && (
                    <p className="text-muted-foreground text-xs">
                      By: {report.generated_by_profile.full_name}
                    </p>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => downloadReport(report.file_url)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
