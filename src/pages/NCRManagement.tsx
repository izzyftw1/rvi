import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { NavigationHeader } from '@/components/NavigationHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, AlertTriangle, CheckCircle, Clock, FileWarning } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { NCRFormDialog } from '@/components/ncr/NCRFormDialog';

interface NCR {
  id: string;
  ncr_number: string;
  ncr_type: 'INTERNAL' | 'CUSTOMER' | 'SUPPLIER';
  source_reference: string | null;
  work_order_id: string | null;
  quantity_affected: number;
  unit: string;
  issue_description: string;
  disposition: string | null;
  status: 'OPEN' | 'ACTION_IN_PROGRESS' | 'EFFECTIVENESS_PENDING' | 'CLOSED';
  due_date: string | null;
  created_at: string;
  work_orders?: { wo_number: string; display_id: string } | null;
}

const STATUS_CONFIG = {
  OPEN: { label: 'Open', icon: AlertTriangle, color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  ACTION_IN_PROGRESS: { label: 'In Progress', icon: Clock, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  EFFECTIVENESS_PENDING: { label: 'Effectiveness Pending', icon: FileWarning, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  CLOSED: { label: 'Closed', icon: CheckCircle, color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
};

const TYPE_CONFIG = {
  INTERNAL: { label: 'Internal', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  CUSTOMER: { label: 'Customer', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  SUPPLIER: { label: 'Supplier', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' },
};

export default function NCRManagement() {
  const navigate = useNavigate();
  const [ncrs, setNcrs] = useState<NCR[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    loadNCRs();
  }, []);

  const loadNCRs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ncrs')
        .select(`
          *,
          work_orders (wo_number, display_id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNcrs(data || []);
    } catch (error) {
      console.error('Error loading NCRs:', error);
      toast.error('Failed to load NCRs');
    } finally {
      setLoading(false);
    }
  };

  const filteredNCRs = ncrs.filter(ncr => {
    const matchesSearch = 
      ncr.ncr_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ncr.issue_description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ncr.source_reference?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || ncr.status === statusFilter;
    const matchesType = typeFilter === 'all' || ncr.ncr_type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const stats = {
    total: ncrs.length,
    open: ncrs.filter(n => n.status === 'OPEN').length,
    inProgress: ncrs.filter(n => n.status === 'ACTION_IN_PROGRESS').length,
    effectivenessPending: ncrs.filter(n => n.status === 'EFFECTIVENESS_PENDING').length,
    closed: ncrs.filter(n => n.status === 'CLOSED').length,
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Non-Conformance Reports</h1>
            <p className="text-muted-foreground">Manage quality issues with 8D methodology</p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create NCR
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total NCRs</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{stats.open}</div>
              <p className="text-xs text-muted-foreground">Open</p>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 dark:border-yellow-800">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">{stats.inProgress}</div>
              <p className="text-xs text-muted-foreground">In Progress</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{stats.effectivenessPending}</div>
              <p className="text-xs text-muted-foreground">Effectiveness</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.closed}</div>
              <p className="text-xs text-muted-foreground">Closed</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search NCRs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="ACTION_IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="EFFECTIVENESS_PENDING">Effectiveness Pending</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="INTERNAL">Internal</SelectItem>
                  <SelectItem value="CUSTOMER">Customer</SelectItem>
                  <SelectItem value="SUPPLIER">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* NCR Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NCR #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredNCRs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-0">
                      <EmptyState
                        icon="alerts"
                        title={searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                          ? "No NCRs Match Your Filters"
                          : "No Non-Conformance Reports"
                        }
                        description={searchTerm || statusFilter !== 'all' || typeFilter !== 'all'
                          ? "Try adjusting your search or filter criteria to find what you are looking for."
                          : "NCRs are created when quality issues are identified during production or inspection. Click 'New NCR' to log an issue."
                        }
                        hint="NCRs help track and resolve quality problems systematically."
                        size="md"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNCRs.map((ncr) => {
                    const statusConfig = STATUS_CONFIG[ncr.status];
                    const typeConfig = TYPE_CONFIG[ncr.ncr_type];
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                      <TableRow 
                        key={ncr.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/ncr/${ncr.id}`)}
                      >
                        <TableCell className="font-medium">{ncr.ncr_number}</TableCell>
                        <TableCell>
                          <Badge className={typeConfig.color}>{typeConfig.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {ncr.work_orders?.display_id || ncr.work_orders?.wo_number || '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {ncr.issue_description}
                        </TableCell>
                        <TableCell>
                          {ncr.quantity_affected} {ncr.unit}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig.color}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {ncr.due_date ? format(new Date(ncr.due_date), 'dd MMM yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          {format(new Date(ncr.created_at), 'dd MMM yyyy')}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <NCRFormDialog 
        open={showCreateDialog} 
        onOpenChange={setShowCreateDialog}
        onSuccess={() => {
          loadNCRs();
          setShowCreateDialog(false);
        }}
      />
    </div>
  );
}
