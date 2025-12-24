import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getFinancialYear, getTdsQuarter } from '@/lib/tdsUtils';
import { 
  FileText, Download, CheckCircle2, Clock, AlertCircle, 
  IndianRupee, Building2, Users, Calculator 
} from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface QuarterSummary {
  quarter: string;
  quarterLabel: string;
  receivables: {
    count: number;
    grossAmount: number;
    tdsAmount: number;
    pending: number;
    filed: number;
    paid: number;
  };
  payables: {
    count: number;
    grossAmount: number;
    tdsAmount: number;
    pending: number;
    filed: number;
    paid: number;
  };
  netPosition: number;
  filingDueDate: string;
  status: 'pending' | 'due_soon' | 'overdue' | 'filed';
}

interface TdsRecord {
  id: string;
  record_type: string;
  pan_number: string;
  entity_type: string;
  tds_rate: number;
  gross_amount: number;
  tds_amount: number;
  net_amount: number;
  quarter: string;
  transaction_date: string;
  status: string;
  party_name?: string;
}

export function TdsReconciliationReport() {
  const [loading, setLoading] = useState(true);
  const [selectedFY, setSelectedFY] = useState(() => getFinancialYear(new Date()));
  const [records, setRecords] = useState<TdsRecord[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const financialYears = [
    getFinancialYear(new Date()),
    getFinancialYear(new Date(new Date().setFullYear(new Date().getFullYear() - 1))),
    getFinancialYear(new Date(new Date().setFullYear(new Date().getFullYear() - 2))),
  ];

  useEffect(() => {
    loadData();
  }, [selectedFY]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: tdsData, error } = await supabase
        .from('tds_records')
        .select('*')
        .eq('financial_year', selectedFY)
        .order('transaction_date', { ascending: false });

      if (error) throw error;

      // Enrich with party names
      const customerIds = [...new Set((tdsData || []).filter(r => r.customer_id).map(r => r.customer_id))];
      const supplierIds = [...new Set((tdsData || []).filter(r => r.supplier_id).map(r => r.supplier_id))];

      const [customersRes, suppliersRes] = await Promise.all([
        customerIds.length > 0 
          ? supabase.from('customer_master').select('id, customer_name').in('id', customerIds)
          : { data: [] },
        supplierIds.length > 0
          ? supabase.from('suppliers').select('id, name').in('id', supplierIds)
          : { data: [] },
      ]);

      const customerMap: Record<string, string> = {};
      (customersRes.data || []).forEach(c => { customerMap[c.id] = c.customer_name; });
      
      const supplierMap: Record<string, string> = {};
      (suppliersRes.data || []).forEach(s => { supplierMap[s.id] = s.name; });

      const enriched = (tdsData || []).map(r => ({
        ...r,
        party_name: r.customer_id ? customerMap[r.customer_id] : (r.supplier_id ? supplierMap[r.supplier_id] : 'Unknown'),
      }));

      setRecords(enriched);
    } catch (error: any) {
      toast.error('Failed to load TDS data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate quarterly summaries
  const quarterSummaries = useMemo((): QuarterSummary[] => {
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const quarterLabels: Record<string, string> = {
      'Q1': 'Apr - Jun',
      'Q2': 'Jul - Sep',
      'Q3': 'Oct - Dec',
      'Q4': 'Jan - Mar',
    };

    // Get filing due dates based on FY
    const [startYear] = selectedFY.split('-').map(Number);
    const filingDueDates: Record<string, string> = {
      'Q1': `${startYear}-07-31`,
      'Q2': `${startYear}-10-31`,
      'Q3': `${startYear + 1}-01-31`,
      'Q4': `${startYear + 1}-05-31`,
    };

    return quarters.map(q => {
      const qRecords = records.filter(r => r.quarter === q);
      const receivables = qRecords.filter(r => r.record_type === 'receivable');
      const payables = qRecords.filter(r => r.record_type === 'payable');

      const recTotal = receivables.reduce((sum, r) => sum + r.tds_amount, 0);
      const payTotal = payables.reduce((sum, r) => sum + r.tds_amount, 0);

      const dueDate = new Date(filingDueDates[q]);
      const today = new Date();
      // Check for new status values (deducted/deposited/claimed) and legacy values (pending/filed/paid)
      const allFiled = qRecords.length > 0 && qRecords.every(r => 
        r.status === 'deposited' || r.status === 'claimed' || r.status === 'filed' || r.status === 'paid'
      );
      
      let status: QuarterSummary['status'] = 'pending';
      if (allFiled) {
        status = 'filed';
      } else if (today > dueDate) {
        status = 'overdue';
      } else if (today > new Date(dueDate.getTime() - 15 * 24 * 60 * 60 * 1000)) {
        status = 'due_soon';
      }

      return {
        quarter: q,
        quarterLabel: quarterLabels[q],
        receivables: {
          count: receivables.length,
          grossAmount: receivables.reduce((sum, r) => sum + r.gross_amount, 0),
          tdsAmount: recTotal,
          pending: receivables.filter(r => r.status === 'pending' || r.status === 'deducted').length,
          filed: receivables.filter(r => r.status === 'filed' || r.status === 'deposited').length,
          paid: receivables.filter(r => r.status === 'paid' || r.status === 'claimed').length,
        },
        payables: {
          count: payables.length,
          grossAmount: payables.reduce((sum, r) => sum + r.gross_amount, 0),
          tdsAmount: payTotal,
          pending: payables.filter(r => r.status === 'pending' || r.status === 'deducted').length,
          filed: payables.filter(r => r.status === 'filed' || r.status === 'deposited').length,
          paid: payables.filter(r => r.status === 'paid' || r.status === 'claimed').length,
        },
        netPosition: recTotal - payTotal,
        filingDueDate: filingDueDates[q],
        status,
      };
    });
  }, [records, selectedFY]);

  const totals = useMemo(() => {
    return quarterSummaries.reduce((acc, q) => ({
      receivablesTds: acc.receivablesTds + q.receivables.tdsAmount,
      payablesTds: acc.payablesTds + q.payables.tdsAmount,
      receivablesCount: acc.receivablesCount + q.receivables.count,
      payablesCount: acc.payablesCount + q.payables.count,
    }), { receivablesTds: 0, payablesTds: 0, receivablesCount: 0, payablesCount: 0 });
  }, [quarterSummaries]);

  const updateQuarterStatus = async (quarter: string, newStatus: 'deducted' | 'deposited' | 'claimed') => {
    setUpdatingStatus(quarter);
    try {
      const { error } = await supabase
        .from('tds_records')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('financial_year', selectedFY)
        .eq('quarter', quarter);

      if (error) throw error;

      const statusLabel = newStatus === 'deducted' ? 'Deducted' : newStatus === 'deposited' ? 'Deposited' : 'Claimed';
      toast.success(`Quarter ${quarter} marked as ${statusLabel}`);
      loadData();
    } catch (error: any) {
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const exportQuarterData = (quarter: string) => {
    const qRecords = records.filter(r => r.quarter === quarter);
    if (qRecords.length === 0) {
      toast.error('No records to export');
      return;
    }

    const headers = ['Date', 'Type', 'Party', 'PAN', 'Entity', 'Gross Amt', 'TDS Rate', 'TDS Amt', 'Net Amt', 'Status'];
    const rows = qRecords.map(r => [
      format(new Date(r.transaction_date), 'dd-MM-yyyy'),
      r.record_type === 'receivable' ? 'Receivable' : 'Payable',
      r.party_name,
      r.pan_number,
      r.entity_type,
      r.gross_amount.toFixed(2),
      `${r.tds_rate}%`,
      r.tds_amount.toFixed(2),
      r.net_amount.toFixed(2),
      r.status,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TDS_${selectedFY}_${quarter}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success('Export completed');
  };

  const getStatusBadge = (status: QuarterSummary['status']) => {
    switch (status) {
      case 'filed':
        return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Filed</Badge>;
      case 'overdue':
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Overdue</Badge>;
      case 'due_soon':
        return <Badge className="bg-amber-600"><Clock className="h-3 w-3 mr-1" />Due Soon</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              TDS Receivable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{totals.receivablesTds.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">{totals.receivablesCount} transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-amber-600" />
              TDS Payable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">₹{totals.payablesTds.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">{totals.payablesCount} transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calculator className="h-5 w-5 text-green-600" />
              Net Position
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${totals.receivablesTds - totals.payablesTds >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{Math.abs(totals.receivablesTds - totals.payablesTds).toLocaleString()}
            </div>
            <p className="text-sm text-muted-foreground">
              {totals.receivablesTds - totals.payablesTds >= 0 ? 'Recoverable' : 'Payable'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Financial Year
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedFY} onValueChange={setSelectedFY}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {financialYears.map(fy => (
                  <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Quarterly Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Quarterly TDS Summary for ITR Filing</CardTitle>
          <CardDescription>
            Track TDS by quarter for income tax return compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarter</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Receivables (TDS)</TableHead>
                <TableHead className="text-right">Payables (TDS)</TableHead>
                <TableHead className="text-right">Net Position</TableHead>
                <TableHead>Filing Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quarterSummaries.map(q => (
                <TableRow key={q.quarter}>
                  <TableCell className="font-medium">{q.quarter}</TableCell>
                  <TableCell>{q.quarterLabel}</TableCell>
                  <TableCell className="text-right">
                    <div className="font-medium text-blue-600">₹{q.receivables.tdsAmount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{q.receivables.count} txns</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="font-medium text-amber-600">₹{q.payables.tdsAmount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{q.payables.count} txns</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className={`font-medium ${q.netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ₹{Math.abs(q.netPosition).toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {q.netPosition >= 0 ? 'Recoverable' : 'Payable'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(q.filingDueDate), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>{getStatusBadge(q.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => exportQuarterData(q.quarter)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {q.status !== 'filed' && (q.receivables.count > 0 || q.payables.count > 0) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuarterStatus(q.quarter, 'deposited')}
                          disabled={updatingStatus === q.quarter}
                        >
                          {updatingStatus === q.quarter ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Mark Deposited'
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detailed Records */}
      <Card>
        <CardHeader>
          <CardTitle>TDS Transaction Details</CardTitle>
          <CardDescription>All TDS records for FY {selectedFY}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All ({records.length})</TabsTrigger>
              <TabsTrigger value="receivables">
                Receivables ({records.filter(r => r.record_type === 'receivable').length})
              </TabsTrigger>
              <TabsTrigger value="payables">
                Payables ({records.filter(r => r.record_type === 'payable').length})
              </TabsTrigger>
            </TabsList>

            {['all', 'receivables', 'payables'].map(tab => (
              <TabsContent key={tab} value={tab}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>PAN</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">TDS %</TableHead>
                      <TableHead className="text-right">TDS Amt</TableHead>
                      <TableHead>Quarter</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records
                      .filter(r => tab === 'all' || r.record_type === (tab === 'receivables' ? 'receivable' : 'payable'))
                      .slice(0, 50)
                      .map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{format(new Date(r.transaction_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>
                            <Badge variant={r.record_type === 'receivable' ? 'default' : 'secondary'}>
                              {r.record_type === 'receivable' ? 'Receivable' : 'Payable'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">{r.party_name}</TableCell>
                          <TableCell className="font-mono text-sm">{r.pan_number}</TableCell>
                          <TableCell className="text-right">₹{r.gross_amount.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{r.tds_rate}%</TableCell>
                          <TableCell className="text-right font-medium">
                            ₹{r.tds_amount.toLocaleString()}
                          </TableCell>
                          <TableCell>{r.quarter}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === 'filed' ? 'default' : 'secondary'}>
                              {r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
