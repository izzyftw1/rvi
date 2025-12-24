import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Home, AlertTriangle, Clock, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface AgingBucket {
  label: string;
  min: number;
  max: number;
  amount: number;
  count: number;
  invoices: any[];
}

export default function Aging() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<AgingBucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [totalOutstanding, setTotalOutstanding] = useState(0);

  useEffect(() => {
    loadAgingData();
  }, []);

  const loadAgingData = async () => {
    try {
      // Exclude closed_adjusted invoices from aging - they should not appear as overdue
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customer_master!customer_id(customer_name, primary_contact_email, primary_contact_phone)
        `)
        .in("status", ["issued", "part_paid", "overdue"])
        .neq("status", "closed_adjusted")
        .gt("balance_amount", 0)
        .order("due_date", { ascending: true });

      if (error) throw error;

      const today = new Date();
      
      // Define aging buckets
      const agingBuckets: AgingBucket[] = [
        { label: "Current", min: -999999, max: 0, amount: 0, count: 0, invoices: [] },
        { label: "1-15 days", min: 1, max: 15, amount: 0, count: 0, invoices: [] },
        { label: "16-30 days", min: 16, max: 30, amount: 0, count: 0, invoices: [] },
        { label: "31-45 days", min: 31, max: 45, amount: 0, count: 0, invoices: [] },
        { label: "46-60 days", min: 46, max: 60, amount: 0, count: 0, invoices: [] },
        { label: ">60 days", min: 61, max: 999999, amount: 0, count: 0, invoices: [] }
      ];

      let total = 0;

      (data || []).forEach((invoice: any) => {
        const dueDate = new Date(invoice.due_date);
        const daysOverdue = differenceInDays(today, dueDate);
        const balance = Number(invoice.balance_amount) || 0;
        total += balance;

        // Find the appropriate bucket
        for (const bucket of agingBuckets) {
          if (daysOverdue >= bucket.min && daysOverdue <= bucket.max) {
            bucket.amount += balance;
            bucket.count += 1;
            bucket.invoices.push({
              ...invoice,
              days_overdue: Math.max(0, daysOverdue)
            });
            break;
          }
        }
      });

      setBuckets(agingBuckets);
      setTotalOutstanding(total);
    } catch (error: any) {
      console.error("Error loading aging data:", error);
      toast({
        title: "Error",
        description: "Failed to load aging data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getBucketColor = (label: string) => {
    if (label === "Current") return "bg-green-500/10 border-green-500/20 text-green-700";
    if (label === "1-15 days") return "bg-yellow-500/10 border-yellow-500/20 text-yellow-700";
    if (label === "16-30 days") return "bg-orange-500/10 border-orange-500/20 text-orange-700";
    if (label === "31-45 days") return "bg-red-500/10 border-red-500/20 text-red-700";
    if (label === "46-60 days") return "bg-red-600/10 border-red-600/20 text-red-800";
    return "bg-destructive/10 border-destructive/20 text-destructive";
  };

  const selectedBucketData = buckets.find(b => b.label === selectedBucket);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/"><Home className="h-4 w-4" /></Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/finance/dashboard">Finance</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>AR Aging</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Accounts Receivable Aging
              </CardTitle>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Total Outstanding</div>
                <div className="text-2xl font-bold">₹{totalOutstanding.toLocaleString()}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading aging data...</div>
            ) : (
              <>
                {/* Aging Buckets Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                  {buckets.map((bucket) => (
                    <button
                      key={bucket.label}
                      onClick={() => setSelectedBucket(selectedBucket === bucket.label ? null : bucket.label)}
                      className={`p-4 border rounded-lg text-left transition-all ${getBucketColor(bucket.label)} ${
                        selectedBucket === bucket.label ? "ring-2 ring-primary" : ""
                      } hover:opacity-80`}
                    >
                      <div className="text-sm font-medium">{bucket.label}</div>
                      <div className="text-2xl font-bold mt-1">
                        ₹{bucket.amount.toLocaleString()}
                      </div>
                      <div className="text-xs mt-1 opacity-70">
                        {bucket.count} invoice{bucket.count !== 1 ? "s" : ""}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Overdue Warning */}
                {buckets.filter(b => b.label !== "Current" && b.amount > 0).length > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mb-6">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-700">
                      {buckets.filter(b => b.label !== "Current").reduce((sum, b) => sum + b.count, 0)} invoices are overdue totaling ₹
                      {buckets.filter(b => b.label !== "Current").reduce((sum, b) => sum + b.amount, 0).toLocaleString()}
                    </span>
                  </div>
                )}

                {/* Selected Bucket Detail */}
                {selectedBucketData && selectedBucketData.invoices.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {selectedBucketData.label} - {selectedBucketData.count} Invoices
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>Due Date</TableHead>
                              <TableHead>Days Overdue</TableHead>
                              <TableHead className="text-right">Balance</TableHead>
                              <TableHead></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedBucketData.invoices.map((inv: any) => (
                              <TableRow key={inv.id}>
                                <TableCell className="font-medium">{inv.invoice_no}</TableCell>
                                <TableCell>{inv.customer_master?.customer_name || "—"}</TableCell>
                                <TableCell>{format(new Date(inv.due_date), "MMM dd, yyyy")}</TableCell>
                                <TableCell>
                                  {inv.days_overdue > 0 ? (
                                    <Badge variant="destructive">{inv.days_overdue} days</Badge>
                                  ) : (
                                    <Badge variant="outline">Not due</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {inv.currency} {Number(inv.balance_amount).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" asChild>
                                    <Link to={`/finance/invoices/${inv.id}`}>View</Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Customer-wise Breakdown */}
                {!selectedBucket && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingDown className="h-4 w-4" />
                        Customer-wise Outstanding
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        // Aggregate by customer
                        const customerMap = new Map<string, { name: string; total: number; overdue: number; count: number }>();
                        
                        buckets.forEach(bucket => {
                          bucket.invoices.forEach((inv: any) => {
                            const customerName = inv.customer_master?.customer_name || "Unknown";
                            const existing = customerMap.get(customerName) || { name: customerName, total: 0, overdue: 0, count: 0 };
                            existing.total += Number(inv.balance_amount) || 0;
                            existing.count += 1;
                            if (inv.days_overdue > 0) {
                              existing.overdue += Number(inv.balance_amount) || 0;
                            }
                            customerMap.set(customerName, existing);
                          });
                        });

                        const customers = Array.from(customerMap.values()).sort((a, b) => b.total - a.total);

                        if (customers.length === 0) {
                          return (
                            <div className="text-center py-8 text-muted-foreground">
                              No outstanding invoices found.
                            </div>
                          );
                        }

                        return (
                          <div className="rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Customer</TableHead>
                                  <TableHead className="text-right">Invoices</TableHead>
                                  <TableHead className="text-right">Total Outstanding</TableHead>
                                  <TableHead className="text-right">Overdue Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {customers.map((customer) => (
                                  <TableRow key={customer.name}>
                                    <TableCell className="font-medium">{customer.name}</TableCell>
                                    <TableCell className="text-right">{customer.count}</TableCell>
                                    <TableCell className="text-right">₹{customer.total.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">
                                      {customer.overdue > 0 ? (
                                        <span className="text-destructive font-medium">
                                          ₹{customer.overdue.toLocaleString()}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}