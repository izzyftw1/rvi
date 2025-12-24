import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { NavigationHeader } from '@/components/NavigationHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Plus, Loader2, CreditCard, FileText } from 'lucide-react';
import { createPaymentTdsRecord } from '@/hooks/useTdsCalculation';

interface Supplier {
  id: string;
  name: string;
  pan_number: string | null;
  tds_rate: number | null;
}

interface SupplierPayment {
  id: string;
  supplier_id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_no: string | null;
  notes: string | null;
  created_at: string;
  supplier_name?: string;
}

export default function SupplierPayments() {
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    supplier_id: '',
    payment_date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    payment_method: 'bank_transfer',
    reference_no: '',
    notes: '',
  });

  const selectedSupplier = suppliers.find(s => s.id === formData.supplier_id);
  const tdsRate = selectedSupplier?.tds_rate || 0;
  const grossAmount = parseFloat(formData.amount) || 0;
  const tdsAmount = (grossAmount * tdsRate) / 100;
  const netPayable = grossAmount - tdsAmount;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load suppliers first
      const { data: suppliersData } = await supabase
        .from('suppliers')
        .select('id, name, pan_number')
        .eq('is_active', true)
        .order('name');

      const typedSuppliers = (suppliersData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        pan_number: s.pan_number,
        tds_rate: 0
      })) as Supplier[];

      // Load payments via RPC or direct fetch
      const { data: paymentsData } = await supabase.rpc('get_supplier_payments' as any).catch(() => ({ data: [] }));
      
      const supplierMap = new Map(typedSuppliers.map(s => [s.id, s.name]));
      const enrichedPayments = ((paymentsData as any[]) || []).map(p => ({
        ...p,
        supplier_name: supplierMap.get(p.supplier_id) || 'Unknown'
      })) as SupplierPayment[];

      setPayments(enrichedPayments);
      setSuppliers(typedSuppliers);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.supplier_id || !formData.amount) {
      toast.error('Please fill required fields');
      return;
    }

    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      
      const { error } = await (supabase
        .from('supplier_payments' as any)
        .insert({
          supplier_id: formData.supplier_id,
          payment_date: formData.payment_date,
          amount: parseFloat(formData.amount),
          payment_method: formData.payment_method,
          reference_no: formData.reference_no || null,
          notes: formData.notes || null,
          created_by: user?.user?.id,
        }) as any);

      if (error) throw error;

      // Create TDS record if applicable
      if (tdsRate > 0 && selectedSupplier?.pan_number) {
        await createPaymentTdsRecord({
          supplierId: formData.supplier_id,
          grossAmount: parseFloat(formData.amount),
          transactionDate: formData.payment_date,
          createdBy: user?.user?.id,
        });
      }

      toast.success('Payment recorded successfully');
      setShowAddDialog(false);
      setFormData({
        supplier_id: '',
        payment_date: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        payment_method: 'bank_transfer',
        reference_no: '',
        notes: '',
      });
      loadData();
    } catch (error: any) {
      console.error('Error saving payment:', error);
      toast.error(error.message || 'Failed to save payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Supplier Payments" 
        subtitle="Record payments to suppliers with TDS deduction"
      />

      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Payments (MTD)</p>
                  <p className="text-2xl font-bold">
                    ₹{payments
                      .filter(p => new Date(p.payment_date).getMonth() === new Date().getMonth())
                      .reduce((sum, p) => sum + p.amount, 0)
                      .toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Payments Today</p>
                  <p className="text-2xl font-bold">
                    {payments.filter(p => 
                      format(new Date(p.payment_date), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                    ).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex items-center justify-end h-full">
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <CardTitle>Payment History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : payments.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No payments recorded yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell>{format(new Date(payment.payment_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="font-medium">{payment.supplier_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {payment.payment_method.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{payment.reference_no || '-'}</TableCell>
                      <TableCell className="text-right font-medium">
                        ₹{payment.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{payment.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Payment Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Supplier Payment</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select 
                value={formData.supplier_id} 
                onValueChange={v => setFormData(prev => ({ ...prev, supplier_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.tds_rate ? `(TDS: ${s.tds_rate}%)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Date *</Label>
                <Input 
                  type="date" 
                  value={formData.payment_date}
                  onChange={e => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Gross Amount *</Label>
                <Input 
                  type="number" 
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>
            </div>

            {/* TDS Preview */}
            {formData.supplier_id && grossAmount > 0 && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Gross Amount:</span>
                  <span>₹{grossAmount.toLocaleString()}</span>
                </div>
                {tdsRate > 0 && selectedSupplier?.pan_number && (
                  <>
                    <div className="flex justify-between text-sm text-amber-600">
                      <span>TDS @ {tdsRate}%:</span>
                      <span>- ₹{tdsAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-2">
                      <span>Net Payable:</span>
                      <span>₹{netPayable.toLocaleString()}</span>
                    </div>
                  </>
                )}
                {tdsRate > 0 && !selectedSupplier?.pan_number && (
                  <p className="text-xs text-amber-600">
                    ⚠️ TDS not applicable - Supplier has no PAN
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select 
                  value={formData.payment_method} 
                  onValueChange={v => setFormData(prev => ({ ...prev, payment_method: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reference No</Label>
                <Input 
                  placeholder="Transaction ID / Cheque No"
                  value={formData.reference_no}
                  onChange={e => setFormData(prev => ({ ...prev, reference_no: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea 
                placeholder="Optional notes..."
                value={formData.notes}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
