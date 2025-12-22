import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { NavigationHeader } from "@/components/NavigationHeader";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { ArrowLeft, AlertTriangle, ClipboardCheck, Search, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QCSummaryStats, QCInfoAlert, QCSection } from "@/components/qc/QCPageLayout";
import { QCStatusIndicator } from "@/components/qc/QCStatusIndicator";
import { ProductionContextDisplay } from "@/components/qc/ProductionContextDisplay";
import { RejectionClassificationReview } from "@/components/qc/RejectionClassificationReview";
import { NCRFormDialog } from "@/components/ncr/NCRFormDialog";
import { format } from "date-fns";

const OPERATIONS = ['A', 'B', 'C', 'D'] as const;

interface EligibleWorkOrder {
  id: string;
  wo_id: string;
  display_id: string;
  customer: string;
  item_code: string;
  status: string;
  quantity: number;
  tolerances_defined: boolean;
  last_qc_check?: string;
  qc_check_count: number;
  first_piece_approved?: boolean;
  last_production_entry?: string;
}

interface ProductionLogData {
  id: string;
  rejection_dent: number | null;
  rejection_scratch: number | null;
  rejection_forging_mark: number | null;
  rejection_lining: number | null;
  rejection_dimension: number | null;
  rejection_tool_mark: number | null;
  rejection_setting: number | null;
  rejection_previous_setup_fault: number | null;
  rejection_face_not_ok: number | null;
  rejection_material_not_ok: number | null;
  total_rejection_quantity: number | null;
  created_at: string;
}

const HourlyQC = () => {
  const [eligibleWorkOrders, setEligibleWorkOrders] = useState<EligibleWorkOrder[]>([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<EligibleWorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [tolerances, setTolerances] = useState<Array<{
    id: string;
    name: string;
    min: number;
    max: number;
    unit: string;
  }>>([]);
  
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<typeof OPERATIONS[number]>('A');
  const [machineId, setMachineId] = useState<string>("");
  const [machines, setMachines] = useState<Array<{ id: string; name: string; machine_id: string }>>([]);
  const [binaryChecksEnabled, setBinaryChecksEnabled] = useState(false);
  const [applicableChecks, setApplicableChecks] = useState({
    thread: false, visual: false, plating: false, platingThickness: false
  });
  
  const [qcResults, setQcResults] = useState({
    thread: 'ok', visual: 'ok', plating: 'ok', platingThickness: 'ok', remarks: ''
  });

  // Additional state for enhanced QC features
  const [productionLogData, setProductionLogData] = useState<ProductionLogData | null>(null);
  const [showNCRDialog, setShowNCRDialog] = useState(false);
  const [ncrPrefill, setNcrPrefill] = useState<{ issueDescription?: string; sourceReference?: string }>({});

  useEffect(() => {
    loadEligibleWorkOrders();
    loadMachines();
    
    const channel = supabase
      .channel('hourly-qc-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadEligibleWorkOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hourly_qc_checks' }, loadEligibleWorkOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dimension_tolerances' }, loadEligibleWorkOrders)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (selectedWorkOrder && operation) loadTolerances();
  }, [selectedWorkOrder, operation]);

  // Load production log data when machine is selected
  useEffect(() => {
    if (selectedWorkOrder && machineId) {
      loadProductionLogData();
    }
  }, [selectedWorkOrder, machineId]);

  const loadProductionLogData = async () => {
    if (!selectedWorkOrder || !machineId) return;
    try {
      const { data, error } = await supabase
        .from('daily_production_logs')
        .select(`
          id,
          rejection_dent, rejection_scratch, rejection_forging_mark,
          rejection_lining, rejection_dimension, rejection_tool_mark,
          rejection_setting, rejection_previous_setup_fault,
          rejection_face_not_ok, rejection_material_not_ok,
          total_rejection_quantity, created_at
        `)
        .eq('wo_id', selectedWorkOrder.id)
        .eq('machine_id', machineId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      setProductionLogData(data?.[0] || null);
    } catch (error) {
      console.error('Error loading production log data:', error);
    }
  };

  const loadMachines = async () => {
    try {
      const { data, error } = await supabase.from('machines').select('id, name, machine_id').order('name');
      if (error) throw error;
      setMachines(data || []);
    } catch (error) {
      console.error('Error loading machines:', error);
    }
  };

  const loadEligibleWorkOrders = async () => {
    try {
      setLoading(true);
      
      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('id, wo_id, display_id, customer, item_code, status, quantity')
        .in('status', ['in_progress', 'pending', 'qc', 'packing'])
        .order('created_at', { ascending: false });

      if (woError) throw woError;
      if (!workOrders || workOrders.length === 0) { setEligibleWorkOrders([]); return; }

      const { data: toleranceData, error: tolError } = await supabase
        .from('dimension_tolerances').select('item_code');
      if (tolError) throw tolError;

      const itemCodesWithTolerances = new Set(toleranceData?.map(t => t.item_code) || []);

      const woIds = workOrders.map(wo => wo.id);
      const { data: qcChecks, error: qcError } = await supabase
        .from('hourly_qc_checks').select('wo_id, check_datetime')
        .in('wo_id', woIds).order('check_datetime', { ascending: false });
      if (qcError) throw qcError;

      const qcChecksByWo = new Map<string, { count: number; lastCheck?: string }>();
      qcChecks?.forEach(check => {
        const existing = qcChecksByWo.get(check.wo_id);
        if (existing) { existing.count++; }
        else { qcChecksByWo.set(check.wo_id, { count: 1, lastCheck: check.check_datetime }); }
      });

      const enrichedWOs: EligibleWorkOrder[] = workOrders.map(wo => {
        const qcInfo = qcChecksByWo.get(wo.id);
        return {
          id: wo.id,
          wo_id: wo.wo_id,
          display_id: wo.display_id || wo.wo_id,
          customer: wo.customer,
          item_code: wo.item_code,
          status: wo.status,
          quantity: wo.quantity,
          tolerances_defined: itemCodesWithTolerances.has(wo.item_code),
          last_qc_check: qcInfo?.lastCheck,
          qc_check_count: qcInfo?.count || 0
        };
      });

      setEligibleWorkOrders(enrichedWOs.filter(wo => wo.tolerances_defined));
    } catch (error: any) {
      console.error('Error loading work orders:', error);
      toast.error('Failed to load work orders');
    } finally {
      setLoading(false);
    }
  };

  const loadTolerances = async () => {
    if (!selectedWorkOrder) return;
    try {
      const { data, error } = await supabase
        .from('dimension_tolerances')
        .select('*')
        .eq('item_code', selectedWorkOrder.item_code)
        .eq('operation', operation)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const dimensionsObj = data[0].dimensions as Record<string, { name: string; min: number; max: number; unit?: string }>;
        const tolerancesArray = Object.entries(dimensionsObj).map(([id, dim]) => ({
          id, name: dim.name, min: dim.min, max: dim.max, unit: dim.unit || 'mm'
        }));
        
        setTolerances(tolerancesArray);
        const initialMeasurements: Record<string, string> = {};
        tolerancesArray.forEach(t => { initialMeasurements[t.id] = ''; });
        setMeasurements(initialMeasurements);
      } else {
        toast.error('No tolerances defined for this operation');
        setTolerances([]);
        setMeasurements({});
      }
    } catch (error) {
      console.error('Error loading tolerances:', error);
      toast.error('Failed to load tolerances');
    }
  };

  const checkTolerance = (value: number, min: number, max: number): boolean => value >= min && value <= max;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkOrder) { toast.error('No work order selected'); return; }
    if (!machineId) { toast.error('Please select a machine'); return; }

    try {
      const outOfTolerance: string[] = [];
      const dimensionsData: Record<string, number> = {};

      tolerances.forEach(tol => {
        const measuredValue = parseFloat(measurements[tol.id] || '0');
        dimensionsData[tol.id] = measuredValue;
        if (!checkTolerance(measuredValue, tol.min, tol.max)) outOfTolerance.push(tol.name);
      });

      let hasBinaryFailure = false;
      if (binaryChecksEnabled) {
        if (applicableChecks.thread && qcResults.thread !== 'ok' && qcResults.thread !== 'na') hasBinaryFailure = true;
        if (applicableChecks.visual && qcResults.visual !== 'ok' && qcResults.visual !== 'na') hasBinaryFailure = true;
        if (applicableChecks.plating && qcResults.plating !== 'ok' && qcResults.plating !== 'na') hasBinaryFailure = true;
        if (applicableChecks.platingThickness && qcResults.platingThickness !== 'ok' && qcResults.platingThickness !== 'na') hasBinaryFailure = true;
      }

      const overallStatus = (outOfTolerance.length === 0 && !hasBinaryFailure) ? 'pass' : 'fail';

      const { error } = await supabase.from('hourly_qc_checks').insert({
        wo_id: selectedWorkOrder.id,
        machine_id: machineId,
        operator_id: (await supabase.auth.getUser()).data.user?.id,
        operation: operation,
        dimensions: dimensionsData,
        status: overallStatus,
        out_of_tolerance_dimensions: outOfTolerance.length > 0 ? outOfTolerance : null,
        thread_applicable: applicableChecks.thread,
        thread_status: applicableChecks.thread ? qcResults.thread : null,
        visual_applicable: applicableChecks.visual,
        visual_status: applicableChecks.visual ? qcResults.visual : null,
        plating_applicable: applicableChecks.plating,
        plating_status: applicableChecks.plating ? qcResults.plating : null,
        plating_thickness_applicable: applicableChecks.platingThickness,
        plating_thickness_status: applicableChecks.platingThickness ? qcResults.platingThickness : null,
        remarks: qcResults.remarks || null
      });

      if (error) throw error;

      toast.success(overallStatus === 'pass' ? '✅ QC Check Passed' : '⚠️ QC Check Failed - Deviation recorded');
      resetForm();
      setSelectedWorkOrder(null);
      loadEligibleWorkOrders();
    } catch (error: any) {
      console.error('Error submitting QC check:', error);
      toast.error(error.message || 'Failed to submit QC check');
    }
  };

  const resetForm = () => {
    setMeasurements({});
    setQcResults({ thread: 'ok', visual: 'ok', plating: 'ok', platingThickness: 'ok', remarks: '' });
    setBinaryChecksEnabled(false);
    setApplicableChecks({ thread: false, visual: false, plating: false, platingThickness: false });
    setOperation('A');
    setMachineId("");
  };

  const filteredWorkOrders = eligibleWorkOrders.filter(wo => 
    wo.display_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wo.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    wo.item_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTimeSinceLastCheck = (lastCheck?: string) => {
    if (!lastCheck) return null;
    const diff = Date.now() - new Date(lastCheck).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}h ${minutes}m ago`;
    return `${minutes}m ago`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <PageContainer>
          <div className="flex items-center justify-center h-64">
            <Clock className="w-6 h-6 animate-spin text-primary" />
          </div>
        </PageContainer>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // QC ENTRY FORM VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  if (selectedWorkOrder) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        
        <PageContainer maxWidth="lg">
          <div className="space-y-6">
            <Button variant="outline" onClick={() => setSelectedWorkOrder(null)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Work Orders
            </Button>

            {/* Work Order Summary */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Recording QC for</p>
                    <p className="text-lg font-bold">{selectedWorkOrder.display_id}</p>
                  </div>
                  <Badge variant="outline" className="text-base">{selectedWorkOrder.item_code}</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Production Context from Daily Production Log - Read Only */}
            {machineId && (
              <ProductionContextDisplay
                workOrderId={selectedWorkOrder.id}
                machineId={machineId}
                title="Production Context (from Daily Log)"
                showRejectionDetails={true}
              />
            )}
            {!machineId && (
              <Card className="border-muted bg-muted/20">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Select a machine to view production context from Daily Production Log
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Rejection Classification Review - Read Only from Production, QC can Confirm/Challenge */}
            {machineId && productionLogData && productionLogData.total_rejection_quantity && productionLogData.total_rejection_quantity > 0 && (
              <RejectionClassificationReview
                workOrderId={selectedWorkOrder.id}
                productionLogId={productionLogData.id}
                totalRejection={productionLogData.total_rejection_quantity}
                rejectionBreakdown={[
                  { key: 'rejection_dent', label: 'Dent', productionCount: productionLogData.rejection_dent || 0 },
                  { key: 'rejection_scratch', label: 'Scratch', productionCount: productionLogData.rejection_scratch || 0 },
                  { key: 'rejection_forging_mark', label: 'Forging Mark', productionCount: productionLogData.rejection_forging_mark || 0 },
                  { key: 'rejection_lining', label: 'Lining', productionCount: productionLogData.rejection_lining || 0 },
                  { key: 'rejection_dimension', label: 'Dimension', productionCount: productionLogData.rejection_dimension || 0 },
                  { key: 'rejection_tool_mark', label: 'Tool Mark', productionCount: productionLogData.rejection_tool_mark || 0 },
                  { key: 'rejection_setting', label: 'Setting', productionCount: productionLogData.rejection_setting || 0 },
                  { key: 'rejection_previous_setup_fault', label: 'Previous Setup', productionCount: productionLogData.rejection_previous_setup_fault || 0 },
                  { key: 'rejection_face_not_ok', label: 'Face Not OK', productionCount: productionLogData.rejection_face_not_ok || 0 },
                  { key: 'rejection_material_not_ok', label: 'Material Not OK', productionCount: productionLogData.rejection_material_not_ok || 0 },
                ].filter(r => r.productionCount > 0)}
                onUpdate={loadProductionLogData}
              />
            )}

            {/* Entry Form */}
            <QCSection title="QC Entry Form" icon={<ClipboardCheck className="h-5 w-5" />}>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Operation & Machine Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Operation</Label>
                    <Select value={operation} onValueChange={(v) => setOperation(v as typeof OPERATIONS[number])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATIONS.map(op => <SelectItem key={op} value={op}>Operation {op}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Machine</Label>
                    <Select value={machineId} onValueChange={setMachineId}>
                      <SelectTrigger><SelectValue placeholder="Select machine" /></SelectTrigger>
                      <SelectContent>
                        {machines.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name} ({m.machine_id})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {tolerances.length > 0 ? (
                  <>
                    {/* Dimensional Measurements */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Dimensional Measurements</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tolerances.map(tol => {
                          const measuredValue = parseFloat(measurements[tol.id] || '0');
                          const isOutOfTolerance = measurements[tol.id] && !checkTolerance(measuredValue, tol.min, tol.max);
                          const isPassing = measurements[tol.id] && checkTolerance(measuredValue, tol.min, tol.max);
                          return (
                            <div key={tol.id} className="space-y-1">
                              <Label className="text-xs">
                                {tol.name}
                                <span className="text-muted-foreground ml-2">({tol.min} - {tol.max} {tol.unit})</span>
                              </Label>
                              <Input 
                                type="number" 
                                step="0.001" 
                                value={measurements[tol.id] || ''} 
                                onChange={(e) => setMeasurements({...measurements, [tol.id]: e.target.value})} 
                                className={
                                  isOutOfTolerance 
                                    ? 'border-destructive bg-destructive/10' 
                                    : isPassing 
                                      ? 'border-emerald-500 bg-emerald-500/10' 
                                      : ''
                                } 
                              />
                              {isOutOfTolerance && (
                                <div className="flex items-center gap-1 text-xs text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  Out of tolerance
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Binary Checks */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Binary QC Checks</Label>
                        {!binaryChecksEnabled && (
                          <Button type="button" variant="outline" size="sm" onClick={() => setBinaryChecksEnabled(true)}>
                            + Add Checks
                          </Button>
                        )}
                      </div>
                      {binaryChecksEnabled && (
                        <Card className="bg-muted/30">
                          <CardContent className="pt-4 space-y-4">
                            <div className="flex gap-4 flex-wrap">
                              {['thread', 'visual', 'plating', 'platingThickness'].map(check => (
                                <label key={check} className="flex items-center gap-2 text-sm">
                                  <input 
                                    type="checkbox" 
                                    checked={applicableChecks[check as keyof typeof applicableChecks]} 
                                    onChange={(e) => setApplicableChecks({...applicableChecks, [check]: e.target.checked})} 
                                    className="rounded"
                                  />
                                  <span className="capitalize">{check.replace(/([A-Z])/g, ' $1')}</span>
                                </label>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              {Object.entries(applicableChecks).filter(([_, v]) => v).map(([check]) => (
                                <div key={check}>
                                  <Label className="text-xs capitalize">{check.replace(/([A-Z])/g, ' $1')}</Label>
                                  <Select 
                                    value={qcResults[check as keyof typeof qcResults]} 
                                    onValueChange={(v) => setQcResults({...qcResults, [check]: v})}
                                  >
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="ok">OK</SelectItem>
                                      <SelectItem value="not_ok">Not OK</SelectItem>
                                      <SelectItem value="na">N/A</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {/* Remarks */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Remarks</Label>
                      <Textarea 
                        value={qcResults.remarks} 
                        onChange={(e) => setQcResults({...qcResults, remarks: e.target.value})} 
                        placeholder="Any observations..." 
                        rows={2} 
                      />
                    </div>

                    {/* NCR Button for Pattern Detection */}
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1" size="lg">
                        Submit QC Check
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={() => {
                          setNcrPrefill({
                            issueDescription: `In-Process QC Issue Detected - ${selectedWorkOrder.display_id}`,
                            sourceReference: `Hourly QC Check - Operation ${operation}`
                          });
                          setShowNCRDialog(true);
                        }}
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Raise NCR
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No tolerances defined for this operation. Please set up tolerances first.
                  </div>
                )}
              </form>
            </QCSection>

            {/* NCR Dialog */}
            <NCRFormDialog
              open={showNCRDialog}
              onOpenChange={setShowNCRDialog}
              onSuccess={() => setShowNCRDialog(false)}
              prefillData={{
                workOrderId: selectedWorkOrder.id,
                issueDescription: ncrPrefill.issueDescription,
                sourceReference: ncrPrefill.sourceReference,
              }}
            />
          </div>
        </PageContainer>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORK ORDER LIST VIEW
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <PageHeader
            title="In-Process QC (Hourly)"
            description="Dimensional quality checks for active work orders"
            icon={<ClipboardCheck className="h-6 w-6" />}
          />

          {eligibleWorkOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardCheck className="h-10 w-10 mx-auto text-muted-foreground mb-4 opacity-50" />
                <p className="text-lg font-medium">No Work Orders Ready for In-Process QC</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  Work orders must be active and have dimension tolerances defined.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Summary Stats */}
              <QCSummaryStats
                stats={[
                  { label: 'Active WOs', value: eligibleWorkOrders.length, type: 'total' },
                  { label: 'With QC Checks', value: eligibleWorkOrders.filter(wo => wo.qc_check_count > 0).length, type: 'passed' },
                  { label: 'Pending First Check', value: eligibleWorkOrders.filter(wo => wo.qc_check_count === 0).length, type: 'pending' },
                  { label: 'Total Checks', value: eligibleWorkOrders.reduce((sum, wo) => sum + wo.qc_check_count, 0), type: 'neutral' },
                ]}
              />

              {/* Search */}
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by WO ID, customer, or item code..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Work Orders Table */}
              <QCSection title="Work Orders Ready for QC">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>QC Checks</TableHead>
                      <TableHead>Last Check</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWorkOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No matching work orders found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredWorkOrders.map((wo) => (
                        <TableRow key={wo.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium">{wo.display_id}</TableCell>
                          <TableCell>{wo.customer}</TableCell>
                          <TableCell>{wo.item_code}</TableCell>
                          <TableCell>{wo.quantity?.toLocaleString()}</TableCell>
                          <TableCell>
                            <QCStatusIndicator 
                              status={wo.qc_check_count > 0 ? 'passed' : 'pending'} 
                              label={`${wo.qc_check_count} check${wo.qc_check_count !== 1 ? 's' : ''}`}
                              size="sm"
                              showIcon={false}
                            />
                          </TableCell>
                          <TableCell>
                            {wo.last_qc_check ? (
                              <span className="text-xs text-muted-foreground">{getTimeSinceLastCheck(wo.last_qc_check)}</span>
                            ) : (
                              <span className="text-xs text-amber-600">No checks yet</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" onClick={() => setSelectedWorkOrder(wo)}>
                              Record QC
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </QCSection>
            </>
          )}
        </div>
      </PageContainer>
    </div>
  );
};

export default HourlyQC;
