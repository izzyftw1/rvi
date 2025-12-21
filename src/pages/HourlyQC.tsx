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
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Package, ClipboardCheck, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
    thread: false,
    visual: false,
    plating: false,
    platingThickness: false
  });
  
  const [qcResults, setQcResults] = useState({
    thread: 'ok',
    visual: 'ok',
    plating: 'ok',
    platingThickness: 'ok',
    remarks: ''
  });

  useEffect(() => {
    loadEligibleWorkOrders();
    loadMachines();
    
    // Realtime updates for work orders
    const channel = supabase
      .channel('hourly-qc-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadEligibleWorkOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hourly_qc_checks' }, loadEligibleWorkOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dimension_tolerances' }, loadEligibleWorkOrders)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedWorkOrder && operation) {
      loadTolerances();
    }
  }, [selectedWorkOrder, operation]);

  const loadMachines = async () => {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('id, name, machine_id')
        .order('name');
      
      if (error) throw error;
      setMachines(data || []);
    } catch (error) {
      console.error('Error loading machines:', error);
    }
  };

  const loadEligibleWorkOrders = async () => {
    try {
      setLoading(true);
      
      // Get released work orders (status in production or similar)
      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('id, wo_id, display_id, customer, item_code, status, quantity')
        .in('status', ['in_progress', 'pending', 'qc', 'packing'])
        .order('created_at', { ascending: false });

      if (woError) throw woError;

      if (!workOrders || workOrders.length === 0) {
        setEligibleWorkOrders([]);
        return;
      }

      // Get all item codes that have tolerances defined
      const { data: toleranceData, error: tolError } = await supabase
        .from('dimension_tolerances')
        .select('item_code');

      if (tolError) throw tolError;

      const itemCodesWithTolerances = new Set(toleranceData?.map(t => t.item_code) || []);

      // Get recent QC checks for these work orders
      const woIds = workOrders.map(wo => wo.id);
      const { data: qcChecks, error: qcError } = await supabase
        .from('hourly_qc_checks')
        .select('wo_id, check_datetime')
        .in('wo_id', woIds)
        .order('check_datetime', { ascending: false });

      if (qcError) throw qcError;

      // Group QC checks by work order
      const qcChecksByWo = new Map<string, { count: number; lastCheck?: string }>();
      qcChecks?.forEach(check => {
        const existing = qcChecksByWo.get(check.wo_id);
        if (existing) {
          existing.count++;
        } else {
          qcChecksByWo.set(check.wo_id, { count: 1, lastCheck: check.check_datetime });
        }
      });

      // Enrich work orders with tolerance and QC info
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

      // Filter to only show work orders with tolerances defined
      const eligibleWOs = enrichedWOs.filter(wo => wo.tolerances_defined);
      setEligibleWorkOrders(eligibleWOs);
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
          id,
          name: dim.name,
          min: dim.min,
          max: dim.max,
          unit: dim.unit || 'mm'
        }));
        
        setTolerances(tolerancesArray);
        
        const initialMeasurements: Record<string, string> = {};
        tolerancesArray.forEach(t => {
          initialMeasurements[t.id] = '';
        });
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

  const checkTolerance = (value: number, min: number, max: number): boolean => {
    return value >= min && value <= max;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedWorkOrder) {
      toast.error('No work order selected');
      return;
    }

    if (!machineId) {
      toast.error('Please select a machine');
      return;
    }

    try {
      const outOfTolerance: string[] = [];
      const dimensionsData: Record<string, number> = {};

      tolerances.forEach(tol => {
        const measuredValue = parseFloat(measurements[tol.id] || '0');
        dimensionsData[tol.id] = measuredValue;

        if (!checkTolerance(measuredValue, tol.min, tol.max)) {
          outOfTolerance.push(tol.name);
        }
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

      toast.success(
        overallStatus === 'pass' 
          ? `✅ QC Check Passed` 
          : `⚠️ QC Check Failed - Deviation recorded`
      );
      
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
        <NavigationHeader title="Hourly QC" subtitle="In-process quality checks" />
        <div className="max-w-7xl mx-auto p-4">
          <p className="text-center text-muted-foreground">Loading work orders...</p>
        </div>
      </div>
    );
  }

  if (selectedWorkOrder) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Hourly QC Entry" subtitle={`${selectedWorkOrder.display_id} - ${selectedWorkOrder.item_code}`} />
        
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <Button variant="outline" onClick={() => setSelectedWorkOrder(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Work Orders
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>QC Entry Form</CardTitle>
                <Badge variant="outline">
                  {selectedWorkOrder.display_id} • {selectedWorkOrder.item_code}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Operation</Label>
                    <Select value={operation} onValueChange={(v) => setOperation(v as typeof OPERATIONS[number])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERATIONS.map(op => <SelectItem key={op} value={op}>Operation {op}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Machine</Label>
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
                    <div className="space-y-4">
                      <Label className="text-base font-semibold">Dimensional Measurements</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tolerances.map(tol => {
                          const measuredValue = parseFloat(measurements[tol.id] || '0');
                          const isOutOfTolerance = measurements[tol.id] && !checkTolerance(measuredValue, tol.min, tol.max);
                          return (
                            <div key={tol.id} className="space-y-2">
                              <Label>
                                {tol.name} 
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({tol.min} - {tol.max} {tol.unit})
                                </span>
                              </Label>
                              <Input 
                                type="number" 
                                step="0.001" 
                                value={measurements[tol.id] || ''} 
                                onChange={(e) => setMeasurements({...measurements, [tol.id]: e.target.value})} 
                                className={
                                  isOutOfTolerance 
                                    ? 'border-destructive bg-destructive/10' 
                                    : measurements[tol.id] 
                                      ? 'border-success bg-success/10' 
                                      : ''
                                } 
                              />
                              {isOutOfTolerance && (
                                <div className="flex items-center gap-1 text-xs text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  Out of tolerance!
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Binary QC Checks</Label>
                        {!binaryChecksEnabled && (
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setBinaryChecksEnabled(true)}
                          >
                            + Add Binary Checks
                          </Button>
                        )}
                      </div>
                      {binaryChecksEnabled && (
                        <div className="space-y-4 border rounded-lg p-4">
                          <div className="flex gap-4 flex-wrap">
                            {['thread', 'visual', 'plating', 'platingThickness'].map(check => (
                              <label key={check} className="flex items-center gap-2">
                                <input 
                                  type="checkbox" 
                                  checked={applicableChecks[check as keyof typeof applicableChecks]} 
                                  onChange={(e) => setApplicableChecks({...applicableChecks, [check]: e.target.checked})} 
                                />
                                <span className="text-sm capitalize">
                                  {check.replace(/([A-Z])/g, ' $1')}
                                </span>
                              </label>
                            ))}
                          </div>
                          {Object.entries(applicableChecks).filter(([_, v]) => v).map(([check]) => (
                            <div key={check}>
                              <Label className="capitalize">{check.replace(/([A-Z])/g, ' $1')}</Label>
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
                      )}
                    </div>

                    <div>
                      <Label>Remarks</Label>
                      <Textarea 
                        value={qcResults.remarks} 
                        onChange={(e) => setQcResults({...qcResults, remarks: e.target.value})} 
                        placeholder="Any observations..." 
                        rows={3} 
                      />
                    </div>

                    <Button type="submit" className="w-full" size="lg">
                      Submit QC Check
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No tolerances defined for this operation. Please set up tolerances first.
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Hourly QC Dashboard" subtitle="In-process quality checks for released work orders" />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {eligibleWorkOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No Released Work Orders Requiring In-Process QC</p>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                Work orders must be in a released/active status and have dimension tolerances defined to appear here.
                Set up tolerances in the Tolerance Setup page.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Package className="h-8 w-8 text-primary" />
                    <div>
                      <div className="text-2xl font-bold">{eligibleWorkOrders.length}</div>
                      <div className="text-sm text-muted-foreground">Active WOs</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-8 w-8 text-success" />
                    <div>
                      <div className="text-2xl font-bold">
                        {eligibleWorkOrders.filter(wo => wo.qc_check_count > 0).length}
                      </div>
                      <div className="text-sm text-muted-foreground">With QC Checks</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Clock className="h-8 w-8 text-warning" />
                    <div>
                      <div className="text-2xl font-bold">
                        {eligibleWorkOrders.filter(wo => wo.qc_check_count === 0).length}
                      </div>
                      <div className="text-sm text-muted-foreground">Pending First Check</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <div className="text-2xl font-bold">
                        {eligibleWorkOrders.reduce((sum, wo) => sum + wo.qc_check_count, 0)}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Checks</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <Card>
              <CardContent className="pt-6">
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
            <Card>
              <CardHeader>
                <CardTitle>Work Orders Ready for QC</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>QC Checks</TableHead>
                      <TableHead>Last Check</TableHead>
                      <TableHead>Action</TableHead>
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
                            <Badge variant={wo.qc_check_count > 0 ? "default" : "secondary"}>
                              {wo.qc_check_count} check{wo.qc_check_count !== 1 ? 's' : ''}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {wo.last_qc_check ? (
                              <span className="text-sm text-muted-foreground">
                                {getTimeSinceLastCheck(wo.last_qc_check)}
                              </span>
                            ) : (
                              <span className="text-sm text-warning">No checks yet</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => setSelectedWorkOrder(wo)}
                            >
                              Record QC
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default HourlyQC;
