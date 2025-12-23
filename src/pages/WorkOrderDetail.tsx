import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { QCRecordsTab } from "@/components/QCRecordsTab";
import { WorkOrderGenealogy } from "@/components/WorkOrderGenealogy";
import { MachineAssignmentDialog } from "@/components/MachineAssignmentDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Clock, FileText, Edit, Download, ArrowLeft, Cpu, Flag, AlertTriangle, FlaskConical, CheckSquare, Scissors, Hammer, Send, Package } from "lucide-react";

import { EnhancedProductionTab } from "@/components/EnhancedProductionTab";
import { EnhancedStageHistory } from "@/components/EnhancedStageHistory";
import { WorkOrderSummary } from "@/components/WorkOrderSummary";
import { EnhancedQCRecords } from "@/components/EnhancedQCRecords";
import { WOVersionLog } from "@/components/WOVersionLog";
import { EnhancedExternalTab } from "@/components/EnhancedExternalTab";
import { WOTimelineVisualization } from "@/components/WOTimelineVisualization";
import { WOAuditTrailModal } from "@/components/WOAuditTrailModal";
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalChallanTable } from "@/components/ExternalChallanTable";

import { WOProgressCard } from "@/components/WOProgressCard";
import { ProductionLogsTable } from "@/components/ProductionLogsTable";
import { QCGateStatusBadge } from "@/components/QCGateStatusBadge";
import { MaterialQCApproval } from "@/components/MaterialQCApproval";
import { FirstPieceQCApproval } from "@/components/FirstPieceQCApproval";
import { MaterialMovementTimeline } from "@/components/MaterialMovementTimeline";
import { useUserRole } from "@/hooks/useUserRole";
import { ProductionReleaseSection } from "@/components/ProductionReleaseSection";
import { OEEWidget } from "@/components/OEEWidget";
import { QCStageCard } from "@/components/qc/QCStageCard";
import { FinalQCReportGenerator } from "@/components/qc/FinalQCReportGenerator";
import { OperationRouteManager } from "@/components/OperationRouteManager";
import { OperationRouteStatus } from "@/components/OperationRouteStatus";
import { RouteProgressView } from "@/components/routing/RouteProgressView";
import { WorkOrderNCRList } from "@/components/ncr/WorkOrderNCRList";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";

const WorkOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { isFinanceRole, hasAnyRole } = useUserRole();
  
  // Check if user can manage external processing
  const canManageExternal = hasAnyRole(['production', 'logistics', 'admin']);
  const [wo, setWo] = useState<any>(null);
  const [salesOrder, setSalesOrder] = useState<any>(null);
  const [routingSteps, setRoutingSteps] = useState<any[]>([]);
  const [materialIssues, setMaterialIssues] = useState<any[]>([]);
  const [qcRecords, setQcRecords] = useState<any[]>([]);
  const [hourlyQcRecords, setHourlyQcRecords] = useState<any[]>([]);
  const [scanEvents, setScanEvents] = useState<any[]>([]);
  const [stageHistory, setStageHistory] = useState<any[]>([]);
  const [designFiles, setDesignFiles] = useState<any[]>([]);
  const [genealogyLog, setGenealogyLog] = useState<any[]>([]);
  const [uploadingDesign, setUploadingDesign] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [showAssignmentDialog, setShowAssignmentDialog] = useState(false);
  const [machineAssignments, setMachineAssignments] = useState<any[]>([]);
  const [woProgress, setWoProgress] = useState<any>(null);
  const [woOEE, setWoOEE] = useState<any>(null);
  const [qcGatesBlocked, setQcGatesBlocked] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [cuttingRecords, setCuttingRecords] = useState<any[]>([]);
  const [forgingRecords, setForgingRecords] = useState<any[]>([]);
  const [showExternalDialog, setShowExternalDialog] = useState(false);
  const [externalMoves, setExternalMoves] = useState<any[]>([]);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [qcApprovers, setQcApprovers] = useState<Record<string, string>>({});
  const [releasedByName, setReleasedByName] = useState<string>('');
  const [productionNotReleased, setProductionNotReleased] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(() => {
    return localStorage.getItem('wo-detail-active-tab') || 'production';
  });

  useEffect(() => {
    localStorage.setItem('wo-detail-active-tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    loadWorkOrderData();

    // Setup real-time subscriptions
    const channel = supabase
      .channel(`work_order_details_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cutting_records', filter: `work_order_id=eq.${id}` }, () => {
        loadWorkOrderData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forging_records', filter: `work_order_id=eq.${id}` }, () => {
        loadWorkOrderData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves', filter: `work_order_id=eq.${id}` }, () => {
        loadWorkOrderData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_production_logs', filter: `wo_id=eq.${id}` }, () => {
        // Reload progress when production logs change
        loadWorkOrderData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (wo) {
      // Use unified status fields - prefer qc_material_status, fallback to qc_raw_material_status
      const materialStatus = wo.qc_material_status || wo.qc_raw_material_status || 'pending';
      const firstPieceStatus = wo.qc_first_piece_status || 'pending';
      
      // QC gates block production if they are pending or failed (but NOT if waived or passed)
      const materialBlocked = materialStatus === 'pending' || materialStatus === 'failed';
      const firstPieceBlocked = firstPieceStatus === 'pending' || firstPieceStatus === 'failed';
      setQcGatesBlocked(materialBlocked || firstPieceBlocked);
      
      // Production release gate
      setProductionNotReleased(wo.production_release_status !== 'RELEASED');
    }
  }, [wo]);

  const loadWorkOrderData = async () => {
    try {
      // Load WO
      const { data: woData } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", id)
        .single();

      setWo(woData);

      // Load sales order if linked
      if (woData?.sales_order) {
        const { data: soData } = await supabase
          .from("sales_orders")
          .select("*")
          .eq("id", woData.sales_order)
          .single();
        setSalesOrder(soData || null);
        setSalesOrder(soData);
      }

      // Load routing steps
      const { data: stepsData } = await supabase
        .from("routing_steps")
        .select("*, departments(name)")
        .eq("wo_id", id)
        .order("step_number");

      setRoutingSteps(stepsData || []);

      // Load material issues
      const { data: issuesData } = await supabase
        .from("wo_material_issues")
        .select("*, material_lots(lot_id, heat_no, alloy)")
        .eq("wo_id", id);

      setMaterialIssues(issuesData || []);

      // Load QC records
      const { data: qcData } = await supabase
        .from("qc_records")
        .select("*")
        .eq("wo_id", id)
        .order("created_at", { ascending: false });

      setQcRecords(qcData || []);

      // Load hourly QC records (fetch base rows first)
      const { data: hourlyChecks, error: hourlyErr } = await supabase
        .from("hourly_qc_checks")
        .select("*")
        .eq("wo_id", id)
        .order("check_datetime", { ascending: false });

      if (hourlyErr || !hourlyChecks) {
        setHourlyQcRecords([]);
      } else {
        // Enrich with machine and operator names without relying on FKs
        const { data: allMachines } = await supabase
          .from("machines")
          .select("id, machine_id, name");
        const machinesMap: Record<string, { machine_id: string; name: string }> = {};
        (allMachines || []).forEach((m: any) => {
          machinesMap[m.id] = { machine_id: m.machine_id, name: m.name };
        });

        const operatorIds = Array.from(
          new Set((hourlyChecks || []).map((c: any) => c.operator_id).filter(Boolean))
        );
        let profilesMap: Record<string, { full_name: string }> = {};
        if (operatorIds.length > 0) {
          const { data: profileRows } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", operatorIds as string[]);
          (profileRows || []).forEach((p: any) => {
            profilesMap[p.id] = { full_name: p.full_name };
          });
        }

        const enriched = (hourlyChecks || []).map((c: any) => ({
          ...c,
          machines: c.machine_id ? machinesMap[c.machine_id] : undefined,
          profiles: c.operator_id ? profilesMap[c.operator_id] : undefined,
        }));

        setHourlyQcRecords(enriched);
      }

      // Load scan events
      const { data: eventsData } = await supabase
        .from("scan_events")
        .select("*, profiles(full_name)")
        .eq("entity_id", woData?.wo_id)
        .order("scan_date_time", { ascending: false });

      setScanEvents(eventsData || []);

      // Load stage history
      const { data: historyData } = await supabase
        .from("wo_stage_history")
        .select("*, profiles(full_name)")
        .eq("wo_id", id)
        .order("changed_at", { ascending: false });

      setStageHistory(historyData || []);

      // Load design files
      const { data: designData } = await supabase
        .from("design_files")
        .select("*")
        .eq("wo_id", id)
        .order("uploaded_at", { ascending: false });

      setDesignFiles(designData || []);

      // Load genealogy log (comprehensive action log)
      const { data: genealogyData } = await supabase
        .from("wo_actions_log")
        .select("*")
        .eq("wo_id", id)
        .order("created_at", { ascending: true });

      // Enrich with user names
      const userIds = Array.from(
        new Set(genealogyData?.map(log => log.performed_by).filter(Boolean) || [])
      );
      
      let usersMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds as string[]);
        
        profiles?.forEach(p => {
          usersMap[p.id] = p.full_name;
        });
      }

      const enrichedGenealogy = (genealogyData || []).map(log => ({
        ...log,
        performer_name: log.performed_by ? usersMap[log.performed_by] : "System"
      }));

      setGenealogyLog(enrichedGenealogy);

      // Load machine assignments
      const { data: assignmentsData } = await supabase
        .from("wo_machine_assignments")
        .select(`
          *,
          machine:machines(machine_id, name)
        `)
        .eq("wo_id", id)
        .order("scheduled_start", { ascending: true });

      setMachineAssignments(assignmentsData || []);

      // Load production progress
      if (id) {
        const { data: progressData } = await supabase.rpc("get_wo_progress", {
          _wo_id: id,
        });
        setWoProgress(progressData?.[0] || null);
      }

      // Load OEE for assigned machines
      if (assignmentsData && assignmentsData.length > 0) {
        await loadWOOEE(assignmentsData);
      }

      // Load cutting records
      const { data: cuttingData } = await supabase
        .from("cutting_records")
        .select("*")
        .eq("work_order_id", id)
        .order("created_at", { ascending: false });
      
      setCuttingRecords(cuttingData || []);

      // Load forging records
      const { data: forgingData } = await supabase
        .from("forging_records")
        .select("*")
        .eq("work_order_id", id)
        .order("created_at", { ascending: false });
      
      setForgingRecords(forgingData || []);

      // Load external moves
      const { data: movesData } = await supabase
        .from("wo_external_moves" as any)
        .select("id, work_order_id, process, qty_sent, status, partner_id, expected_return_date, dispatch_date, challan_no, remarks")
        .eq("work_order_id", id)
        .order("dispatch_date", { ascending: false });
      
      setExternalMoves(movesData || []);

      // Load QC approver names and production release user
      if (woData) {
        const approverIds = [
          woData.qc_raw_material_approved_by,
          woData.qc_first_piece_approved_by,
          woData.qc_final_approved_by,
          woData.production_released_by
        ].filter(Boolean);

        if (approverIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', approverIds);

          const approversMap: Record<string, string> = {};
          profiles?.forEach(p => {
            approversMap[p.id] = p.full_name;
          });
          setQcApprovers(approversMap);
          
          // Set released by name
          if (woData.production_released_by && approversMap[woData.production_released_by]) {
            setReleasedByName(approversMap[woData.production_released_by]);
          }
        }
      }
    } catch (error) {
      console.error("Error loading WO data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadWOOEE = async (assignments: any[]) => {
    try {
      // Get assigned machines (not just running - all assigned to this WO)
      const assignedMachines = assignments.map((a: any) => a.machine_id);

      if (assignedMachines.length === 0) {
        setWoOEE(null);
        return;
      }

      const today = format(new Date(), 'yyyy-MM-dd');
      const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(new Date()), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      // Fetch production logs for this WO - single source of truth
      const { data: todayLogs } = await supabase
        .from('daily_production_logs')
        .select('actual_runtime_minutes, total_downtime_minutes, ok_quantity, total_rejection_quantity, target_quantity')
        .eq('wo_id', id)
        .eq('log_date', today);

      const { data: weekLogs } = await supabase
        .from('daily_production_logs')
        .select('actual_runtime_minutes, total_downtime_minutes, ok_quantity, total_rejection_quantity, target_quantity')
        .eq('wo_id', id)
        .gte('log_date', weekStart)
        .lte('log_date', weekEnd);

      const { data: monthLogs } = await supabase
        .from('daily_production_logs')
        .select('actual_runtime_minutes, total_downtime_minutes, ok_quantity, total_rejection_quantity, target_quantity')
        .eq('wo_id', id)
        .gte('log_date', monthStart)
        .lte('log_date', monthEnd);

      // Calculate OEE from production logs
      // OEE = Availability × Performance × Quality
      // Availability = Actual Run Time / (Actual Run Time + Downtime)
      // Performance = Actual Output / Target Output (or Actual/Expected based on cycle time)
      // Quality = OK Quantity / (OK Quantity + Rejection Quantity)
      const calculateOEEFromLogs = (logs: any[]) => {
        if (!logs || logs.length === 0) {
          return { availability: 0, performance: 0, quality: 0, oee: 0 };
        }

        const totals = logs.reduce((acc, log) => ({
          runtime: acc.runtime + (log.actual_runtime_minutes || 0),
          downtime: acc.downtime + (log.total_downtime_minutes || 0),
          okQty: acc.okQty + (log.ok_quantity || 0),
          rejectQty: acc.rejectQty + (log.total_rejection_quantity || 0),
          targetQty: acc.targetQty + (log.target_quantity || 0),
        }), { runtime: 0, downtime: 0, okQty: 0, rejectQty: 0, targetQty: 0 });

        const totalTime = totals.runtime + totals.downtime;
        const totalProduced = totals.okQty + totals.rejectQty;

        const availability = totalTime > 0 ? (totals.runtime / totalTime) * 100 : 0;
        const performance = totals.targetQty > 0 ? Math.min((totalProduced / totals.targetQty) * 100, 100) : 0;
        const quality = totalProduced > 0 ? (totals.okQty / totalProduced) * 100 : 0;
        const oee = (availability * performance * quality) / 10000;

        return {
          availability: Math.round(availability * 10) / 10,
          performance: Math.round(performance * 10) / 10,
          quality: Math.round(quality * 10) / 10,
          oee: Math.round(oee * 10) / 10,
        };
      };

      setWoOEE({
        today: calculateOEEFromLogs(todayLogs || []),
        week: calculateOEEFromLogs(weekLogs || []),
        month: calculateOEEFromLogs(monthLogs || []),
      });
    } catch (error: any) {
      console.error('Error loading WO OEE:', error);
    }
  };

  const handleStageUpdate = async (newStage: string) => {
    try {
      const { error } = await supabase
        .from("work_orders")
        .update({ current_stage: newStage as any })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Stage updated",
        description: `Work order stage updated to ${newStage.replace('_', ' ').toUpperCase()}`,
      });

      setShowStageDialog(false);
      loadWorkOrderData();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to update stage",
        description: error.message,
      });
    }
  };

  const handleDesignUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !wo) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'dxf', 'step'].includes(fileExtension || '')) {
      toast({
        title: "Invalid file type",
        description: "Only PDF, DXF, and STEP files are allowed",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploadingDesign(true);
      const { data: { user } } = await supabase.auth.getUser();

      const maxVersion = designFiles.length > 0 
        ? Math.max(...designFiles.map(f => f.version))
        : 0;
      const nextVersion = maxVersion + 1;

      const filePath = `${wo.id}/${nextVersion}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('design-files')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      await supabase
        .from('design_files')
        .update({ is_latest: false })
        .eq('wo_id', wo.id);

      const { error: dbError } = await supabase
        .from('design_files')
        .insert({
          wo_id: wo.id,
          file_path: filePath,
          file_name: file.name,
          file_type: fileExtension || 'pdf',
          version: nextVersion,
          uploaded_by: user?.id,
          is_latest: true,
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: `Design file v${nextVersion} uploaded successfully`,
      });

      loadWorkOrderData();
    } catch (error: any) {
      toast({
        title: "Error uploading design",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingDesign(false);
      e.target.value = '';
    }
  };

  const downloadDesignFile = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('design-files')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Error downloading file",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const exportGenealogyPDF = () => {
    const { jsPDF } = require('jspdf');
    require('jspdf-autotable');
    
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(18);
    doc.text(`Work Order Genealogy: ${wo?.wo_id}`, 14, 20);
    
    doc.setFontSize(11);
    doc.text(`Customer: ${wo?.customer}`, 14, 30);
    doc.text(`Item: ${wo?.item_code}`, 14, 36);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 42);
    
    // Prepare table data
    const tableData = genealogyLog.map(log => [
      new Date(log.created_at).toLocaleString(),
      log.department,
      log.action_type.replace(/_/g, ' ').toUpperCase(),
      log.performer_name,
      JSON.stringify(log.action_details, null, 2).substring(0, 100)
    ]);
    
    doc.autoTable({
      head: [['Time', 'Department', 'Action', 'Performed By', 'Details']],
      body: tableData,
      startY: 50,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] }
    });
    
    doc.save(`WO_Genealogy_${wo?.wo_id}_${new Date().toISOString().split('T')[0]}.pdf`);
    
    toast({
      title: "Success",
      description: "Genealogy exported as PDF",
    });
  };

  const exportGenealogyExcel = () => {
    const XLSX = require('xlsx');
    
    const data = genealogyLog.map(log => ({
      'Timestamp': new Date(log.created_at).toLocaleString(),
      'Department': log.department,
      'Action Type': log.action_type.replace(/_/g, ' ').toUpperCase(),
      'Performed By': log.performer_name,
      'Action Details': JSON.stringify(log.action_details, null, 2)
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Genealogy');
    
    XLSX.writeFile(wb, `WO_Genealogy_${wo?.wo_id}_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast({
      title: "Success",
      description: "Genealogy exported as Excel",
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!wo) {
    return <div className="flex items-center justify-center min-h-screen">Work Order not found</div>;
  }

  // Determine blockers vs warnings - use unified status (prefer qc_material_status, fallback to qc_raw_material_status)
  const blockers = [];
  const warnings = [];
  
  const unifiedMaterialStatus = wo.qc_material_status || wo.qc_raw_material_status || 'pending';
  const unifiedFirstPieceStatus = wo.qc_first_piece_status || 'pending';
  
  if (productionNotReleased) {
    blockers.push({ type: 'release', targetId: 'production-release-section', label: 'Production Logging Locked', description: 'Unlock production logging before operators can record quantities' });
  }
  if (unifiedMaterialStatus === 'failed') {
    blockers.push({ type: 'qc', targetId: 'qc-status-section', label: 'Material QC Failed', description: 'Raw material quality check failed - cannot proceed' });
  }
  if (unifiedFirstPieceStatus === 'failed') {
    blockers.push({ type: 'qc', targetId: 'qc-status-section', label: 'First Piece QC Failed', description: 'First piece inspection failed - cannot proceed' });
  }

  // Handle scroll to blocking section with highlight
  const scrollToBlocker = (blocker: { type: string; targetId: string; label: string }) => {
    const targetElement = document.getElementById(blocker.targetId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add highlight animation
      targetElement.classList.add('ring-2', 'ring-destructive', 'ring-offset-2', 'animate-pulse');
      setTimeout(() => {
        targetElement.classList.remove('ring-2', 'ring-destructive', 'ring-offset-2', 'animate-pulse');
      }, 2000);
    }
    // If QC type, also switch to QC tab
    if (blocker.type === 'qc') {
      setActiveTab('qc');
    }
  };
  
  // Pending states are warnings, not blockers
  if (unifiedMaterialStatus === 'pending') {
    warnings.push({ type: 'qc', label: 'Material QC Pending', description: 'Awaiting raw material inspection' });
  }
  if (unifiedFirstPieceStatus === 'pending') {
    warnings.push({ type: 'qc', label: 'First Piece QC Pending', description: 'Awaiting first piece inspection' });
  }
  
  const hasBlockers = blockers.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-8">
        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: WORK ORDER SUMMARY - Single Operational View Header
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          {/* Back Navigation */}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => navigate('/work-orders')}
            className="text-muted-foreground hover:text-foreground -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Work Orders
          </Button>

          {/* Work Order Summary Card */}
          <WorkOrderSummary workOrder={wo} />

          {/* Action Buttons Row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {salesOrder && (
                <button 
                  onClick={() => navigate(`/sales`)}
                  className="text-primary hover:underline"
                >
                  Customer PO: {salesOrder.po_number}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {canManageExternal && (
                <Button 
                  onClick={() => setShowExternalDialog(true)} 
                  variant="secondary"
                  size="sm"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send to External
                </Button>
              )}
              <Button 
                onClick={() => setShowAssignmentDialog(true)} 
                variant="default"
                size="sm"
                disabled={qcGatesBlocked || productionNotReleased}
                title={qcGatesBlocked ? 'QC gates must pass or be waived before assigning machines' : productionNotReleased ? 'Unlock production logging first' : ''}
              >
                <Cpu className="h-4 w-4 mr-2" />
                Assign Machines
              </Button>
              {hourlyQcRecords.length > 0 && (
                <Button size="sm" onClick={() => navigate(`/dispatch-qc-report/${id}`)}>
                  <FileText className="h-4 w-4 mr-2" />
                  Final QC Report
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStageDialog(true)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Update Stage
              </Button>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            BLOCKERS SECTION - Dominating visual treatment for critical issues
        ═══════════════════════════════════════════════════════════════════ */}
        {hasBlockers && (
          <section className="space-y-3">
            <div className="rounded-lg border-2 border-destructive bg-destructive/5 p-5">
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-destructive p-2">
                  <AlertTriangle className="h-6 w-6 text-destructive-foreground" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-destructive mb-2">Production Blocked</h2>
                  <div className="space-y-2">
                    {blockers.map((blocker, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-destructive mt-2 shrink-0" />
                        <div>
                          <span className="font-semibold text-destructive">{blocker.label}:</span>
                          <span className="text-muted-foreground ml-1">{blocker.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => blockers[0] && scrollToBlocker(blockers[0])}
                  >
                    {blockers[0]?.type === 'release' ? 'Go to Unlock' : 'View Details'}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Warnings - Less prominent than blockers */}
        {!hasBlockers && warnings.length > 0 && (
          <section>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    {warnings.map(w => w.label).join(' • ')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Production can proceed but QC approvals are pending
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PRODUCTION PROGRESS - Primary operational snapshot
        ═══════════════════════════════════════════════════════════════════ */}
        {wo && (
          <section className="space-y-3">
            <WOProgressCard
              woId={id!}
              orderedQuantity={wo.quantity || 0}
            />
          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ORDER INFO & RELEASE - Combined compact view
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Core Details - Compact inline */}
          <Card className="lg:col-span-2">
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-x-8 gap-y-3 items-center">
                <div>
                  <p className="text-xs text-muted-foreground">Due</p>
                  <p className="font-semibold">{new Date(wo.due_date).toLocaleDateString()}</p>
                </div>
                {wo.cycle_time_seconds && (
                  <div>
                    <p className="text-xs text-muted-foreground">Cycle</p>
                    <p className="font-semibold">{wo.cycle_time_seconds}s <span className="text-muted-foreground font-normal text-xs">({Math.round(3600 / wo.cycle_time_seconds)}/hr)</span></p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <Badge variant="outline" className="font-normal">{wo.material_location || 'Factory'}</Badge>
                </div>
                {/* QC Gates - Inline compact - use unified status */}
                <div className="flex items-center gap-3 ml-auto">
                  {[
                    { label: 'Material', status: unifiedMaterialStatus },
                    { label: '1st Pc', status: unifiedFirstPieceStatus },
                    { label: 'Final', status: wo.qc_final_status || 'pending' },
                  ].map((gate, idx) => {
                    const isPassed = gate.status === 'passed' || gate.status === 'waived';
                    const isFailed = gate.status === 'failed';
                    return (
                      <button 
                        key={idx} 
                        onClick={() => setActiveTab('qc')}
                        className="flex items-center gap-1.5 text-xs hover:underline"
                        title={`${gate.label} QC: ${gate.status}`}
                      >
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          isFailed && "bg-destructive",
                          isPassed && "bg-emerald-500",
                          !isPassed && !isFailed && "bg-muted-foreground/40"
                        )} />
                        <span className="text-muted-foreground">{gate.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Production Release - Compact */}
          <div id="production-release-section" className="transition-all duration-300 rounded-lg">
            <ProductionReleaseSection
              workOrder={wo}
              releasedByName={releasedByName}
              onReleased={loadWorkOrderData}
            />
          </div>
        </section>

        {/* Production Flow - Only show if machines assigned or OEE exists */}
        {(machineAssignments.length > 0 || woOEE) && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {machineAssignments.length > 0 && (
              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Machines</span>
                    {machineAssignments.length > 3 && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setActiveTab('production')}>
                        View all ({machineAssignments.length})
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {machineAssignments.slice(0, 4).map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 px-2.5 py-1.5 border rounded-md text-sm bg-muted/30">
                        <span className="font-medium">{a.machine?.machine_id}</span>
                        <Badge variant={a.status === 'running' ? 'default' : 'secondary'} className="text-xs h-5">
                          {a.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {woOEE && <OEEWidget metrics={woOEE} title="Work Order OEE" />}
          </section>
        )}

        {/* External Processing - Challan-based Table */}
        <ExternalChallanTable workOrderId={id || ""} />

        {/* NCRs */}
        <WorkOrderNCRList workOrderId={wo.id} />

        {/* Data Entry Redirect */}
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Log Production Data</p>
                  <p className="text-xs text-muted-foreground">
                    Use the Daily Production Log page for all production entries
                  </p>
                </div>
              </div>
              <Button 
                variant="outline" 
                onClick={() => navigate('/daily-production-log')}
                disabled={qcGatesBlocked || productionNotReleased}
              >
                Open Production Log
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-2">
            <TabsList className="grid grid-cols-7">
              <TabsTrigger value="production">Production</TabsTrigger>
              <TabsTrigger value="routing">Routing</TabsTrigger>
              <TabsTrigger value="stage-history">History</TabsTrigger>
              <TabsTrigger value="qc">QC</TabsTrigger>
              <TabsTrigger value="genealogy">Versions</TabsTrigger>
              <TabsTrigger value="external">External</TabsTrigger>
              <TabsTrigger value="materials">Materials</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" onClick={() => setShowAuditModal(true)} className="text-muted-foreground">
              <FileText className="h-4 w-4 mr-1" />
              Audit Log
            </Button>
          </div>

          <TabsContent value="production" className="space-y-4">
            {activeTab === 'production' && (
              <EnhancedProductionTab woId={id || ""} workOrder={wo} />
            )}
          </TabsContent>

          <TabsContent value="routing" className="space-y-4">
            {activeTab === 'routing' && (
              <div className="space-y-4">
                <OperationRouteManager workOrderId={id || ""} />
                <RouteProgressView workOrderId={id || ""} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="stage-history" className="space-y-4">
            {activeTab === 'stage-history' && (
              <EnhancedStageHistory stageHistory={stageHistory} routingSteps={routingSteps} />
            )}
          </TabsContent>

          <TabsContent value="qc" className="space-y-4">
            {activeTab === 'qc' && (
              <div className="space-y-6">
                {/* QC Stages */}
                <div className="grid gap-4">
                  <QCStageCard
                    woId={id || ''}
                    qcType="incoming"
                    status={unifiedMaterialStatus}
                    approvedAt={wo.qc_raw_material_approved_at || wo.qc_material_approved_at}
                    approvedByName={wo.qc_raw_material_approved_by ? qcApprovers[wo.qc_raw_material_approved_by] : (wo.qc_material_approved_by ? qcApprovers[wo.qc_material_approved_by] : undefined)}
                    remarks={wo.qc_raw_material_remarks || wo.qc_material_remarks}
                    onUpdate={loadWorkOrderData}
                  />
                  
                  <QCStageCard
                    woId={id || ''}
                    qcType="first_piece"
                    status={unifiedFirstPieceStatus}
                    approvedAt={wo.qc_first_piece_approved_at}
                    approvedByName={wo.qc_first_piece_approved_by ? qcApprovers[wo.qc_first_piece_approved_by] : undefined}
                    remarks={wo.qc_first_piece_remarks}
                    onUpdate={loadWorkOrderData}
                    isLocked={unifiedMaterialStatus !== 'passed' && unifiedMaterialStatus !== 'waived'}
                  />
                  
                  <QCStageCard
                    woId={id || ''}
                    qcType="final"
                    status={wo.qc_final_status || 'pending'}
                    approvedAt={wo.qc_final_approved_at}
                    approvedByName={wo.qc_final_approved_by ? qcApprovers[wo.qc_final_approved_by] : undefined}
                    remarks={wo.qc_final_remarks}
                    onUpdate={loadWorkOrderData}
                  />
                </div>

                {/* Final QC Report Generator */}
                {wo.status === 'completed' && (
                  <FinalQCReportGenerator
                    woId={id || ''}
                    woNumber={wo.display_id || wo.wo_id}
                    customer={wo.customer}
                    itemCode={wo.item_code}
                  />
                )}

                {/* Legacy QC Records Display */}
                <EnhancedQCRecords qcRecords={qcRecords} workOrder={wo} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="genealogy" className="space-y-4">
            {activeTab === 'genealogy' && (
              <WOVersionLog woId={id || ""} />
            )}
          </TabsContent>

          <TabsContent value="external" className="space-y-4">
            {activeTab === 'external' && (
              <>
                <MaterialMovementTimeline workOrderId={id || ""} />
                <EnhancedExternalTab workOrderId={id || ""} />
              </>
            )}
          </TabsContent>

          <TabsContent value="materials" className="space-y-4">
            <Tabs defaultValue="issues">
              <TabsList>
                <TabsTrigger value="issues">Material Issues</TabsTrigger>
                <TabsTrigger value="design">Design Files</TabsTrigger>
              </TabsList>

              <TabsContent value="issues">
                <Card>
                  <CardHeader>
                    <CardTitle>Material Issues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {materialIssues.length === 0 ? (
                      <div className="text-center py-8">
                        <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-sm font-medium mb-1">No materials issued yet</p>
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium">How to populate:</span> Issue material from the Material Requirements page.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {materialIssues.map((issue: any) => (
                          <div
                            key={issue.id}
                            className="flex items-center justify-between p-3 bg-secondary rounded-lg"
                          >
                            <div>
                              <p className="font-medium">
                                {issue.material_lots?.lot_id || "Unknown Lot"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Heat: {issue.material_lots?.heat_no} • {issue.material_lots?.alloy}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium">
                                {issue.quantity_kg} {issue.uom}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(issue.issued_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="design">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Design Files</CardTitle>
                      <div>
                        <input
                          type="file"
                          id="design-upload"
                          accept=".pdf,.dxf,.step"
                          onChange={handleDesignUpload}
                          className="hidden"
                          disabled={uploadingDesign}
                        />
                        <Button
                          onClick={() => document.getElementById('design-upload')?.click()}
                          disabled={uploadingDesign}
                        >
                          {uploadingDesign ? "Uploading..." : "Upload Design"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {designFiles.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">No design files uploaded</p>
                    ) : (
                      <div className="space-y-3">
                        {designFiles.map((file) => (
                          <div key={file.id} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium">v{file.version} - {file.file_name}</p>
                                {file.is_latest && <Badge>Latest</Badge>}
                              </div>
                              <p className="text-sm text-muted-foreground uppercase">{file.file_type}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(file.uploaded_at).toLocaleString()}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadDesignFile(file.file_path, file.file_name)}
                            >
                              Download
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>

        </Tabs>

        {/* Stage Update Dialog */}
        <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
          <DialogContent className="bg-background">
            <DialogHeader>
              <DialogTitle>Update Work Order Stage</DialogTitle>
              <DialogDescription>Change the current production stage</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Select onValueChange={handleStageUpdate} defaultValue={wo?.current_stage}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="production_planning">Production Planning</SelectItem>
                  <SelectItem value="proforma_sent">Proforma Sent</SelectItem>
                  <SelectItem value="raw_material_check">Raw Material Check</SelectItem>
                  <SelectItem value="raw_material_order">Raw Material Order</SelectItem>
                  <SelectItem value="raw_material_inwards">Raw Material Inwards (Goods In)</SelectItem>
                  <SelectItem value="raw_material_qc">Raw Material QC</SelectItem>
                  <SelectItem value="cutting">Cutting</SelectItem>
                  <SelectItem value="forging">Forging</SelectItem>
                  <SelectItem value="cnc_production">CNC / Production</SelectItem>
                  <SelectItem value="first_piece_qc">First Piece QC</SelectItem>
                  <SelectItem value="mass_production">Mass Production</SelectItem>
                  <SelectItem value="buffing">Buffing</SelectItem>
                  <SelectItem value="plating">Plating</SelectItem>
                  <SelectItem value="blasting">Blasting</SelectItem>
                  <SelectItem value="packing">Packing</SelectItem>
                  <SelectItem value="dispatch">Dispatch</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogContent>
        </Dialog>

        {/* Machine Assignment Dialog */}
        <MachineAssignmentDialog
          open={showAssignmentDialog}
          onOpenChange={setShowAssignmentDialog}
          workOrder={wo}
          onAssigned={() => {
            loadWorkOrderData();
            toast({ title: "Success", description: "Machines assigned to work order" });
          }}
        />

        {/* Send to External Dialog */}
        <SendToExternalDialog
          open={showExternalDialog}
          onOpenChange={setShowExternalDialog}
          workOrder={wo}
          onSuccess={loadWorkOrderData}
        />
      </div>

      {/* Audit Trail Modal */}
      <WOAuditTrailModal 
        open={showAuditModal}
        onOpenChange={setShowAuditModal}
        auditLog={genealogyLog}
        woId={wo.wo_number || wo.display_id || wo.wo_id}
      />
    </div>
  );
};

export default WorkOrderDetail;

