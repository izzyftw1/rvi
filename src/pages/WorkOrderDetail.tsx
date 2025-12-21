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
import { CheckCircle2, Clock, FileText, Edit, Download, ArrowLeft, Cpu, Flag, AlertTriangle, FlaskConical, CheckSquare, Scissors, Hammer, Send } from "lucide-react";

import { EnhancedProductionTab } from "@/components/EnhancedProductionTab";
import { EnhancedStageHistory } from "@/components/EnhancedStageHistory";
import { EnhancedQCRecords } from "@/components/EnhancedQCRecords";
import { WOVersionLog } from "@/components/WOVersionLog";
import { EnhancedExternalTab } from "@/components/EnhancedExternalTab";
import { WOTimelineVisualization } from "@/components/WOTimelineVisualization";
import { WOAuditTrailModal } from "@/components/WOAuditTrailModal";
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalProcessingTab } from "@/components/ExternalProcessingTab";
import { ExternalMovementsTab } from "@/components/ExternalMovementsTab";
import { ExternalProcessingHistoryTab } from "@/components/ExternalProcessingHistoryTab";

import { WOProgressCard } from "@/components/WOProgressCard";
import { ProductionLogsTable } from "@/components/ProductionLogsTable";
import { ProductionLogForm } from "@/components/ProductionLogForm";
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
      .channel('work_order_details')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cutting_records', filter: `work_order_id=eq.${id}` }, () => {
        loadWorkOrderData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forging_records', filter: `work_order_id=eq.${id}` }, () => {
        loadWorkOrderData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves', filter: `work_order_id=eq.${id}` }, () => {
        loadWorkOrderData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (wo) {
      // QC gates block production if they are pending or failed (but NOT if waived)
      const materialBlocked = wo.qc_material_status === 'pending' || wo.qc_material_status === 'failed';
      const firstPieceBlocked = wo.qc_first_piece_status === 'pending' || wo.qc_first_piece_status === 'failed';
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
      // Get running machines
      const runningMachines = assignments
        .filter((a: any) => a.status === 'running')
        .map((a: any) => a.machine_id);

      if (runningMachines.length === 0) {
        setWoOEE(null);
        return;
      }

      const today = format(new Date(), 'yyyy-MM-dd');
      const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(new Date()), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      // Fetch metrics for all running machines
      const { data: todayData } = await supabase
        .from('machine_daily_metrics')
        .select('*')
        .in('machine_id', runningMachines)
        .eq('date', today);

      const { data: weekData } = await supabase
        .from('machine_daily_metrics')
        .select('*')
        .in('machine_id', runningMachines)
        .gte('date', weekStart)
        .lte('date', weekEnd);

      const { data: monthData } = await supabase
        .from('machine_daily_metrics')
        .select('*')
        .in('machine_id', runningMachines)
        .gte('date', monthStart)
        .lte('date', monthEnd);

      const calculateAverageOEE = (dataArray: any[]) => {
        if (!dataArray || dataArray.length === 0) {
          return { availability: 0, performance: 0, quality: 0, oee: 0 };
        }

        const totals = dataArray.reduce((acc, d) => ({
          availability: acc.availability + (d.availability_pct || 0),
          performance: acc.performance + (d.performance_pct || 0),
          quality: acc.quality + (d.quality_pct || 0),
          oee: acc.oee + (d.oee_pct || 0),
        }), { availability: 0, performance: 0, quality: 0, oee: 0 });

        return {
          availability: totals.availability / dataArray.length,
          performance: totals.performance / dataArray.length,
          quality: totals.quality / dataArray.length,
          oee: totals.oee / dataArray.length,
        };
      };

      setWoOEE({
        today: calculateAverageOEE(todayData || []),
        week: calculateAverageOEE(weekData || []),
        month: calculateAverageOEE(monthData || []),
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

  // Determine blockers vs warnings
  const blockers = [];
  const warnings = [];
  
  if (productionNotReleased) {
    blockers.push({ type: 'release', label: 'Production Not Released', description: 'Work order must be released before production can start' });
  }
  if (wo.qc_material_status === 'failed') {
    blockers.push({ type: 'qc', label: 'Material QC Failed', description: 'Raw material quality check failed - cannot proceed' });
  }
  if (wo.qc_first_piece_status === 'failed') {
    blockers.push({ type: 'qc', label: 'First Piece QC Failed', description: 'First piece inspection failed - cannot proceed' });
  }
  
  // Pending states are warnings, not blockers
  if (wo.qc_material_status === 'pending') {
    warnings.push({ type: 'qc', label: 'Material QC Pending', description: 'Awaiting raw material inspection' });
  }
  if (wo.qc_first_piece_status === 'pending') {
    warnings.push({ type: 'qc', label: 'First Piece QC Pending', description: 'Awaiting first piece inspection' });
  }
  
  const hasBlockers = blockers.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-8">
        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: ORDER HEADER - Identity & Key Actions
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">{wo.wo_number || wo.display_id || wo.wo_id}</h1>
                <StatusBadge status={wo.status} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {wo.customer} • {wo.item_code} • Qty: {wo.quantity}
                {salesOrder && (
                  <>
                    {" • "}
                    <button 
                      onClick={() => navigate(`/sales`)}
                      className="text-primary hover:underline"
                    >
                      PO: {salesOrder.po_number}
                    </button>
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canManageExternal && (
                <Button 
                  onClick={() => setShowExternalDialog(true)} 
                  variant="secondary"
                  size="sm"
                  disabled={productionNotReleased}
                  title={productionNotReleased ? 'Work order must be released for production first' : ''}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send to External
                </Button>
              )}
              <Button 
                onClick={() => setShowAssignmentDialog(true)} 
                variant="default"
                disabled={qcGatesBlocked || productionNotReleased}
                title={qcGatesBlocked ? 'QC gates must pass or be waived before assigning machines' : productionNotReleased ? 'Work order must be released for production first' : ''}
              >
                <Cpu className="h-4 w-4 mr-2" />
                Assign Machines
              </Button>
              {hourlyQcRecords.length > 0 && (
                <Button onClick={() => navigate(`/dispatch-qc-report/${id}`)}>
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
                Stage: {wo.current_stage?.replace('_', ' ').toUpperCase() || 'N/A'}
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
                    onClick={() => setActiveTab('qc')}
                  >
                    Resolve Issues
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
            SECTION 2: ORDER INFO - Static details grouped together
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Order Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Core Details */}
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                    <p className="text-lg font-bold">{wo.quantity} pcs</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Due Date</p>
                    <p className="text-lg font-bold">{new Date(wo.due_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cycle Time</p>
                    {wo.cycle_time_seconds ? (
                      <p className="text-lg font-bold">{wo.cycle_time_seconds}s/pc</p>
                    ) : (
                      <p className="text-sm text-destructive">Not defined</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Material Location</p>
                    <Badge variant={wo.material_location === 'Factory' ? 'default' : 'outline'}>
                      {wo.material_location || 'Factory'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Production Release - Consolidated here */}
            <ProductionReleaseSection
              workOrder={wo}
              releasedByName={releasedByName}
              onReleased={loadWorkOrderData}
            />
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: PRODUCTION FLOW - Progress & Machines
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Production Flow</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Progress Card */}
            {woProgress && (
              <WOProgressCard
                woId={id!}
                targetQuantity={woProgress.target_quantity}
                completedQuantity={woProgress.total_completed}
                scrapQuantity={woProgress.total_scrap}
                progressPercentage={woProgress.progress_percentage}
                remainingQuantity={woProgress.remaining_quantity}
              />
            )}

            {/* Machine Assignments - Compact view */}
            {machineAssignments.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Machine Assignments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {machineAssignments.slice(0, 3).map((assignment: any) => (
                    <div key={assignment.id} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div>
                        <p className="font-medium">{assignment.machine?.machine_id}</p>
                        <p className="text-xs text-muted-foreground">{assignment.quantity_allocated} pcs</p>
                      </div>
                      <Badge variant={assignment.status === 'running' ? 'default' : 'secondary'} className="text-xs">
                        {assignment.status}
                      </Badge>
                    </div>
                  ))}
                  {machineAssignments.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center">+{machineAssignments.length - 3} more</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Operation Route Status */}
          <OperationRouteStatus workOrderId={wo.id} />

          {/* OEE Widget - Only if running */}
          {woOEE && (
            <OEEWidget 
              metrics={woOEE}
              title="Work Order OEE (Running Machines)"
            />
          )}
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4: QC STATUS - Consolidated quality view
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">QC Status</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Material QC', status: wo.qc_raw_material_status || wo.qc_material_status || 'pending' },
              { label: 'First Piece', status: wo.qc_first_piece_status || 'pending' },
              { label: 'Final QC', status: wo.qc_final_status || 'pending' },
            ].map((gate, idx) => {
              const isPassed = gate.status === 'passed' || gate.status === 'waived';
              const isFailed = gate.status === 'failed';
              const isPending = gate.status === 'pending';
              return (
                <Card 
                  key={idx} 
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    isFailed && "border-destructive/50 bg-destructive/5",
                    isPassed && "border-emerald-500/30 bg-emerald-500/5",
                    isPending && "opacity-60"
                  )}
                  onClick={() => setActiveTab('qc')}
                >
                  <CardContent className="p-4 text-center">
                    <div className={cn(
                      "w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center",
                      isFailed && "bg-destructive text-destructive-foreground",
                      isPassed && "bg-emerald-600 text-white",
                      isPending && "bg-muted text-muted-foreground"
                    )}>
                      {isPassed ? <CheckCircle2 className="h-4 w-4" /> : 
                       isFailed ? <AlertTriangle className="h-4 w-4" /> : 
                       <Clock className="h-4 w-4" />}
                    </div>
                    <p className="text-sm font-medium">{gate.label}</p>
                    <p className={cn(
                      "text-xs capitalize mt-1",
                      isFailed && "text-destructive",
                      isPassed && "text-emerald-600 dark:text-emerald-400",
                      isPending && "text-muted-foreground"
                    )}>
                      {gate.status}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 5: EXTERNAL PROCESSING - If applicable
        ═══════════════════════════════════════════════════════════════════ */}
        {(wo.external_out_total > 0 || externalMoves.length > 0) && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">External Processing</h2>
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{wo.external_out_total || 0}</p>
                    <p className="text-xs text-muted-foreground">Sent Out</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{wo.external_in_total || 0}</p>
                    <p className="text-xs text-muted-foreground">Returned</p>
                  </div>
                  <div>
                    <p className={cn(
                      "text-2xl font-bold",
                      (wo.external_out_total - wo.external_in_total) > 0 && "text-amber-600 dark:text-amber-400"
                    )}>
                      {(wo.external_out_total || 0) - (wo.external_in_total || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Currently Out</p>
                  </div>
                </div>
                {externalMoves.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="w-full mt-4"
                    onClick={() => setActiveTab('external')}
                  >
                    View Details →
                  </Button>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* NCRs - Only show if there are any */}
        <WorkOrderNCRList workOrderId={wo.id} />

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 6: PRODUCTION LOGGING & AUDIT
        ═══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Production Logging</h2>
          {qcGatesBlocked || productionNotReleased ? (
            <Card className="border-muted">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  {productionNotReleased 
                    ? 'Production logging is blocked until the work order is released.'
                    : 'Production logging is blocked until QC gates pass or are waived.'
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <ProductionLogForm workOrder={wo} />
          )}
        </section>

        {/* Audit Trail Button */}
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            onClick={() => setShowAuditModal(true)}
            className="gap-2"
          >
            <FileText className="h-4 w-4" />
            Show Full Audit Log
          </Button>
        </div>

        {/* Tabs with Lazy Loading */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="production">🏭 Production</TabsTrigger>
              <TabsTrigger value="routing">🛤️ Routing</TabsTrigger>
              <TabsTrigger value="stage-history">🔁 Stage History</TabsTrigger>
              <TabsTrigger value="qc">⚙️ QC Records</TabsTrigger>
              <TabsTrigger value="genealogy">🧾 Version Log</TabsTrigger>
              <TabsTrigger value="external">🔗 External</TabsTrigger>
              <TabsTrigger value="materials">📦 Materials</TabsTrigger>
          </TabsList>

          <TabsContent value="production" className="space-y-4">
            {activeTab === 'production' && (
              <EnhancedProductionTab woId={id || ""} workOrder={wo} />
            )}
          </TabsContent>

          <TabsContent value="routing" className="space-y-4">
            {activeTab === 'routing' && (
              <div className="space-y-4">
                <OperationRouteManager workOrderId={id || ""} />
                <OperationRouteStatus workOrderId={id || ""} />
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
                    status={wo.qc_raw_material_status || 'pending'}
                    approvedAt={wo.qc_raw_material_approved_at}
                    approvedByName={wo.qc_raw_material_approved_by ? qcApprovers[wo.qc_raw_material_approved_by] : undefined}
                    remarks={wo.qc_raw_material_remarks}
                    onUpdate={loadWorkOrderData}
                  />
                  
                  <QCStageCard
                    woId={id || ''}
                    qcType="first_piece"
                    status={wo.qc_first_piece_status || 'pending'}
                    approvedAt={wo.qc_first_piece_approved_at}
                    approvedByName={wo.qc_first_piece_approved_by ? qcApprovers[wo.qc_first_piece_approved_by] : undefined}
                    remarks={wo.qc_first_piece_remarks}
                    onUpdate={loadWorkOrderData}
                    isLocked={wo.qc_raw_material_status !== 'passed' && wo.qc_raw_material_status !== 'waived'}
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
                      <p className="text-center text-muted-foreground py-8">
                        No materials issued yet
                      </p>
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

          {/* Old duplicate tabs removed - using new enhanced components */}
        </Tabs>

        {/* Legacy Genealogy Section - Will be replaced by WOVersionLog */}
        {false && (
          <div>
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Complete Work Order Genealogy</CardTitle>
                  <div className="flex gap-2">
                    <Button onClick={exportGenealogyPDF} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export PDF
                    </Button>
                    <Button onClick={exportGenealogyExcel} variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export Excel
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Comprehensive timeline of all actions from Goods In to Dispatch
                </p>
              </CardHeader>
              <CardContent>
                {genealogyLog.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No genealogy records yet
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Timeline visualization */}
                    <div className="relative">
                      {genealogyLog.map((log, index) => (
                        <div key={log.id} className="relative flex gap-4 pb-8">
                          {index < genealogyLog.length - 1 && (
                            <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border" />
                          )}
                          
                          <div className="relative">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold z-10">
                              {index + 1}
                            </div>
                          </div>

                          <div className="flex-1 bg-secondary rounded-lg p-4">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge className="bg-primary">{log.department}</Badge>
                                  <span className="text-sm font-semibold">
                                    {log.action_type.replace(/_/g, ' ').toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(log.created_at).toLocaleString()}
                                </p>
                              </div>
                              <Badge variant="outline">{log.performer_name}</Badge>
                            </div>

                            <div className="mt-3 space-y-1">
                              {log.action_type === 'material_issued' && (
                                <>
                                  <p className="text-sm"><span className="font-medium">Lot:</span> {log.action_details.lot_id}</p>
                                  <p className="text-sm"><span className="font-medium">Heat No:</span> {log.action_details.heat_no}</p>
                                  <p className="text-sm"><span className="font-medium">Alloy:</span> {log.action_details.alloy}</p>
                                  <p className="text-sm"><span className="font-medium">Quantity:</span> {log.action_details.quantity_kg} {log.action_details.uom}</p>
                                </>
                              )}

                              {(log.action_type === 'qc_incoming' || log.action_type === 'qc_in_process' || log.action_type === 'qc_final') && (
                                <>
                                  <p className="text-sm"><span className="font-medium">QC ID:</span> {log.action_details.qc_id}</p>
                                  <p className="text-sm">
                                    <span className="font-medium">Result:</span>{' '}
                                    <Badge variant={log.action_details.result === 'pass' ? 'default' : 'destructive'}>
                                      {log.action_details.result?.toUpperCase()}
                                    </Badge>
                                  </p>
                                  {log.action_details.remarks && (
                                    <p className="text-sm"><span className="font-medium">Remarks:</span> {log.action_details.remarks}</p>
                                  )}
                                </>
                              )}

                              {log.action_type === 'hourly_qc_check' && (
                                <>
                                  <p className="text-sm"><span className="font-medium">Machine:</span> {log.action_details.machine_id} - {log.action_details.machine_name}</p>
                                  <p className="text-sm"><span className="font-medium">Operation:</span> {log.action_details.operation}</p>
                                  <p className="text-sm">
                                    <span className="font-medium">Status:</span>{' '}
                                    <Badge variant={log.action_details.status === 'pass' ? 'default' : 'destructive'}>
                                      {log.action_details.status?.toUpperCase()}
                                    </Badge>
                                  </p>
                                </>
                              )}

                              {log.action_type === 'carton_built' && (
                                <>
                                  <p className="text-sm"><span className="font-medium">Carton ID:</span> {log.action_details.carton_id}</p>
                                  <p className="text-sm"><span className="font-medium">Quantity:</span> {log.action_details.quantity} pcs</p>
                                  <p className="text-sm"><span className="font-medium">Weight:</span> {log.action_details.gross_weight} kg (Gross) / {log.action_details.net_weight} kg (Net)</p>
                                </>
                              )}

                              {log.action_type === 'design_uploaded' && (
                                <>
                                  <p className="text-sm"><span className="font-medium">File:</span> {log.action_details.file_name}</p>
                                  <p className="text-sm"><span className="font-medium">Version:</span> v{log.action_details.version}</p>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-6 border-t">
                      <h4 className="font-medium mb-3">Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-3 bg-secondary rounded-lg">
                          <p className="text-xs text-muted-foreground">Total Actions</p>
                          <p className="text-2xl font-bold">{genealogyLog.length}</p>
                        </div>
                        <div className="p-3 bg-secondary rounded-lg">
                          <p className="text-xs text-muted-foreground">Departments</p>
                          <p className="text-2xl font-bold">{new Set(genealogyLog.map(l => l.department)).size}</p>
                        </div>
                        <div className="p-3 bg-secondary rounded-lg">
                          <p className="text-xs text-muted-foreground">First Action</p>
                          <p className="text-sm font-medium">
                            {genealogyLog[0] ? new Date(genealogyLog[0].created_at).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <div className="p-3 bg-secondary rounded-lg">
                          <p className="text-xs text-muted-foreground">Last Action</p>
                          <p className="text-sm font-medium">
                            {genealogyLog[genealogyLog.length - 1] ? new Date(genealogyLog[genealogyLog.length - 1].created_at).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

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

