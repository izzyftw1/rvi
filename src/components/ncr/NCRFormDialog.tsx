import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkOrderSelect } from '@/components/ui/work-order-select';
import { toast } from 'sonner';
import { FormSection, FormRow, FormField, FormActions, FormContainer, RequiredIndicator } from '@/components/ui/form-layout';
import { Database } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Package, Link2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type NCRType = Database['public']['Enums']['ncr_type'];
type NCRDisposition = Database['public']['Enums']['ncr_disposition'];

interface NCRFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  prefillData?: {
    workOrderId?: string;
    qcRecordId?: string;
    issueDescription?: string;
    sourceReference?: string;
    raisedFrom?: 'incoming_qc' | 'inprocess_qc' | 'final_qc' | 'production';
    materialLotId?: string;
    productionLogId?: string;
    batchId?: string;
    machineId?: string;
    operationType?: string;
    rejectionType?: string;
    quantityAffected?: number;
  };
}

interface WorkOrder {
  id: string;
  wo_number: string;
  item_code: string | null;
  customer: string | null;
  quantity: number | null;
}

interface ResolvedMaterialLot {
  id: string;
  lot_id: string;
  alloy: string;
  heat_no: string | null;
  supplier: string | null;
  material_size_mm: string | null;
  resolved_via: 'direct' | 'wo_material_issue' | 'batch' | 'none';
}

export function NCRFormDialog({ open, onOpenChange, onSuccess, prefillData }: NCRFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [resolvedLot, setResolvedLot] = useState<ResolvedMaterialLot | null>(null);
  const [resolvingLot, setResolvingLot] = useState(false);
  
  const [formData, setFormData] = useState({
    ncr_type: 'INTERNAL' as NCRType,
    source_reference: prefillData?.sourceReference || '',
    work_order_id: prefillData?.workOrderId || '',
    quantity_affected: prefillData?.quantityAffected?.toString() || '',
    unit: 'pcs',
    issue_description: prefillData?.issueDescription || '',
    root_cause: '',
    corrective_action: '',
    disposition: '' as NCRDisposition | '',
    due_date: '',
    raised_from: prefillData?.raisedFrom || '' as 'incoming_qc' | 'inprocess_qc' | 'final_qc' | 'production' | '',
    production_log_id: prefillData?.productionLogId || '',
    batch_id: prefillData?.batchId || '',
    machine_id: prefillData?.machineId || '',
    rejection_type: prefillData?.rejectionType || '',
  });

  useEffect(() => {
    if (open) {
      loadWorkOrders();
      if (prefillData) {
        setFormData(prev => ({
          ...prev,
          work_order_id: prefillData.workOrderId || '',
          issue_description: prefillData.issueDescription || '',
          source_reference: prefillData.sourceReference || '',
          raised_from: prefillData.raisedFrom || '',
          production_log_id: prefillData.productionLogId || '',
          batch_id: prefillData.batchId || '',
          machine_id: prefillData.machineId || '',
          rejection_type: prefillData.rejectionType || '',
          quantity_affected: prefillData.quantityAffected?.toString() || '',
        }));
        
        // Auto-resolve material lot from prefill
        if (prefillData.materialLotId) {
          resolveMaterialLotDirect(prefillData.materialLotId);
        } else if (prefillData.workOrderId) {
          resolveMaterialLotFromWO(prefillData.workOrderId, prefillData.batchId);
        }
      }
    } else {
      // Reset on close
      setResolvedLot(null);
    }
  }, [open, prefillData]);

  // Auto-resolve when work order changes
  useEffect(() => {
    if (formData.work_order_id && !prefillData?.materialLotId) {
      resolveMaterialLotFromWO(formData.work_order_id, formData.batch_id);
    } else if (!formData.work_order_id) {
      setResolvedLot(null);
    }
  }, [formData.work_order_id, formData.batch_id]);

  const loadWorkOrders = async () => {
    const { data } = await supabase
      .from('work_orders')
      .select('id, wo_number, item_code, customer, quantity')
      .order('created_at', { ascending: false })
      .limit(100);
    
    setWorkOrders(data || []);
  };

  const resolveMaterialLotDirect = async (lotId: string) => {
    setResolvingLot(true);
    try {
      const { data } = await supabase
        .from('material_lots')
        .select('id, lot_id, alloy, heat_no, supplier, material_size_mm')
        .eq('id', lotId)
        .single();
      
      if (data) {
        setResolvedLot({
          ...data,
          resolved_via: 'direct'
        });
      }
    } catch (error) {
      console.error('Error resolving material lot:', error);
    } finally {
      setResolvingLot(false);
    }
  };

  const resolveMaterialLotFromWO = async (workOrderId: string, batchId?: string) => {
    setResolvingLot(true);
    try {
      // Resolve from wo_material_issues - this is the primary linkage
      const { data: issuesData } = await supabase
        .from('wo_material_issues')
        .select('lot_id')
        .eq('wo_id', workOrderId)
        .order('issued_at', { ascending: false })
        .limit(1);
      
      if (issuesData && issuesData.length > 0 && issuesData[0].lot_id) {
        const { data: lotData } = await supabase
          .from('material_lots')
          .select('id, lot_id, alloy, heat_no, supplier, material_size_mm')
          .eq('id', issuesData[0].lot_id)
          .single();
        
        if (lotData) {
          setResolvedLot({
            ...lotData,
            resolved_via: 'wo_material_issue'
          });
          return;
        }
      }

      // No material lot found
      setResolvedLot({
        id: '',
        lot_id: 'Not Found',
        alloy: '-',
        heat_no: null,
        supplier: null,
        material_size_mm: null,
        resolved_via: 'none'
      });
    } catch (error) {
      console.error('Error resolving material lot from WO:', error);
      setResolvedLot(null);
    } finally {
      setResolvingLot(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.quantity_affected || !formData.issue_description || !formData.ncr_type) {
      toast.error('Please fill in required fields: NCR Type, Quantity, and Issue Description');
      return;
    }

    setLoading(true);
    try {
      const { data: ncrNumber } = await supabase.rpc('generate_ncr_number');
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('ncrs').insert({
        ncr_number: ncrNumber,
        ncr_type: formData.ncr_type,
        source_reference: formData.source_reference || null,
        work_order_id: formData.work_order_id || null,
        qc_record_id: prefillData?.qcRecordId || null,
        quantity_affected: parseFloat(formData.quantity_affected),
        unit: formData.unit,
        issue_description: formData.issue_description,
        root_cause: formData.root_cause || null,
        corrective_action: formData.corrective_action || null,
        disposition: formData.disposition || null,
        due_date: formData.due_date || null,
        created_by: user?.user?.id,
        status: 'OPEN',
        raised_from: formData.raised_from || null,
        material_lot_id: resolvedLot?.id && resolvedLot.resolved_via !== 'none' ? resolvedLot.id : null,
        production_log_id: formData.production_log_id || null,
        machine_id: formData.machine_id || null,
        rejection_type: formData.rejection_type || null,
      });

      if (error) throw error;

      toast.success('NCR created successfully');
      onSuccess();
      resetForm();
    } catch (error) {
      console.error('Error creating NCR:', error);
      toast.error('Failed to create NCR');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      ncr_type: 'INTERNAL',
      source_reference: '',
      work_order_id: prefillData?.workOrderId || '',
      quantity_affected: '',
      unit: 'pcs',
      issue_description: '',
      root_cause: '',
      corrective_action: '',
      disposition: '',
      due_date: '',
      raised_from: '',
      production_log_id: '',
      batch_id: '',
      machine_id: '',
      rejection_type: '',
    });
    setResolvedLot(null);
  };

  const dispositionOptions: { value: NCRDisposition; label: string }[] = [
    { value: 'REWORK', label: 'Rework' },
    { value: 'SCRAP', label: 'Scrap' },
    { value: 'USE_AS_IS', label: 'Use As Is' },
    { value: 'RETURN_TO_SUPPLIER', label: 'Return to Supplier' },
  ];

  const getResolvedViaLabel = (via: string) => {
    switch (via) {
      case 'direct': return 'Direct Link';
      case 'wo_material_issue': return 'WO Material Issue';
      case 'batch': return 'Production Batch';
      case 'none': return 'Not Found';
      default: return via;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Non-Conformance Report</DialogTitle>
          <DialogDescription>
            Log a quality issue for tracking and resolution
          </DialogDescription>
        </DialogHeader>
        
        <FormContainer onSubmit={handleSubmit}>
          {/* Classification Section */}
          <FormSection title="Classification" description="Categorize the non-conformance">
            <FormRow cols={2}>
              <FormField>
                <Label>NCR Type<RequiredIndicator /></Label>
                <Select 
                  value={formData.ncr_type} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, ncr_type: v as NCRType }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INTERNAL">Internal</SelectItem>
                    <SelectItem value="CUSTOMER">Customer</SelectItem>
                    <SelectItem value="SUPPLIER">Supplier</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField>
                <Label>Disposition (Severity)</Label>
                <Select 
                  value={formData.disposition} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, disposition: v as NCRDisposition }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select disposition" />
                  </SelectTrigger>
                  <SelectContent>
                    {dispositionOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>

            <FormRow cols={2}>
              <FormField>
                <Label>Source Reference</Label>
                <Input
                  value={formData.source_reference}
                  onChange={(e) => setFormData(prev => ({ ...prev, source_reference: e.target.value }))}
                  placeholder="e.g., Customer PO, Lot ID"
                />
              </FormField>

              <FormField>
                <Label>Raised From</Label>
                <Select 
                  value={formData.raised_from} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, raised_from: v as any }))}
                  disabled={!!prefillData?.raisedFrom}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select source..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incoming_qc">Incoming QC</SelectItem>
                    <SelectItem value="inprocess_qc">In-Process QC</SelectItem>
                    <SelectItem value="final_qc">Final QC</SelectItem>
                    <SelectItem value="production">Production</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>

            <FormField>
              <Label>Work Order</Label>
              <WorkOrderSelect
                value={formData.work_order_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, work_order_id: v === 'none' ? '' : v }))}
                workOrders={workOrders}
                placeholder="Select work order..."
                disabled={!!prefillData?.workOrderId}
                includeNone={true}
                noneLabel="No Work Order"
              />
            </FormField>

            {/* Auto-resolved Material Lot (Read-only) */}
            <FormField>
              <Label className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Material Lot (Auto-Resolved)
              </Label>
              {resolvingLot ? (
                <div className="h-10 flex items-center text-muted-foreground text-sm">
                  Resolving material lot...
                </div>
              ) : resolvedLot ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md border">
                    {resolvedLot.resolved_via !== 'none' ? (
                      <>
                        <div className="flex-1">
                          <div className="font-medium">{resolvedLot.lot_id}</div>
                          <div className="text-sm text-muted-foreground">
                            {resolvedLot.alloy} • Heat: {resolvedLot.heat_no || 'N/A'}
                            {resolvedLot.supplier && ` • Supplier: ${resolvedLot.supplier}`}
                            {resolvedLot.material_size_mm && ` • Size: ${resolvedLot.material_size_mm}`}
                          </div>
                        </div>
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          {getResolvedViaLabel(resolvedLot.resolved_via)}
                        </Badge>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        <span>No material lot linked to this work order</span>
                      </div>
                    )}
                  </div>
                  {resolvedLot.resolved_via !== 'none' && resolvedLot.supplier && (
                    <Alert>
                      <Link2 className="h-4 w-4" />
                      <AlertDescription>
                        Traceability: NCR → Lot {resolvedLot.lot_id} → Supplier: {resolvedLot.supplier}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : formData.work_order_id ? (
                <div className="h-10 flex items-center text-muted-foreground text-sm">
                  Select a work order to auto-resolve material lot
                </div>
              ) : (
                <div className="h-10 flex items-center text-muted-foreground text-sm">
                  Material lot will be auto-resolved from work order
                </div>
              )}
            </FormField>
          </FormSection>

          {/* Issue Details Section */}
          <FormSection title="Issue Details" description="Describe the non-conformance" withSeparator>
            <FormRow cols={2}>
              <FormField>
                <Label>Quantity Affected<RequiredIndicator /></Label>
                <Input
                  type="number"
                  value={formData.quantity_affected}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity_affected: e.target.value }))}
                  placeholder="0"
                  min="0"
                  step="0.01"
                />
              </FormField>

              <FormField>
                <Label>Unit<RequiredIndicator /></Label>
                <Select 
                  value={formData.unit} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, unit: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces</SelectItem>
                    <SelectItem value="kg">Kilograms</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>

            <FormField>
              <Label>Issue Description<RequiredIndicator /></Label>
              <Textarea
                value={formData.issue_description}
                onChange={(e) => setFormData(prev => ({ ...prev, issue_description: e.target.value }))}
                placeholder="Describe the non-conformance issue in detail..."
                rows={3}
              />
            </FormField>
          </FormSection>

          {/* Root Cause & Corrective Action */}
          <FormSection title="Analysis & Action" description="Document root cause and corrective action" withSeparator>
            <FormField>
              <Label>Root Cause</Label>
              <Textarea
                value={formData.root_cause}
                onChange={(e) => setFormData(prev => ({ ...prev, root_cause: e.target.value }))}
                placeholder="Identify the root cause of this non-conformance..."
                rows={2}
              />
            </FormField>

            <FormField>
              <Label>Corrective Action</Label>
              <Textarea
                value={formData.corrective_action}
                onChange={(e) => setFormData(prev => ({ ...prev, corrective_action: e.target.value }))}
                placeholder="Describe the corrective action to be taken..."
                rows={2}
              />
            </FormField>
          </FormSection>

          {/* Timeline Section */}
          <FormSection title="Timeline" withSeparator>
            <FormField>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
              />
            </FormField>
          </FormSection>

          <FormActions>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create NCR'}
            </Button>
          </FormActions>
        </FormContainer>
      </DialogContent>
    </Dialog>
  );
}
