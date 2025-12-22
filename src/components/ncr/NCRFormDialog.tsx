import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FormSection, FormRow, FormField, FormActions, FormContainer, RequiredIndicator } from '@/components/ui/form-layout';
import { Database } from '@/integrations/supabase/types';

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
  };
}

interface WorkOrder {
  id: string;
  wo_number: string;
  display_id: string;
}

interface MaterialLot {
  id: string;
  lot_id: string;
  alloy: string;
  heat_no: string | null;
}

export function NCRFormDialog({ open, onOpenChange, onSuccess, prefillData }: NCRFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [materialLots, setMaterialLots] = useState<MaterialLot[]>([]);
  
  const [formData, setFormData] = useState({
    ncr_type: 'INTERNAL' as NCRType,
    source_reference: prefillData?.sourceReference || '',
    work_order_id: prefillData?.workOrderId || '',
    quantity_affected: '',
    unit: 'pcs',
    issue_description: prefillData?.issueDescription || '',
    root_cause: '',
    corrective_action: '',
    disposition: '' as NCRDisposition | '',
    due_date: '',
    raised_from: prefillData?.raisedFrom || '' as 'incoming_qc' | 'inprocess_qc' | 'final_qc' | 'production' | '',
    material_lot_id: prefillData?.materialLotId || '',
    production_log_id: prefillData?.productionLogId || '',
  });

  useEffect(() => {
    if (open) {
      loadWorkOrders();
      loadMaterialLots();
      if (prefillData) {
        setFormData(prev => ({
          ...prev,
          work_order_id: prefillData.workOrderId || '',
          issue_description: prefillData.issueDescription || '',
          source_reference: prefillData.sourceReference || '',
          raised_from: prefillData.raisedFrom || '',
          material_lot_id: prefillData.materialLotId || '',
          production_log_id: prefillData.productionLogId || '',
        }));
      }
    }
  }, [open, prefillData]);

  const loadWorkOrders = async () => {
    const { data } = await supabase
      .from('work_orders')
      .select('id, wo_number, display_id')
      .order('created_at', { ascending: false })
      .limit(100);
    
    setWorkOrders(data || []);
  };

  const loadMaterialLots = async () => {
    const { data } = await supabase
      .from('inventory_lots')
      .select('id, lot_id, alloy, heat_no')
      .order('received_date', { ascending: false })
      .limit(100);
    
    setMaterialLots(data || []);
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
        material_lot_id: formData.material_lot_id || null,
        production_log_id: formData.production_log_id || null,
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
      material_lot_id: '',
      production_log_id: '',
    });
  };

  const dispositionOptions: { value: NCRDisposition; label: string }[] = [
    { value: 'REWORK', label: 'Rework' },
    { value: 'SCRAP', label: 'Scrap' },
    { value: 'USE_AS_IS', label: 'Use As Is' },
    { value: 'RETURN_TO_SUPPLIER', label: 'Return to Supplier' },
  ];

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

            <FormRow cols={2}>
              <FormField>
                <Label>Work Order</Label>
                <Select 
                  value={formData.work_order_id} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, work_order_id: v }))}
                  disabled={!!prefillData?.workOrderId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select work order" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrders.map(wo => (
                      <SelectItem key={wo.id} value={wo.id}>
                        {wo.display_id || wo.wo_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField>
                <Label>Material Lot</Label>
                <Select 
                  value={formData.material_lot_id} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, material_lot_id: v }))}
                  disabled={!!prefillData?.materialLotId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select material lot..." />
                  </SelectTrigger>
                  <SelectContent>
                    {materialLots.map(lot => (
                      <SelectItem key={lot.id} value={lot.id}>
                        {lot.lot_id} - {lot.alloy} {lot.heat_no ? `(${lot.heat_no})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </FormRow>
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
