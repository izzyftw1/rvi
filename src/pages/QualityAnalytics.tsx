import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { format, subDays, differenceInMinutes, differenceInDays } from "date-fns";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Target, AlertTriangle, TrendingUp, Percent, Clock, User, Wrench, Settings, Truck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { cn } from "@/lib/utils";

import { QualityKPICards } from "@/components/quality/QualityKPICards";
import { NCRAnalytics } from "@/components/quality/NCRAnalytics";
import { QualityLossIndicators } from "@/components/quality/QualityLossIndicators";
import { IPQCComplianceCard } from "@/components/quality/IPQCComplianceCard";
import { SupplierDefectCard } from "@/components/quality/SupplierDefectCard";
import { FirstPieceMetrics } from "@/components/quality/FirstPieceMetrics";

const COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export default function QualityAnalytics() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState("30");
  const [trendView, setTrendView] = useState<"operator" | "machine" | "setup" | "partner">("operator");
  
  // Raw data from database - directly from production logs and NCRs
  const [productionLogs, setProductionLogs] = useState<any[]>([]);
  const [ncrs, setNcrs] = useState<any[]>([]);
  const [hourlyChecks, setHourlyChecks] = useState<any[]>([]);
  const [materialLots, setMaterialLots] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [fpApprovals, setFpApprovals] = useState<any[]>([]);
  const [externalMoves, setExternalMoves] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  useEffect(() => {
    loadAllData();
  }, [dateRange]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const days = parseInt(dateRange);
      const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

      // Parallel fetches - direct from production logs and NCRs
      const [
        { data: prodLogs },
        { data: ncrData },
        { data: hourlyData },
        { data: matLots },
        { data: woData },
        { data: fpData },
        { data: extMoves },
        { data: machineData },
        { data: operatorData },
        { data: partnerData }
      ] = await Promise.all([
        // Production logs with all rejection fields and relationships
        supabase
          .from("daily_production_logs")
          .select(`
            id, log_date, shift, wo_id, machine_id, operator_id, programmer_id, setter_id,
            actual_quantity, ok_quantity, total_rejection_quantity, rework_quantity,
            rejection_dimension, rejection_setting, rejection_scratch, rejection_dent,
            rejection_tool_mark, rejection_forging_mark, rejection_material_not_ok, rejection_lining,
            rejection_face_not_ok, rejection_previous_setup_fault, setup_number
          `)
          .gte("log_date", startDate),
        // NCRs - directly from NCR Management
        supabase
          .from("ncrs")
          .select(`
            id, ncr_number, status, root_cause, raised_from, quantity_affected,
            created_at, closed_at, work_order_id, machine_id, rejection_type, disposition,
            production_log_id, operator_id, issue_description
          `)
          .gte("created_at", startDate),
        supabase
          .from("hourly_qc_checks")
          .select(`id, wo_id, machine_id, check_datetime, status, created_at`)
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
          .select(`id, machine_id, programmer_id, setup_start_time, first_piece_approval_time, setup_type, activity_date`)
          .gte("activity_date", startDate),
        // External moves for partner defect tracking
        supabase
          .from("wo_external_moves")
          .select(`id, work_order_id, partner_id, quantity_sent, quantity_returned, process, status, returned_date, dispatch_date`)
          .gte("dispatch_date", startDate),
        supabase.from("machines").select("id, name, machine_id"),
        supabase.from("people").select("id, full_name"),
        supabase.from("external_partners").select("id, name, process_type")
      ]);

      setProductionLogs(prodLogs || []);
      setNcrs(ncrData || []);
      setHourlyChecks(hourlyData || []);
      setMaterialLots(matLots || []);
      setWorkOrders(woData || []);
      setFpApprovals(fpData || []);
      setExternalMoves(extMoves || []);
      setMachines(machineData || []);
      setOperators(operatorData || []);
      setPartners(partnerData || []);

    } catch (error: any) {
      console.error("Error loading analytics:", error);
      toast({ variant: "destructive", title: "Error", description: "Failed to load quality analytics" });
    } finally {
      setLoading(false);
    }
  };

  // Helper to get names from IDs
  const getMachineName = (id: string) => machines.find(m => m.id === id)?.name || machines.find(m => m.id === id)?.machine_id || "Unknown";
  const getOperatorName = (id: string) => operators.find(o => o.id === id)?.full_name || "Unknown";
  const getPartnerName = (id: string) => partners.find(p => p.id === id)?.name || "Unknown";

  // Calculate KPIs directly from production logs
  const kpis = useMemo(() => {
    const totalProduced = productionLogs.reduce((sum, l) => sum + (l.actual_quantity || 0), 0);
    const totalOK = productionLogs.reduce((sum, l) => sum + (l.ok_quantity || 0), 0);
    const totalRejected = productionLogs.reduce((sum, l) => sum + (l.total_rejection_quantity || 0), 0);
    const totalRework = productionLogs.reduce((sum, l) => sum + (l.rework_quantity || 0), 0);
    
    const fpy = totalProduced > 0 ? (totalOK / totalProduced) * 100 : 0;
    const rejectionRate = totalProduced > 0 ? (totalRejected / totalProduced) * 100 : 0;
    const reworkRatio = totalProduced > 0 ? (totalRework / totalProduced) * 100 : 0;
    
    const openNCRs = ncrs.filter(n => n.status !== "closed").length;
    const ncrPer1000Pcs = totalProduced > 0 ? (ncrs.length / totalProduced) * 1000 : 0;
    
    // IPQC Pass Rate from hourly checks
    const passedChecks = hourlyChecks.filter(c => c.status === "pass").length;
    const ipqcPassRate = hourlyChecks.length > 0 ? (passedChecks / hourlyChecks.length) * 100 : 100;

    return [
      { label: "First Pass Yield", value: fpy.toFixed(1), unit: "%", status: (fpy >= 95 ? "good" : fpy >= 85 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <Target className="h-4 w-4" /> },
      { label: "Rejection Rate", value: rejectionRate.toFixed(2), unit: "%", status: (rejectionRate <= 2 ? "good" : rejectionRate <= 5 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <AlertTriangle className="h-4 w-4" /> },
      { label: "IPQC Pass Rate", value: ipqcPassRate.toFixed(1), unit: "%", status: (ipqcPassRate >= 95 ? "good" : ipqcPassRate >= 85 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <TrendingUp className="h-4 w-4" /> },
      { label: "NCR Rate", value: ncrPer1000Pcs.toFixed(2), unit: "/1K pcs", status: (ncrPer1000Pcs <= 1 ? "good" : ncrPer1000Pcs <= 5 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <AlertTriangle className="h-4 w-4" /> },
      { label: "Open NCRs", value: openNCRs, status: (openNCRs === 0 ? "good" : openNCRs <= 5 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <Clock className="h-4 w-4" /> },
      { label: "Rework Ratio", value: reworkRatio.toFixed(2), unit: "%", status: (reworkRatio <= 3 ? "good" : reworkRatio <= 8 ? "warning" : "critical") as "good" | "warning" | "critical", icon: <Percent className="h-4 w-4" /> },
    ];
  }, [productionLogs, ncrs, hourlyChecks]);

  // Defect trends by Operator - directly from production logs
  const operatorTrends = useMemo(() => {
    const byOperator: Record<string, { id: string; name: string; produced: number; rejected: number; rework: number; ncrCount: number }> = {};
    
    productionLogs.forEach(log => {
      const opId = log.operator_id || "unknown";
      if (!byOperator[opId]) {
        byOperator[opId] = { id: opId, name: getOperatorName(opId), produced: 0, rejected: 0, rework: 0, ncrCount: 0 };
      }
      byOperator[opId].produced += log.actual_quantity || 0;
      byOperator[opId].rejected += log.total_rejection_quantity || 0;
      byOperator[opId].rework += log.rework_quantity || 0;
    });

    // Add NCR counts by operator
    ncrs.forEach(ncr => {
      const opId = ncr.operator_id || "unknown";
      if (byOperator[opId]) {
        byOperator[opId].ncrCount++;
      }
    });

    return Object.values(byOperator)
      .filter(o => o.produced > 0)
      .map(o => ({
        ...o,
        rejectionRate: o.produced > 0 ? (o.rejected / o.produced) * 100 : 0
      }))
      .sort((a, b) => b.rejected - a.rejected)
      .slice(0, 10);
  }, [productionLogs, ncrs, operators]);

  // Defect trends by Machine - directly from production logs
  const machineTrends = useMemo(() => {
    const byMachine: Record<string, { id: string; name: string; produced: number; rejected: number; rework: number; ncrCount: number }> = {};
    
    productionLogs.forEach(log => {
      const machId = log.machine_id || "unknown";
      if (!byMachine[machId]) {
        byMachine[machId] = { id: machId, name: getMachineName(machId), produced: 0, rejected: 0, rework: 0, ncrCount: 0 };
      }
      byMachine[machId].produced += log.actual_quantity || 0;
      byMachine[machId].rejected += log.total_rejection_quantity || 0;
      byMachine[machId].rework += log.rework_quantity || 0;
    });

    // Add NCR counts by machine
    ncrs.forEach(ncr => {
      const machId = ncr.machine_id || "unknown";
      if (byMachine[machId]) {
        byMachine[machId].ncrCount++;
      }
    });

    return Object.values(byMachine)
      .filter(m => m.produced > 0)
      .map(m => ({
        ...m,
        rejectionRate: m.produced > 0 ? (m.rejected / m.produced) * 100 : 0
      }))
      .sort((a, b) => b.rejected - a.rejected)
      .slice(0, 10);
  }, [productionLogs, ncrs, machines]);

  // Defect trends by Setup (Setter) - directly from production logs
  const setupTrends = useMemo(() => {
    const bySetter: Record<string, { id: string; name: string; setups: number; produced: number; rejected: number; settingFaults: number }> = {};
    
    productionLogs.forEach(log => {
      const setterId = log.setter_id || log.programmer_id || "unknown";
      if (!bySetter[setterId]) {
        bySetter[setterId] = { id: setterId, name: getOperatorName(setterId), setups: 0, produced: 0, rejected: 0, settingFaults: 0 };
      }
      // Count unique setups
      bySetter[setterId].setups++;
      bySetter[setterId].produced += log.actual_quantity || 0;
      bySetter[setterId].rejected += log.total_rejection_quantity || 0;
      // Track setting-related faults
      bySetter[setterId].settingFaults += (log.rejection_setting || 0) + (log.rejection_previous_setup_fault || 0);
    });

    return Object.values(bySetter)
      .filter(s => s.setups > 0)
      .map(s => ({
        ...s,
        faultRate: s.produced > 0 ? (s.settingFaults / s.produced) * 100 : 0
      }))
      .sort((a, b) => b.settingFaults - a.settingFaults)
      .slice(0, 10);
  }, [productionLogs, operators]);

  // Defect trends by External Partner - from external moves with quality issues
  const partnerTrends = useMemo(() => {
    const byPartner: Record<string, { id: string; name: string; sent: number; returned: number; shortfall: number; ncrCount: number }> = {};
    
    externalMoves.forEach(move => {
      const partnerId = move.partner_id || "unknown";
      if (!byPartner[partnerId]) {
        byPartner[partnerId] = { id: partnerId, name: getPartnerName(partnerId), sent: 0, returned: 0, shortfall: 0, ncrCount: 0 };
      }
      byPartner[partnerId].sent += move.quantity_sent || 0;
      byPartner[partnerId].returned += move.quantity_returned || 0;
      // Shortfall = sent - returned (quality/quantity issues)
      if (move.status === 'received') {
        byPartner[partnerId].shortfall += Math.max(0, (move.quantity_sent || 0) - (move.quantity_returned || 0));
      }
    });

    // Count NCRs raised from external processing
    ncrs.filter(n => n.raised_from === 'external' || n.raised_from === 'external_processing').forEach(ncr => {
      // Try to link to partner (would need production log to WO to external move mapping)
      // For now, count all external NCRs
    });

    return Object.values(byPartner)
      .filter(p => p.sent > 0)
      .map(p => ({
        ...p,
        defectRate: p.sent > 0 ? (p.shortfall / p.sent) * 100 : 0
      }))
      .sort((a, b) => b.shortfall - a.shortfall)
      .slice(0, 10);
  }, [externalMoves, ncrs, partners]);

  // NCR Analytics - directly from NCR table
  const ncrMetrics = useMemo(() => {
    const totalProduced = productionLogs.reduce((sum, l) => sum + (l.actual_quantity || 0), 0);
    const ncrPer1000Pcs = totalProduced > 0 ? (ncrs.length / totalProduced) * 1000 : 0;
    const ncrPerWO = workOrders.length > 0 ? ncrs.length / workOrders.length : 0;
    
    // Repeat NCR analysis
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

    // NCR by machine
    const machineCounts: Record<string, { count: number; scrapQty: number }> = {};
    ncrs.forEach(n => {
      const machine = getMachineName(n.machine_id || "");
      if (!machineCounts[machine]) machineCounts[machine] = { count: 0, scrapQty: 0 };
      machineCounts[machine].count++;
      if (n.disposition === 'SCRAP') machineCounts[machine].scrapQty += n.quantity_affected || 0;
    });

    // NCR by rejection type
    const rejectionTypeCounts: Record<string, { count: number; totalQty: number }> = {};
    ncrs.forEach(n => {
      if (n.rejection_type) {
        const types = n.rejection_type.split(',');
        types.forEach((t: string) => {
          const type = t.replace('rejection_', '').replace(/_/g, ' ').trim();
          if (!rejectionTypeCounts[type]) rejectionTypeCounts[type] = { count: 0, totalQty: 0 };
          rejectionTypeCounts[type].count++;
          rejectionTypeCounts[type].totalQty += n.quantity_affected || 0;
        });
      }
    });

    // Scrap by disposition
    const dispositionCounts: Record<string, number> = {};
    ncrs.forEach(n => {
      const disp = n.disposition || 'PENDING';
      dispositionCounts[disp] = (dispositionCounts[disp] || 0) + (n.quantity_affected || 0);
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
      ncrBySource: Object.entries(sourceCounts).map(([source, count]) => ({ source, count })),
      ncrByMachine: Object.entries(machineCounts)
        .map(([machine, data]) => ({ machine, ...data }))
        .sort((a, b) => b.count - a.count),
      ncrByRejectionType: Object.entries(rejectionTypeCounts)
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => b.totalQty - a.totalQty),
      scrapByDisposition: Object.entries(dispositionCounts)
        .map(([disposition, qty]) => ({ disposition, qty })),
      reworkCount: ncrs.filter(n => n.disposition === 'REWORK').length,
    };
  }, [ncrs, productionLogs, workOrders, machines]);

  // Quality loss indicators - directly from production logs
  const lossData = useMemo(() => {
    const totalProduced = productionLogs.reduce((sum, l) => sum + (l.actual_quantity || 0), 0);
    const totalScrap = productionLogs.reduce((sum, l) => sum + (l.total_rejection_quantity || 0), 0);
    const totalRework = productionLogs.reduce((sum, l) => sum + (l.rework_quantity || 0), 0);
    
    const ncrLinkedScrap = ncrs.reduce((sum, n) => sum + (n.quantity_affected || 0), 0);
    
    const scrapPercentage = totalProduced > 0 ? (totalScrap / totalProduced) * 100 : 0;
    const reworkRatio = totalProduced > 0 ? (totalRework / totalProduced) * 100 : 0;
    const ncrScrapPercentage = totalScrap > 0 ? (ncrLinkedScrap / totalScrap) * 100 : 0;

    // Scrap by reason - directly from production logs rejection fields
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
    const checksRequired = Math.max(checksCompleted, Math.ceil(checksCompleted * 1.1));
    const complianceRate = checksRequired > 0 ? (checksCompleted / checksRequired) * 100 : 100;
    const missedChecks = checksRequired - checksCompleted;

    const checksByMachine: Record<string, { machine: string; times: Date[]; completed: number }> = {};
    hourlyChecks.forEach(check => {
      const machine = getMachineName(check.machine_id || "");
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
      rate: 100
    }));

    return { checksCompleted, checksRequired, complianceRate, avgTimeBetweenChecks, missedChecks, checksByMachine: checksByMachineArr };
  }, [hourlyChecks, machines]);

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

    let totalMins = 0;
    withApprovalTime.forEach(f => {
      totalMins += differenceInMinutes(new Date(f.first_piece_approval_time), new Date(f.setup_start_time));
    });
    const avgApprovalTime = withApprovalTime.length > 0 ? totalMins / withApprovalTime.length : 0;

    const byMachine: Record<string, { machine: string; total: number; passed: number }> = {};
    fpApprovals.forEach(f => {
      const machine = getMachineName(f.machine_id || "");
      if (!byMachine[machine]) byMachine[machine] = { machine, total: 0, passed: 0 };
      byMachine[machine].total++;
      if (f.first_piece_approval_time) byMachine[machine].passed++;
    });

    const byProgrammer: Record<string, { programmer: string; total: number; passed: number }> = {};
    fpApprovals.forEach(f => {
      const programmer = getOperatorName(f.programmer_id || "");
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
  }, [fpApprovals, workOrders, machines, operators]);

  // Get current trend data based on selected view
  const currentTrendData = useMemo(() => {
    switch (trendView) {
      case "operator": return operatorTrends;
      case "machine": return machineTrends;
      case "setup": return setupTrends;
      case "partner": return partnerTrends;
      default: return operatorTrends;
    }
  }, [trendView, operatorTrends, machineTrends, setupTrends, partnerTrends]);

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
              description="Defect trends from Production Logs & NCR Management"
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

          {/* Defect Trends by Dimension */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Defect Trends
                  </CardTitle>
                  <CardDescription>
                    Rejections and NCRs from Production Logs by dimension
                  </CardDescription>
                </div>
                <Tabs value={trendView} onValueChange={(v) => setTrendView(v as any)}>
                  <TabsList>
                    <TabsTrigger value="operator" className="flex items-center gap-1">
                      <User className="h-3 w-3" /> Operator
                    </TabsTrigger>
                    <TabsTrigger value="machine" className="flex items-center gap-1">
                      <Wrench className="h-3 w-3" /> Machine
                    </TabsTrigger>
                    <TabsTrigger value="setup" className="flex items-center gap-1">
                      <Settings className="h-3 w-3" /> Setup
                    </TabsTrigger>
                    <TabsTrigger value="partner" className="flex items-center gap-1">
                      <Truck className="h-3 w-3" /> Partner
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {currentTrendData.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available for selected period
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Bar Chart */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">
                      {trendView === "operator" && "Rejections by Operator"}
                      {trendView === "machine" && "Rejections by Machine"}
                      {trendView === "setup" && "Setting Faults by Setter"}
                      {trendView === "partner" && "Shortfall by Partner"}
                    </h4>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={currentTrendData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={100} 
                          className="text-xs"
                          tickFormatter={(v) => v.length > 12 ? v.slice(0, 12) + "..." : v}
                        />
                        <Tooltip />
                        <Bar 
                          dataKey={trendView === "setup" ? "settingFaults" : trendView === "partner" ? "shortfall" : "rejected"} 
                          fill="hsl(var(--destructive))" 
                          name={trendView === "setup" ? "Setting Faults" : trendView === "partner" ? "Shortfall" : "Rejected"}
                          radius={[0, 4, 4, 0]} 
                        />
                        {trendView !== "setup" && trendView !== "partner" && (
                          <Bar dataKey="rework" fill="hsl(var(--warning))" name="Rework" radius={[0, 4, 4, 0]} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Data Table */}
                  <div>
                    <h4 className="text-sm font-medium mb-3">Details</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-2 font-medium">
                              {trendView === "operator" && "Operator"}
                              {trendView === "machine" && "Machine"}
                              {trendView === "setup" && "Setter"}
                              {trendView === "partner" && "Partner"}
                            </th>
                            <th className="text-right p-2 font-medium">
                              {trendView === "partner" ? "Sent" : "Produced"}
                            </th>
                            <th className="text-right p-2 font-medium">
                              {trendView === "setup" ? "Faults" : trendView === "partner" ? "Shortfall" : "Rejected"}
                            </th>
                            <th className="text-right p-2 font-medium">Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentTrendData.slice(0, 8).map((item: any, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-2 truncate max-w-[120px]">{item.name}</td>
                              <td className="p-2 text-right text-muted-foreground">
                                {(trendView === "partner" ? item.sent : item.produced)?.toLocaleString()}
                              </td>
                              <td className="p-2 text-right">
                                <span className="text-destructive font-medium">
                                  {(trendView === "setup" ? item.settingFaults : trendView === "partner" ? item.shortfall : item.rejected)?.toLocaleString()}
                                </span>
                              </td>
                              <td className="p-2 text-right">
                                <Badge variant={
                                  (trendView === "setup" ? item.faultRate : trendView === "partner" ? item.defectRate : item.rejectionRate) <= 2 ? "secondary" :
                                  (trendView === "setup" ? item.faultRate : trendView === "partner" ? item.defectRate : item.rejectionRate) <= 5 ? "outline" : "destructive"
                                }>
                                  {(trendView === "setup" ? item.faultRate : trendView === "partner" ? item.defectRate : item.rejectionRate)?.toFixed(2)}%
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* NCR Analytics - Directly from NCR Management */}
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
