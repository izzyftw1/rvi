import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Eye, Building2, User } from 'lucide-react';
import { format } from 'date-fns';

interface SupplierAccount {
  id: string;
  user_id: string;
  customer_id: string;
  is_active: boolean;
  can_view_work_orders: boolean;
  can_view_dispatches: boolean;
  can_view_invoices: boolean;
  notes: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
  customer_master?: { customer_name: string; party_code: string } | null;
}

interface User {
  id: string;
  full_name: string;
}

interface Customer {
  id: string;
  customer_name: string;
  party_code: string | null;
}

export function SupplierAccountsManagement() {
  const [accounts, setAccounts] = useState<SupplierAccount[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAccount, setNewAccount] = useState({
    user_id: '',
    customer_id: '',
    can_view_work_orders: true,
    can_view_dispatches: false,
    can_view_invoices: false,
    notes: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load supplier accounts with related data
      const { data: accountsData, error: accountsError } = await supabase
        .from('supplier_accounts')
        .select(`
          *,
          customer_master:customer_id(customer_name, party_code)
        `)
        .order('created_at', { ascending: false });

      if (accountsError) throw accountsError;
      
      // Fetch user names separately
      const userIds = [...new Set((accountsData || []).map(a => a.user_id))];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      
      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
      
      const enrichedAccounts = (accountsData || []).map(a => ({
        ...a,
        profiles: profilesMap.get(a.user_id) || null
      }));
      
      setAccounts(enrichedAccounts as SupplierAccount[]);

      // Load all users for dropdown
      const { data: usersData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');
      setUsers(usersData || []);

      // Load all customers for dropdown
      const { data: customersData } = await supabase
        .from('customer_master')
        .select('id, customer_name, party_code')
        .order('customer_name');
      setCustomers(customersData || []);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccount.user_id || !newAccount.customer_id) {
      toast({ title: 'Error', description: 'User and Customer are required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('supplier_accounts')
        .insert({
          user_id: newAccount.user_id,
          customer_id: newAccount.customer_id,
          can_view_work_orders: newAccount.can_view_work_orders,
          can_view_dispatches: newAccount.can_view_dispatches,
          can_view_invoices: newAccount.can_view_invoices,
          notes: newAccount.notes || null,
          created_by: user?.id,
        });

      if (error) throw error;

      toast({ title: 'Success', description: 'Supplier account created successfully' });
      setDialogOpen(false);
      setNewAccount({
        user_id: '',
        customer_id: '',
        can_view_work_orders: true,
        can_view_dispatches: false,
        can_view_invoices: false,
        notes: '',
      });
      loadData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (accountId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('supplier_accounts')
        .update({ is_active: !isActive })
        .eq('id', accountId);

      if (error) throw error;
      
      setAccounts(prev => prev.map(a => 
        a.id === accountId ? { ...a, is_active: !isActive } : a
      ));
      
      toast({ title: 'Updated', description: `Account ${!isActive ? 'activated' : 'deactivated'}` });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Are you sure you want to delete this supplier account?')) return;

    try {
      const { error } = await supabase
        .from('supplier_accounts')
        .delete()
        .eq('id', accountId);

      if (error) throw error;
      
      setAccounts(prev => prev.filter(a => a.id !== accountId));
      toast({ title: 'Deleted', description: 'Supplier account removed' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Supplier Portal Accounts
            </CardTitle>
            <CardDescription>
              Assign users to customer accounts for read-only portal access to work orders
            </CardDescription>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Supplier Account
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No supplier accounts configured</p>
            <p className="text-sm">Create an account to give a user read-only access to specific customer work orders</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Customer (Party Code)</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {account.profiles?.full_name || 'Unknown'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div>{account.customer_master?.customer_name || 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">
                        {account.customer_master?.party_code || '—'}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {account.can_view_work_orders && (
                        <Badge variant="outline" className="text-xs">Work Orders</Badge>
                      )}
                      {account.can_view_dispatches && (
                        <Badge variant="outline" className="text-xs">Dispatches</Badge>
                      )}
                      {account.can_view_invoices && (
                        <Badge variant="outline" className="text-xs">Invoices</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={account.is_active}
                      onCheckedChange={() => handleToggleStatus(account.id, account.is_active)}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(account.created_at), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteAccount(account.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Supplier Account</DialogTitle>
            <DialogDescription>
              Assign a user to view a customer's work orders in the supplier portal
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>User *</Label>
              <Select
                value={newAccount.user_id}
                onValueChange={(value) => setNewAccount(prev => ({ ...prev, user_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Customer (Party Code) *</Label>
              <Select
                value={newAccount.customer_id}
                onValueChange={(value) => setNewAccount(prev => ({ ...prev, customer_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.customer_name} {customer.party_code ? `(${customer.party_code})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2">
              <Label>Permissions</Label>
              <div className="flex items-center justify-between">
                <Label className="font-normal">Can view Work Orders</Label>
                <Switch
                  checked={newAccount.can_view_work_orders}
                  onCheckedChange={(checked) => setNewAccount(prev => ({ ...prev, can_view_work_orders: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal">Can view Dispatches</Label>
                <Switch
                  checked={newAccount.can_view_dispatches}
                  onCheckedChange={(checked) => setNewAccount(prev => ({ ...prev, can_view_dispatches: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal">Can view Invoices</Label>
                <Switch
                  checked={newAccount.can_view_invoices}
                  onCheckedChange={(checked) => setNewAccount(prev => ({ ...prev, can_view_invoices: checked }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any notes about this supplier account..."
                value={newAccount.notes}
                onChange={(e) => setNewAccount(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAccount} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
