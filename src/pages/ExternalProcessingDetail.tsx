import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Calendar, Search, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExternalJob {
  id: string;
  wo_id: string;
  wo_display_id: string;
  item_code: string;
  customer: string;
  partner_name: string;
  dispatch_date: string;
  expected_return_date: string;
  quantity_sent: number;
  quantity_returned: number;
  status: string;
  delay_days: number;
}

const PROCESS_LABELS: Record<string, string> = {
  job_work: 'Job Work',
  plating: 'Plating',
  buffing: 'Buffing',
  blasting: 'Blasting',
  forging_ext: 'Forging'
};

const ExternalProcessingDetail = () => {
  const { processName } = useParams<{ processName: string }>();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ExternalJob[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<ExternalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"expected_return_date" | "delay_days">("expected_return_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const processLabel = PROCESS_LABELS[processName || ''] || processName;

  useEffect(() => {
    if (processName) {
      loadJobs();
      
      // Real-time subscription
      const channel = supabase
        .channel('external-processing-page')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'wo_external_moves'
          },
          () => loadJobs()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [processName]);

  useEffect(() => {
    applyFiltersAndSort();
  }, [jobs, searchTerm, sortField, sortDirection]);

  const loadJobs = async () => {
    if (!processName) return;

    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data: movesData, error } = await supabase
        .from('wo_external_moves')
        .select(`
          id,
          work_order_id,
          process,
          dispatch_date,
          expected_return_date,
          returned_date,
          quantity_sent,
          quantity_returned,
          status,
          work_orders!work_order_id(
            id,
            display_id,
            wo_number,
            item_code,
            customer
          ),
          external_partners!partner_id(name)
        `)
        .eq('process', processName)
        .order('expected_return_date', { ascending: true });

      if (error) throw error;

      const jobsList: ExternalJob[] = (movesData || []).map((move: any) => {
        const pending = (move.quantity_sent || 0) - (move.quantity_returned || 0);
        const isOverdue = !move.returned_date && move.expected_return_date < today;
        const delayDays = isOverdue 
          ? Math.floor((new Date().getTime() - new Date(move.expected_return_date).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        let status = 'In Progress';
        if (move.returned_date || pending <= 0) {
          status = 'Received';
        } else if (isOverdue) {
          status = 'Overdue';
        } else if (!move.dispatch_date || move.status === 'pending') {
          status = 'Pending';
        }

        return {
          id: move.id,
          wo_id: move.work_orders?.id || '',
          wo_display_id: move.work_orders?.display_id || move.work_orders?.wo_number || 'N/A',
          item_code: move.work_orders?.item_code || 'N/A',
          customer: move.work_orders?.customer || 'N/A',
          partner_name: move.external_partners?.name || 'Unknown',
          dispatch_date: move.dispatch_date || '',
          expected_return_date: move.expected_return_date || '',
          quantity_sent: move.quantity_sent || 0,
          quantity_returned: move.quantity_returned || 0,
          status,
          delay_days: delayDays
        };
      });

      setJobs(jobsList);
      setLoading(false);
    } catch (error) {
      console.error('Error loading external jobs:', error);
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...jobs];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(job => 
        job.wo_display_id.toLowerCase().includes(term) ||
        job.partner_name.toLowerCase().includes(term) ||
        job.customer.toLowerCase().includes(term) ||
        job.item_code.toLowerCase().includes(term)
      );
    }

    filtered.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      
      if (sortField === 'expected_return_date') {
        return direction * (new Date(a.expected_return_date).getTime() - new Date(b.expected_return_date).getTime());
      }
      return direction * (a.delay_days - b.delay_days);
    });

    setFilteredJobs(filtered);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      'Received': 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
      'In Progress': 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      'Pending': 'bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
      'Overdue': 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
    };

    return (
      <Badge variant="outline" className={cn("font-medium", colors[status as keyof typeof colors])}>
        {status}
      </Badge>
    );
  };

  const counters = {
    active: filteredJobs.filter(j => j.status === 'In Progress' || j.status === 'Pending').length,
    overdue: filteredJobs.filter(j => j.status === 'Overdue').length,
    received: filteredJobs.filter(j => j.status === 'Received').length
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          Dashboard
        </Button>
        <span>/</span>
        <span>External Processing</span>
        <span>/</span>
        <span className="text-foreground font-medium">{processLabel}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" onClick={() => navigate('/')} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">{processLabel} Jobs</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
            Active: {counters.active}
          </Badge>
          <Badge variant="destructive" className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">
            Overdue: {counters.overdue}
          </Badge>
          <Badge variant="default" className="bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300">
            Received: {counters.received}
          </Badge>
        </div>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader className="border-b bg-muted/50">
          <div className="flex items-center justify-between">
            <CardTitle>Job Details</CardTitle>
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by WO ID, Partner, Customer, or Item Code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="h-96 bg-muted animate-pulse" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO ID</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Sent Date</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleSort('expected_return_date')}
                  >
                    <div className="flex items-center gap-1">
                      Expected Return
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Qty Sent</TableHead>
                  <TableHead className="text-right">Qty Received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => toggleSort('delay_days')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Delay
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow 
                    key={job.id}
                    className="hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">{job.wo_display_id}</TableCell>
                    <TableCell className="text-muted-foreground">{job.item_code}</TableCell>
                    <TableCell>{job.customer}</TableCell>
                    <TableCell>{job.partner_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {job.dispatch_date ? new Date(job.dispatch_date).toLocaleDateString() : 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {job.expected_return_date ? new Date(job.expected_return_date).toLocaleDateString() : 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold">{job.quantity_sent}</TableCell>
                    <TableCell className="text-right font-semibold">{job.quantity_returned}</TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell className="text-right">
                      {job.delay_days > 0 ? (
                        <Badge variant="destructive" className="font-mono">
                          {job.delay_days}d
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/work-orders/${job.wo_id}`)}
                      >
                        View WO
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExternalProcessingDetail;
