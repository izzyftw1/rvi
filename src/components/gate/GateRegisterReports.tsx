import { useState, useMemo, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Download, FileSpreadsheet, FileText, ArrowDownToLine, ArrowUpFromLine,
  Scale, Clock, AlertTriangle, Filter, X, Loader2
} from "lucide-react";
import { format, subDays, subMonths, subYears, parseISO, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { downloadPDF, downloadExcel } from "@/lib/exportHelpers";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface GateReportEntry {
  id: string;
  gate_entry_no: string;
  direction: string;
  material_type: string;
  entry_date: string;
  entry_time: string;
  item_name: string | null;
  rod_section_size: string | null;
  material_grade: string | null;
  alloy: string | null;
  heat_no: string | null;
  gross_weight_kg: number;
  net_weight_kg: number;
  tare_weight_kg: number;
  estimated_pcs: number | null;
  supplier_name: string | null;
  party_code: string | null;
  process_type: string | null;
  challan_no: string | null;
  dc_number: string | null;
  vehicle_no: string | null;
  transporter: string | null;
  status: string;
  qc_status: string;
  remarks: string | null;
  work_order_id: string | null;
  customer_id: string | null;
  partner_id: string | null;
  rpo_id: string | null;
}

interface OutstandingExternal {
  partner_name: string;
  process_type: string;
  work_order_id: string | null;
  wo_number: string | null;
  item_name: string | null;
  total_sent_kg: number;
  total_sent_pcs: number;
  total_returned_kg: number;
  total_returned_pcs: number;
  balance_kg: number;
  balance_pcs: number;
  oldest_sent_date: string;
  days_out: number;
  challan_nos: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DATE_RANGES = [
  { value: "1", label: "Yesterday" },
  { value: "7", label: "Last 7 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "180", label: "Last 6 Months" },
  { value: "365", label: "Last Year" },
  { value: "custom", label: "Custom Range" },
];

const MATERIAL_TYPES = [
  { value: "all", label: "All Types" },
  { value: "raw_material", label: "Raw Material" },
  { value: "external_process", label: "External Process" },
  { value: "finished_goods", label: "Finished Goods" },
  { value: "scrap", label: "Scrap" },
  { value: "other", label: "Other" },
];

const MATERIAL_TYPE_LABELS: Record<string, string> = {
  raw_material: "Raw Material",
  external_process: "External Process",
  finished_goods: "Finished Goods",
  scrap: "Scrap",
  other: "Other",
};

export function GateRegisterReports({ open, onOpenChange }: Props) {
  const [activeTab, setActiveTab] = useState<"movement" | "outstanding">("movement");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<GateReportEntry[]>([]);

  // Filters
  const [dateRange, setDateRange] = useState("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterMaterialType, setFilterMaterialType] = useState("all");
  const [filterSupplier, setFilterSupplier] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [filterPartner, setFilterPartner] = useState("");

  // Master data for dropdowns
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([]);
  const [woMap, setWoMap] = useState<Record<string, string>>({});

  const dateFilter = useMemo(() => {
    if (dateRange === "custom") {
      return {
        from: customFrom || format(subDays(new Date(), 30), "yyyy-MM-dd"),
        to: customTo || format(new Date(), "yyyy-MM-dd"),
      };
    }
    const days = parseInt(dateRange);
    return {
      from: format(subDays(new Date(), days), "yyyy-MM-dd"),
      to: format(new Date(), "yyyy-MM-dd"),
    };
  }, [dateRange, customFrom, customTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, suppliersRes, partnersRes] = await Promise.all([
        supabase
          .from("gate_register")
          .select("*")
          .gte("entry_date", dateFilter.from)
          .lte("entry_date", dateFilter.to)
          .order("entry_time", { ascending: false })
          .limit(5000),
        supabase.from("suppliers").select("id, name").order("name"),
        supabase.from("external_partners").select("id, name").eq("is_active", true).order("name"),
      ]);

      setEntries((entriesRes.data || []) as GateReportEntry[]);
      setSuppliers(suppliersRes.data || []);
      setPartners(partnersRes.data || []);

      // Load WO numbers for linked entries
      const woIds = [...new Set((entriesRes.data || []).map((e: any) => e.work_order_id).filter(Boolean))];
      if (woIds.length > 0) {
        const { data: wos } = await supabase
          .from("work_orders")
          .select("id, wo_number")
          .in("id", woIds.slice(0, 200));
        const map: Record<string, string> = {};
        (wos || []).forEach((w: any) => { map[w.id] = w.wo_number; });
        setWoMap(map);
      }
    } catch (err) {
      console.error("Report load error:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  // Apply filters
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (filterDirection !== "all" && e.direction !== filterDirection) return false;
      if (filterMaterialType !== "all" && e.material_type !== filterMaterialType) return false;
      if (filterSupplier && !(e.supplier_name || "").toLowerCase().includes(filterSupplier.toLowerCase())) return false;
      if (filterItem && !(e.item_name || e.rod_section_size || "").toLowerCase().includes(filterItem.toLowerCase())) return false;
      if (filterPartner && e.partner_id !== filterPartner) return false;
      return true;
    });
  }, [entries, filterDirection, filterMaterialType, filterSupplier, filterItem, filterPartner]);

  // Summary stats
  const summary = useMemo(() => {
    const inEntries = filtered.filter(e => e.direction === "IN");
    const outEntries = filtered.filter(e => e.direction === "OUT");
    return {
      totalEntries: filtered.length,
      inCount: inEntries.length,
      outCount: outEntries.length,
      totalInGross: inEntries.reduce((s, e) => s + e.gross_weight_kg, 0),
      totalInNet: inEntries.reduce((s, e) => s + e.net_weight_kg, 0),
      totalOutGross: outEntries.reduce((s, e) => s + e.gross_weight_kg, 0),
      totalOutNet: outEntries.reduce((s, e) => s + e.net_weight_kg, 0),
      totalInPcs: inEntries.reduce((s, e) => s + (e.estimated_pcs || 0), 0),
      totalOutPcs: outEntries.reduce((s, e) => s + (e.estimated_pcs || 0), 0),
      byType: Object.entries(
        filtered.reduce((acc, e) => {
          const key = `${e.direction}-${e.material_type}`;
          if (!acc[key]) acc[key] = { direction: e.direction, type: e.material_type, count: 0, grossKg: 0, netKg: 0 };
          acc[key].count++;
          acc[key].grossKg += e.gross_weight_kg;
          acc[key].netKg += e.net_weight_kg;
          return acc;
        }, {} as Record<string, { direction: string; type: string; count: number; grossKg: number; netKg: number }>)
      ).map(([, v]) => v),
    };
  }, [filtered]);

  // Outstanding external balance
  const outstanding = useMemo((): OutstandingExternal[] => {
    const extOut = entries.filter(e => e.material_type === "external_process" && e.direction === "OUT");
    const extIn = entries.filter(e => e.material_type === "external_process" && e.direction === "IN");

    // Group OUT by partner + item
    const groups: Record<string, OutstandingExternal> = {};
    extOut.forEach(e => {
      const key = `${e.supplier_name || "Unknown"}_${e.item_name || "N/A"}_${e.work_order_id || ""}`;
      if (!groups[key]) {
        groups[key] = {
          partner_name: e.supplier_name || "Unknown",
          process_type: e.process_type || "-",
          work_order_id: e.work_order_id,
          wo_number: e.work_order_id ? woMap[e.work_order_id] || null : null,
          item_name: e.item_name || e.rod_section_size || "-",
          total_sent_kg: 0,
          total_sent_pcs: 0,
          total_returned_kg: 0,
          total_returned_pcs: 0,
          balance_kg: 0,
          balance_pcs: 0,
          oldest_sent_date: e.entry_date,
          days_out: 0,
          challan_nos: [],
        };
      }
      groups[key].total_sent_kg += e.net_weight_kg;
      groups[key].total_sent_pcs += e.estimated_pcs || 0;
      if (e.challan_no) groups[key].challan_nos.push(e.challan_no);
      if (e.entry_date < groups[key].oldest_sent_date) groups[key].oldest_sent_date = e.entry_date;
    });

    // Match IN entries
    extIn.forEach(e => {
      const key = `${e.supplier_name || "Unknown"}_${e.item_name || "N/A"}_${e.work_order_id || ""}`;
      if (groups[key]) {
        groups[key].total_returned_kg += e.net_weight_kg;
        groups[key].total_returned_pcs += e.estimated_pcs || 0;
      }
    });

    const today = new Date();
    return Object.values(groups)
      .map(g => ({
        ...g,
        balance_kg: Math.max(0, g.total_sent_kg - g.total_returned_kg),
        balance_pcs: Math.max(0, g.total_sent_pcs - g.total_returned_pcs),
        days_out: Math.floor((today.getTime() - new Date(g.oldest_sent_date).getTime()) / (1000 * 60 * 60 * 24)),
        challan_nos: [...new Set(g.challan_nos)],
      }))
      .filter(g => g.balance_kg > 0.1 || g.balance_pcs > 0)
      .sort((a, b) => b.days_out - a.days_out);
  }, [entries, woMap]);

  // Outstanding filters
  const [filterOutPartner, setFilterOutPartner] = useState("");
  const [filterOutProcess, setFilterOutProcess] = useState("");

  const filteredOutstanding = useMemo(() => {
    return outstanding.filter(o => {
      if (filterOutPartner && !o.partner_name.toLowerCase().includes(filterOutPartner.toLowerCase())) return false;
      if (filterOutProcess && o.process_type !== filterOutProcess) return false;
      return true;
    });
  }, [outstanding, filterOutPartner, filterOutProcess]);

  const outstandingSummary = useMemo(() => ({
    totalBalanceKg: filteredOutstanding.reduce((s, o) => s + o.balance_kg, 0),
    totalBalancePcs: filteredOutstanding.reduce((s, o) => s + o.balance_pcs, 0),
    totalPartners: new Set(filteredOutstanding.map(o => o.partner_name)).size,
    overdueCount: filteredOutstanding.filter(o => o.days_out > 14).length,
  }), [filteredOutstanding]);

  // ── EXPORT: Movement Report Excel ──
  const exportMovementExcel = () => {
    const rows = filtered.map(e => ({
      "Entry No": e.gate_entry_no,
      Direction: e.direction,
      Type: MATERIAL_TYPE_LABELS[e.material_type] || e.material_type,
      Date: format(new Date(e.entry_time), "dd-MMM-yyyy"),
      Time: format(new Date(e.entry_time), "HH:mm"),
      "Item / Material": e.item_name || e.rod_section_size || "-",
      "Heat No": e.heat_no || "-",
      "Material Grade": e.material_grade || e.alloy || "-",
      "Supplier / Partner": e.supplier_name || "-",
      "Party Code": e.party_code || "-",
      "Process Type": e.process_type || "-",
      "Work Order": e.work_order_id ? woMap[e.work_order_id] || "-" : "-",
      "Gross Weight (kg)": e.gross_weight_kg,
      "Tare Weight (kg)": e.tare_weight_kg,
      "Net Weight (kg)": e.net_weight_kg,
      "Est. PCS": e.estimated_pcs || "-",
      "Challan No": e.challan_no || "-",
      "DC Number": e.dc_number || "-",
      "Vehicle No": e.vehicle_no || "-",
      Transporter: e.transporter || "-",
      "QC Status": e.qc_status || "-",
      Remarks: e.remarks || "-",
    }));

    // Add summary rows
    rows.push({} as any);
    rows.push({ "Entry No": "SUMMARY", Direction: "", Type: "", Date: `${dateFilter.from} to ${dateFilter.to}`, Time: "" } as any);
    rows.push({ "Entry No": "Total IN", Direction: String(summary.inCount), "Gross Weight (kg)": summary.totalInGross, "Net Weight (kg)": summary.totalInNet, "Est. PCS": summary.totalInPcs } as any);
    rows.push({ "Entry No": "Total OUT", Direction: String(summary.outCount), "Gross Weight (kg)": summary.totalOutGross, "Net Weight (kg)": summary.totalOutNet, "Est. PCS": summary.totalOutPcs } as any);
    rows.push({ "Entry No": "Net Movement", "Gross Weight (kg)": summary.totalInGross - summary.totalOutGross, "Net Weight (kg)": summary.totalInNet - summary.totalOutNet } as any);

    downloadExcel(rows, `Gate_Register_Report`, "Movement Report");
  };

  // ── EXPORT: Movement Report PDF ──
  const exportMovementPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Gate Register - Movement Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Period: ${dateFilter.from} to ${dateFilter.to}  |  Generated: ${format(new Date(), "dd-MMM-yyyy HH:mm")}`, 14, 22);
    doc.text(`Filters: Direction=${filterDirection === "all" ? "All" : filterDirection}  Type=${filterMaterialType === "all" ? "All" : MATERIAL_TYPE_LABELS[filterMaterialType] || filterMaterialType}`, 14, 28);

    // Summary table
    autoTable(doc, {
      startY: 34,
      head: [["", "Count", "Gross (kg)", "Net (kg)", "Est. PCS"]],
      body: [
        ["Total IN", summary.inCount, summary.totalInGross.toFixed(2), summary.totalInNet.toFixed(2), summary.totalInPcs],
        ["Total OUT", summary.outCount, summary.totalOutGross.toFixed(2), summary.totalOutNet.toFixed(2), summary.totalOutPcs],
        ["Net Movement", summary.totalEntries, (summary.totalInGross - summary.totalOutGross).toFixed(2), (summary.totalInNet - summary.totalOutNet).toFixed(2), summary.totalInPcs - summary.totalOutPcs],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    // Detail table
    const detailY = (doc as any).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: detailY,
      head: [["Entry No", "Dir", "Type", "Date", "Item", "Supplier/Partner", "Gross (kg)", "Net (kg)", "PCS", "Challan", "Vehicle", "QC"]],
      body: filtered.map(e => [
        e.gate_entry_no,
        e.direction,
        MATERIAL_TYPE_LABELS[e.material_type] || e.material_type,
        format(new Date(e.entry_time), "dd-MMM HH:mm"),
        (e.item_name || e.rod_section_size || "-").substring(0, 20),
        (e.supplier_name || "-").substring(0, 18),
        e.gross_weight_kg.toFixed(2),
        e.net_weight_kg.toFixed(2),
        e.estimated_pcs || "-",
        e.challan_no || "-",
        e.vehicle_no || "-",
        e.qc_status || "-",
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save(`Gate_Register_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  // ── EXPORT: Outstanding Excel ──
  const exportOutstandingExcel = () => {
    const rows = filteredOutstanding.map(o => ({
      "Partner": o.partner_name,
      "Process": o.process_type,
      "Work Order": o.wo_number || "-",
      "Item": o.item_name,
      "Sent (kg)": o.total_sent_kg,
      "Sent (pcs)": o.total_sent_pcs || "-",
      "Returned (kg)": o.total_returned_kg,
      "Returned (pcs)": o.total_returned_pcs || "-",
      "Balance (kg)": o.balance_kg,
      "Balance (pcs)": o.balance_pcs || "-",
      "Days Out": o.days_out,
      "Oldest Sent": o.oldest_sent_date,
      "Challans": o.challan_nos.join(", "),
    }));

    rows.push({} as any);
    rows.push({
      Partner: "TOTAL",
      "Balance (kg)": outstandingSummary.totalBalanceKg,
      "Balance (pcs)": outstandingSummary.totalBalancePcs,
    } as any);

    downloadExcel(rows, "External_Outstanding_Report", "Outstanding Balance");
  };

  // ── EXPORT: Outstanding PDF ──
  const exportOutstandingPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("External Process - Outstanding Balance Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "dd-MMM-yyyy HH:mm")}  |  Partners: ${outstandingSummary.totalPartners}  |  Overdue (>14d): ${outstandingSummary.overdueCount}`, 14, 22);

    // Summary
    autoTable(doc, {
      startY: 28,
      head: [["Total Balance (kg)", "Total Balance (pcs)", "Active Partners", "Overdue >14 Days"]],
      body: [[outstandingSummary.totalBalanceKg.toFixed(2), outstandingSummary.totalBalancePcs, outstandingSummary.totalPartners, outstandingSummary.overdueCount]],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [220, 38, 38] },
    });

    const detailY = (doc as any).lastAutoTable.finalY + 8;
    autoTable(doc, {
      startY: detailY,
      head: [["Partner", "Process", "WO", "Item", "Sent (kg)", "Returned (kg)", "Balance (kg)", "Balance (pcs)", "Days Out", "Challans"]],
      body: filteredOutstanding.map(o => [
        o.partner_name.substring(0, 20),
        o.process_type,
        o.wo_number || "-",
        (o.item_name || "-").substring(0, 18),
        o.total_sent_kg.toFixed(2),
        o.total_returned_kg.toFixed(2),
        o.balance_kg.toFixed(2),
        o.balance_pcs || "-",
        o.days_out,
        o.challan_nos.slice(0, 3).join(", "),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [220, 38, 38] },
      didParseCell: (data: any) => {
        // Highlight overdue rows
        if (data.section === "body" && data.column.index === 8) {
          const days = parseInt(data.cell.raw);
          if (days > 14) data.cell.styles.textColor = [220, 38, 38];
        }
      },
    });

    doc.save(`External_Outstanding_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  const clearFilters = () => {
    setFilterDirection("all");
    setFilterMaterialType("all");
    setFilterSupplier("");
    setFilterItem("");
    setFilterPartner("");
    setFilterOutPartner("");
    setFilterOutProcess("");
  };

  const processTypesInData = [...new Set(entries.filter(e => e.process_type).map(e => e.process_type!))].sort();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Gate Register Reports
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="movement" className="flex-1 gap-2">
              <Scale className="h-4 w-4" />
              Movement Report
            </TabsTrigger>
            <TabsTrigger value="outstanding" className="flex-1 gap-2">
              <AlertTriangle className="h-4 w-4" />
              Outstanding External
            </TabsTrigger>
          </TabsList>

          {/* ════════════════ MOVEMENT REPORT ════════════════ */}
          <TabsContent value="movement" className="space-y-4">
            {/* Filters Row */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Filters</span>
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="ml-auto text-xs">
                    <X className="h-3 w-3 mr-1" /> Clear
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  <div>
                    <Label className="text-xs">Date Range</Label>
                    <Select value={dateRange} onValueChange={setDateRange}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {DATE_RANGES.map(d => (
                          <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {dateRange === "custom" && (
                    <>
                      <div>
                        <Label className="text-xs">From</Label>
                        <Input type="date" className="h-8 text-xs" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">To</Label>
                        <Input type="date" className="h-8 text-xs" value={customTo} onChange={e => setCustomTo(e.target.value)} />
                      </div>
                    </>
                  )}
                  <div>
                    <Label className="text-xs">Direction</Label>
                    <Select value={filterDirection} onValueChange={setFilterDirection}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="IN">IN</SelectItem>
                        <SelectItem value="OUT">OUT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Material Type</Label>
                    <Select value={filterMaterialType} onValueChange={setFilterMaterialType}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {MATERIAL_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Supplier / Partner</Label>
                    <Input className="h-8 text-xs" placeholder="Search..." value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Item / Material</Label>
                    <Input className="h-8 text-xs" placeholder="Search..." value={filterItem} onChange={e => setFilterItem(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total IN</p>
                  <p className="text-lg font-bold text-emerald-600">{summary.totalInNet.toFixed(1)} kg</p>
                  <p className="text-xs text-muted-foreground">{summary.inCount} entries</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total OUT</p>
                  <p className="text-lg font-bold text-amber-600">{summary.totalOutNet.toFixed(1)} kg</p>
                  <p className="text-xs text-muted-foreground">{summary.outCount} entries</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Net Movement</p>
                  <p className="text-lg font-bold">{(summary.totalInNet - summary.totalOutNet).toFixed(1)} kg</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">IN PCS</p>
                  <p className="text-lg font-bold text-emerald-600">{summary.totalInPcs.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">OUT PCS</p>
                  <p className="text-lg font-bold text-amber-600">{summary.totalOutPcs.toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>

            {/* Breakdown by type */}
            {summary.byType.length > 0 && (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Breakdown by Type</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {summary.byType.sort((a, b) => b.netKg - a.netKg).map((b, i) => (
                      <div key={i} className="flex items-center justify-between border rounded p-2 text-xs">
                        <div className="flex items-center gap-1">
                          <Badge variant={b.direction === "IN" ? "default" : "secondary"} className="text-[10px] px-1">
                            {b.direction}
                          </Badge>
                          <span>{MATERIAL_TYPE_LABELS[b.type] || b.type}</span>
                        </div>
                        <span className="font-medium">{b.netKg.toFixed(1)} kg ({b.count})</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Export Buttons */}
            <div className="flex gap-2">
              <Button onClick={exportMovementExcel} variant="outline" size="sm" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Export Excel
              </Button>
              <Button onClick={exportMovementPDF} variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" /> Export PDF
              </Button>
              <span className="text-xs text-muted-foreground self-center ml-2">
                {filtered.length} entries in range
              </span>
              {loading && <Loader2 className="h-4 w-4 animate-spin self-center" />}
            </div>

            {/* Data Table */}
            <div className="border rounded-md max-h-[45vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sticky top-0 bg-background">Entry No</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Dir</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Type</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Date</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Item</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Heat No</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Supplier/Partner</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">WO</TableHead>
                    <TableHead className="text-xs text-right sticky top-0 bg-background">Gross (kg)</TableHead>
                    <TableHead className="text-xs text-right sticky top-0 bg-background">Net (kg)</TableHead>
                    <TableHead className="text-xs text-right sticky top-0 bg-background">PCS</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Challan</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Vehicle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                        No entries found for this period and filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs font-mono">{e.gate_entry_no}</TableCell>
                        <TableCell>
                          <Badge className={cn("text-[10px]", e.direction === "IN" ? "bg-emerald-500 text-white" : "bg-amber-500 text-white")}>
                            {e.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{MATERIAL_TYPE_LABELS[e.material_type] || e.material_type}</TableCell>
                        <TableCell className="text-xs">{format(new Date(e.entry_time), "dd-MMM HH:mm")}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{e.item_name || e.rod_section_size || "-"}</TableCell>
                        <TableCell className="text-xs">{e.heat_no || "-"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{e.supplier_name || "-"}</TableCell>
                        <TableCell className="text-xs">{e.work_order_id ? woMap[e.work_order_id] || "-" : "-"}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{e.gross_weight_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right">{e.net_weight_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right">{e.estimated_pcs || "-"}</TableCell>
                        <TableCell className="text-xs">{e.challan_no || "-"}</TableCell>
                        <TableCell className="text-xs">{e.vehicle_no || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ════════════════ OUTSTANDING EXTERNAL ════════════════ */}
          <TabsContent value="outstanding" className="space-y-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium">Material Still With External Partners</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Partner</Label>
                    <Input className="h-8 text-xs" placeholder="Search partner..." value={filterOutPartner} onChange={e => setFilterOutPartner(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Process Type</Label>
                    <Select value={filterOutProcess || "all"} onValueChange={v => setFilterOutProcess(v === "all" ? "" : v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="all">All Processes</SelectItem>
                        {processTypesInData.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Outstanding Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-destructive/30">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Balance Out</p>
                  <p className="text-lg font-bold text-destructive">{outstandingSummary.totalBalanceKg.toFixed(1)} kg</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Balance PCS</p>
                  <p className="text-lg font-bold">{outstandingSummary.totalBalancePcs.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Active Partners</p>
                  <p className="text-lg font-bold">{outstandingSummary.totalPartners}</p>
                </CardContent>
              </Card>
              <Card className={cn(outstandingSummary.overdueCount > 0 && "border-destructive/50")}>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Overdue (&gt;14 days)</p>
                  <p className={cn("text-lg font-bold", outstandingSummary.overdueCount > 0 && "text-destructive")}>
                    {outstandingSummary.overdueCount}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Export Buttons */}
            <div className="flex gap-2">
              <Button onClick={exportOutstandingExcel} variant="outline" size="sm" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" /> Export Excel
              </Button>
              <Button onClick={exportOutstandingPDF} variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" /> Export PDF
              </Button>
              <span className="text-xs text-muted-foreground self-center ml-2">
                {filteredOutstanding.length} open items
              </span>
            </div>

            {/* Outstanding Table */}
            <div className="border rounded-md max-h-[45vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sticky top-0 bg-background">Partner</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Process</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">WO</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Item</TableHead>
                    <TableHead className="text-xs text-right sticky top-0 bg-background">Sent (kg)</TableHead>
                    <TableHead className="text-xs text-right sticky top-0 bg-background">Returned (kg)</TableHead>
                    <TableHead className="text-xs text-right sticky top-0 bg-background font-bold">Balance (kg)</TableHead>
                    <TableHead className="text-xs text-right sticky top-0 bg-background font-bold">Balance (pcs)</TableHead>
                    <TableHead className="text-xs text-right sticky top-0 bg-background">Days Out</TableHead>
                    <TableHead className="text-xs sticky top-0 bg-background">Challans</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOutstanding.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No outstanding external material found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOutstanding.map((o, i) => (
                      <TableRow key={i} className={cn(o.days_out > 14 && "bg-destructive/5")}>
                        <TableCell className="text-xs font-medium">{o.partner_name}</TableCell>
                        <TableCell className="text-xs">{o.process_type}</TableCell>
                        <TableCell className="text-xs">{o.wo_number || "-"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{o.item_name}</TableCell>
                        <TableCell className="text-xs text-right">{o.total_sent_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right">{o.total_returned_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-bold text-destructive">{o.balance_kg.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-bold">{o.balance_pcs || "-"}</TableCell>
                        <TableCell className={cn("text-xs text-right", o.days_out > 14 && "text-destructive font-bold")}>
                          {o.days_out}d
                        </TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{o.challan_nos.join(", ") || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
