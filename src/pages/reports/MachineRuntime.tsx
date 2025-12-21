import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

import { toast } from "sonner";
import { Download, ChevronDown, ChevronUp, FileText, Filter } from "lucide-react";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Site {
  id: string;
  name: string;
  code: string;
}

interface Machine {
  id: string;
  machine_id: string;
  name: string;
}

interface RuntimeData {
  machine_id: string;
  machine_name: string;
  planned_minutes: number;
  actual_run_minutes: number;
  downtime_minutes: number;
  target_qty: number;
  qty_ok: number;
  qty_scrap: number;
  availability_pct: number;
  performance_pct: number;
  quality_pct: number;
  oee_pct: number;
  downtime_breakdown: {
    maintenance: number;
    material_wait: number;
    setup: number;
    stopped: number;
  };
  actions_taken: string[];
}

export default function MachineRuntime() {
  const [sites, setSites] = useState<Site[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("");
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [runtimeData, setRuntimeData] = useState<RuntimeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [kpis, setKpis] = useState({
    avgAvailability: 0,
    avgPerformance: 0,
    avgQuality: 0,
    avgOEE: 0,
  });

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    if (selectedSite) {
      loadMachines();
    }
  }, [selectedSite]);

  useEffect(() => {
    if (selectedSite && startDate && endDate) {
      loadRuntimeData();
    }
  }, [selectedSite, selectedMachines, startDate, endDate]);

  const loadSites = async () => {
    try {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .order("name");
      
      if (error) throw error;
      setSites(data || []);
      
      // Auto-select first site
      if (data && data.length > 0) {
        setSelectedSite(data[0].id);
      }
    } catch (error: any) {
      console.error("Error loading sites:", error);
      toast.error("Failed to load sites");
    }
  };

  const loadMachines = async () => {
    try {
      const { data, error } = await supabase
        .from("machines")
        .select("id, machine_id, name")
        .eq("site_id", selectedSite)
        .order("machine_id");
      
      if (error) throw error;
      setMachines(data || []);
    } catch (error: any) {
      console.error("Error loading machines:", error);
      toast.error("Failed to load machines");
    }
  };

  const loadRuntimeData = async () => {
    setLoading(true);
    try {
      // Get machine daily metrics
      let metricsQuery = supabase
        .from("machine_daily_metrics")
        .select("*")
        .eq("site_id", selectedSite)
        .gte("date", startDate)
        .lte("date", endDate);

      if (selectedMachines.length > 0) {
        metricsQuery = metricsQuery.in("machine_id", selectedMachines);
      }

      const { data: metrics, error: metricsError } = await metricsQuery;
      if (metricsError) throw metricsError;

      // Get production logs for downtime breakdown and actions
      let logsQuery = supabase
        .from("production_logs")
        .select("machine_id, run_state, downtime_minutes, actions_taken, machines(machine_id, name)")
        .gte("log_timestamp", startDate)
        .lte("log_timestamp", endDate + "T23:59:59");

      if (selectedMachines.length > 0) {
        logsQuery = logsQuery.in("machine_id", selectedMachines);
      }

      const { data: logs, error: logsError } = await logsQuery;
      if (logsError) throw logsError;

      // Group metrics by machine
      const machineMap = new Map<string, RuntimeData>();

      metrics?.forEach((metric) => {
        const existing = machineMap.get(metric.machine_id);
        if (existing) {
          existing.planned_minutes += metric.planned_minutes || 0;
          existing.actual_run_minutes += metric.actual_run_minutes || 0;
          existing.downtime_minutes += metric.downtime_minutes || 0;
          existing.target_qty += metric.target_qty || 0;
          existing.qty_ok += metric.qty_ok || 0;
          existing.qty_scrap += metric.qty_scrap || 0;
        } else {
          machineMap.set(metric.machine_id, {
            machine_id: metric.machine_id,
            machine_name: "",
            planned_minutes: metric.planned_minutes || 0,
            actual_run_minutes: metric.actual_run_minutes || 0,
            downtime_minutes: metric.downtime_minutes || 0,
            target_qty: metric.target_qty || 0,
            qty_ok: metric.qty_ok || 0,
            qty_scrap: metric.qty_scrap || 0,
            availability_pct: 0,
            performance_pct: 0,
            quality_pct: 0,
            oee_pct: 0,
            downtime_breakdown: {
              maintenance: 0,
              material_wait: 0,
              setup: 0,
              stopped: 0,
            },
            actions_taken: [],
          });
        }
      });

      // Add downtime breakdown and actions from logs
      logs?.forEach((log: any) => {
        const machineData = machineMap.get(log.machine_id);
        if (machineData) {
          // Set machine name from logs if not set
          if (!machineData.machine_name && log.machines) {
            machineData.machine_name = `${log.machines.machine_id} - ${log.machines.name}`;
          }

          // Breakdown downtime by reason
          if (log.run_state === 'maintenance') {
            machineData.downtime_breakdown.maintenance += log.downtime_minutes || 0;
          } else if (log.run_state === 'material_wait') {
            machineData.downtime_breakdown.material_wait += log.downtime_minutes || 0;
          } else if (log.run_state === 'setup') {
            machineData.downtime_breakdown.setup += log.downtime_minutes || 0;
          } else if (log.run_state === 'stopped') {
            machineData.downtime_breakdown.stopped += log.downtime_minutes || 0;
          }

          // Collect actions taken
          if (log.actions_taken) {
            machineData.actions_taken.push(log.actions_taken);
          }
        }
      });

      // Calculate percentages
      const runtimeArray = Array.from(machineMap.values()).map(data => {
        const availability = data.planned_minutes > 0
          ? ((data.planned_minutes - data.downtime_minutes) / data.planned_minutes) * 100
          : 0;
        const performance = data.target_qty > 0
          ? (data.qty_ok / data.target_qty) * 100
          : 0;
        const quality = data.qty_ok > 0
          ? ((data.qty_ok - data.qty_scrap) / data.qty_ok) * 100
          : 0;
        const oee = (availability * performance * quality) / 10000;

        return {
          ...data,
          availability_pct: availability,
          performance_pct: performance,
          quality_pct: quality,
          oee_pct: oee,
        };
      });

      setRuntimeData(runtimeArray);

      // Calculate KPIs
      if (runtimeArray.length > 0) {
        const avgAvailability = runtimeArray.reduce((sum, d) => sum + d.availability_pct, 0) / runtimeArray.length;
        const avgPerformance = runtimeArray.reduce((sum, d) => sum + d.performance_pct, 0) / runtimeArray.length;
        const avgQuality = runtimeArray.reduce((sum, d) => sum + d.quality_pct, 0) / runtimeArray.length;
        const avgOEE = runtimeArray.reduce((sum, d) => sum + d.oee_pct, 0) / runtimeArray.length;

        setKpis({
          avgAvailability,
          avgPerformance,
          avgQuality,
          avgOEE,
        });
      } else {
        setKpis({ avgAvailability: 0, avgPerformance: 0, avgQuality: 0, avgOEE: 0 });
      }
    } catch (error: any) {
      console.error("Error loading runtime data:", error);
      toast.error("Failed to load runtime data");
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (machineId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(machineId)) {
      newExpanded.delete(machineId);
    } else {
      newExpanded.add(machineId);
    }
    setExpandedRows(newExpanded);
  };

  const exportCSV = () => {
    const headers = [
      "Machine",
      "Planned (min)",
      "Actual Run (min)",
      "Downtime (min)",
      "Maintenance (min)",
      "Material Wait (min)",
      "Setup (min)",
      "Stopped (min)",
      "Target (pcs)",
      "Actual (pcs)",
      "Scrap",
      "Availability %",
      "Performance %",
      "Quality %",
      "OEE %",
    ];

    const rows = runtimeData.map(data => [
      data.machine_name,
      data.planned_minutes,
      data.actual_run_minutes,
      data.downtime_minutes,
      data.downtime_breakdown.maintenance,
      data.downtime_breakdown.material_wait,
      data.downtime_breakdown.setup,
      data.downtime_breakdown.stopped,
      data.target_qty,
      data.qty_ok,
      data.qty_scrap,
      data.availability_pct.toFixed(2),
      data.performance_pct.toFixed(2),
      data.quality_pct.toFixed(2),
      data.oee_pct.toFixed(2),
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `machine-runtime-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Machine Runtime Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${startDate} to ${endDate}`, 14, 22);
    doc.text(`Site: ${sites.find(s => s.id === selectedSite)?.name || 'N/A'}`, 14, 28);

    // KPIs
    doc.setFontSize(12);
    doc.text("KPIs (Average)", 14, 38);
    doc.setFontSize(10);
    doc.text(`Availability: ${kpis.avgAvailability.toFixed(2)}%`, 14, 44);
    doc.text(`Performance: ${kpis.avgPerformance.toFixed(2)}%`, 60, 44);
    doc.text(`Quality: ${kpis.avgQuality.toFixed(2)}%`, 110, 44);
    doc.text(`OEE: ${kpis.avgOEE.toFixed(2)}%`, 150, 44);

    // Table
    autoTable(doc, {
      startY: 50,
      head: [["Machine", "Plan(m)", "Run(m)", "Down(m)", "Target", "OK", "Scrap", "Avail%", "Perf%", "OEE%"]],
      body: runtimeData.map(data => [
        data.machine_name,
        data.planned_minutes,
        data.actual_run_minutes,
        data.downtime_minutes,
        data.target_qty,
        data.qty_ok,
        data.qty_scrap,
        data.availability_pct.toFixed(1),
        data.performance_pct.toFixed(1),
        data.oee_pct.toFixed(1),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      styles: { fontSize: 8 },
    });

    doc.save(`machine-runtime-${startDate}-to-${endDate}.pdf`);
    toast.success("PDF exported successfully");
  };

  const toggleMachine = (machineId: string) => {
    setSelectedMachines(prev => 
      prev.includes(machineId) 
        ? prev.filter(id => id !== machineId)
        : [...prev, machineId]
    );
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
              <BreadcrumbPage>Machine Runtime</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Machine Runtime Report</h1>
            <p className="text-muted-foreground">OEE metrics and runtime analysis</p>
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
                <Label>Machines ({selectedMachines.length} selected)</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder={selectedMachines.length === 0 ? "All machines" : `${selectedMachines.length} selected`} />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedMachines([])}
                        className="w-full mb-2"
                      >
                        Clear All
                      </Button>
                      {machines.map(machine => (
                        <div key={machine.id} className="flex items-center space-x-2 py-1">
                          <input
                            type="checkbox"
                            checked={selectedMachines.includes(machine.id)}
                            onChange={() => toggleMachine(machine.id)}
                            className="rounded"
                          />
                          <label className="text-sm">{machine.machine_id} - {machine.name}</label>
                        </div>
                      ))}
                    </div>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Availability</CardDescription>
              <CardTitle className="text-3xl">{kpis.avgAvailability.toFixed(1)}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Uptime / Planned Time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Performance</CardDescription>
              <CardTitle className="text-3xl">{kpis.avgPerformance.toFixed(1)}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Actual / Target Qty</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Quality</CardDescription>
              <CardTitle className="text-3xl">{kpis.avgQuality.toFixed(1)}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Good / Total Production</p>
            </CardContent>
          </Card>

          <Card className="border-primary">
            <CardHeader className="pb-2">
              <CardDescription>OEE</CardDescription>
              <CardTitle className="text-3xl text-primary">{kpis.avgOEE.toFixed(1)}%</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Overall Equipment Effectiveness</p>
            </CardContent>
          </Card>
        </div>

        {/* Runtime Table */}
        <Card>
          <CardHeader>
            <CardTitle>Runtime Details</CardTitle>
            <CardDescription>
              {loading ? "Loading..." : `${runtimeData.length} machine${runtimeData.length !== 1 ? 's' : ''} found`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead className="text-right">Planned (min)</TableHead>
                    <TableHead className="text-right">Actual Run (min)</TableHead>
                    <TableHead className="text-right">Downtime (min)</TableHead>
                    <TableHead className="text-right">Target (pcs)</TableHead>
                    <TableHead className="text-right">OK (pcs)</TableHead>
                    <TableHead className="text-right">Scrap</TableHead>
                    <TableHead className="text-right">Efficiency %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runtimeData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No runtime data found for selected filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    runtimeData.map(data => (
                      <>
                        <TableRow key={data.machine_id}>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRow(data.machine_id)}
                            >
                              {expandedRows.has(data.machine_id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">{data.machine_name}</TableCell>
                          <TableCell className="text-right">{data.planned_minutes}</TableCell>
                          <TableCell className="text-right">{data.actual_run_minutes}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="destructive">{data.downtime_minutes}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{data.target_qty}</TableCell>
                          <TableCell className="text-right">{data.qty_ok}</TableCell>
                          <TableCell className="text-right">{data.qty_scrap}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={data.oee_pct >= 85 ? "default" : data.oee_pct >= 60 ? "secondary" : "destructive"}>
                              {data.oee_pct.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {expandedRows.has(data.machine_id) && (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/50">
                              <div className="p-4 space-y-3">
                                <div>
                                  <h4 className="font-semibold mb-2">Downtime Breakdown</h4>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div className="flex items-center justify-between p-2 bg-background rounded">
                                      <span className="text-sm">Maintenance:</span>
                                      <Badge variant="outline">{data.downtime_breakdown.maintenance} min</Badge>
                                    </div>
                                    <div className="flex items-center justify-between p-2 bg-background rounded">
                                      <span className="text-sm">Material Wait:</span>
                                      <Badge variant="outline">{data.downtime_breakdown.material_wait} min</Badge>
                                    </div>
                                    <div className="flex items-center justify-between p-2 bg-background rounded">
                                      <span className="text-sm">Setup:</span>
                                      <Badge variant="outline">{data.downtime_breakdown.setup} min</Badge>
                                    </div>
                                    <div className="flex items-center justify-between p-2 bg-background rounded">
                                      <span className="text-sm">Stopped:</span>
                                      <Badge variant="outline">{data.downtime_breakdown.stopped} min</Badge>
                                    </div>
                                  </div>
                                </div>
                                {data.actions_taken.length > 0 && (
                                  <div>
                                    <h4 className="font-semibold mb-2">Actions Taken</h4>
                                    <ul className="space-y-1 text-sm">
                                      {data.actions_taken.map((action, idx) => (
                                        <li key={idx} className="pl-4 border-l-2 border-primary/20">
                                          {action}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
