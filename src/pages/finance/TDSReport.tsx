import { useState, useEffect } from "react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, FileText, Building2, Users, IndianRupee } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { getFinancialYear, getTdsQuarter, getPanEntityType } from "@/lib/tdsUtils";

interface TdsRecord {
  id: string;
  record_type: 'receivable' | 'payable';
  customer_id: string | null;
  supplier_id: string | null;
  receipt_id: string | null;
  invoice_id: string | null;
  po_id: string | null;
  pan_number: string;
  entity_type: string;
  tds_rate: number;
  gross_amount: number;
  tds_amount: number;
  net_amount: number;
  financial_year: string;
  quarter: string;
  transaction_date: string;
  status: 'pending' | 'filed' | 'paid';
  remarks: string | null;
  // Enriched fields
  party_name?: string;
  invoice_no?: string;
  receipt_no?: string;
}

interface TdsSummary {
  quarter: string;
  total_tds: number;
  count: number;
  pending: number;
  filed: number;
  paid: number;
}

export default function TDSReport() {
  const [records, setRecords] = useState<TdsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFY, setSelectedFY] = useState<string>(() => getFinancialYear(new Date()));
  const [selectedQuarter, setSelectedQuarter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("receivables");

  const financialYears = [
    getFinancialYear(new Date()),
    getFinancialYear(new Date(new Date().setFullYear(new Date().getFullYear() - 1))),
    getFinancialYear(new Date(new Date().setFullYear(new Date().getFullYear() - 2)))
  ];

  useEffect(() => {
    loadData();
  }, [selectedFY, selectedQuarter]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("tds_records")
        .select("*")
        .eq("financial_year", selectedFY)
        .order("transaction_date", { ascending: false });

      if (selectedQuarter !== "all") {
        query = query.eq("quarter", selectedQuarter);
      }

      const { data: tdsData, error } = await query;
      if (error) throw error;

      // Enrich with party names
      const customerIds = [...new Set((tdsData || []).filter(r => r.customer_id).map(r => r.customer_id))];
      const supplierIds = [...new Set((tdsData || []).filter(r => r.supplier_id).map(r => r.supplier_id))];

      const [customersRes, suppliersRes, invoicesRes, receiptsRes] = await Promise.all([
        customerIds.length > 0 
          ? supabase.from("customer_master").select("id, customer_name").in("id", customerIds)
          : { data: [] },
        supplierIds.length > 0
          ? supabase.from("suppliers").select("id, name").in("id", supplierIds)
          : { data: [] },
        supabase.from("invoices").select("id, invoice_no"),
        supabase.from("customer_receipts").select("id, receipt_no")
      ]);

      const customerMap: Record<string, string> = {};
      (customersRes.data || []).forEach(c => { customerMap[c.id] = c.customer_name; });
      
      const supplierMap: Record<string, string> = {};
      (suppliersRes.data || []).forEach(s => { supplierMap[s.id] = s.name; });
      
      const invoiceMap: Record<string, string> = {};
      (invoicesRes.data || []).forEach(i => { invoiceMap[i.id] = i.invoice_no; });
      
      const receiptMap: Record<string, string> = {};
      (receiptsRes.data || []).forEach(r => { receiptMap[r.id] = r.receipt_no; });

      const enriched: TdsRecord[] = (tdsData || []).map(r => ({
        ...r,
        record_type: r.record_type as 'receivable' | 'payable',
        status: r.status as 'pending' | 'filed' | 'paid',
        party_name: r.customer_id ? customerMap[r.customer_id] : (r.supplier_id ? supplierMap[r.supplier_id] : "Unknown"),
        invoice_no: r.invoice_id ? invoiceMap[r.invoice_id] : undefined,
        receipt_no: r.receipt_id ? receiptMap[r.receipt_id] : undefined
      }));

      setRecords(enriched);
    } catch (error: any) {
      toast.error("Failed to load TDS records");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const receivables = records.filter(r => r.record_type === 'receivable');
  const payables = records.filter(r => r.record_type === 'payable');

  const calculateSummary = (data: TdsRecord[]): TdsSummary[] => {
    const byQuarter: Record<string, TdsSummary> = {};
    
    data.forEach(r => {
      if (!byQuarter[r.quarter]) {
        byQuarter[r.quarter] = {
          quarter: r.quarter,
          total_tds: 0,
          count: 0,
          pending: 0,
          filed: 0,
          paid: 0
        };
      }
      byQuarter[r.quarter].total_tds += r.tds_amount;
      byQuarter[r.quarter].count += 1;
      byQuarter[r.quarter][r.status] += 1;
    });

    return Object.values(byQuarter).sort((a, b) => a.quarter.localeCompare(b.quarter));
  };

  const receivableSummary = calculateSummary(receivables);
  const payableSummary = calculateSummary(payables);

  const totalReceivableTds = receivables.reduce((sum, r) => sum + r.tds_amount, 0);
  const totalPayableTds = payables.reduce((sum, r) => sum + r.tds_amount, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'filed':
        return <Badge variant="outline" className="border-blue-500 text-blue-600">Filed</Badge>;
      case 'paid':
        return <Badge className="bg-green-600">Paid</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const exportToCSV = () => {
    const data = activeTab === 'receivables' ? receivables : payables;
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["Date", "Party", "PAN", "Entity Type", "TDS Rate", "Gross Amount", "TDS Amount", "Net Amount", "Quarter", "Status"];
    const rows = data.map(r => [
      format(new Date(r.transaction_date), "dd-MM-yyyy"),
      r.party_name,
      r.pan_number,
      r.entity_type,
      `${r.tds_rate}%`,
      r.gross_amount.toFixed(2),
      r.tds_amount.toFixed(2),
      r.net_amount.toFixed(2),
      r.quarter,
      r.status
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tds_${activeTab}_${selectedFY}_${selectedQuarter}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success("Export completed");
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="TDS Report" 
        subtitle="Tax Deducted at Source - Receivables & Payables" 
      />
      
      <div className="p-6 space-y-6">
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
              <div className="text-3xl font-bold">₹{totalReceivableTds.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">From {receivables.length} transactions</p>
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
              <div className="text-3xl font-bold">₹{totalPayableTds.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">From {payables.length} transactions</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <IndianRupee className="h-5 w-5 text-green-600" />
                Net Position
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${totalReceivableTds - totalPayableTds >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₹{Math.abs(totalReceivableTds - totalPayableTds).toLocaleString()}
              </div>
              <p className="text-sm text-muted-foreground">
                {totalReceivableTds - totalPayableTds >= 0 ? 'Recoverable' : 'Payable'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Total Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{records.length}</div>
              <p className="text-sm text-muted-foreground">FY {selectedFY}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Financial Year:</span>
            <Select value={selectedFY} onValueChange={setSelectedFY}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {financialYears.map(fy => (
                  <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Quarter:</span>
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Q1">Q1 (Apr-Jun)</SelectItem>
                <SelectItem value="Q2">Q2 (Jul-Sep)</SelectItem>
                <SelectItem value="Q3">Q3 (Oct-Dec)</SelectItem>
                <SelectItem value="Q4">Q4 (Jan-Mar)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto">
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <CardTitle>TDS Records</CardTitle>
            <CardDescription>Customer receivables and supplier payables</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="receivables">
                    Receivables ({receivables.length})
                  </TabsTrigger>
                  <TabsTrigger value="payables">
                    Payables ({payables.length})
                  </TabsTrigger>
                  <TabsTrigger value="summary">
                    Quarterly Summary
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="receivables">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>PAN</TableHead>
                        <TableHead>Entity Type</TableHead>
                        <TableHead className="text-right">Gross Amt</TableHead>
                        <TableHead className="text-right">TDS Rate</TableHead>
                        <TableHead className="text-right">TDS Amt</TableHead>
                        <TableHead className="text-right">Net Amt</TableHead>
                        <TableHead>Quarter</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivables.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            No TDS receivable records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        receivables.map(record => (
                          <TableRow key={record.id}>
                            <TableCell>{format(new Date(record.transaction_date), "dd MMM yyyy")}</TableCell>
                            <TableCell className="font-medium">{record.party_name}</TableCell>
                            <TableCell className="font-mono text-sm">{record.pan_number}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.entity_type}</Badge>
                            </TableCell>
                            <TableCell className="text-right">₹{record.gross_amount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{record.tds_rate}%</TableCell>
                            <TableCell className="text-right font-medium text-blue-600">
                              ₹{record.tds_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">₹{record.net_amount.toLocaleString()}</TableCell>
                            <TableCell>{record.quarter}</TableCell>
                            <TableCell>{getStatusBadge(record.status)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="payables">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>PAN</TableHead>
                        <TableHead>Entity Type</TableHead>
                        <TableHead className="text-right">Gross Amt</TableHead>
                        <TableHead className="text-right">TDS Rate</TableHead>
                        <TableHead className="text-right">TDS Amt</TableHead>
                        <TableHead className="text-right">Net Amt</TableHead>
                        <TableHead>Quarter</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payables.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            No TDS payable records found
                          </TableCell>
                        </TableRow>
                      ) : (
                        payables.map(record => (
                          <TableRow key={record.id}>
                            <TableCell>{format(new Date(record.transaction_date), "dd MMM yyyy")}</TableCell>
                            <TableCell className="font-medium">{record.party_name}</TableCell>
                            <TableCell className="font-mono text-sm">{record.pan_number}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.entity_type}</Badge>
                            </TableCell>
                            <TableCell className="text-right">₹{record.gross_amount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{record.tds_rate}%</TableCell>
                            <TableCell className="text-right font-medium text-amber-600">
                              ₹{record.tds_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">₹{record.net_amount.toLocaleString()}</TableCell>
                            <TableCell>{record.quarter}</TableCell>
                            <TableCell>{getStatusBadge(record.status)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="summary">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Receivables Summary */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">TDS Receivable by Quarter</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Quarter</TableHead>
                              <TableHead className="text-right">Count</TableHead>
                              <TableHead className="text-right">TDS Amount</TableHead>
                              <TableHead className="text-right">Pending</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {receivableSummary.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                                  No data
                                </TableCell>
                              </TableRow>
                            ) : (
                              receivableSummary.map(s => (
                                <TableRow key={s.quarter}>
                                  <TableCell className="font-medium">{s.quarter}</TableCell>
                                  <TableCell className="text-right">{s.count}</TableCell>
                                  <TableCell className="text-right font-medium">₹{s.total_tds.toLocaleString()}</TableCell>
                                  <TableCell className="text-right">{s.pending}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                    {/* Payables Summary */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">TDS Payable by Quarter</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Quarter</TableHead>
                              <TableHead className="text-right">Count</TableHead>
                              <TableHead className="text-right">TDS Amount</TableHead>
                              <TableHead className="text-right">Pending</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {payableSummary.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-muted-foreground py-4">
                                  No data
                                </TableCell>
                              </TableRow>
                            ) : (
                              payableSummary.map(s => (
                                <TableRow key={s.quarter}>
                                  <TableCell className="font-medium">{s.quarter}</TableCell>
                                  <TableCell className="text-right">{s.count}</TableCell>
                                  <TableCell className="text-right font-medium">₹{s.total_tds.toLocaleString()}</TableCell>
                                  <TableCell className="text-right">{s.pending}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
