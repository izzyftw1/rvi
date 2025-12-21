import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

import { toast } from "sonner";
import { Download, FileText, Filter, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Site {
  id: string;
  name: string;
  code: string;
}

interface OperatorMetrics {
  operator_id: string;
  operator_name: string;
  operator_type: string;
  days_worked: number;
  total_run_minutes: number;
  total_qty_ok: number;
  total_scrap: number;
  avg_efficiency_pct: number;
  trend_data: number[];
}

interface DailyBreakdown {
  date: string;
  run_minutes: number;
  qty_ok: number;
  scrap: number;
  efficiency_pct: number;
}

interface TopItem {
  item_code: string;
  qty_produced: number;
}

export default function WorkerEfficiency() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [selectedOperatorType, setSelectedOperatorType] = useState<string>("all");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [activeTab, setActiveTab] = useState("daily");
  const [operatorData, setOperatorData] = useState<OperatorMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<OperatorMetrics | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dailyBreakdown, setDailyBreakdown] = useState<DailyBreakdown[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    if (selectedSite && startDate && endDate) {
      loadOperatorData();
    }
  }, [selectedSite, selectedOperatorType, startDate, endDate, activeTab]);

  const loadSites = async () => {
    try {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .order("name");
      
      if (error) throw error;
      setSites(data || []);
      
      if (data && data.length > 0) {
        setSelectedSite(data[0].id);
      }
    } catch (error: any) {
      console.error("Error loading sites:", error);
      toast.error("Failed to load sites");
    }
  };

  const loadOperatorData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("operator_daily_metrics")
        .select(`
          operator_id,
          site_id,
          date,
          qty_ok,
          scrap,
          run_minutes,
          efficiency_pct,
          profiles!operator_daily_metrics_operator_id_fkey(full_name)
        `)
        .eq("site_id", selectedSite)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      const { data: metrics, error } = await query;
      if (error) throw error;

      // Get operator types from production logs
      const operatorIds = [...new Set(metrics?.map(m => m.operator_id))];
      const { data: prodLogs } = await supabase
        .from("production_logs")
        .select("operator_id, operator_type")
        .in("operator_id", operatorIds);

      const operatorTypeMap = new Map();
      prodLogs?.forEach(log => {
        if (!operatorTypeMap.has(log.operator_id)) {
          operatorTypeMap.set(log.operator_id, log.operator_type);
        }
      });

      // Group by operator
      const operatorMap = new Map<string, OperatorMetrics>();
      
      metrics?.forEach((metric: any) => {
        const operatorType = operatorTypeMap.get(metric.operator_id) || 'RVI';
        
        // Filter by operator type if selected
        if (selectedOperatorType !== 'all' && operatorType !== selectedOperatorType) {
          return;
        }

        const existing = operatorMap.get(metric.operator_id);
        if (existing) {
          existing.days_worked++;
          existing.total_run_minutes += metric.run_minutes || 0;
          existing.total_qty_ok += metric.qty_ok || 0;
          existing.total_scrap += metric.scrap || 0;
          existing.trend_data.push(metric.efficiency_pct || 0);
        } else {
          operatorMap.set(metric.operator_id, {
            operator_id: metric.operator_id,
            operator_name: metric.profiles?.full_name || 'Unknown',
            operator_type: operatorType,
            days_worked: 1,
            total_run_minutes: metric.run_minutes || 0,
            total_qty_ok: metric.qty_ok || 0,
            total_scrap: metric.scrap || 0,
            avg_efficiency_pct: metric.efficiency_pct || 0,
            trend_data: [metric.efficiency_pct || 0],
          });
        }
      });

      // Calculate averages and get last 14 days for sparkline
      const operatorArray = Array.from(operatorMap.values()).map(op => {
        const avgEfficiency = op.trend_data.reduce((sum, val) => sum + val, 0) / op.trend_data.length;
        
        // Get last 14 days for sparkline
        const last14Days = op.trend_data.slice(-14);
        
        return {
          ...op,
          avg_efficiency_pct: avgEfficiency,
          trend_data: last14Days,
        };
      });

      setOperatorData(operatorArray);
    } catch (error: any) {
      console.error("Error loading operator data:", error);
      toast.error("Failed to load operator data");
    } finally {
      setLoading(false);
    }
  };

  const loadOperatorDetails = async (operator: OperatorMetrics) => {
    try {
      // Load daily breakdown
      const { data: daily, error: dailyError } = await supabase
        .from("operator_daily_metrics")
        .select("*")
        .eq("operator_id", operator.operator_id)
        .eq("site_id", selectedSite)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });

      if (dailyError) throw dailyError;

      setDailyBreakdown(daily?.map(d => ({
        date: d.date,
        run_minutes: d.run_minutes || 0,
        qty_ok: d.qty_ok || 0,
        scrap: d.scrap || 0,
        efficiency_pct: d.efficiency_pct || 0,
      })) || []);

      // Load top items by output
      const { data: prodLogs, error: logsError } = await supabase
        .from("production_logs")
        .select(`
          wo_id,
          quantity_completed,
          work_orders!inner(item_code)
        `)
        .eq("operator_id", operator.operator_id)
        .gte("log_timestamp", startDate)
        .lte("log_timestamp", endDate + "T23:59:59");

      if (logsError) throw logsError;

      // Group by item code
      const itemMap = new Map<string, number>();
      prodLogs?.forEach((log: any) => {
        const itemCode = log.work_orders?.item_code || 'Unknown';
        itemMap.set(itemCode, (itemMap.get(itemCode) || 0) + (log.quantity_completed || 0));
      });

      const topItemsArray = Array.from(itemMap.entries())
        .map(([item_code, qty_produced]) => ({ item_code, qty_produced }))
        .sort((a, b) => b.qty_produced - a.qty_produced)
        .slice(0, 5);

      setTopItems(topItemsArray);
      setSelectedOperator(operator);
      setModalOpen(true);
    } catch (error: any) {
      console.error("Error loading operator details:", error);
      toast.error("Failed to load operator details");
    }
  };

  const Sparkline = ({ data }: { data: number[] }) => {
    if (data.length === 0) return <span className="text-muted-foreground">-</span>;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * 60;
      const y = 20 - ((value - min) / range) * 15;
      return `${x},${y}`;
    }).join(' ');

    const trend = data.length > 1 ? data[data.length - 1] - data[0] : 0;
    const color = trend > 0 ? 'hsl(var(--success))' : trend < 0 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))';

    return (
      <div className="flex items-center gap-2">
        <svg width="60" height="20" className="inline-block">
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        </svg>
        {trend > 0 && <TrendingUp className="h-3 w-3 text-success" />}
        {trend < 0 && <TrendingDown className="h-3 w-3 text-destructive" />}
        {trend === 0 && <Minus className="h-3 w-3 text-muted-foreground" />}
      </div>
    );
  };

  const exportCSV = () => {
    const headers = [
      "Operator",
      "Type",
      "Days Worked",
      "Run Minutes",
      "Qty OK",
      "Scrap",
      "Avg Efficiency %",
    ];

    const rows = operatorData.map(op => [
      op.operator_name,
      op.operator_type,
      op.days_worked,
      op.total_run_minutes,
      op.total_qty_ok,
      op.total_scrap,
      op.avg_efficiency_pct.toFixed(2),
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worker-efficiency-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Worker Efficiency Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 22);
    doc.text(`Site: ${sites.find(s => s.id === selectedSite)?.name || 'N/A'}`, 14, 28);
    doc.text(`View: ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`, 14, 34);

    autoTable(doc, {
      startY: 40,
      head: [["Operator", "Type", "Days", "Run(m)", "OK", "Scrap", "Efficiency%"]],
      body: operatorData.map(op => [
        op.operator_name,
        op.operator_type,
        op.days_worked,
        op.total_run_minutes,
        op.total_qty_ok,
        op.total_scrap,
        op.avg_efficiency_pct.toFixed(1),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 8 },
    });

    doc.save(`worker-efficiency-${startDate}-to-${endDate}.pdf`);
    toast.success("PDF exported successfully");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/reports">Reports</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Worker Efficiency</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Worker Efficiency Report</h1>
            <p className="text-muted-foreground">Operator productivity and performance metrics</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportCSV} variant="outline">
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button onClick={exportPDF} variant="outline">
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Site</Label>
                <Select value={selectedSite} onValueChange={setSelectedSite}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map(site => (
                      <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Operator Type</Label>
                <Select value={selectedOperatorType} onValueChange={setSelectedOperatorType}>
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="RVI">RVI</SelectItem>
                    <SelectItem value="CONTRACTOR">CONTRACTOR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs and Table */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            <Card>
              <CardHeader>
                <CardTitle>Worker Performance</CardTitle>
                <CardDescription>
                  {loading ? "Loading..." : `${operatorData.length} operator${operatorData.length !== 1 ? 's' : ''} found`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Operator</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Days Worked</TableHead>
                        <TableHead className="text-right">Run Minutes</TableHead>
                        <TableHead className="text-right">Qty OK</TableHead>
                        <TableHead className="text-right">Scrap</TableHead>
                        <TableHead className="text-right">Avg Efficiency %</TableHead>
                        <TableHead>Trend (14d)</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operatorData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            No operator data found for selected filters
                          </TableCell>
                        </TableRow>
                      ) : (
                        operatorData.map(operator => (
                          <TableRow key={operator.operator_id} className="cursor-pointer hover:bg-muted/50">
                            <TableCell className="font-medium">{operator.operator_name}</TableCell>
                            <TableCell>
                              <Badge variant={operator.operator_type === 'RVI' ? 'default' : 'secondary'}>
                                {operator.operator_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{operator.days_worked}</TableCell>
                            <TableCell className="text-right">{operator.total_run_minutes}</TableCell>
                            <TableCell className="text-right">{operator.total_qty_ok}</TableCell>
                            <TableCell className="text-right">{operator.total_scrap}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={operator.avg_efficiency_pct >= 85 ? "default" : operator.avg_efficiency_pct >= 60 ? "secondary" : "destructive"}>
                                {operator.avg_efficiency_pct.toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Sparkline data={operator.trend_data} />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => loadOperatorDetails(operator)}
                              >
                                Details
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Operator Details Modal */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedOperator?.operator_name} - Performance Details
              </DialogTitle>
              <DialogDescription>
                {selectedOperator?.operator_type} Operator • {startDate} to {endDate}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Daily Breakdown */}
              <div>
                <h3 className="font-semibold mb-3">Daily Breakdown</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Run Minutes</TableHead>
                        <TableHead className="text-right">Qty OK</TableHead>
                        <TableHead className="text-right">Scrap</TableHead>
                        <TableHead className="text-right">Efficiency %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyBreakdown.map(day => (
                        <TableRow key={day.date}>
                          <TableCell>{format(new Date(day.date), 'MMM dd, yyyy')}</TableCell>
                          <TableCell className="text-right">{day.run_minutes}</TableCell>
                          <TableCell className="text-right">{day.qty_ok}</TableCell>
                          <TableCell className="text-right">{day.scrap}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={day.efficiency_pct >= 85 ? "default" : day.efficiency_pct >= 60 ? "secondary" : "destructive"}>
                              {day.efficiency_pct.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Top Items by Output */}
              <div>
                <h3 className="font-semibold mb-3">Top Items by Output</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {topItems.map((item, idx) => (
                    <Card key={item.item_code}>
                      <CardContent className="pt-6">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-muted-foreground">#{idx + 1}</p>
                            <p className="font-semibold">{item.item_code}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold">{item.qty_produced}</p>
                            <p className="text-xs text-muted-foreground">pieces</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {topItems.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2 text-center py-4">
                      No production data found
                    </p>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
