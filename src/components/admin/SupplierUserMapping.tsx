import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface SupplierMapping {
  id: string;
  user_id: string;
  customer_id: string;
  created_at: string;
  customer_master: {
    customer_name: string;
    party_code: string | null;
  } | null;
}

interface Customer {
  id: string;
  customer_name: string;
  party_code: string | null;
}

interface SupplierUserMappingProps {
  userId: string;
  userName: string | null;
}

export function SupplierUserMapping({ userId, userName }: SupplierUserMappingProps) {
  const [mappings, setMappings] = useState<SupplierMapping[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load existing mappings for this user
      const { data: mappingsData, error: mappingsError } = await supabase
        .from('supplier_users')
        .select(`
          id,
          user_id,
          customer_id,
          created_at,
          customer_master:customer_id (customer_name, party_code)
        `)
        .eq('user_id', userId);

      if (mappingsError) throw mappingsError;
      setMappings(mappingsData || []);

      // Load all customers for selection
      const { data: customersData, error: customersError } = await supabase
        .from('customer_master')
        .select('id, customer_name, party_code')
        .order('customer_name');

      if (customersError) throw customersError;
      setCustomers(customersData || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMapping = async () => {
    if (!selectedCustomer) return;

    // Check if mapping already exists
    if (mappings.some(m => m.customer_id === selectedCustomer)) {
      toast({
        title: 'Already Mapped',
        description: 'This customer is already mapped to this supplier user.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('supplier_users')
        .insert({
          user_id: userId,
          customer_id: selectedCustomer,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer mapping added successfully.',
      });

      setSelectedCustomer('');
      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add mapping',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMapping = async (mappingId: string) => {
    try {
      const { error } = await supabase
        .from('supplier_users')
        .delete()
        .eq('id', mappingId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Customer mapping removed.',
      });

      loadData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove mapping',
        variant: 'destructive',
      });
    }
  };

  // Filter out already mapped customers
  const availableCustomers = customers.filter(
    c => !mappings.some(m => m.customer_id === c.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Customer Access Mapping
        </CardTitle>
        <CardDescription>
          Map which customers this supplier user can view work orders for.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new mapping */}
        <div className="flex gap-2">
          <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select customer to add..." />
            </SelectTrigger>
            <SelectContent>
              {availableCustomers.length === 0 ? (
                <SelectItem value="none" disabled>No customers available</SelectItem>
              ) : (
                availableCustomers.map(customer => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.customer_name}
                    {customer.party_code && (
                      <span className="text-muted-foreground ml-2">({customer.party_code})</span>
                    )}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleAddMapping} 
            disabled={!selectedCustomer || saving}
            size="icon"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>

        {/* Current mappings */}
        {mappings.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No customers mapped. This user won't be able to see any work orders.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Party Code</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map(mapping => (
                <TableRow key={mapping.id}>
                  <TableCell className="font-medium">
                    {mapping.customer_master?.customer_name || 'Unknown'}
                  </TableCell>
                  <TableCell>
                    {mapping.customer_master?.party_code ? (
                      <Badge variant="outline">{mapping.customer_master.party_code}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveMapping(mapping.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          <strong>Note:</strong> Supplier users can only view work orders for their mapped customers. 
          They have read-only access and cannot perform any actions.
        </div>
      </CardContent>
    </Card>
  );
}
