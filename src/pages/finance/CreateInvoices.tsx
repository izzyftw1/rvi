import { useState, useEffect } from "react";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Truck, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActionPermission } from "@/hooks/useActionPermission";

interface DispatchNoteItem {
  id: string;
  dispatch_note_no: string;
  work_order_id: string;
  sales_order_id: string | null;
  item_code: string;
  wo_number: string | null;
  packed_qty: number;
  dispatched_qty: number;
  unit_rate: number | null;
  currency: string | null;
  gst_percent: number;
}

interface AdvanceInfo {
  so_id: string;
  so_number: string;
  received: number;
  unapplied: number;
}

interface InvoiceableShipment {
  id: string;
  ship_id: string;
  customer: string;
  customer_id: string | null;
  so_numbers: string[];
  ship_date: string;
  status: string;
  total_dispatched_qty: number;
  total_packed_qty: number;
  dispatch_notes: DispatchNoteItem[];
  currency: string;
  is_export: boolean;
  gst_label: string;
  already_invoiced: boolean;
  invoice_nos: string[];
  blocker: string | null;
  advances: AdvanceInfo[];
}

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

export default function CreateInvoices() {
  const [shipments, setShipments] = useState<InvoiceableShipment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState("ready");
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [advanceDeductions, setAdvanceDeductions] = useState<Record<string, number>>({});
  const { canPerform } = useActionPermission();
  const canOverrideQty = canPerform("create_invoice");

  useEffect(() => { loadInvoiceableShipments(); }, []);

  const loadInvoiceableShipments = async () => {
    setLoading(true);
    try {
      const [{ data: shipmentsData, error: shipError }, { data: settings }] = await Promise.all([
        supabase.from("shipments").select("id, ship_id, customer, ship_date, status")
          .in("status", ["delivered", "in_transit", "shipped", "dispatched"])
          .order("ship_date", { ascending: false }),
        supabase.from("finance_settings").select("company_state, default_gst_percent").maybeSingle(),
      ]);
      if (shipError) throw shipError;
      const companyState = (settings?.company_state || "Gujarat").trim().toLowerCase();
      const defaultGst = Number(settings?.default_gst_percent ?? 18);

      const shipIds = (shipmentsData || []).map(s => s.id);
      const { data: notes, error: nErr } = await supabase
        .from("dispatch_notes")
        .select("id, dispatch_note_no, work_order_id, sales_order_id, shipment_id, item_code, packed_qty, dispatched_qty, unit_rate, currency, invoiced, invoice_id")
        .in("shipment_id", shipIds.length ? shipIds : [EMPTY_UUID]);
      if (nErr) throw nErr;

      const woIds = [...new Set((notes || []).map(n => n.work_order_id))];
      const { data: wos } = await supabase.from("work_orders_restricted")
        .select("id, wo_number, so_id, customer_id")
        .in("id", woIds.length ? woIds : [EMPTY_UUID]);
      const woMap = new Map<string, any>((wos || []).map((w: any) => [w.id, w]));

      const soIds = [...new Set((notes || []).map(n => n.sales_order_id || woMap.get(n.work_order_id)?.so_id).filter(Boolean))] as string[];
      const invIds = [...new Set((notes || []).map(n => n.invoice_id).filter(Boolean))] as string[];
      const [{ data: sos }, { data: lines }, { data: advs }, { data: invs }] = await Promise.all([
        supabase.from("sales_orders").select("id, so_id, customer_id, currency, gst_percent").in("id", soIds.length ? soIds : [EMPTY_UUID]),
        supabase.from("sales_order_line_items").select("work_order_id, gst_percent").in("work_order_id", woIds.length ? woIds : [EMPTY_UUID]),
        supabase.from("so_advance_status").select("sales_order_id, so_id, advance_received, advance_unapplied").in("sales_order_id", soIds.length ? soIds : [EMPTY_UUID]),
        supabase.from("invoices").select("id, invoice_no").in("id", invIds.length ? invIds : [EMPTY_UUID]),
      ]);
      const soMap = new Map<string, any>((sos || []).map((s: any) => [s.id, s]));
      const lineMap = new Map<string, any>((lines || []).map((l: any) => [l.work_order_id, l]));
      const advMap = new Map<string, any>((advs || []).map((a: any) => [a.sales_order_id, a]));
      const invMap = new Map<string, string>((invs || []).map((i: any) => [i.id, i.invoice_no]));

      const custIds = [...new Set([
        ...(sos || []).map((s: any) => s.customer_id),
        ...(wos || []).map((w: any) => w.customer_id),
      ].filter(Boolean))] as string[];
      const { data: customers } = await supabase.from("customer_master")
        .select("id, customer_name, is_export_customer, state, country")
        .in("id", custIds.length ? custIds : [EMPTY_UUID]);
      const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));

      const result: InvoiceableShipment[] = [];
      for (const s of shipmentsData || []) {
        const all = (notes || []).filter(n => n.shipment_id === s.id);
        if (all.length === 0) continue;
        const open = all.filter(n => !n.invoiced);
        const invoiced = open.length === 0;
        const useNotes = invoiced ? all : open;

        const custSet = new Set<string>();
        const soSet = new Set<string>();
        let missingCustomer = false;
        const items: DispatchNoteItem[] = useNotes.map(n => {
          const wo = woMap.get(n.work_order_id);
          const soId = n.sales_order_id || wo?.so_id || null;
          const so = soId ? soMap.get(soId) : null;
          const custId = so?.customer_id || wo?.customer_id || null;
          if (custId && custMap.has(custId)) custSet.add(custId); else missingCustomer = true;
          if (soId) soSet.add(soId);
          const line = lineMap.get(n.work_order_id) || null;
          return {
            id: n.id, dispatch_note_no: n.dispatch_note_no, work_order_id: n.work_order_id, sales_order_id: soId,
            item_code: n.item_code, wo_number: wo?.wo_number || null,
            packed_qty: n.packed_qty || 0, dispatched_qty: n.dispatched_qty || 0,
            unit_rate: n.unit_rate, currency: n.currency || so?.currency || null,
            gst_percent: Number(line?.gst_percent ?? so?.gst_percent ?? defaultGst),
          };
        });
        const customer = custSet.size === 1 ? custMap.get([...custSet][0]) : null;
        const isExport = !!customer && (customer.is_export_customer === true ||
          (!!customer.country && customer.country.trim().toLowerCase() !== "india"));
        const sameState = !!customer && (customer.state || "").trim().toLowerCase() === companyState;
        const currencies = new Set(items.map(i => i.currency || "INR"));

        let blocker: string | null = null;
        if (!invoiced) {
          if (missingCustomer || !customer) blocker = custSet.size > 1 ? "Shipment spans more than one customer" : "Missing customer: link the work order to a sales order with a customer";
          else if (currencies.size > 1) blocker = "Mixed currencies on one shipment";
          else {
            const noPrice = items.filter(i => !i.unit_rate || Number(i.unit_rate) <= 0);
            if (noPrice.length) blocker = `Missing price on ${[...new Set(noPrice.map(i => i.wo_number || i.item_code))].join(", ")}`;
          }
        }

        result.push({
          id: s.id, ship_id: s.ship_id,
          customer: customer?.customer_name || s.customer,
          customer_id: customer?.id || null,
          so_numbers: [...soSet].map(id => soMap.get(id)?.so_id).filter(Boolean),
          ship_date: s.ship_date, status: s.status || "unknown",
          total_dispatched_qty: items.reduce((a, i) => a + i.dispatched_qty, 0),
          total_packed_qty: items.reduce((a, i) => a + i.packed_qty, 0),
          dispatch_notes: items,
          currency: [...currencies][0] || "INR",
          is_export: isExport,
          gst_label: !customer ? "—" : isExport ? "Export (0%)" : sameState ? "CGST+SGST" : "IGST",
          already_invoiced: invoiced,
          invoice_nos: [...new Set(all.map(n => n.invoice_id && invMap.get(n.invoice_id)).filter(Boolean))] as string[],
          blocker,
          advances: [...soSet].map(id => advMap.get(id)).filter((a: any) => a && Number(a.advance_received) > 0).map((a: any) => ({
            so_id: a.sales_order_id, so_number: a.so_id, received: Number(a.advance_received), unapplied: Number(a.advance_unapplied),
          })),
        });
      }
      setShipments(result);
    } catch (error: any) {
      toast.error("Failed to load shipments: " + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const readyShipments = shipments.filter(s => !s.already_invoiced && !s.blocker);
  const blockedShipments = shipments.filter(s => !s.already_invoiced && s.blocker);
  const invoicedShipments = shipments.filter(s => s.already_invoiced);

  const toggleSelection = (id: string) => {
    const s = shipments.find(x => x.id === id);
    if (s?.blocker) { toast.error(s.blocker); return; }
    if (s?.already_invoiced) { toast.error("This shipment has already been invoiced"); return; }
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === readyShipments.length ? new Set() : new Set(readyShipments.map(s => s.id)));
  };

  const calculateTotal = (s: InvoiceableShipment) =>
    s.dispatch_notes.reduce((sum, n) => {
      const amt = (qtyOverrides[n.id] ?? n.dispatched_qty) * (Number(n.unit_rate) || 0);
      return sum + amt + (s.is_export ? 0 : (amt * n.gst_percent) / 100);
    }, 0);

  const createInvoices = async () => {
    if (selected.size === 0) { toast.error("Please select at least one shipment"); return; }
    setCreating(true);
    let ok = 0;
    for (const s of shipments.filter(x => selected.has(x.id))) {
      const overrides: Record<string, number> = {};
      if (canOverrideQty) s.dispatch_notes.forEach(n => { if (qtyOverrides[n.id] != null) overrides[n.id] = qtyOverrides[n.id]; });
      const advances: Record<string, number> = {};
      s.advances.forEach(a => { const v = advanceDeductions[`${s.id}:${a.so_id}`]; if (v && v > 0) advances[a.so_id] = Math.min(v, a.unapplied); });
      const { data, error } = await supabase.rpc("create_invoice_from_shipment", {
        p_shipment_id: s.id, p_qty_overrides: overrides, p_advances: advances,
      } as any);
      if (error) { toast.error(`${s.ship_id}: ${error.message}`); continue; }
      const r = data as any;
      ok++;
      toast.success(`${r.invoice_no} created for ${s.ship_id} (${r.currency} ${Number(r.total).toLocaleString(undefined, { minimumFractionDigits: 2 })})${Number(r.advance_applied) > 0 ? ` · less advance ${r.currency} ${Number(r.advance_applied).toLocaleString()}` : ""}`);
    }
    if (ok > 0) { setSelected(new Set()); setQtyOverrides({}); setAdvanceDeductions({}); loadInvoiceableShipments(); }
    setCreating(false);
  };

  const fmt = (cur: string, v: number) => `${cur} ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const ShipmentTable = ({ data, showCheckboxes = false, mode }: { data: InvoiceableShipment[]; showCheckboxes?: boolean; mode: "ready" | "blocked" | "invoiced" }) => (
    <Table>
      <TableHeader>
        <TableRow>
          {showCheckboxes && (
            <TableHead className="w-12">
              <Checkbox checked={selected.size === readyShipments.length && readyShipments.length > 0} onCheckedChange={toggleAll} />
            </TableHead>
          )}
          <TableHead>Shipment</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>SO</TableHead>
          <TableHead>Ship Date</TableHead>
          <TableHead className="text-right">Dispatched Qty</TableHead>
          <TableHead>GST</TableHead>
          <TableHead className="text-right">Amount (incl. GST)</TableHead>
          <TableHead>{mode === "invoiced" ? "Invoice" : mode === "blocked" ? "Blocked because" : "Advance"}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No shipments found</TableCell></TableRow>
        ) : data.map(s => (
          <TableRow key={s.id} className={s.blocker ? "bg-destructive/5" : s.already_invoiced ? "bg-muted/50" : ""}>
            {showCheckboxes && (
              <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSelection(s.id)} /></TableCell>
            )}
            <TableCell className="font-medium">
              <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-muted-foreground" />{s.ship_id}</div>
            </TableCell>
            <TableCell>{s.customer}</TableCell>
            <TableCell>{s.so_numbers.join(", ") || "-"}</TableCell>
            <TableCell>{s.ship_date ? new Date(s.ship_date).toLocaleDateString() : "-"}</TableCell>
            <TableCell className="text-right font-medium">
              {mode === "ready" && canOverrideQty ? (
                <div className="space-y-1">
                  {s.dispatch_notes.map(n => (
                    <div key={n.id} className="flex items-center justify-end gap-2 text-xs">
                      <span className="text-muted-foreground">{n.wo_number || n.item_code}</span>
                      <Input type="number" min={1} className="h-7 w-24 text-right"
                        value={qtyOverrides[n.id] ?? n.dispatched_qty}
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          setQtyOverrides(prev => {
                            const next = { ...prev };
                            if (!v || v === n.dispatched_qty) delete next[n.id]; else next[n.id] = v;
                            return next;
                          });
                        }} />
                    </div>
                  ))}
                </div>
              ) : s.total_dispatched_qty.toLocaleString()}
            </TableCell>
            <TableCell><Badge variant="outline">{s.gst_label}</Badge></TableCell>
            <TableCell className="text-right font-medium">{fmt(s.currency, calculateTotal(s))}</TableCell>
            <TableCell>
              {mode === "invoiced" ? (s.invoice_nos.join(", ") || "-")
                : mode === "blocked" ? <span className="text-sm text-destructive">{s.blocker}</span>
                : s.advances.length === 0 ? <span className="text-xs text-muted-foreground">No advance</span>
                : (
                  <div className="space-y-1">
                    {s.advances.map(a => (
                      <div key={a.so_id} className="text-xs">
                        <div className="text-muted-foreground">{a.so_number}: received {fmt(s.currency, a.received)}, unapplied {fmt(s.currency, a.unapplied)}</div>
                        {a.unapplied > 0 && (
                          <div className="flex items-center gap-2 mt-1">
                            <span>Less advance</span>
                            <Input type="number" min={0} max={a.unapplied} className="h-7 w-28"
                              value={advanceDeductions[`${s.id}:${a.so_id}`] ?? ""}
                              placeholder="0"
                              onChange={e => {
                                const v = Math.max(0, Math.min(Number(e.target.value) || 0, a.unapplied, calculateTotal(s)));
                                setAdvanceDeductions(prev => ({ ...prev, [`${s.id}:${a.so_id}`]: v }));
                              }} />
                            <Button type="button" variant="ghost" size="sm" className="h-7"
                              onClick={() => setAdvanceDeductions(prev => ({ ...prev, [`${s.id}:${a.so_id}`]: Math.min(a.unapplied, calculateTotal(s)) }))}>
                              Max
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <PageContainer maxWidth="2xl">
      <PageHeader title="Create Invoices" description="Generate tax invoices from dispatched shipments" icon={<FileText className="h-5 w-5" />} />
      <div className="space-y-6 mt-6">
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>Invoiced by dispatched quantity</AlertTitle>
          <AlertDescription>
            Partial shipments can be invoiced. Customer, sales order, currency and GST come from each dispatch note's own sales order.
            Invoice numbers are assigned on creation.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" />Ready to Invoice</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{readyShipments.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Blocked</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{blockedShipments.length}</div><p className="text-sm text-muted-foreground">Missing customer, price or mixed currency</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5 text-blue-600" />Already Invoiced</CardTitle></CardHeader>
            <CardContent><div className="text-3xl font-bold">{invoicedShipments.length}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Shipments</CardTitle>
                <CardDescription>Select dispatched shipments to generate invoices</CardDescription>
              </div>
              <Button onClick={createInvoices} disabled={selected.size === 0 || creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create {selected.size > 0 ? `${selected.size} ` : ""}Invoice{selected.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="ready">Ready ({readyShipments.length})</TabsTrigger>
                  <TabsTrigger value="blocked">Blocked ({blockedShipments.length})</TabsTrigger>
                  <TabsTrigger value="invoiced">Invoiced ({invoicedShipments.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="ready"><ShipmentTable data={readyShipments} showCheckboxes mode="ready" /></TabsContent>
                <TabsContent value="blocked"><ShipmentTable data={blockedShipments} mode="blocked" /></TabsContent>
                <TabsContent value="invoiced"><ShipmentTable data={invoicedShipments} mode="invoiced" /></TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
