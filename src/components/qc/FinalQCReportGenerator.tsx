import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Download, FileText, Loader2 } from "lucide-react";
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
  const [reportData, setReportData] = useState<any>(null);

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

      // Load QC records
      const { data: qcRecords } = await supabase
        .from('qc_records')
        .select('*')
        .eq('wo_id', woId);

      // Load dimension tolerances
      const { data: tolerances } = await supabase
        .from('dimension_tolerances')
        .select('*')
        .eq('item_code', itemCode)
        .single();

      setReportData({
        hourly: hourlyData || [],
        qcRecords: qcRecords || [],
        tolerances: tolerances?.dimensions || {}
      });
    } catch (error: any) {
      console.error('Error loading report data:', error);
      toast.error('Failed to load QC report data');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    if (!reportData) return;

    const doc = new jsPDF();
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.text('Final Quality Control Report', 105, yPos, { align: 'center' });
    yPos += 10;

    doc.setFontSize(10);
    doc.text(`Work Order: ${woNumber}`, 20, yPos);
    yPos += 6;
    doc.text(`Customer: ${customer}`, 20, yPos);
    yPos += 6;
    doc.text(`Item Code: ${itemCode}`, 20, yPos);
    yPos += 6;
    doc.text(`Report Date: ${new Date().toLocaleDateString()}`, 20, yPos);
    yPos += 15;

    // QC Stages Summary
    doc.setFontSize(14);
    doc.text('QC Gate Status', 20, yPos);
    yPos += 8;

    const qcStages = ['incoming', 'first_piece', 'in_process', 'final'];
    const stageData = qcStages.map(stage => {
      const record = reportData.qcRecords.find((r: any) => r.qc_type === stage);
      return [
        stage.replace('_', ' ').toUpperCase(),
        record?.result || 'Pending',
        record?.approved_at ? new Date(record.approved_at).toLocaleDateString() : '-',
        record?.remarks || '-'
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Stage', 'Status', 'Date', 'Remarks']],
      body: stageData,
      theme: 'striped'
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Hourly QC Summary
    if (reportData.hourly.length > 0) {
      doc.setFontSize(14);
      doc.text('Hourly Dimensional Checks Summary', 20, yPos);
      yPos += 8;

      // Calculate dimension averages
      const dimensionStats: Record<string, { sum: number; count: number; min: number; max: number }> = {};

      reportData.hourly.forEach((check: any) => {
        if (check.dimensions) {
          Object.entries(check.dimensions).forEach(([dim, value]: [string, any]) => {
            if (typeof value === 'number') {
              if (!dimensionStats[dim]) {
                dimensionStats[dim] = { sum: 0, count: 0, min: value, max: value };
              }
              dimensionStats[dim].sum += value;
              dimensionStats[dim].count += 1;
              dimensionStats[dim].min = Math.min(dimensionStats[dim].min, value);
              dimensionStats[dim].max = Math.max(dimensionStats[dim].max, value);
            }
          });
        }
      });

      const dimensionData = Object.entries(dimensionStats).map(([dim, stats]) => {
        const avg = stats.sum / stats.count;
        const tolerance = reportData.tolerances[dim];
        return [
          dim,
          avg.toFixed(2),
          stats.min.toFixed(2),
          stats.max.toFixed(2),
          tolerance ? `${tolerance.min} - ${tolerance.max}` : '-',
          tolerance && avg >= tolerance.min && avg <= tolerance.max ? '✓ PASS' : '✗ FAIL'
        ];
      });

      autoTable(doc, {
        startY: yPos,
        head: [['Dimension', 'Avg', 'Min', 'Max', 'Tolerance', 'Status']],
        body: dimensionData,
        theme: 'grid'
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    }

    // Signature Section
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.text('Approved By:', 20, yPos);
    yPos += 20;
    doc.line(20, yPos, 100, yPos);
    doc.setFontSize(10);
    doc.text('QC Supervisor Signature', 20, yPos + 5);

    doc.text('Date:', 120, yPos - 20);
    doc.line(120, yPos, 190, yPos);
    doc.text(new Date().toLocaleDateString(), 120, yPos + 5);

    // Save PDF
    doc.save(`Final_QC_Report_${woNumber}.pdf`);
    toast.success('Final QC Report generated successfully');
  };

  return (
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
            </div>
          )}

          <Button
            onClick={generatePDF}
            disabled={loading || !reportData}
            className="w-full"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download Final QC Report (PDF)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};