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
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalProcessingTab } from "@/components/ExternalProcessingTab";
import { ExternalMovementsTab } from "@/components/ExternalMovementsTab";
import { NavigationHeader } from "@/components/NavigationHeader";
import { WOProgressCard } from "@/components/WOProgressCard";
import { ProductionLogsTable } from "@/components/ProductionLogsTable";
import { ProductionLogForm } from "@/components/ProductionLogForm";
import { QCGateStatusBadge } from "@/components/QCGateStatusBadge";
import { MaterialQCApproval } from "@/components/MaterialQCApproval";
import { FirstPieceQCApproval } from "@/components/FirstPieceQCApproval";
import { useUserRole } from "@/hooks/useUserRole";
import { OEEWidget } from "@/components/OEEWidget";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

const WorkOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { isFinanceRole } = useUserRole();
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

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{wo.wo_id}</h1>
              <StatusBadge status={wo.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {wo.customer} • {wo.item_code}
              {salesOrder && (
                <>
                  {" • "}
                  <button 
                    onClick={() => navigate(`/sales`)}
                    className="text-blue-600 hover:underline"
                  >
                    PO: {salesOrder.po_number}
                  </button>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => setShowExternalDialog(true)} 
              variant="secondary"
              size="sm"
            >
              <Send className="h-4 w-4 mr-2" />
              Send to External
            </Button>
            <Button 
              onClick={() => setShowAssignmentDialog(true)} 
              variant="default"
              disabled={qcGatesBlocked}
              title={qcGatesBlocked ? 'QC gates must pass or be waived before assigning machines' : ''}
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

        {/* QC Gates Blocked Warning */}
        {qcGatesBlocked && (
          <div className="bg-destructive/10 border-2 border-destructive rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive">Production Blocked – QC Gates Pending</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {(wo.qc_material_status === 'pending' || wo.qc_material_status === 'failed') && 
                    "Material QC must pass or be waived before production can begin. "}
                  {wo.qc_material_status === 'passed' && 
                    (wo.qc_first_piece_status === 'pending' || wo.qc_first_piece_status === 'failed') && 
                    "First Piece QC must pass or be waived before mass production can begin. "}
                  Please complete or waive the required QC approvals in the QC Records tab.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Machine Assignments */}
        {machineAssignments.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Machine Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {machineAssignments.map((assignment: any) => (
                  <div key={assignment.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex-1">
                      <p className="font-medium">
                        {assignment.machine?.machine_id} - {assignment.machine?.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(assignment.scheduled_start).toLocaleString()} → {new Date(assignment.scheduled_end).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {assignment.quantity_allocated} pcs
                      </p>
                      {assignment.override_cycle_time_seconds && (
                        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded">
                          <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
                            ⚠️ Cycle Time Overridden: {assignment.original_cycle_time_seconds}s → {assignment.override_cycle_time_seconds}s
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Applied: {new Date(assignment.override_applied_at).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                    <Badge variant={assignment.status === 'running' ? 'default' : 'secondary'}>
                      {assignment.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Quantity</p>
                <p className="text-lg font-bold">{wo.quantity} pcs</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cycle Time</p>
                {wo.cycle_time_seconds ? (
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{wo.cycle_time_seconds}s/pc</p>
                    {machineAssignments.some(a => a.override_cycle_time_seconds) ? (
                      <Badge variant="destructive">Overridden</Badge>
                    ) : (
                      <Badge variant="outline">Default</Badge>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-destructive font-semibold">Not defined</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Due Date</p>
                <p className="text-lg font-bold">
                  {new Date(wo.due_date).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Customer PO / Sales Order</p>
                {salesOrder ? (
                  <button 
                    onClick={() => navigate('/sales')}
                    className="text-lg font-bold text-blue-600 hover:underline"
                  >
                    {salesOrder.po_number}
                  </button>
                ) : (
                  <p className="text-lg font-bold">—</p>
                )}
              </div>
              {isFinanceRole() && (wo.gross_weight_per_pc || wo.net_weight_per_pc) && (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">Gross Weight</p>
                    <p className="text-lg font-bold">{wo.gross_weight_per_pc}g/pc</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Net Weight</p>
                    <p className="text-lg font-bold">{wo.net_weight_per_pc}g/pc</p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Material QC and First Piece QC Approval Components - Legacy Support */}
        {wo.material_qc_status === 'pending' && (
          <MaterialQCApproval workOrder={wo} onApproved={loadWorkOrderData} />
        )}
        
        {wo.first_piece_ready_for_qc && wo.first_piece_qc_status === 'pending' && (
          <FirstPieceQCApproval workOrder={wo} onApproved={loadWorkOrderData} />
        )}

        {/* Production Progress Card */}
        {woProgress && (
          <div className="space-y-4">
            <WOProgressCard
              targetQuantity={woProgress.target_quantity}
              completedQuantity={woProgress.total_completed}
              scrapQuantity={woProgress.total_scrap}
              progressPercentage={woProgress.progress_percentage}
              remainingQuantity={woProgress.remaining_quantity}
            />
            
            {/* External WIP Distribution */}
            {wo.external_out_total > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">External Processing Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Sent:</span>
                      <span className="font-semibold">{wo.external_out_total} pcs</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Returned:</span>
                      <span className="font-semibold">{wo.external_in_total} pcs</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Currently Out:</span>
                      <span className="font-semibold text-orange-600">
                        {wo.external_out_total - wo.external_in_total} pcs
                      </span>
                    </div>
                    
                    {wo.external_wip && Object.keys(wo.external_wip).length > 0 && (
                      <div className="mt-4 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">By Process:</p>
                        <div className="space-y-2">
                          {Object.entries(wo.external_wip).map(([process, qty]: [string, any]) => (
                            <div key={process} className="flex justify-between items-center text-sm">
                              <Badge variant="outline" className="capitalize">
                                {process.replace('_', ' ')}
                              </Badge>
                              <span className="font-medium">{qty} pcs</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* OEE Widget for running WO */}
        {woOEE && machineAssignments.some(a => a.status === 'running') && (
          <OEEWidget 
            metrics={woOEE}
            title="Work Order OEE (Running Machines)"
          />
        )}

        {/* Production Log Form */}
        {qcGatesBlocked ? (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Production Logging Disabled
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Production logging is blocked until all QC gates pass or are waived. Please complete the required QC approvals in the QC Records tab.
              </p>
              <div className="space-y-2">
                {(wo.qc_material_status === 'pending' || wo.qc_material_status === 'failed') && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-destructive"></div>
                    <span>Raw Material QC - {wo.qc_material_status === 'pending' ? 'Pending' : 'Failed'}</span>
                  </div>
                )}
                {(wo.qc_first_piece_status === 'pending' || wo.qc_first_piece_status === 'failed') && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-destructive"></div>
                    <span>First Piece QC - {wo.qc_first_piece_status === 'pending' ? 'Pending' : 'Failed'}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <ProductionLogForm workOrder={wo} />
        )}

        {/* Tabs */}
        <Tabs defaultValue={searchParams.get('tab') || "production"} className="w-full">
            <TabsList className="grid w-full grid-cols-11">
              <TabsTrigger value="production">Production</TabsTrigger>
              <TabsTrigger value="routing">Routing</TabsTrigger>
              <TabsTrigger value="stage-history">Stage History</TabsTrigger>
              <TabsTrigger value="design">Design Files</TabsTrigger>
              <TabsTrigger value="materials">Materials</TabsTrigger>
              <TabsTrigger value="qc">QC Records</TabsTrigger>
              <TabsTrigger value="hourly-qc">Hourly QC</TabsTrigger>
              {wo.cutting_required && <TabsTrigger value="cutting">Cutting</TabsTrigger>}
              {wo.forging_required && <TabsTrigger value="forging">Forging</TabsTrigger>}
              <TabsTrigger value="external">External</TabsTrigger>
              <TabsTrigger value="genealogy">Genealogy</TabsTrigger>
          </TabsList>

          <TabsContent value="production" className="space-y-4">
            <ProductionLogsTable woId={id || ""} />
          </TabsContent>

          <TabsContent value="routing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Routing Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {routingSteps.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No routing steps defined
                  </p>
                ) : (
                  <div className="space-y-4">
                    {routingSteps.map((step, index) => (
                      <div key={step.id} className="flex items-start gap-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              step.status === "completed"
                                ? "bg-success text-success-foreground"
                                : step.status === "in_progress"
                                ? "bg-warning text-warning-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {step.status === "completed" ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : step.status === "in_progress" ? (
                              <Clock className="h-4 w-4" />
                            ) : (
                              <span className="text-xs">{index + 1}</span>
                            )}
                          </div>
                          {index < routingSteps.length - 1 && (
                            <div className="w-0.5 h-12 bg-border" />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{step.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {step.departments?.name || "Unassigned"}
                              </p>
                            </div>
                            <Badge variant="outline">{step.status}</Badge>
                          </div>
                          {step.actual_start && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Started: {new Date(step.actual_start).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stage-history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Stage Transition History</CardTitle>
              </CardHeader>
              <CardContent>
                {stageHistory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No stage history recorded
                  </p>
                ) : (
                  <div className="space-y-3">
                    {stageHistory.map((history, index) => (
                      <div
                        key={history.id}
                        className={`p-4 rounded-lg border ${
                          index === 0 ? 'border-primary bg-primary/5' : 'bg-secondary'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {history.from_stage && (
                                <>
                                  <Badge variant="outline">
                                    {history.from_stage.replace('_', ' ').toUpperCase()}
                                  </Badge>
                                  <span className="text-muted-foreground">→</span>
                                </>
                              )}
                              <Badge className="bg-primary">
                                {history.to_stage.replace('_', ' ').toUpperCase()}
                              </Badge>
                              {history.is_override && (
                                <Badge variant="destructive" className="text-xs">
                                  OVERRIDE
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Changed by: {history.profiles?.full_name || 'System'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(history.changed_at).toLocaleString()}
                            </p>
                            {history.reason && (
                              <p className="text-sm mt-2 italic">
                                Reason: {history.reason}
                              </p>
                            )}
                          </div>
                          {index === 0 && (
                            <Badge variant="secondary" className="text-xs">
                              CURRENT
                            </Badge>
                          )}
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

          <TabsContent value="materials" className="space-y-4">
            <Tabs defaultValue="issues">
              <TabsList>
                <TabsTrigger value="issues">Material Issues</TabsTrigger>
                <TabsTrigger value="external-movements">External Movements</TabsTrigger>
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

              <TabsContent value="external-movements">
                <ExternalMovementsTab workOrderId={id || ""} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="qc" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>QC Records</CardTitle>
              </CardHeader>
              <CardContent>
                {qcRecords.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No QC records yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {qcRecords.map((qc) => (
                      <div
                        key={qc.id}
                        className="flex items-start justify-between p-4 border rounded-lg"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{qc.qc_id}</p>
                            <Badge variant="outline">{qc.qc_type.replace("_", " ")}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {new Date(qc.qc_date_time).toLocaleString()}
                          </p>
                          {qc.remarks && (
                            <p className="text-sm mt-2">{qc.remarks}</p>
                          )}
                        </div>
                        <Badge
                          variant={
                            qc.result === "pass"
                              ? "default"
                              : qc.result === "fail"
                              ? "destructive"
                              : "secondary"
                          }
                          className={
                            qc.result === "pass"
                              ? "bg-success"
                              : ""
                          }
                        >
                          {qc.result.toUpperCase()}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="hourly-qc" className="space-y-4">
            <QCRecordsTab records={hourlyQcRecords} woId={wo.wo_id} workOrder={wo} onUpdate={loadWorkOrderData} />
          </TabsContent>

          {wo.cutting_required && (
            <TabsContent value="cutting" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Cutting Records</CardTitle>
                    <Button onClick={() => window.open('/cutting', '_blank')} variant="outline" size="sm">
                      Open Cutting Dashboard
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {cuttingRecords.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No cutting records yet
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {cuttingRecords.map((record) => (
                        <div key={record.id} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-medium text-lg">{record.item_code}</p>
                              <Badge variant={
                                record.status === 'completed' ? 'default' : 
                                record.status === 'in_progress' ? 'secondary' : 
                                'outline'
                              }>
                                {record.status.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Progress</p>
                              <p className="text-xl font-bold">
                                {record.qty_cut}/{record.qty_required} kg
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Start Date</p>
                              <p className="font-medium">
                                {record.start_date ? new Date(record.start_date).toLocaleDateString() : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">End Date</p>
                              <p className="font-medium">
                                {record.end_date ? new Date(record.end_date).toLocaleDateString() : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Remaining</p>
                              <p className="font-medium text-orange-600">
                                {(record.qty_required - record.qty_cut).toFixed(2)} kg
                              </p>
                            </div>
                          </div>
                          {record.remarks && (
                            <div className="mt-3 p-2 bg-secondary rounded">
                              <p className="text-xs text-muted-foreground">Remarks</p>
                              <p className="text-sm">{record.remarks}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {wo.forging_required && (
            <TabsContent value="forging" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Forging Records</CardTitle>
                    <Button onClick={() => window.open('/forging', '_blank')} variant="outline" size="sm">
                      Open Forging Dashboard
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {forgingRecords.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No forging records yet
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {forgingRecords.map((record) => (
                        <div key={record.id} className="p-4 border rounded-lg">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <p className="font-medium text-lg">{record.forging_vendor || 'No Vendor Assigned'}</p>
                              <div className="flex gap-2 mt-1">
                                <Badge variant={
                                  record.status === 'completed' ? 'default' : 
                                  record.status === 'in_progress' ? 'secondary' : 
                                  'outline'
                                }>
                                  {record.status.replace('_', ' ').toUpperCase()}
                                </Badge>
                                {record.qc_approved && (
                                  <Badge variant="default">QC Approved</Badge>
                                )}
                                {record.sample_sent && !record.qc_approved && (
                                  <Badge variant="outline">Sample Sent</Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">Progress</p>
                              <p className="text-xl font-bold">
                                {record.qty_forged || 0}/{record.qty_required} pcs
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Start Date</p>
                              <p className="font-medium">
                                {record.forging_start_date ? new Date(record.forging_start_date).toLocaleDateString() : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">End Date</p>
                              <p className="font-medium">
                                {record.forging_end_date ? new Date(record.forging_end_date).toLocaleDateString() : '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Remaining</p>
                              <p className="font-medium text-orange-600">
                                {record.qty_required - (record.qty_forged || 0)} pcs
                              </p>
                            </div>
                          </div>
                          {record.remarks && (
                            <div className="mt-3 p-2 bg-secondary rounded">
                              <p className="text-xs text-muted-foreground">Remarks</p>
                              <p className="text-sm">{record.remarks}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          <TabsContent value="external" className="space-y-4">
            <ExternalProcessingTab workOrderId={id || ""} />
          </TabsContent>

          <TabsContent value="genealogy" className="space-y-4">
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
                  <SelectItem value="goods_in">Goods In</SelectItem>
                  <SelectItem value="cutting_queue">Cutting Queue</SelectItem>
                  <SelectItem value="cutting_in_progress">Cutting In Progress</SelectItem>
                  <SelectItem value="cutting_complete">Cutting Complete</SelectItem>
                  <SelectItem value="forging_queue">Forging Queue</SelectItem>
                  <SelectItem value="forging_in_progress">Forging In Progress</SelectItem>
                  <SelectItem value="forging_complete">Forging Complete</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="qc">QC</SelectItem>
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
    </div>
  );
};

export default WorkOrderDetail;

