import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface NCRFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  prefillData?: {
    workOrderId?: string;
    qcRecordId?: string;
    issueDescription?: string;
    sourceReference?: string;
  };
}

interface WorkOrder {
  id: string;
  wo_number: string;
  display_id: string;
}

export function NCRFormDialog({ open, onOpenChange, onSuccess, prefillData }: NCRFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  
  const [formData, setFormData] = useState({
    ncr_type: 'INTERNAL' as 'INTERNAL' | 'CUSTOMER' | 'SUPPLIER',
    source_reference: prefillData?.sourceReference || '',
    work_order_id: prefillData?.workOrderId || '',
    quantity_affected: '',
    unit: 'pcs',
    issue_description: prefillData?.issueDescription || '',
    responsible_person: '',
    due_date: '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.quantity_affected || !formData.issue_description) {
      toast.error('Please fill in required fields');
      return;
    }

    setLoading(true);
    try {
      // Generate NCR number
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
        due_date: formData.due_date || null,
        created_by: user?.user?.id,
        status: 'OPEN',
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
      work_order_id: '',
      quantity_affected: '',
      unit: 'pcs',
      issue_description: '',
      responsible_person: '',
      due_date: '',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Non-Conformance Report</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>NCR Type *</Label>
              <Select 
                value={formData.ncr_type} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, ncr_type: v as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INTERNAL">Internal</SelectItem>
                  <SelectItem value="CUSTOMER">Customer</SelectItem>
                  <SelectItem value="SUPPLIER">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Source Reference</Label>
              <Input
                value={formData.source_reference}
                onChange={(e) => setFormData(prev => ({ ...prev, source_reference: e.target.value }))}
                placeholder="e.g., Customer PO, Lot ID"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Work Order</Label>
            <Select 
              value={formData.work_order_id} 
              onValueChange={(v) => setFormData(prev => ({ ...prev, work_order_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select work order (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {workOrders.map(wo => (
                  <SelectItem key={wo.id} value={wo.id}>
                    {wo.display_id || wo.wo_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantity Affected *</Label>
              <Input
                type="number"
                value={formData.quantity_affected}
                onChange={(e) => setFormData(prev => ({ ...prev, quantity_affected: e.target.value }))}
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <Label>Unit *</Label>
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
            </div>
          </div>

          <div className="space-y-2">
            <Label>Issue Description *</Label>
            <Textarea
              value={formData.issue_description}
              onChange={(e) => setFormData(prev => ({ ...prev, issue_description: e.target.value }))}
              placeholder="Describe the non-conformance issue..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={formData.due_date}
              onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create NCR'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
