import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ClipboardCheck, Search, Loader2, Package, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";

interface CartonRow {
  id: string;
  carton_id: string;
  wo_id: string;
  quantity: number;
  dispatched_qty: number;
  built_at: string;
  dispatch_qc_status: string;
  batch_number: number | null;
  wo_number: string;
  item_code: string;
  revision: string | null;
  customer: string;
}

const CHECKS: { key: string; label: string }[] = [
  { key: "customer", label: "Correct customer" },
  { key: "part_revision", label: "Correct part / revision" },
  { key: "quantity", label: "Quantity matches" },
  { key: "wo_batch", label: "WO and batch match" },
  { key: "labels", label: "Labels correct" },
  { key: "packaging", label: "Packaging OK" },
  { key: "documents", label: "Documents complete" },
  { key: "no_holds_ncrs", label: "No open holds / NCRs" },
];

const DispatchQCList = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cartons, setCartons] = useState<CartonRow[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: cErr } = await supabase
      .from("cartons")
      .select("id, carton_id, wo_id, quantity, dispatched_qty, built_at, dispatch_qc_status, production_batches:production_batch_id(batch_number)")
      .eq("status", "ready_for_dispatch")
      .neq("dispatch_qc_status", "passed")
      .order("built_at", { ascending: true });
    if (cErr) { setError(cErr.message); setLoading(false); return; }
    const woIds = [...new Set((data || []).map(c => c.wo_id))];
    const { data: wos, error: wErr } = woIds.length
      ? await supabase.from("work_orders_restricted").select("id, wo_number, item_code, revision, customer").in("id", woIds)
      : { data: [], error: null };
    if (wErr) setError(wErr.message);
    const woMap = new Map<string, any>((wos || []).map((w: any) => [w.id, w]));
    setCartons((data || []).filter(c => woMap.has(c.wo_id)).map((c: any) => {
      const wo = woMap.get(c.wo_id);
      return {
        id: c.id, carton_id: c.carton_id, wo_id: c.wo_id, quantity: c.quantity, dispatched_qty: c.dispatched_qty || 0,
        built_at: c.built_at, dispatch_qc_status: c.dispatch_qc_status,
        batch_number: c.production_batches?.batch_number ?? null,
        wo_number: wo?.wo_number || "", item_code: wo?.item_code || "", revision: wo?.revision || null,
        customer: wo?.customer || "Unknown",
      };
    }));
    const { data: insp } = await supabase
      .from("dispatch_qc_inspections")
      .select("id, inspection_no, customer_name, total_qty, result, remarks, created_at, carton_ids")
      .eq("system_backfill", false)
      .order("created_at", { ascending: false })
      .limit(20);
    setRecent(insp || []);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const q = search.toLowerCase();
    const g: Record<string, CartonRow[]> = {};
    cartons
      .filter(c => !q || [c.carton_id, c.wo_number, c.item_code, c.customer].some(v => v.toLowerCase().includes(q)))
      .forEach(c => { (g[c.customer] ||= []).push(c); });
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [cartons, search]);

  const selectedRows = cartons.filter(c => selected.has(c.id));
  const selectedCustomer = selectedRows[0]?.customer;

  const toggle = (c: CartonRow) => {
    const next = new Set(selected);
    if (next.has(c.id)) next.delete(c.id);
    else {
      if (selectedCustomer && selectedCustomer !== c.customer) {
        toast.error(`Dispatch QC covers one customer at a time (selected: ${selectedCustomer})`);
        return;
      }
      next.add(c.id);
    }
    setSelected(next);
  };

  const toggleGroup = (customer: string, rows: CartonRow[]) => {
    if (selectedCustomer && selectedCustomer !== customer) {
      toast.error(`Dispatch QC covers one customer at a time (selected: ${selectedCustomer})`);
      return;
    }
    const all = rows.every(r => selected.has(r.id));
    const next = new Set(selected);
    rows.forEach(r => (all ? next.delete(r.id) : next.add(r.id)));
    setSelected(next);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Dispatch QC"
        description="Inspect packed cartons per customer before dispatch"
        icon={<ClipboardCheck className="h-6 w-6" />}
      />

      {error && <Alert variant="destructive" className="mb-4"><AlertDescription>Could not load cartons: {error}</AlertDescription></Alert>}

      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search carton, WO, item or customer..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <span className="text-sm text-muted-foreground">
            {selectedRows.length} carton(s) · {selectedRows.reduce((s, c) => s + c.quantity - c.dispatched_qty, 0).toLocaleString()} pcs
            {selectedCustomer ? ` · ${selectedCustomer}` : ""}
          </span>
          <Button disabled={selectedRows.length === 0} onClick={() => setDialogOpen(true)}>
            <ClipboardCheck className="h-4 w-4 mr-2" /> Inspect selected
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No packed cartons awaiting Dispatch QC</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([customer, rows]) => (
            <Card key={customer}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <Checkbox checked={rows.every(r => selected.has(r.id))} onCheckedChange={() => toggleGroup(customer, rows)} />
                  <CardTitle className="text-base">{customer}</CardTitle>
                  <Badge variant="secondary">{rows.length} cartons</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Carton</TableHead>
                      <TableHead>WO</TableHead>
                      <TableHead>Item / Rev</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Packed</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(c => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => toggle(c)}>
                        <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c)} /></TableCell>
                        <TableCell className="font-mono text-xs">{c.carton_id}</TableCell>
                        <TableCell>{c.wo_number}</TableCell>
                        <TableCell>{c.item_code}{c.revision ? ` / ${c.revision}` : ""}</TableCell>
                        <TableCell>{c.batch_number ? `#${c.batch_number}` : "—"}</TableCell>
                        <TableCell className="text-right">{(c.quantity - c.dispatched_qty).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(c.built_at), "dd MMM yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant={c.dispatch_qc_status === "failed" ? "destructive" : "outline"}>
                            {c.dispatch_qc_status === "failed" ? "Failed – re-inspect" : "Awaiting Dispatch QC"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-base">Recent Dispatch QC</CardTitle><CardDescription>Latest post-packing inspections</CardDescription></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>No.</TableHead><TableHead>Customer</TableHead><TableHead>Cartons</TableHead><TableHead className="text-right">Pcs</TableHead><TableHead>Result</TableHead><TableHead>Remarks</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
              <TableBody>
                {recent.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.inspection_no}</TableCell>
                    <TableCell>{r.customer_name || "—"}</TableCell>
                    <TableCell>{r.carton_ids?.length || 0}</TableCell>
                    <TableCell className="text-right">{(r.total_qty || 0).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={r.result === "pass" ? "default" : "destructive"}>{r.result}</Badge></TableCell>
                    <TableCell className="max-w-[240px] truncate">{r.remarks || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {dialogOpen && (
        <InspectDialog rows={selectedRows} onClose={() => setDialogOpen(false)} onSaved={() => { setDialogOpen(false); load(); }} />
      )}
    </PageContainer>
  );
};

const InspectDialog = ({ rows, onClose, onSaved }: { rows: CartonRow[]; onClose: () => void; onSaved: () => void }) => {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState<"pass" | "fail" | null>(null);
  const allChecked = CHECKS.every(c => checks[c.key]);

  const submit = async (result: "pass" | "fail") => {
    setSaving(result);
    const { data, error } = await supabase.rpc("record_dispatch_qc" as any, {
      p_carton_ids: rows.map(r => r.id),
      p_result: result,
      p_checklist: checks,
      p_remarks: remarks || null,
    } as any);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${(data as any)?.inspection_no}: Dispatch QC ${result.toUpperCase()} for ${rows.length} carton(s)`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Dispatch QC — {rows[0]?.customer}</DialogTitle>
          <DialogDescription>
            {rows.length} carton(s) · {rows.reduce((s, c) => s + c.quantity - c.dispatched_qty, 0).toLocaleString()} pcs ·{" "}
            {[...new Set(rows.map(r => r.wo_number))].join(", ")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {CHECKS.map(c => (
            <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={!!checks[c.key]} onCheckedChange={v => setChecks({ ...checks, [c.key]: !!v })} />
              {c.label}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label>Remarks {saving === "fail" || !allChecked ? "(required for fail)" : ""}</Label>
          <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={!!saving || !remarks.trim()} onClick={() => submit("fail")}>
            {saving === "fail" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />} Fail
          </Button>
          <Button disabled={!!saving || !allChecked} onClick={() => submit("pass")}>
            {saving === "pass" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Pass
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DispatchQCList;
