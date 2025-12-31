import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, Search, Package, RefreshCw, Eye, Building2 } from 'lucide-react';
import { format } from 'date-fns';

interface SupplierWorkOrder {
  id: string;
  wo_number: string;
  item_code: string;
  quantity: number;
  status: string;
  priority: number | string | null;
  target_date: string | null;
  created_at: string;
  customer_id: string;
  qty_completed: number | null;
  qty_dispatched: number | null;
  completion_pct: number | null;
  customer_name: string;
  party_code: string | null;
}

interface SupplierAccount {
  customer_id: string;
  customer_master: { customer_name: string; party_code: string | null } | null;
}

export default function SupplierPortal() {
  const [workOrders, setWorkOrders] = useState<SupplierWorkOrder[]>([]);
  const [accounts, setAccounts] = useState<SupplierAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First check if user has supplier accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('supplier_accounts')
        .select('customer_id, customer_master:customer_id(customer_name, party_code)')
        .eq('is_active', true);

      if (accountsError) throw accountsError;

      if (!accountsData || accountsData.length === 0) {
        setError('No supplier accounts configured for your user. Please contact an administrator.');
        setLoading(false);
        return;
      }

      setAccounts(accountsData);

      // Load work orders from the scoped view
      const { data: woData, error: woError } = await supabase
        .from('supplier_work_orders_vw')
        .select('*')
        .order('created_at', { ascending: false });

      if (woError) throw woError;
      setWorkOrders(woData || []);
    } catch (err: any) {
      console.error('Error loading supplier data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkOrders = workOrders.filter(wo => 
    wo.wo_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    wo.item_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityColor = (priority: number | string | null) => {
    const p = String(priority || '').toLowerCase();
    switch (p) {
      case 'urgent': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Not Configured</h2>
            <p className="text-muted-foreground text-center max-w-md">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Supplier Portal
          </h1>
          <p className="text-muted-foreground">
            View work orders for your assigned customers
          </p>
        </div>
        <Button variant="outline" onClick={loadData} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Customer Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {accounts.map((account, idx) => (
          <Card key={idx}>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium">{account.customer_master?.customer_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {account.customer_master?.party_code || 'No party code'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Work Orders */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Work Orders</CardTitle>
              <CardDescription>
                {filteredWorkOrders.length} work order{filteredWorkOrders.length !== 1 ? 's' : ''} found
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search WO# or Item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredWorkOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No work orders found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>WO Number</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Due Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWorkOrders.map((wo) => (
                    <TableRow key={wo.id}>
                      <TableCell className="font-mono font-medium">{wo.wo_number}</TableCell>
                      <TableCell>{wo.item_code}</TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm">{wo.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{wo.party_code}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <div>{wo.quantity?.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">
                            {wo.qty_dispatched || 0} dispatched
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-24">
                          <Progress value={wo.completion_pct || 0} className="h-2" />
                          <span className="text-xs text-muted-foreground">
                            {Math.round(wo.completion_pct || 0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(wo.status)}>
                          {wo.status?.replace('_', ' ') || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {wo.priority && (
                          <Badge className={getPriorityColor(wo.priority)}>
                            {wo.priority}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {wo.target_date ? format(new Date(wo.target_date), 'dd MMM yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
