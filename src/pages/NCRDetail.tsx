import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, FileWarning, Save, Lock, Shield, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { NCRActionManager } from '@/components/ncr/NCRActionManager';
import { NCRLinkedData } from '@/components/ncr/NCRLinkedData';
import { useUserRole } from '@/hooks/useUserRole';

interface NCR {
  id: string;
  ncr_number: string;
  ncr_type: 'INTERNAL' | 'CUSTOMER' | 'SUPPLIER';
  source_reference: string | null;
  work_order_id: string | null;
  qc_record_id: string | null;
  operation_type: string | null;
  quantity_affected: number;
  unit: string;
  issue_description: string;
  disposition: string | null;
  root_cause: string | null;
  corrective_action: string | null;
  preventive_action: string | null;
  responsible_person: string | null;
  due_date: string | null;
  status: 'OPEN' | 'ACTION_IN_PROGRESS' | 'EFFECTIVENESS_PENDING' | 'CLOSED';
  effectiveness_check: string | null;
  effectiveness_verified: boolean;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  raised_from: string | null;
  material_lot_id: string | null;
  production_log_id: string | null;
  closure_notes: string | null;
  financial_impact_type: 'SCRAP' | 'REWORK' | 'CUSTOMER_REJECTION' | null;
  linked_invoice_id: string | null;
  linked_dispatch_id: string | null;
  cost_impact: number | null;
  adjustment_created: boolean;
  work_orders?: { wo_number: string; display_id: string; customer_id: string; financial_snapshot: any } | null;
}

const STATUS_CONFIG = {
  OPEN: { label: 'Open', icon: AlertTriangle, color: 'bg-red-100 text-red-800' },
  ACTION_IN_PROGRESS: { label: 'In Progress', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  EFFECTIVENESS_PENDING: { label: 'Effectiveness Pending', icon: FileWarning, color: 'bg-blue-100 text-blue-800' },
  CLOSED: { label: 'Closed', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
};

export default function NCRDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useUserRole();
  const [ncr, setNCR] = useState<NCR | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoices, setInvoices] = useState<{ id: string; invoice_no: string }[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  
  const isQualityUser = hasRole('quality') || hasRole('admin');
  
  const [formData, setFormData] = useState<{
    disposition: 'REWORK' | 'SCRAP' | 'USE_AS_IS' | 'RETURN_TO_SUPPLIER' | '';
    financial_impact_type: 'SCRAP' | 'REWORK' | 'CUSTOMER_REJECTION' | '';
    root_cause: string;
    corrective_action: string;
    preventive_action: string;
    effectiveness_check: string;
    effectiveness_verified: boolean;
    closure_notes: string;
  }>({
    disposition: '',
    financial_impact_type: '',
    root_cause: '',
    corrective_action: '',
    preventive_action: '',
    effectiveness_check: '',
    effectiveness_verified: false,
    closure_notes: '',
  });

  useEffect(() => {
    if (id) loadNCR();
  }, [id]);

  const loadNCR = async () => {
    try {
      const { data, error } = await supabase
        .from('ncrs')
        .select(`
          *,
          work_orders (wo_number, display_id, customer_id, financial_snapshot)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setNCR(data as NCR);
      setSelectedInvoiceId(data.linked_invoice_id || '');
      setFormData({
        disposition: data.disposition || '',
        financial_impact_type: (data.financial_impact_type as 'SCRAP' | 'REWORK' | 'CUSTOMER_REJECTION' | '') || '',
        root_cause: data.root_cause || '',
        corrective_action: data.corrective_action || '',
        preventive_action: data.preventive_action || '',
        effectiveness_check: data.effectiveness_check || '',
        effectiveness_verified: data.effectiveness_verified || false,
        closure_notes: data.closure_notes || '',
      });

      // Load related invoices if we have a customer from work order
      if (data.work_orders?.customer_id) {
        const { data: invoiceData } = await supabase
          .from('invoices')
          .select('id, invoice_no')
          .eq('customer_id', data.work_orders.customer_id)
          .order('invoice_date', { ascending: false })
          .limit(50);
        setInvoices(invoiceData || []);
      }
    } catch (error) {
      console.error('Error loading NCR:', error);
      toast.error('Failed to load NCR');
    } finally {
      setLoading(false);
    }
  };

  const handleInvoiceLink = async (invoiceId: string) => {
    if (!ncr) return;
    try {
      const { error } = await supabase
        .from('ncrs')
        .update({ linked_invoice_id: invoiceId || null } as any)
        .eq('id', ncr.id);
      
      if (error) throw error;
      setSelectedInvoiceId(invoiceId);
      toast.success(invoiceId ? 'Invoice linked' : 'Invoice unlinked');
    } catch (error) {
      console.error('Error linking invoice:', error);
      toast.error('Failed to link invoice');
    }
  };

  const canClose = () => {
    return (
      isQualityUser &&
      formData.disposition &&
      formData.root_cause &&
      formData.corrective_action &&
      formData.preventive_action &&
      formData.effectiveness_check &&
      formData.effectiveness_verified
    );
  };

  const getMissingRequirements = () => {
    const missing = [];
    if (!formData.disposition) missing.push('Disposition');
    if (!formData.root_cause) missing.push('Root Cause');
    if (!formData.corrective_action) missing.push('Corrective Action');
    if (!formData.preventive_action) missing.push('Preventive Action');
    if (!formData.effectiveness_check) missing.push('Effectiveness Check');
    if (!formData.effectiveness_verified) missing.push('Effectiveness Verification');
    return missing;
  };

  // Calculate cost impact based on disposition and work order pricing
  const calculateCostImpact = (): number => {
    if (!ncr?.work_orders?.financial_snapshot) return 0;
    const snapshot = ncr.work_orders.financial_snapshot;
    const pricePerPc = snapshot?.line_item?.price_per_pc || 0;
    return ncr.quantity_affected * pricePerPc;
  };

  // Auto-create customer adjustment when NCR is customer rejection
  const createCustomerAdjustment = async () => {
    if (!ncr || formData.financial_impact_type !== 'CUSTOMER_REJECTION') return;
    if (ncr.adjustment_created) return; // Already created
    
    const customerId = ncr.work_orders?.customer_id;
    if (!customerId) {
      toast.error('Cannot create adjustment: No customer linked to work order');
      return;
    }

    const costImpact = calculateCostImpact();
    const snapshot = ncr.work_orders?.financial_snapshot;
    const currency = snapshot?.currency || 'USD';

    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('customer_credit_adjustments')
        .insert({
          customer_id: customerId,
          ncr_id: ncr.id,
          source_invoice_id: ncr.linked_invoice_id,
          adjustment_type: 'rejection',
          original_amount: costImpact,
          remaining_amount: costImpact,
          currency,
          reason: `Customer Rejection - NCR ${ncr.ncr_number}: ${ncr.issue_description.substring(0, 100)}`,
          rejection_qty: ncr.quantity_affected,
          unit_rate: snapshot?.line_item?.price_per_pc || 0,
          status: 'pending',
          created_by: user?.user?.id,
          notes: `Auto-created from NCR ${ncr.ncr_number}`,
        });

      if (error) throw error;
      
      // Mark NCR as having adjustment created
      await supabase
        .from('ncrs')
        .update({ adjustment_created: true, cost_impact: costImpact } as any)
        .eq('id', ncr.id);
      
      toast.success('Customer adjustment created automatically');
      return true;
    } catch (error) {
      console.error('Error creating customer adjustment:', error);
      toast.error('Failed to create customer adjustment');
      return false;
    }
  };

  const handleSave = async () => {
    if (!ncr) return;
    
    setSaving(true);
    try {
      // Determine new status based on filled fields
      let newStatus = ncr.status;
      
      if (formData.disposition && formData.root_cause && formData.corrective_action && formData.preventive_action) {
        if (!formData.effectiveness_check || !formData.effectiveness_verified) {
          newStatus = 'EFFECTIVENESS_PENDING';
        }
      } else if (formData.disposition || formData.root_cause || formData.corrective_action || formData.preventive_action) {
        newStatus = 'ACTION_IN_PROGRESS';
      }

      const costImpact = calculateCostImpact();

      const { error } = await supabase
        .from('ncrs')
        .update({
          disposition: formData.disposition || null,
          financial_impact_type: formData.financial_impact_type || null,
          root_cause: formData.root_cause || null,
          corrective_action: formData.corrective_action || null,
          preventive_action: formData.preventive_action || null,
          effectiveness_check: formData.effectiveness_check || null,
          effectiveness_verified: formData.effectiveness_verified,
          closure_notes: formData.closure_notes || null,
          cost_impact: costImpact,
          status: newStatus,
        } as any)
        .eq('id', ncr.id);

      if (error) throw error;

      // Auto-create customer adjustment if financial impact is customer rejection
      if (formData.financial_impact_type === 'CUSTOMER_REJECTION' && !ncr.adjustment_created) {
        await createCustomerAdjustment();
      }
      
      toast.success('NCR updated successfully');
      loadNCR();
    } catch (error) {
      console.error('Error saving NCR:', error);
      toast.error('Failed to save NCR');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!ncr || !canClose()) {
      if (!isQualityUser) {
        toast.error('Only Quality users can close NCRs');
      } else {
        toast.error('Cannot close NCR. Please complete all required fields.');
      }
      return;
    }

    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('ncrs')
        .update({
          disposition: formData.disposition || null,
          root_cause: formData.root_cause,
          corrective_action: formData.corrective_action,
          preventive_action: formData.preventive_action,
          effectiveness_check: formData.effectiveness_check,
          effectiveness_verified: true,
          closure_notes: formData.closure_notes,
          status: 'CLOSED',
          closed_by: user?.user?.id,
          closed_at: new Date().toISOString(),
        } as any)
        .eq('id', ncr.id);

      if (error) throw error;
      
      toast.success('NCR closed successfully');
      loadNCR();
    } catch (error) {
      console.error('Error closing NCR:', error);
      toast.error('Failed to close NCR');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!ncr) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6">
          <p>NCR not found</p>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[ncr.status];
  const StatusIcon = statusConfig.icon;
  const isClosed = ncr.status === 'CLOSED';
  const missingReqs = getMissingRequirements();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/ncr')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{ncr.ncr_number}</h1>
              <Badge className={statusConfig.color}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
              {ncr.raised_from && (
                <Badge variant="outline">
                  From: {ncr.raised_from.replace('_', ' ')}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Created {format(new Date(ncr.created_at), 'dd MMM yyyy HH:mm')}
            </p>
          </div>
          
          {!isClosed && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              {isQualityUser && (
                <Button 
                  onClick={handleClose} 
                  disabled={saving || !canClose()}
                  variant={canClose() ? 'default' : 'secondary'}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Close NCR
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Role-based warning */}
        {!isQualityUser && !isClosed && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              You can update actions assigned to you, but only Quality users can close this NCR.
            </AlertDescription>
          </Alert>
        )}

        {!isClosed && isQualityUser && missingReqs.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              To close this NCR, complete: {missingReqs.join(', ')}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Details & Linked Data */}
          <div className="space-y-6">
            {/* Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>NCR Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium">{ncr.ncr_type}</p>
                </div>
                {ncr.source_reference && (
                  <div>
                    <Label className="text-muted-foreground">Source Reference</Label>
                    <p className="font-medium">{ncr.source_reference}</p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground">Quantity Affected</Label>
                  <p className="font-medium">{ncr.quantity_affected} {ncr.unit}</p>
                </div>
                {ncr.due_date && (
                  <div>
                    <Label className="text-muted-foreground">Due Date</Label>
                    <p className="font-medium">{format(new Date(ncr.due_date), 'dd MMM yyyy')}</p>
                  </div>
                )}
                {ncr.closed_at && (
                  <div>
                    <Label className="text-muted-foreground">Closed At</Label>
                    <p className="font-medium">{format(new Date(ncr.closed_at), 'dd MMM yyyy HH:mm')}</p>
                  </div>
                )}
                
                {/* Invoice Linking */}
                {ncr.ncr_type === 'CUSTOMER' && invoices.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-muted-foreground">Linked Invoice</Label>
                    <Select 
                      value={selectedInvoiceId} 
                      onValueChange={handleInvoiceLink}
                      disabled={ncr.status === 'CLOSED'}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Link to invoice..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No invoice linked</SelectItem>
                        {invoices.map(inv => (
                          <SelectItem key={inv.id} value={inv.id}>
                            {inv.invoice_no}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedInvoiceId && (
                      <p className="text-xs text-muted-foreground">
                        This links the NCR to the invoice for adjustment tracking
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Linked Data */}
            <NCRLinkedData
              ncrId={ncr.id}
              workOrderId={ncr.work_order_id}
              qcRecordId={ncr.qc_record_id}
              materialLotId={ncr.material_lot_id}
              productionLogId={ncr.production_log_id}
              machineId={(ncr as any).machine_id}
              raisedFrom={ncr.raised_from}
            />
          </div>

          {/* Middle & Right Columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Issue & Disposition */}
            <Card>
              <CardHeader>
                <CardTitle>Issue Description</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p>{ncr.issue_description}</p>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <Label>Disposition *</Label>
                  <Select 
                    value={formData.disposition} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, disposition: v as 'REWORK' | 'SCRAP' | 'USE_AS_IS' | 'RETURN_TO_SUPPLIER' | '' }))}
                    disabled={isClosed}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select disposition..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REWORK">Rework</SelectItem>
                      <SelectItem value="SCRAP">Scrap</SelectItem>
                      <SelectItem value="USE_AS_IS">Use As-Is</SelectItem>
                      <SelectItem value="RETURN_TO_SUPPLIER">Return to Supplier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Financial Impact Classification</Label>
                  <Select 
                    value={formData.financial_impact_type} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, financial_impact_type: v as 'SCRAP' | 'REWORK' | 'CUSTOMER_REJECTION' | '' }))}
                    disabled={isClosed}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select financial impact..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SCRAP">Scrap (Company Loss)</SelectItem>
                      <SelectItem value="REWORK">Rework (WIP)</SelectItem>
                      <SelectItem value="CUSTOMER_REJECTION">Customer Rejection (Adjustment)</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.financial_impact_type === 'CUSTOMER_REJECTION' && !ncr.adjustment_created && (
                    <p className="text-xs text-amber-600">
                      ⚠️ A customer adjustment will be auto-created when you save
                    </p>
                  )}
                  {ncr.adjustment_created && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      ✓ Customer adjustment created
                    </Badge>
                  )}
                </div>

                {ncr.cost_impact && ncr.cost_impact > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                    <Label className="text-muted-foreground">Estimated Cost Impact</Label>
                    <p className="text-xl font-bold text-destructive">
                      ${ncr.cost_impact.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ncr.quantity_affected} pcs × unit price
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions Manager */}
            <NCRActionManager
              ncrId={ncr.id}
              isQualityUser={isQualityUser}
              isNCRClosed={isClosed}
              onActionsUpdate={loadNCR}
            />

            {/* 8D Steps */}
            <Card>
              <CardHeader>
                <CardTitle>8D Problem Solving</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>D4 - Root Cause Analysis *</Label>
                    <Textarea
                      value={formData.root_cause}
                      onChange={(e) => setFormData(prev => ({ ...prev, root_cause: e.target.value }))}
                      placeholder="Identify the root cause of the problem..."
                      rows={4}
                      disabled={isClosed || !isQualityUser}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>D5 - Corrective Actions *</Label>
                    <Textarea
                      value={formData.corrective_action}
                      onChange={(e) => setFormData(prev => ({ ...prev, corrective_action: e.target.value }))}
                      placeholder="Define corrective actions to address the root cause..."
                      rows={4}
                      disabled={isClosed || !isQualityUser}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>D7 - Preventive Actions *</Label>
                    <Textarea
                      value={formData.preventive_action}
                      onChange={(e) => setFormData(prev => ({ ...prev, preventive_action: e.target.value }))}
                      placeholder="Define preventive actions to avoid recurrence..."
                      rows={4}
                      disabled={isClosed || !isQualityUser}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>D8 - Effectiveness Verification *</Label>
                    <Textarea
                      value={formData.effectiveness_check}
                      onChange={(e) => setFormData(prev => ({ ...prev, effectiveness_check: e.target.value }))}
                      placeholder="Document how effectiveness was verified..."
                      rows={4}
                      disabled={isClosed || !isQualityUser}
                    />
                  </div>
                </div>

                {isQualityUser && !isClosed && (
                  <>
                    <div className="space-y-2">
                      <Label>Closure Notes</Label>
                      <Textarea
                        value={formData.closure_notes}
                        onChange={(e) => setFormData(prev => ({ ...prev, closure_notes: e.target.value }))}
                        placeholder="Additional notes for closure..."
                        rows={2}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="effectiveness_verified"
                        checked={formData.effectiveness_verified}
                        onChange={(e) => setFormData(prev => ({ ...prev, effectiveness_verified: e.target.checked }))}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="effectiveness_verified" className="cursor-pointer">
                        I confirm that effectiveness has been verified
                      </Label>
                    </div>
                  </>
                )}

                {isClosed && ncr.closure_notes && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <Label className="text-green-800 dark:text-green-300">Closure Notes</Label>
                    <p className="mt-1">{ncr.closure_notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
