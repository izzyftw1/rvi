import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExternalAnalytics, DateRange, PROCESS_LABELS } from "@/hooks/useExternalAnalytics";
import { 
  Factory, Clock, CheckCircle, AlertTriangle, TrendingUp, 
  TrendingDown, Package, ArrowLeft, Download
} from "lucide-react";
import { downloadCSV, downloadPDF } from "@/lib/exportHelpers";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Legend, LineChart, Line, PieChart, Pie, Cell
} from "recharts";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";

const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const ExternalAnalytics = () => {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<DateRange>('90');
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  
  const { 
    movements, partnerMetrics, processMetrics, summary, 
    partnerMap, loading 
  } = useExternalAnalytics(dateRange);

  // Filter movements based on selection
  const filteredMovements = movements.filter(m => {
    if (selectedPartner && m.partner_id !== selectedPartner) return false;
    if (selectedProcess && m.process_type !== selectedProcess) return false;
    return true;
  });

  // Partner comparison chart data
  const partnerComparisonData = partnerMetrics.slice(0, 10).map(p => ({
    name: p.partner_name.length > 10 ? p.partner_name.slice(0, 10) + "..." : p.partner_name,
    onTime: p.on_time_percentage,
    turnaround: p.turnaround_days_avg,
    loss: p.loss_percentage,
  }));

  // Process comparison chart data
  const processComparisonData = processMetrics.map(p => ({
    name: p.process_label,
    movements: p.total_movements,
    turnaround: p.avg_turnaround_days,
    onTime: p.on_time_percentage,
  }));

  const handleExportMovements = () => {
    const exportData = filteredMovements.map(m => ({
      'Challan': m.challan_no || '-',
      'Process': PROCESS_LABELS[m.process_type] || m.process_type,
      'Partner': partnerMap[m.partner_id || '']?.name || 'Unknown',
      'Qty Sent': m.quantity_sent,
      'Qty Returned': m.quantity_returned || 0,
      'Qty Rejected': m.quantity_rejected || 0,
      'Sent Date': m.sent_date ? format(parseISO(m.sent_date), 'dd/MM/yyyy') : '-',
      'Expected': m.expected_return_date ? format(parseISO(m.expected_return_date), 'dd/MM/yyyy') : '-',
      'Returned': m.actual_return_date ? format(parseISO(m.actual_return_date), 'dd/MM/yyyy') : '-',
      'Status': m.status || 'pending',
    }));
    downloadCSV(exportData, `external_movements_${dateRange}d`);
    toast({ description: 'Movements exported' });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon">
              <Link to="/partner-dashboard">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Factory className="h-6 w-6" />
                External Processing Analytics
              </h1>
              <p className="text-sm text-muted-foreground">
                Detailed analysis & drill-down
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={dateRange} onValueChange={(v: DateRange) => setDateRange(v)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 Days</SelectItem>
                <SelectItem value="90">Last 90 Days</SelectItem>
                <SelectItem value="180">Last 180 Days</SelectItem>
                <SelectItem value="365">Last 365 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleExportMovements} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Movements</div>
            <div className="text-xl font-bold">{summary.total_movements}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Completed</div>
            <div className="text-xl font-bold text-green-600">{summary.completed_movements}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Pending</div>
            <div className="text-xl font-bold text-blue-600">{summary.pending_movements}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Overdue</div>
            <div className={cn("text-xl font-bold", summary.overdue_movements > 0 ? "text-destructive" : "text-green-600")}>
              {summary.overdue_movements}
            </div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">Avg Turnaround</div>
            <div className="text-xl font-bold">{summary.avg_turnaround_days}d</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-muted-foreground">On-Time</div>
            <div className={cn("text-xl font-bold", summary.on_time_percentage >= 80 ? "text-green-600" : "text-amber-600")}>
              {summary.on_time_percentage}%
            </div>
          </Card>
        </div>

        <Tabs defaultValue="partners" className="space-y-4">
          <TabsList>
            <TabsTrigger value="partners">By Partner</TabsTrigger>
            <TabsTrigger value="process">By Process</TabsTrigger>
            <TabsTrigger value="movements">All Movements</TabsTrigger>
          </TabsList>

          {/* Partners Tab */}
          <TabsContent value="partners" className="space-y-6">
            {/* Partner comparison chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Partner Performance Comparison</CardTitle>
                <CardDescription>On-time rate and loss % by partner</CardDescription>
              </CardHeader>
              <CardContent>
                {partnerComparisonData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={partnerComparisonData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" domain={[0, 100]} unit="%" />
                      <YAxis dataKey="name" type="category" width={100} className="text-xs" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="onTime" name="On-Time %" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="loss" name="Loss %" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Partner details table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Partner Details</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : partnerMetrics.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">No data</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Partner</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead className="text-right">Movements</TableHead>
                        <TableHead className="text-right">Pending</TableHead>
                        <TableHead className="text-right">Overdue</TableHead>
                        <TableHead className="text-right">Turnaround</TableHead>
                        <TableHead className="text-right">On-Time</TableHead>
                        <TableHead className="text-right">Loss</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerMetrics.map(p => (
                        <TableRow 
                          key={p.partner_id}
                          className={cn(
                            "cursor-pointer hover:bg-muted/50",
                            selectedPartner === p.partner_id && "bg-muted"
                          )}
                          onClick={() => setSelectedPartner(selectedPartner === p.partner_id ? null : p.partner_id)}
                        >
                          <TableCell className="font-medium">{p.partner_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{p.process_type || 'General'}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{p.total_movements}</TableCell>
                          <TableCell className="text-right">
                            {p.pending_movements > 0 ? (
                              <Badge variant="secondary">{p.pending_movements}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.overdue_movements > 0 ? (
                              <Badge variant="destructive">{p.overdue_movements}</Badge>
                            ) : <span className="text-green-600">0</span>}
                          </TableCell>
                          <TableCell className="text-right">{p.turnaround_days_avg}d</TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              p.on_time_percentage >= 80 ? "text-green-600" : 
                              p.on_time_percentage >= 60 ? "text-amber-600" : "text-destructive"
                            )}>
                              {p.on_time_percentage}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={cn(
                              p.loss_percentage <= 1 ? "text-green-600" : 
                              p.loss_percentage <= 3 ? "text-amber-600" : "text-destructive"
                            )}>
                              {p.loss_percentage}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Process Tab */}
          <TabsContent value="process" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Process Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  {processComparisonData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={processComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" className="text-xs" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="movements" name="Movements" fill="hsl(var(--chart-1))" />
                        <Bar dataKey="turnaround" name="Avg Days" fill="hsl(var(--chart-2))" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      No data
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Process Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {processMetrics.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data</div>
                  ) : (
                    <div className="space-y-3">
                      {processMetrics.map(p => (
                        <div 
                          key={p.process}
                          className={cn(
                            "border rounded-lg p-3 cursor-pointer hover:bg-muted/50",
                            selectedProcess === p.process && "bg-muted"
                          )}
                          onClick={() => setSelectedProcess(selectedProcess === p.process ? null : p.process)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{p.process_label}</span>
                            <Badge variant="outline">{p.total_movements} moves</Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">Turnaround: </span>
                              <span className="font-medium">{p.avg_turnaround_days}d</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">On-Time: </span>
                              <span className={cn(
                                "font-medium",
                                p.on_time_percentage >= 80 ? "text-green-600" : "text-amber-600"
                              )}>{p.on_time_percentage}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Loss: </span>
                              <span className={cn(
                                "font-medium",
                                p.loss_percentage <= 1 ? "text-green-600" : "text-destructive"
                              )}>{p.loss_percentage}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Movements Tab */}
          <TabsContent value="movements" className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              <Select 
                value={selectedPartner || "all"} 
                onValueChange={(v) => setSelectedPartner(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Partners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Partners</SelectItem>
                  {partnerMetrics.map(p => (
                    <SelectItem key={p.partner_id} value={p.partner_id}>
                      {p.partner_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select 
                value={selectedProcess || "all"} 
                onValueChange={(v) => setSelectedProcess(v === "all" ? null : v)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Processes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Processes</SelectItem>
                  {processMetrics.map(p => (
                    <SelectItem key={p.process} value={p.process}>
                      {p.process_label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(selectedPartner || selectedProcess) && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setSelectedPartner(null); setSelectedProcess(null); }}
                >
                  Clear Filters
                </Button>
              )}
            </div>

            {/* Movements table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Movement Records ({filteredMovements.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
                ) : filteredMovements.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">No movements found</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Challan</TableHead>
                        <TableHead>Process</TableHead>
                        <TableHead>Partner</TableHead>
                        <TableHead className="text-right">Sent</TableHead>
                        <TableHead className="text-right">Returned</TableHead>
                        <TableHead>Sent Date</TableHead>
                        <TableHead>Expected</TableHead>
                        <TableHead>Returned</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMovements.slice(0, 50).map(m => {
                        const isComplete = m.status === 'received' || m.status === 'completed' || m.actual_return_date;
                        const isOverdue = !isComplete && m.expected_return_date && new Date() > parseISO(m.expected_return_date);
                        const isOnTime = isComplete && m.expected_return_date && m.actual_return_date && 
                          parseISO(m.actual_return_date) <= parseISO(m.expected_return_date);
                        
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="font-mono text-xs">{m.challan_no || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{PROCESS_LABELS[m.process_type] || m.process_type}</Badge>
                            </TableCell>
                            <TableCell>{partnerMap[m.partner_id || '']?.name || 'Unknown'}</TableCell>
                            <TableCell className="text-right">{m.quantity_sent}</TableCell>
                            <TableCell className="text-right">
                              {m.quantity_returned || 0}
                              {(m.quantity_rejected || 0) > 0 && (
                                <span className="text-destructive ml-1">(-{m.quantity_rejected})</span>
                              )}
                            </TableCell>
                            <TableCell>{m.sent_date ? format(parseISO(m.sent_date), 'dd/MM/yy') : '-'}</TableCell>
                            <TableCell>{m.expected_return_date ? format(parseISO(m.expected_return_date), 'dd/MM/yy') : '-'}</TableCell>
                            <TableCell>{m.actual_return_date ? format(parseISO(m.actual_return_date), 'dd/MM/yy') : '-'}</TableCell>
                            <TableCell>
                              {isComplete ? (
                                isOnTime ? (
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    <CheckCircle className="h-3 w-3 mr-1" /> On-Time
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">
                                    <TrendingDown className="h-3 w-3 mr-1" /> Late
                                  </Badge>
                                )
                              ) : isOverdue ? (
                                <Badge variant="destructive">
                                  <AlertTriangle className="h-3 w-3 mr-1" /> Overdue
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  <Clock className="h-3 w-3 mr-1" /> Pending
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                {filteredMovements.length > 50 && (
                  <div className="text-center text-sm text-muted-foreground mt-4">
                    Showing 50 of {filteredMovements.length} movements
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ExternalAnalytics;
