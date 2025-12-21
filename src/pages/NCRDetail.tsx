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
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, FileWarning, Save, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

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
  work_orders?: { wo_number: string; display_id: string } | null;
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
  const [ncr, setNCR] = useState<NCR | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState<{
    disposition: 'REWORK' | 'SCRAP' | 'USE_AS_IS' | 'RETURN_TO_SUPPLIER' | '';
    root_cause: string;
    corrective_action: string;
    preventive_action: string;
    effectiveness_check: string;
    effectiveness_verified: boolean;
  }>({
    disposition: '',
    root_cause: '',
    corrective_action: '',
    preventive_action: '',
    effectiveness_check: '',
    effectiveness_verified: false,
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
          work_orders (wo_number, display_id)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setNCR(data);
      setFormData({
        disposition: data.disposition || '',
        root_cause: data.root_cause || '',
        corrective_action: data.corrective_action || '',
        preventive_action: data.preventive_action || '',
        effectiveness_check: data.effectiveness_check || '',
        effectiveness_verified: data.effectiveness_verified || false,
      });
    } catch (error) {
      console.error('Error loading NCR:', error);
      toast.error('Failed to load NCR');
    } finally {
      setLoading(false);
    }
  };

  const canClose = () => {
    return (
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

      const { error } = await supabase
        .from('ncrs')
        .update({
          disposition: formData.disposition || null,
          root_cause: formData.root_cause || null,
          corrective_action: formData.corrective_action || null,
          preventive_action: formData.preventive_action || null,
          effectiveness_check: formData.effectiveness_check || null,
          effectiveness_verified: formData.effectiveness_verified,
          status: newStatus,
        } as any)
        .eq('id', ncr.id);

      if (error) throw error;
      
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
      toast.error('Cannot close NCR. Please complete all required fields.');
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
        <div className="container mx-auto px-4 py-6">
          <p>Loading...</p>
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
              <Button 
                onClick={handleClose} 
                disabled={saving || !canClose()}
                variant={canClose() ? 'default' : 'secondary'}
              >
                <Lock className="h-4 w-4 mr-2" />
                Close NCR
              </Button>
            </div>
          )}
        </div>

        {!isClosed && missingReqs.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              To close this NCR, complete: {missingReqs.join(', ')}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
              {ncr.work_orders && (
                <div>
                  <Label className="text-muted-foreground">Work Order</Label>
                  <p className="font-medium">
                    <Button 
                      variant="link" 
                      className="p-0 h-auto"
                      onClick={() => navigate(`/work-orders/${ncr.work_order_id}`)}
                    >
                      {ncr.work_orders.display_id || ncr.work_orders.wo_number}
                    </Button>
                  </p>
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
            </CardContent>
          </Card>

          {/* Issue & Disposition */}
          <Card className="lg:col-span-2">
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
            </CardContent>
          </Card>

          {/* 8D Steps */}
          <Card className="lg:col-span-3">
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
                    disabled={isClosed}
                  />
                </div>

                <div className="space-y-2">
                  <Label>D5 - Corrective Actions *</Label>
                  <Textarea
                    value={formData.corrective_action}
                    onChange={(e) => setFormData(prev => ({ ...prev, corrective_action: e.target.value }))}
                    placeholder="Define corrective actions to address the root cause..."
                    rows={4}
                    disabled={isClosed}
                  />
                </div>

                <div className="space-y-2">
                  <Label>D7 - Preventive Actions *</Label>
                  <Textarea
                    value={formData.preventive_action}
                    onChange={(e) => setFormData(prev => ({ ...prev, preventive_action: e.target.value }))}
                    placeholder="Define preventive actions to avoid recurrence..."
                    rows={4}
                    disabled={isClosed}
                  />
                </div>

                <div className="space-y-2">
                  <Label>D8 - Effectiveness Verification *</Label>
                  <Textarea
                    value={formData.effectiveness_check}
                    onChange={(e) => setFormData(prev => ({ ...prev, effectiveness_check: e.target.value }))}
                    placeholder="Document how effectiveness was verified..."
                    rows={4}
                    disabled={isClosed}
                  />
                </div>
              </div>

              {!isClosed && (
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
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
