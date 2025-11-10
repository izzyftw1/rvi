import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, FileText, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface FinalQCReportGeneratorProps {
  woId: string;
  woNumber: string;
  customer: string;
  itemCode: string;
}

export const FinalQCReportGenerator = ({
  woId,
  woNumber,
  customer,
  itemCode
}: FinalQCReportGeneratorProps) => {
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

      // Load hourly QC data
      const { data: hourlyData } = await supabase
        .from('hourly_qc_checks')
        .select('*')
        .eq('wo_id', woId);

      // Load QC records with approver names
      const { data: qcRecords } = await supabase
        .from('qc_records')
        .select(`
          *,
          approver:approved_by(full_name)
        `)
        .eq('wo_id', woId);

      // Load QC measurements
      const { data: measurements } = await supabase
        .from('qc_measurements')
        .select('*')
        .in('qc_record_id', qcRecords?.map(r => r.id) || []);

      // Load dimension tolerances
      const { data: tolerances } = await supabase
        .from('dimension_tolerances')
        .select('*')
        .eq('item_code', itemCode)
        .single();

      // Load work order details
      const { data: woData } = await supabase
        .from('work_orders')
        .select('*, sales_orders(so_id)')
        .eq('id', woId)
        .single();

      setReportData({
        hourly: hourlyData || [],
        qcRecords: qcRecords || [],
        measurements: measurements || [],
        tolerances: tolerances?.dimensions || {},
        workOrder: woData
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
      let yPos = 20;

      // Branded Header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('R.V. Industries', 105, yPos, { align: 'center' });
      yPos += 8;
      
      doc.setFontSize(16);
      doc.text('Final Quality Control Report', 105, yPos, { align: 'center' });
      yPos += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Report Metadata
      doc.text(`Work Order No: ${woNumber}`, 20, yPos);
      yPos += 6;
      doc.text(`Sales Order No: ${reportData.workOrder?.sales_orders?.so_id || 'N/A'}`, 20, yPos);
      yPos += 6;
      doc.text(`Customer: ${customer}`, 20, yPos);
      yPos += 6;
      doc.text(`Item Code: ${itemCode}`, 20, yPos);
      yPos += 6;
      doc.text(`Material Size / Alloy: ${reportData.workOrder?.material_size_mm || 'N/A'}`, 20, yPos);
      yPos += 6;
      doc.text(`Date of Completion: ${new Date().toLocaleDateString()}`, 20, yPos);
      yPos += 10;

    // 1️⃣ RAW MATERIAL TEST
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Raw Material Test', 20, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');

    const rawMaterialQC = reportData.qcRecords.find((r: any) => r.qc_type === 'incoming');
    const rawMaterialData = rawMaterialQC ? [[
      rawMaterialQC.result || 'Pending',
      rawMaterialQC.remarks || '-',
      rawMaterialQC.file_upload_url ? 'Attached' : 'N/A',
      rawMaterialQC.approved_at ? new Date(rawMaterialQC.approved_at).toLocaleDateString() : '-'
    ]] : [['Pending', '-', '-', '-']];

    autoTable(doc, {
      startY: yPos,
      head: [['Status', 'Remarks', 'Lab Report', 'Date']],
      body: rawMaterialData,
      theme: 'grid'
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // 2️⃣ FIRST PIECE QC
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. First Piece QC', 20, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');

    const firstPieceQC = reportData.qcRecords.find((r: any) => r.qc_type === 'first_piece');
    const firstPieceMeasurements = reportData.measurements.filter((m: any) => 
      m.qc_record_id === firstPieceQC?.id
    );

    if (firstPieceMeasurements.length > 0) {
      const firstPieceData = firstPieceMeasurements.map((m: any) => [
        m.dimension_name,
        `${m.lower_limit} - ${m.upper_limit} ${m.unit}`,
        `${m.measured_value} ${m.unit}`,
        m.is_within_tolerance ? 'PASS' : 'FAIL'
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Parameter', 'Specification', 'Measured', 'Result']],
        body: firstPieceData,
        theme: 'grid'
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    } else {
      doc.setFontSize(10);
      doc.text('No dimensional measurements recorded', 20, yPos);
      yPos += 15;
    }

    // 3️⃣ HOURLY QC SUMMARY
    if (reportData.hourly.length > 0) {
      if (yPos > 240) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('3. Hourly QC Summary', 20, yPos);
      yPos += 8;
      doc.setFont('helvetica', 'normal');

      // Calculate dimension statistics
      const dimensionStats: Record<string, { sum: number; count: number; min: number; max: number; outOfTolerance: number }> = {};

      reportData.hourly.forEach((check: any) => {
        if (check.dimensions) {
          Object.entries(check.dimensions).forEach(([dim, value]: [string, any]) => {
            if (typeof value === 'number') {
              if (!dimensionStats[dim]) {
                dimensionStats[dim] = { sum: 0, count: 0, min: value, max: value, outOfTolerance: 0 };
              }
              dimensionStats[dim].sum += value;
              dimensionStats[dim].count += 1;
              dimensionStats[dim].min = Math.min(dimensionStats[dim].min, value);
              dimensionStats[dim].max = Math.max(dimensionStats[dim].max, value);
              
              const tolerance = reportData.tolerances[dim];
              if (tolerance && (value < tolerance.min || value > tolerance.max)) {
                dimensionStats[dim].outOfTolerance += 1;
              }
            }
          });
        }
      });

      const dimensionData = Object.entries(dimensionStats).map(([dim, stats]) => {
        const avg = stats.sum / stats.count;
        const deviation = ((stats.max - stats.min) / avg * 100).toFixed(2);
        const tolerance = reportData.tolerances[dim];
        const notes = stats.outOfTolerance > 0 ? `${stats.outOfTolerance} out of spec` : '-';
        
        return [
          dim,
          avg.toFixed(2),
          stats.min.toFixed(2),
          stats.max.toFixed(2),
          tolerance ? `${tolerance.min} - ${tolerance.max}` : '-',
          `${deviation}%`,
          notes
        ];
      });

      autoTable(doc, {
        startY: yPos,
        head: [['Parameter', 'Average', 'Min', 'Max', 'Tolerance', 'Deviation', 'Notes']],
        body: dimensionData,
        theme: 'grid',
        styles: { fontSize: 9 }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // 4️⃣ FINAL QC
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Final Inspection', 20, yPos);
    yPos += 8;
    doc.setFont('helvetica', 'normal');

    const finalQC = reportData.qcRecords.find((r: any) => r.qc_type === 'final');
    const totalPassed = reportData.hourly.filter((h: any) => h.status === 'pass').length;
    const totalFailed = reportData.hourly.filter((h: any) => h.status === 'fail').length;
    const passPercentage = reportData.hourly.length > 0 
      ? ((totalPassed / reportData.hourly.length) * 100).toFixed(2) 
      : '0';

    const finalData = [
      ['Inspector Comments', finalQC?.remarks || 'No comments'],
      ['Total Inspections', reportData.hourly.length.toString()],
      ['Passed', totalPassed.toString()],
      ['Rejected', totalFailed.toString()],
      ['Pass Rate', `${passPercentage}%`],
      ['Final Status', finalQC?.result || 'Pending']
    ];

    autoTable(doc, {
      startY: yPos,
      body: finalData,
      theme: 'grid'
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Signature Section
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Approved By:', 20, yPos);
    yPos += 15;
    
    const finalApprover = finalQC?.approver?.full_name || 'QC Supervisor';
    doc.setFont('helvetica', 'normal');
    doc.line(20, yPos, 100, yPos);
    doc.setFontSize(10);
    doc.text(finalApprover, 20, yPos + 5);

    doc.text('Date:', 120, yPos - 15);
    doc.line(120, yPos, 190, yPos);
    doc.text(new Date().toLocaleDateString(), 120, yPos + 5);

    // Generate PDF blob
    const pdfBlob = doc.output('blob');
    const fileName = `Final_QC_Report_${woNumber}_${customer.replace(/\s+/g, '_')}.pdf`;
    const filePath = `${woId}/${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
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
        report_data: {
          qc_stages: reportData.qcRecords.length,
          hourly_checks: reportData.hourly.length,
          pass_rate: passPercentage
        }
      })
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }

    // Set generated report and show success modal
    setGeneratedReport({
      fileUrl: publicUrl,
      filePath: filePath,
      reportId: reportRecord.id
    });
    setShowSuccessModal(true);
    toast.success('Final QC Report generated and saved successfully');

    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate QC report: ' + error.message);
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

  // Check if all required QC stages are passed or waived
  const allQCPassed = reportData?.qcRecords.every((r: any) => 
    ['passed', 'waived'].includes(r.result)
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Final QC Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Generate a comprehensive QC report including all stages, hourly checks, and dimensional analysis.
            </p>

            {reportData && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground">Hourly Checks:</span>
                  <span className="ml-2 font-semibold">{reportData.hourly.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">QC Stages:</span>
                  <span className="ml-2 font-semibold">{reportData.qcRecords.length}/4</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Measurements:</span>
                  <span className="ml-2 font-semibold">{reportData.measurements.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">All QC Passed:</span>
                  <span className={`ml-2 font-semibold ${allQCPassed ? 'text-green-600' : 'text-amber-600'}`}>
                    {allQCPassed ? 'Yes' : 'Pending'}
                  </span>
                </div>
              </div>
            )}

            <Button
              onClick={generatePDF}
              disabled={loading || generating || !reportData || !allQCPassed}
              className="w-full"
            >
              {loading || generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {generating ? 'Generating Report...' : 'Loading Data...'}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate Final QC Report (PDF)
                </>
              )}
            </Button>

            {!allQCPassed && reportData && (
              <p className="text-xs text-amber-600">
                All QC stages must be passed or waived before generating the final report.
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
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              QC Report Generated Successfully
            </DialogTitle>
            <DialogDescription>
              Your Final QC Report has been compiled and saved to the QC archive.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <p className="text-sm">
                <span className="font-semibold">Report:</span> Final_QC_Report_{woNumber}_{customer.replace(/\s+/g, '_')}.pdf
              </p>
              <p className="text-sm">
                <span className="font-semibold">Generated:</span> {new Date().toLocaleString()}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Version:</span> {generatedReport && 'Latest'}
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