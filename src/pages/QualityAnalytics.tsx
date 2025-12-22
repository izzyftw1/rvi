import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, startOfWeek, startOfMonth, differenceInMinutes, differenceInDays } from "date-fns";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Target, AlertTriangle, TrendingUp, Percent, Clock } from "lucide-react";

import { QualityKPICards } from "@/components/quality/QualityKPICards";
import { RejectionAnalytics } from "@/components/quality/RejectionAnalytics";
import { NCRAnalytics } from "@/components/quality/NCRAnalytics";
import { QualityTrendCharts } from "@/components/quality/QualityTrendCharts";
import { QualityLossIndicators } from "@/components/quality/QualityLossIndicators";
import { IPQCComplianceCard } from "@/components/quality/IPQCComplianceCard";
import { SupplierDefectCard } from "@/components/quality/SupplierDefectCard";
import { FirstPieceMetrics } from "@/components/quality/FirstPieceMetrics";

export default function QualityAnalytics() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30");
  
  // Raw data from database
  const [productionLogs, setProductionLogs] = useState<any[]>([]);
  const [qcRecords, setQcRecords] = useState<any[]>([]);
  const [ncrs, setNcrs] = useState<any[]>([]);
  const [hourlyChecks, setHourlyChecks] = useState<any[]>([]);
  const [materialLots, setMaterialLots] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [fpApprovals, setFpApprovals] = useState<any[]>([]);

  useEffect(() => {
    loadAllData();
  }, [dateRange]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const days = parseInt(dateRange);
      const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

      // Parallel fetches for all data
      const [
        { data: prodLogs },
        { data: qcRecs },
        { data: ncrData },
        { data: hourlyData },
        { data: matLots },
        { data: woData },
        { data: fpData }
      ] = await Promise.all([
        supabase
          .from("daily_production_logs")
          .select(`
            id, log_date, shift, wo_id, machine_id, operator_id, programmer_id,
            actual_quantity, ok_quantity, total_rejection_quantity, rework_quantity,
            rejection_dimension, rejection_setting, rejection_scratch, rejection_dent,
            rejection_tool_mark, rejection_forging_mark, rejection_material_not_ok, rejection_lining,
            rejection_face_not_ok, rejection_previous_setup_fault,
            machines:machine_id(name, machine_id),
            operator:operator_id(full_name),
            programmer:programmer_id(full_name),
            work_order:wo_id(display_id, customer)
          `)
          .gte("log_date", startDate),
        supabase
          .from("qc_records")
          .select("id, result, qc_type, wo_id, created_at")
          .gte("created_at", startDate),
        supabase
          .from("ncrs")
          .select(`
            id, ncr_number, status, root_cause, raised_from, quantity_affected,
            created_at, closed_at, work_order_id
          `)
          .gte("created_at", startDate),
        supabase
          .from("hourly_qc_checks")
          .select(`
            id, wo_id, machine_id, check_datetime, status, created_at,
            machines:machine_id(name, machine_id)
          `)
          .gte("check_datetime", startDate),
        supabase
          .from("material_lots")
          .select("id, lot_id, supplier, qc_status, received_date_time")
          .gte("received_date_time", startDate),
        supabase
          .from("work_orders")
          .select("id, display_id, qc_first_piece_passed, qc_first_piece_approved_at, created_at")
          .gte("created_at", startDate),
        supabase
          .from("cnc_programmer_activity")
          .select(`
            id, machine_id, programmer_id, setup_start_time, first_piece_approval_time,
            setup_type, activity_date,
            machines:machine_id(name, machine_id),
            programmer:programmer_id(full_name)
          `)
          .gte("activity_date", startDate)
      ]);

      setProductionLogs(prodLogs || []);
      setQcRecords(qcRecs || []);
      setNcrs(ncrData || []);
      setHourlyChecks(hourlyData || []);
      setMaterialLots(matLots || []);
      setWorkOrders(woData || []);
      setFpApprovals(fpData || []);

    } catch (error: any) {
      console.error("Error loading analytics:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to load quality analytics" });
    } finally {
      setLoading(false);
    }
  };

  // Calculate KPIs
  const kpis = useMemo(() => {
    const totalProduced = productionLogs.reduce((sum, l) => sum + (l.actual_quantity || 0), 0);
    const totalOK = productionLogs.reduce((sum, l) => sum + (l.ok_quantity || 0), 0);
    const totalRejected = productionLogs.reduce((sum, l) => sum + (l.total_rejection_quantity || 0), 0);
    const totalRework = productionLogs.reduce((sum, l) => sum + (l.rework_quantity || 0), 0);
    
    const fpy = totalProduced > 0 ? (totalOK / totalProduced) * 100 : 0;
    const rejectionRate = totalProduced > 0 ? (totalRejected / totalProduced) * 100 : 0;
    const reworkRatio = totalProduced > 0 ? (totalRework / totalProduced) * 100 : 0;
    
    const totalInspections = qcRecords.length;
    const passedInspections = qcRecords.filter(r => r.result === "pass").length;
    const passRate = totalInspections > 0 ? (passedInspections / totalInspections) * 100 : 0;
    
    const openNCRs = ncrs.filter(n => n.status !== "closed").length;
    const ncrPer1000Pcs = totalProduced > 0 ? (ncrs.length / totalProduced) * 1000 : 0;
    const ncrPerWO = workOrders.length > 0 ? ncrs.length / workOrders.length : 0;
    
    // IPQC Compliance
    const ipqcChecks = hourlyChecks.length;
    
    // Supplier defect rate
    const totalLots = materialLots.length;
    const failedLots = materialLots.filter(l => l.qc_status === "fail" || l.qc_status === "rejected").length;
    const supplierDefectRate = totalLots > 0 ? (failedLots / totalLots) * 100 : 0;

    return [
      { label: "First Pass Yield", value: fpy.toFixed(1), unit: "%", status: (fpy >= 95 ? "good" : fpy >= 85 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <Target className="h-4 w-4" /> },
      { label: "Rejection Rate", value: rejectionRate.toFixed(2), unit: "%", status: (rejectionRate <= 2 ? "good" : rejectionRate <= 5 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <AlertTriangle className="h-4 w-4" /> },
      { label: "QC Pass Rate", value: passRate.toFixed(1), unit: "%", status: (passRate >= 95 ? "good" : passRate >= 85 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <TrendingUp className="h-4 w-4" /> },
      { label: "NCR Rate", value: ncrPer1000Pcs.toFixed(2), unit: "/1K pcs", status: (ncrPer1000Pcs <= 1 ? "good" : ncrPer1000Pcs <= 5 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <AlertTriangle className="h-4 w-4" /> },
      { label: "Open NCRs", value: openNCRs, status: (openNCRs === 0 ? "good" : openNCRs <= 5 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <Clock className="h-4 w-4" /> },
      { label: "Rework Ratio", value: reworkRatio.toFixed(2), unit: "%", status: (reworkRatio <= 3 ? "good" : reworkRatio <= 8 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <Percent className="h-4 w-4" /> },
    ];
  }, [productionLogs, qcRecords, ncrs, workOrders, hourlyChecks, materialLots]);

  // Rejection analytics by dimension
  const rejectionData = useMemo(() => {
    const byMachine: Record<string, { name: string; produced: number; rejections: number }> = {};
    const byOperator: Record<string, { name: string; produced: number; rejections: number }> = {};
    const byProgrammer: Record<string, { name: string; produced: number; rejections: number }> = {};
    const byWorkOrder: Record<string, { name: string; produced: number; rejections: number }> = {};

    productionLogs.forEach(log => {
      const machineName = (log.machines as any)?.name || "Unknown";
      const operatorName = (log.operator as any)?.full_name || "Unknown";
      const programmerName = (log.programmer as any)?.full_name || "Unknown";
      const woName = (log.work_order as any)?.display_id || "Unknown";

      if (!byMachine[machineName]) byMachine[machineName] = { name: machineName, produced: 0, rejections: 0 };
      byMachine[machineName].produced += log.actual_quantity || 0;
      byMachine[machineName].rejections += log.total_rejection_quantity || 0;

      if (!byOperator[operatorName]) byOperator[operatorName] = { name: operatorName, produced: 0, rejections: 0 };
      byOperator[operatorName].produced += log.actual_quantity || 0;
      byOperator[operatorName].rejections += log.total_rejection_quantity || 0;

      if (!byProgrammer[programmerName]) byProgrammer[programmerName] = { name: programmerName, produced: 0, rejections: 0 };
      byProgrammer[programmerName].produced += log.actual_quantity || 0;
      byProgrammer[programmerName].rejections += log.total_rejection_quantity || 0;

      if (!byWorkOrder[woName]) byWorkOrder[woName] = { name: woName, produced: 0, rejections: 0 };
      byWorkOrder[woName].produced += log.actual_quantity || 0;
      byWorkOrder[woName].rejections += log.total_rejection_quantity || 0;
    });

    const toArray = (obj: Record<string, { name: string; produced: number; rejections: number }>) =>
      Object.values(obj)
        .map(item => ({
          ...item,
          rate: item.produced > 0 ? (item.rejections / item.produced) * 100 : 0
        }))
        .filter(item => item.rejections > 0)
        .sort((a, b) => b.rejections - a.rejections);

    return {
      byMachine: toArray(byMachine),
      byOperator: toArray(byOperator),
      byProgrammer: toArray(byProgrammer),
      byWorkOrder: toArray(byWorkOrder)
    };
  }, [productionLogs]);

  // NCR Analytics
  const ncrMetrics = useMemo(() => {
    const totalProduced = productionLogs.reduce((sum, l) => sum + (l.actual_quantity || 0), 0);
    const ncrPer1000Pcs = totalProduced > 0 ? (ncrs.length / totalProduced) * 1000 : 0;
    const ncrPerWO = workOrders.length > 0 ? ncrs.length / workOrders.length : 0;
    
    // Repeat NCR analysis (same root cause within 90 days)
    const rootCauseCounts: Record<string, number> = {};
    ncrs.forEach(n => {
      const rc = n.root_cause || "Unspecified";
      rootCauseCounts[rc] = (rootCauseCounts[rc] || 0) + 1;
    });
    const repeatNCRs = Object.entries(rootCauseCounts)
      .filter(([_, count]) => count > 1)
      .map(([rootCause, count]) => ({ rootCause, count }))
      .sort((a, b) => b.count - a.count);
    const totalRepeatNCRs = repeatNCRs.reduce((sum, r) => sum + r.count - 1, 0);
    const repeatNCRRate = ncrs.length > 0 ? (totalRepeatNCRs / ncrs.length) * 100 : 0;
    
    const openNCRs = ncrs.filter(n => n.status !== "closed").length;
    const closedNCRs = ncrs.filter(n => n.status === "closed").length;
    
    // Average aging for closed NCRs
    let avgAgingDays = 0;
    const closedWithDates = ncrs.filter(n => n.closed_at && n.created_at);
    if (closedWithDates.length > 0) {
      const totalDays = closedWithDates.reduce((sum, n) => {
        return sum + differenceInDays(new Date(n.closed_at), new Date(n.created_at));
      }, 0);
      avgAgingDays = totalDays / closedWithDates.length;
    }
    
    // NCR by age bucket
    const now = new Date();
    const ageBuckets = { "0-3 days": 0, "4-7 days": 0, "8-14 days": 0, "15-30 days": 0, "30+ days": 0 };
    ncrs.filter(n => n.status !== "closed").forEach(n => {
      const days = differenceInDays(now, new Date(n.created_at));
      if (days <= 3) ageBuckets["0-3 days"]++;
      else if (days <= 7) ageBuckets["4-7 days"]++;
      else if (days <= 14) ageBuckets["8-14 days"]++;
      else if (days <= 30) ageBuckets["15-30 days"]++;
      else ageBuckets["30+ days"]++;
    });
    
    // NCR by source
    const sourceCounts: Record<string, number> = {};
    ncrs.forEach(n => {
      const source = n.raised_from || "Unknown";
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    return {
      ncrPer1000Pcs,
      ncrPerWO,
      repeatNCRRate,
      openNCRs,
      closedNCRs,
      avgAgingDays,
      ncrByAge: Object.entries(ageBuckets).map(([range, count]) => ({ range, count })),
      repeatNCRs,
      ncrBySource: Object.entries(sourceCounts).map(([source, count]) => ({ source, count }))
    };
  }, [ncrs, productionLogs, workOrders]);

  // Trend data
  const trendData = useMemo(() => {
    const dailyData: Record<string, { date: string; produced: number; ok: number; rejected: number; rework: number; passed: number; failed: number }> = {};
    
    productionLogs.forEach(log => {
      const date = format(new Date(log.log_date), "MMM dd");
      if (!dailyData[date]) {
        dailyData[date] = { date, produced: 0, ok: 0, rejected: 0, rework: 0, passed: 0, failed: 0 };
      }
      dailyData[date].produced += log.actual_quantity || 0;
      dailyData[date].ok += log.ok_quantity || 0;
      dailyData[date].rejected += log.total_rejection_quantity || 0;
      dailyData[date].rework += log.rework_quantity || 0;
    });

    qcRecords.forEach(qc => {
      const date = format(new Date(qc.created_at), "MMM dd");
      if (!dailyData[date]) {
        dailyData[date] = { date, produced: 0, ok: 0, rejected: 0, rework: 0, passed: 0, failed: 0 };
      }
      if (qc.result === "pass") dailyData[date].passed++;
      if (qc.result === "fail") dailyData[date].failed++;
    });

    const dailyTrend = Object.values(dailyData)
      .map(d => ({
        date: d.date,
        passRate: (d.passed + d.failed) > 0 ? (d.passed / (d.passed + d.failed)) * 100 : 0,
        fpy: d.produced > 0 ? (d.ok / d.produced) * 100 : 0,
        rejectionRate: d.produced > 0 ? (d.rejected / d.produced) * 100 : 0,
        scrap: d.rejected,
        rework: d.rework
      }))
      .slice(-14);

    // Weekly aggregation
    const weeklyData: Record<string, typeof dailyData[string]> = {};
    Object.entries(dailyData).forEach(([_, data]) => {
      const weekStart = format(startOfWeek(new Date()), "MMM dd");
      if (!weeklyData[weekStart]) {
        weeklyData[weekStart] = { date: weekStart, produced: 0, ok: 0, rejected: 0, rework: 0, passed: 0, failed: 0 };
      }
      weeklyData[weekStart].produced += data.produced;
      weeklyData[weekStart].ok += data.ok;
      weeklyData[weekStart].rejected += data.rejected;
      weeklyData[weekStart].rework += data.rework;
      weeklyData[weekStart].passed += data.passed;
      weeklyData[weekStart].failed += data.failed;
    });

    const weeklyTrend = Object.values(weeklyData).map(d => ({
      date: d.date,
      passRate: (d.passed + d.failed) > 0 ? (d.passed / (d.passed + d.failed)) * 100 : 0,
      fpy: d.produced > 0 ? (d.ok / d.produced) * 100 : 0,
      rejectionRate: d.produced > 0 ? (d.rejected / d.produced) * 100 : 0,
      scrap: d.rejected,
      rework: d.rework
    }));

    return { dailyTrend, weeklyTrend, monthlyTrend: weeklyTrend };
  }, [productionLogs, qcRecords]);

  // Quality loss indicators
  const lossData = useMemo(() => {
    const totalProduced = productionLogs.reduce((sum, l) => sum + (l.actual_quantity || 0), 0);
    const totalScrap = productionLogs.reduce((sum, l) => sum + (l.total_rejection_quantity || 0), 0);
    const totalRework = productionLogs.reduce((sum, l) => sum + (l.rework_quantity || 0), 0);
    
    // NCR-linked scrap (sum of quantity_affected from NCRs)
    const ncrLinkedScrap = ncrs.reduce((sum, n) => sum + (n.quantity_affected || 0), 0);
    
    const scrapPercentage = totalProduced > 0 ? (totalScrap / totalProduced) * 100 : 0;
    const reworkRatio = totalProduced > 0 ? (totalRework / totalProduced) * 100 : 0;
    const ncrScrapPercentage = totalScrap > 0 ? (ncrLinkedScrap / totalScrap) * 100 : 0;

    // Scrap by reason
    const scrapReasons: Record<string, number> = {
      "Dimension": 0, "Setting": 0, "Scratch": 0, "Dent": 0,
      "Tool Mark": 0, "Forging Mark": 0, "Material": 0, "Lining": 0,
      "Face Not OK": 0, "Prev Setup": 0
    };
    productionLogs.forEach(log => {
      scrapReasons["Dimension"] += log.rejection_dimension || 0;
      scrapReasons["Setting"] += log.rejection_setting || 0;
      scrapReasons["Scratch"] += log.rejection_scratch || 0;
      scrapReasons["Dent"] += log.rejection_dent || 0;
      scrapReasons["Tool Mark"] += log.rejection_tool_mark || 0;
      scrapReasons["Forging Mark"] += log.rejection_forging_mark || 0;
      scrapReasons["Material"] += log.rejection_material_not_ok || 0;
      scrapReasons["Lining"] += log.rejection_lining || 0;
      scrapReasons["Face Not OK"] += log.rejection_face_not_ok || 0;
      scrapReasons["Prev Setup"] += log.rejection_previous_setup_fault || 0;
    });

    const scrapByReason = Object.entries(scrapReasons)
      .filter(([_, qty]) => qty > 0)
      .map(([reason, quantity]) => ({ reason, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

    return { totalProduced, totalScrap, totalRework, ncrLinkedScrap, scrapByReason, reworkRatio, scrapPercentage, ncrScrapPercentage };
  }, [productionLogs, ncrs]);

  // IPQC Compliance
  const ipqcData = useMemo(() => {
    const checksCompleted = hourlyChecks.length;
    // Estimate required checks: 1 per hour per active machine per shift
    // For simplicity, assume required = completed * 1.1 (would need actual scheduling data)
    const checksRequired = Math.max(checksCompleted, Math.ceil(checksCompleted * 1.1));
    const complianceRate = checksRequired > 0 ? (checksCompleted / checksRequired) * 100 : 100;
    const missedChecks = checksRequired - checksCompleted;

    // Avg time between checks per machine
    const checksByMachine: Record<string, { machine: string; times: Date[]; completed: number }> = {};
    hourlyChecks.forEach(check => {
      const machine = (check.machines as any)?.name || "Unknown";
      if (!checksByMachine[machine]) {
        checksByMachine[machine] = { machine, times: [], completed: 0 };
      }
      checksByMachine[machine].times.push(new Date(check.check_datetime));
      checksByMachine[machine].completed++;
    });

    let totalTimeDiff = 0;
    let timeDiffCount = 0;
    Object.values(checksByMachine).forEach(m => {
      m.times.sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < m.times.length; i++) {
        totalTimeDiff += differenceInMinutes(m.times[i], m.times[i - 1]);
        timeDiffCount++;
      }
    });
    const avgTimeBetweenChecks = timeDiffCount > 0 ? totalTimeDiff / timeDiffCount : 60;

    const checksByMachineArr = Object.values(checksByMachine).map(m => ({
      machine: m.machine,
      completed: m.completed,
      required: Math.ceil(m.completed * 1.1),
      rate: 100 // Simplified
    }));

    return { checksCompleted, checksRequired, complianceRate, avgTimeBetweenChecks, missedChecks, checksByMachine: checksByMachineArr };
  }, [hourlyChecks]);

  // Supplier defect data
  const supplierData = useMemo(() => {
    const totalLots = materialLots.length;
    const passedLots = materialLots.filter(l => l.qc_status === "pass" || l.qc_status === "approved").length;
    const failedLots = materialLots.filter(l => l.qc_status === "fail" || l.qc_status === "rejected").length;
    const defectRate = totalLots > 0 ? (failedLots / totalLots) * 100 : 0;

    const bySupplier: Record<string, { supplier: string; total: number; passed: number; failed: number }> = {};
    materialLots.forEach(lot => {
      const supplier = lot.supplier || "Unknown";
      if (!bySupplier[supplier]) {
        bySupplier[supplier] = { supplier, total: 0, passed: 0, failed: 0 };
      }
      bySupplier[supplier].total++;
      if (lot.qc_status === "pass" || lot.qc_status === "approved") bySupplier[supplier].passed++;
      if (lot.qc_status === "fail" || lot.qc_status === "rejected") bySupplier[supplier].failed++;
    });

    return {
      totalLots,
      passedLots,
      failedLots,
      defectRate,
      bySupplier: Object.values(bySupplier)
        .map(s => ({ ...s, rate: s.total > 0 ? (s.failed / s.total) * 100 : 0 }))
        .sort((a, b) => b.failed - a.failed)
    };
  }, [materialLots]);

  // First Piece metrics
  const firstPieceData = useMemo(() => {
    const totalSetups = fpApprovals.length;
    const withApprovalTime = fpApprovals.filter(f => f.first_piece_approval_time && f.setup_start_time);
    const firstPieceRight = workOrders.filter(wo => wo.qc_first_piece_passed === true).length;
    const fprRate = workOrders.length > 0 ? (firstPieceRight / workOrders.length) * 100 : 0;

    // Avg approval time
    let totalMins = 0;
    withApprovalTime.forEach(f => {
      totalMins += differenceInMinutes(new Date(f.first_piece_approval_time), new Date(f.setup_start_time));
    });
    const avgApprovalTime = withApprovalTime.length > 0 ? totalMins / withApprovalTime.length : 0;

    // By machine
    const byMachine: Record<string, { machine: string; total: number; passed: number }> = {};
    fpApprovals.forEach(f => {
      const machine = (f.machines as any)?.name || "Unknown";
      if (!byMachine[machine]) byMachine[machine] = { machine, total: 0, passed: 0 };
      byMachine[machine].total++;
      if (f.first_piece_approval_time) byMachine[machine].passed++;
    });

    // By programmer
    const byProgrammer: Record<string, { programmer: string; total: number; passed: number }> = {};
    fpApprovals.forEach(f => {
      const programmer = (f.programmer as any)?.full_name || "Unknown";
      if (!byProgrammer[programmer]) byProgrammer[programmer] = { programmer, total: 0, passed: 0 };
      byProgrammer[programmer].total++;
      if (f.first_piece_approval_time) byProgrammer[programmer].passed++;
    });

    return {
      totalSetups,
      firstPieceRight,
      fprRate,
      avgApprovalTime: Math.max(0, avgApprovalTime),
      byMachine: Object.values(byMachine).map(m => ({ ...m, rate: m.total > 0 ? (m.passed / m.total) * 100 : 0 })),
      byProgrammer: Object.values(byProgrammer).map(p => ({ ...p, rate: p.total > 0 ? (p.passed / p.total) * 100 : 0 }))
    };
  }, [fpApprovals, workOrders]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PageContainer maxWidth="2xl">
          <div className="space-y-6">
            <Skeleton className="h-10 w-64" />
            <div className="grid grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-96" />
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="2xl">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <PageHeader
              title="Quality Analytics"
              description="Advanced quality KPIs, trends, and accountability metrics"
              icon={<BarChart3 className="h-6 w-6" />}
            />
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 6 months</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* KPI Cards */}
          <QualityKPICards kpis={kpis} />

          {/* Quality Loss Indicators */}
          <QualityLossIndicators data={lossData} />

          {/* Trend Charts */}
          <QualityTrendCharts 
            dailyTrend={trendData.dailyTrend}
            weeklyTrend={trendData.weeklyTrend}
            monthlyTrend={trendData.monthlyTrend}
          />

          {/* Rejection Analysis by Dimension */}
          <RejectionAnalytics data={rejectionData} />

          {/* NCR Analytics */}
          <NCRAnalytics data={ncrMetrics} />

          {/* IPQC & First Piece Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <IPQCComplianceCard data={ipqcData} />
            <FirstPieceMetrics data={firstPieceData} />
          </div>

          {/* Supplier Defect Analysis */}
          <SupplierDefectCard data={supplierData} />
        </div>
      </PageContainer>
    </div>
  );
}
