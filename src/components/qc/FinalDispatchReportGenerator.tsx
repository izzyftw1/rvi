import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Download, FileText, Loader2, CheckCircle2, ExternalLink, AlertTriangle, Shield, Lock } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface FinalDispatchReportGeneratorProps {
  woId: string;
  woNumber: string;
  customer: string;
  itemCode: string;
  quantity: number;
}

interface HourlyQCDimensionAverage {
  dimension: string;
  operation: string;
  min: number;
  max: number;
  avg: number;
  count: number;
  tolerance?: { min: number; max: number };
  inTolerance: boolean;
}

interface ConsolidatedReportData {
  workOrder: any;
  hourlyQC: any[];
  qcRecords: any[];
  ncrs: any[];
  tolerances: Record<string, any>;
  operatorName: string;
  sampleInspection: {
    sampleSize: number;
    results: any[];
  };
  complianceSummary: {
    totalDimensions: number;
    inTolerance: number;
    outOfTolerance: number;
    complianceRate: number;
  };
  deviationsAndWaivers: any[];
  hourlyQCAverages: HourlyQCDimensionAverage[];
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
  const [reportData, setReportData] = useState<ConsolidatedReportData | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [existingReport, setExistingReport] = useState<any>(null);
  const [generatedReport, setGeneratedReport] = useState<{
    fileUrl: string;
    filePath: string;
    reportId: string;
  } | null>(null);

  useEffect(() => {
    loadReportData();
    checkExistingReport();
  }, [woId]);

  const checkExistingReport = async () => {
    const { data } = await supabase
      .from('qc_final_reports')
      .select('*, generated_by_profile:generated_by(full_name)')
      .eq('work_order_id', woId)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      setExistingReport(data);
    }
  };

  const loadReportData = async () => {
    try {
      setLoading(true);

      // Load work order details - simplified query to avoid type recursion
      const { data: woData } = await supabase
        .from('work_orders')
        .select('id, wo_id, display_id, item_code, customer, quantity, revision, so_id, quality_released')
        .eq('id', woId)
        .single();
      
      // Load sales order ID separately if needed
      let salesOrderId: string | null = null;
      if (woData?.so_id) {
        const { data: soData } = await supabase
          .from('sales_orders')
          .select('so_id')
          .eq('id', woData.so_id)
          .single();
        salesOrderId = soData?.so_id || null;
      }

      // Load hourly QC data
      const { data: hourlyData } = await supabase
        .from('hourly_qc_checks')
        .select('*')
        .eq('wo_id', woId)
        .order('check_datetime', { ascending: true });

      // Load QC records (material, first piece, final)
      const { data: qcRecords } = await supabase
        .from('qc_records')
        .select(`
          *,
          approver:approved_by(full_name)
        `)
        .eq('wo_id', woId);

      // Load NCRs for this work order
      const { data: ncrs } = await supabase
        .from('ncrs')
        .select('*')
        .eq('work_order_id', woId);

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

      // Get first operator name
      const operatorId = hourlyData?.[0]?.operator_id;
      let operatorName = 'N/A';
      if (operatorId) {
        const { data: operatorData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', operatorId)
          .single();
        operatorName = operatorData?.full_name || 'N/A';
      }

      // Calculate sample inspection from last 10 hourly checks
      const sampleChecks = (hourlyData || []).slice(-10);
      const sampleResults = sampleChecks.map((check: any) => ({
        datetime: check.check_datetime,
        operation: check.operation,
        status: check.status,
        dimensions: check.dimensions,
        outOfTolerance: check.out_of_tolerance_dimensions || []
      }));

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
              inTolerance++; // No tolerance defined, assume OK
            }
          }
        });
      });

      // Calculate hourly QC dimension averages
      const hourlyQCAverages: HourlyQCDimensionAverage[] = [];
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
          const inTol = tol && tol.min !== undefined && tol.max !== undefined
            ? stats.values.every(v => v >= tol.min && v <= tol.max)
            : true;
          
          hourlyQCAverages.push({
            dimension: dim,
            operation: op,
            min: stats.min,
            max: stats.max,
            avg,
            count: stats.values.length,
            tolerance: tol ? { min: tol.min, max: tol.max } : undefined,
            inTolerance: inTol
          });
        });
      });

      // Collect deviations and waivers
      const deviationsAndWaivers: any[] = [];
      
      // Add NCRs as deviations
      (ncrs || []).forEach((ncr: any) => {
        deviationsAndWaivers.push({
          type: 'NCR',
          reference: ncr.ncr_number,
          description: ncr.issue_description,
          disposition: ncr.disposition,
          status: ncr.status,
          quantity: ncr.quantity_affected
        });
      });

      // Add QC waivers
      (qcRecords || []).filter((r: any) => r.waive_reason).forEach((record: any) => {
        deviationsAndWaivers.push({
          type: 'Waiver',
          reference: record.qc_id,
          description: record.waive_reason,
          qcType: record.qc_type,
          status: 'approved'
        });
      });

      setReportData({
        workOrder: woData,
        hourlyQC: hourlyData || [],
        qcRecords: qcRecords || [],
        ncrs: ncrs || [],
        tolerances: toleranceMap,
        operatorName,
        sampleInspection: {
          sampleSize: sampleResults.length,
          results: sampleResults
        },
        complianceSummary: {
          totalDimensions,
          inTolerance,
          outOfTolerance,
          complianceRate: totalDimensions > 0 ? (inTolerance / totalDimensions) * 100 : 100
        },
        deviationsAndWaivers,
        hourlyQCAverages
      });
    } catch (error: any) {
      console.error('Error loading report data:', error);
      toast.error('Failed to load dispatch report data');
    } finally {
      setLoading(false);
    }
  };

  const generateConsolidatedReport = async () => {
    if (!reportData) return;

    try {
      setGenerating(true);
      
      const doc = new jsPDF();
      let yPos = 20;

      // Branded Header with "FINAL INSPECTION RECORD" stamp
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('R.V. Industries', 105, yPos, { align: 'center' });
      yPos += 8;
      
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('CONSOLIDATED FINAL INSPECTION RECORD', 105, yPos, { align: 'center' });
      yPos += 6;

      // Immutable record notice
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('This is an immutable inspection record. Generated once and linked to dispatch.', 105, yPos, { align: 'center' });
      yPos += 10;

      // Report Metadata Box
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(245, 247, 250);
      doc.rect(15, yPos, 180, 35, 'FD');
      yPos += 8;

      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
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
      doc.text(new Date().toLocaleString(), 55, yPos);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Primary Operator:', 110, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(reportData.operatorName, 155, yPos);
      
      yPos += 18;

      // SECTION 1: Sample-Based Final Inspection
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('1. SAMPLE-BASED FINAL INSPECTION', 20, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      const sampleData = reportData.sampleInspection.results.map((r, idx) => [
        (idx + 1).toString(),
        new Date(r.datetime).toLocaleString(),
        r.operation,
        r.status.toUpperCase(),
        r.outOfTolerance.length > 0 ? r.outOfTolerance.join(', ') : 'None'
      ]);

      if (sampleData.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [['#', 'Date/Time', 'Op', 'Status', 'Out of Tolerance Dims']],
          body: sampleData,
          theme: 'grid',
          headStyles: { fillColor: [28, 63, 148], fontSize: 9 },
          styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: {
            3: { 
              cellWidth: 20,
              fontStyle: 'bold'
            }
          },
          didParseCell: (data: any) => {
            if (data.section === 'body' && data.column.index === 3) {
              data.cell.styles.textColor = data.cell.raw === 'PASS' ? [34, 139, 34] : [220, 38, 38];
            }
          }
        });
        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(10);
        doc.text('No sample inspections recorded.', 25, yPos);
        yPos += 10;
      }

      // SECTION 2: Aggregated In-Process QC Summary
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
      doc.text('Aggregated min/max/avg from all in-process hourly QC checks', 20, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      // Group by operation
      const operationGroups = ['A', 'B', 'C', 'D'];
      
      operationGroups.forEach((op) => {
        const opData = reportData.hourlyQC.filter((h: any) => h.operation === op);
        if (opData.length === 0) return;

        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`Operation ${op} (${opData.length} checks)`, 25, yPos);
        yPos += 6;

        // Calculate dimension stats
        const dimensionStats: Record<string, { values: number[]; min: number; max: number }> = {};
        const opTolerances = reportData.tolerances[op] || {};

        opData.forEach((check: any) => {
          if (check.dimensions) {
            Object.entries(check.dimensions).forEach(([dim, value]: [string, any]) => {
              if (typeof value === 'number') {
                if (!dimensionStats[dim]) {
                  dimensionStats[dim] = { values: [], min: value, max: value };
                }
                dimensionStats[dim].values.push(value);
                dimensionStats[dim].min = Math.min(dimensionStats[dim].min, value);
                dimensionStats[dim].max = Math.max(dimensionStats[dim].max, value);
              }
            });
          }
        });

        // Dimensional Data Table with tolerance status
        if (Object.keys(dimensionStats).length > 0) {
          const dimData = Object.entries(dimensionStats).map(([dim, stats]) => {
            const avg = stats.values.reduce((a, b) => a + b, 0) / stats.values.length;
            const tol = opTolerances[dim];
            let tolStatus = 'N/A';
            if (tol && tol.min !== undefined && tol.max !== undefined) {
              const allInTol = stats.values.every(v => v >= tol.min && v <= tol.max);
              tolStatus = allInTol ? 'PASS' : 'FAIL';
            }
            return [
              dim,
              tol ? `${tol.min} - ${tol.max}` : 'N/A',
              stats.min.toFixed(3),
              stats.max.toFixed(3),
              avg.toFixed(3),
              stats.values.length.toString(),
              tolStatus
            ];
          });

          autoTable(doc, {
            startY: yPos,
            head: [['Dim', 'Tolerance', 'Min', 'Max', 'Avg', 'N', 'Status']],
            body: dimData,
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

          yPos = (doc as any).lastAutoTable.finalY + 5;
        }

        // Binary checks summary
        const binaryChecks = {
          'Visual': { ok: 0, total: 0 },
          'Thread': { ok: 0, total: 0 },
          'Plating': { ok: 0, total: 0 }
        };

        opData.forEach((check: any) => {
          if (check.visual_applicable) {
            binaryChecks['Visual'].total++;
            if (check.visual_status === 'OK') binaryChecks['Visual'].ok++;
          }
          if (check.thread_applicable) {
            binaryChecks['Thread'].total++;
            if (check.thread_status === 'OK') binaryChecks['Thread'].ok++;
          }
          if (check.plating_applicable) {
            binaryChecks['Plating'].total++;
            if (check.plating_status === 'OK') binaryChecks['Plating'].ok++;
          }
        });

        const activeBinaryChecks = Object.entries(binaryChecks).filter(([_, v]) => v.total > 0);
        if (activeBinaryChecks.length > 0) {
          const binaryText = activeBinaryChecks.map(([name, counts]) => 
            `${name}: ${counts.ok}/${counts.total}`
          ).join(' | ');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text(`Binary Checks: ${binaryText}`, 25, yPos);
          yPos += 8;
        }
      });

      // SECTION 3: Tolerance Compliance Summary
      if (yPos > 230) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('3. TOLERANCE COMPLIANCE STATUS', 20, yPos);
      yPos += 10;
      doc.setTextColor(0, 0, 0);

      const complianceColor = reportData.complianceSummary.complianceRate >= 95 ? [34, 139, 34] :
        reportData.complianceSummary.complianceRate >= 80 ? [255, 165, 0] : [220, 38, 38];

      doc.setFillColor(complianceColor[0], complianceColor[1], complianceColor[2]);
      doc.roundedRect(25, yPos, 60, 25, 3, 3, 'F');
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(`${reportData.complianceSummary.complianceRate.toFixed(1)}%`, 55, yPos + 16, { align: 'center' });
      
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Measurements: ${reportData.complianceSummary.totalDimensions}`, 95, yPos + 8);
      doc.text(`In Tolerance: ${reportData.complianceSummary.inTolerance}`, 95, yPos + 15);
      doc.text(`Out of Tolerance: ${reportData.complianceSummary.outOfTolerance}`, 95, yPos + 22);
      
      yPos += 35;

      // SECTION 4: Deviations and Waivers
      if (yPos > 230) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('4. DEVIATIONS AND WAIVERS', 20, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      if (reportData.deviationsAndWaivers.length > 0) {
        const devData = reportData.deviationsAndWaivers.map(d => [
          d.type,
          d.reference || '-',
          (d.description || '').substring(0, 50),
          d.disposition || d.status || '-',
          d.quantity ? `${d.quantity} pcs` : '-'
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Type', 'Reference', 'Description', 'Disposition/Status', 'Qty']],
          body: devData,
          theme: 'grid',
          headStyles: { fillColor: [255, 165, 0], fontSize: 9 },
          styles: { fontSize: 8, cellPadding: 2 }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text('No deviations or waivers recorded for this work order.', 25, yPos);
        yPos += 10;
      }

      // QC Gate Status Summary
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(28, 63, 148);
      doc.text('5. QC GATE STATUS', 20, yPos);
      yPos += 8;
      doc.setTextColor(0, 0, 0);

      const materialQC = reportData.qcRecords.find((r: any) => r.qc_type === 'material');
      const firstPieceQC = reportData.qcRecords.find((r: any) => r.qc_type === 'first_piece');
      const finalQC = reportData.qcRecords.find((r: any) => r.qc_type === 'final');

      const gateData = [
        ['Material QC', materialQC ? materialQC.result?.toUpperCase() : 'NOT DONE', materialQC?.approver?.full_name || '-'],
        ['First Piece QC', firstPieceQC ? firstPieceQC.result?.toUpperCase() : 'NOT DONE', firstPieceQC?.approver?.full_name || '-'],
        ['Final QC', finalQC ? finalQC.result?.toUpperCase() : 'NOT DONE', finalQC?.approver?.full_name || '-']
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['QC Gate', 'Status', 'Approved By']],
        body: gateData,
        theme: 'grid',
        headStyles: { fillColor: [100, 100, 100], fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 3 },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index === 1) {
            data.cell.styles.fontStyle = 'bold';
            if (data.cell.raw === 'PASS') {
              data.cell.styles.textColor = [34, 139, 34];
            } else if (data.cell.raw === 'FAIL') {
              data.cell.styles.textColor = [220, 38, 38];
            } else {
              data.cell.styles.textColor = [150, 150, 150];
            }
          }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Final Sign-off Section
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }

      doc.setDrawColor(28, 63, 148);
      doc.setLineWidth(0.5);
      doc.line(20, yPos, 190, yPos);
      yPos += 10;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('FINAL DISPATCH AUTHORIZATION', 105, yPos, { align: 'center' });
      yPos += 15;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      // Two signature boxes
      doc.rect(20, yPos, 80, 30);
      doc.text('QC Supervisor', 25, yPos + 8);
      doc.text('Name: _______________________', 25, yPos + 18);
      doc.text('Date: _______________________', 25, yPos + 25);
      
      doc.rect(110, yPos, 80, 30);
      doc.text('Production Manager', 115, yPos + 8);
      doc.text('Name: _______________________', 115, yPos + 18);
      doc.text('Date: _______________________', 115, yPos + 25);

      yPos += 40;

      // Immutability footer
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('This document is an immutable final inspection record. Any changes require a new inspection cycle.', 105, yPos, { align: 'center' });
      doc.text(`Report ID: FIR-${woNumber}-${Date.now()}`, 105, yPos + 5, { align: 'center' });

      // Generate PDF blob
      const pdfBlob = doc.output('blob');
      const fileName = `Final_Inspection_Record_${woNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      const filePath = `${woId}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('qc-reports')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: false // Prevent overwriting - enforce immutability
        });

      if (uploadError && !uploadError.message.includes('already exists')) {
        throw uploadError;
      }

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

      // Save immutable record to database with full report data snapshot
      const { data: reportRecord, error: dbError } = await supabase
        .from('qc_final_reports')
        .insert({
          work_order_id: woId,
          generated_by: user?.id,
          file_url: publicUrl,
          file_path: filePath,
          version_number: (count || 0) + 1,
          remarks: 'Consolidated Final Inspection Record',
          report_data: {
            // Snapshot of all data for immutability
            generated_at: new Date().toISOString(),
            work_order: {
              wo_number: woNumber,
              customer,
              item_code: itemCode,
              quantity
            },
            sample_inspection: reportData.sampleInspection,
            compliance_summary: reportData.complianceSummary,
            deviations_and_waivers: reportData.deviationsAndWaivers,
            qc_gates: {
              material: materialQC?.result,
              first_piece: firstPieceQC?.result,
              final: finalQC?.result
            },
            hourly_checks_count: reportData.hourlyQC.length,
            operations_covered: [...new Set(reportData.hourlyQC.map((h: any) => h.operation))]
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
      setExistingReport(reportRecord);
      setShowSuccessModal(true);
      toast.success('Final Inspection Record generated and locked');

    } catch (error: any) {
      console.error('Error generating report:', error);
      toast.error('Failed to generate inspection record: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const viewExistingReport = () => {
    if (existingReport?.file_url) {
      window.open(existingReport.file_url, '_blank');
    }
  };

  const downloadReport = () => {
    const url = generatedReport?.fileUrl || existingReport?.file_url;
    if (url) {
      window.open(url, '_blank');
    }
  };

  const hasHourlyData = reportData?.hourlyQC && reportData.hourlyQC.length > 0;
  const canGenerate = hasHourlyData && !existingReport;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Consolidated Final Inspection Record
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {existingReport ? (
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <div>
                      <strong>Final Inspection Record exists</strong>
                      <p className="text-sm text-muted-foreground mt-1">
                        Generated on {new Date(existingReport.generated_at).toLocaleString()} 
                        (Version {existingReport.version_number})
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={viewExistingReport}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Record
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm text-muted-foreground">
                Generate a consolidated, immutable inspection record including sample inspection, 
                aggregated hourly QC, tolerance compliance, and any deviations/waivers.
              </p>
            )}

            {reportData && !existingReport && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg text-sm">
                <div>
                  <span className="text-muted-foreground">Hourly Checks:</span>
                  <span className="ml-2 font-semibold">{reportData.hourlyQC.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sample Size:</span>
                  <span className="ml-2 font-semibold">{reportData.sampleInspection.sampleSize} pcs</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Compliance:</span>
                  <Badge variant={reportData.complianceSummary.complianceRate >= 95 ? 'default' : 'destructive'}>
                    {reportData.complianceSummary.complianceRate.toFixed(1)}%
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Deviations:</span>
                  <span className="ml-2 font-semibold">{reportData.deviationsAndWaivers.length}</span>
                </div>
              </div>
            )}

            {!existingReport && (
              <Button
                onClick={generateConsolidatedReport}
                disabled={loading || generating || !canGenerate}
                className="w-full"
              >
                {loading || generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {generating ? 'Generating Record...' : 'Loading...'}
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Final Inspection Record
                  </>
                )}
              </Button>
            )}

            {!hasHourlyData && reportData && !existingReport && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  At least one hourly QC check is required before generating the final inspection record.
                </AlertDescription>
              </Alert>
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
              Final Inspection Record Generated
            </DialogTitle>
            <DialogDescription>
              Your consolidated inspection record has been created and locked.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                This record is now immutable and linked to the work order for dispatch.
              </AlertDescription>
            </Alert>
            
            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <p className="text-sm">
                <span className="font-semibold">Work Order:</span> {woNumber}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Customer:</span> {customer}
              </p>
              <p className="text-sm">
                <span className="font-semibold">Compliance Rate:</span>{' '}
                <Badge variant={reportData?.complianceSummary.complianceRate && reportData.complianceSummary.complianceRate >= 95 ? 'default' : 'destructive'}>
                  {reportData?.complianceSummary.complianceRate.toFixed(1)}%
                </Badge>
              </p>
              <p className="text-sm">
                <span className="font-semibold">Generated:</span> {new Date().toLocaleString()}
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowSuccessModal(false)}>
              Close
            </Button>
            <Button onClick={downloadReport}>
              <Download className="h-4 w-4 mr-2" />
              Download Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
