import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUserRole } from "@/hooks/useUserRole";
import { formatMoney } from "@/lib/currencyTotals";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

export interface AdvanceStatus {
  sales_order_id: string;
  so_id: string;
  currency: string | null;
  advance_percent: number | null;
  advance_due: number;
  advance_received: number;
  advance_applied: number;
  advance_unapplied: number;
  advance_outstanding: number;
}

export const ChaseAdvanceBadge = ({ status }: { status?: AdvanceStatus | null }) =>
  status && status.advance_outstanding > 0.004 ? (
    <Badge variant="destructive" className="whitespace-nowrap">Chase advance</Badge>
  ) : null;

/** Advance due / received / outstanding cells for SO lists. */
export const useAdvanceStatuses = (soIds: string[]) => {
  const [map, setMap] = useState<Record<string, AdvanceStatus>>({});
  const key = soIds.join(",");
  const load = useCallback(async () => {
    if (soIds.length === 0) { setMap({}); return; }
    const { data, error } = await supabase.from("so_advance_status").select("*").in("sales_order_id", soIds);
    if (error) { toast.error("Could not load advance status: " + error.message); return; }
    const m: Record<string, AdvanceStatus> = {};
    (data || []).forEach((r: any) => { m[r.sales_order_id] = r; });
    setMap(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { map, reload: load };
};

/** Full panel for one SO: figures, receipts list, and (finance only) log advance. */
export const SOAdvancePanel = ({ soId, onChanged }: { soId: string; onChanged?: () => void }) => {
  const { isFinanceRole } = useUserRole();
  const canLog = isFinanceRole();
  const [status, setStatus] = useState<AdvanceStatus | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", currency: "", reference: "" });

  const load = useCallback(async () => {
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase.from("so_advance_status").select("*").eq("sales_order_id", soId).maybeSingle(),
      supabase.from("customer_receipts").select("id, receipt_no, receipt_date, total_amount, allocated_amount, currency, bank_reference")
        .eq("sales_order_id", soId).eq("receipt_type", "advance").order("receipt_date"),
    ]);
    setStatus((s as any) || null);
    setReceipts(r || []);
  }, [soId]);
  useEffect(() => { load(); }, [load]);

  const cur = status?.currency || "INR";

  const save = async () => {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { toast.error("Enter the advance amount"); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc("record_advance_receipt", {
      p_so_id: soId, p_date: form.date, p_amount: amount, p_currency: form.currency || cur, p_reference: form.reference || null,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Advance ${(data as any)?.receipt_no} logged`);
    setOpen(false);
    setForm({ ...form, amount: "", reference: "" });
    load();
    onChanged?.();
  };

  return (
    <div className="space-y-3 border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Advance</span>
          {status?.advance_percent ? <span className="text-xs text-muted-foreground">{status.advance_percent}% of order</span> : null}
          <ChaseAdvanceBadge status={status} />
        </div>
        {canLog && (
          <Button size="sm" variant="outline" onClick={() => { setForm(f => ({ ...f, currency: cur })); setOpen(true); }}>
            <Plus className="h-3 w-3 mr-1" /> Log advance receipt
          </Button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 text-sm">
        <div><p className="text-xs text-muted-foreground">Due</p><p className="font-medium">{formatMoney(status?.advance_due || 0, cur)}</p></div>
        <div><p className="text-xs text-muted-foreground">Received</p><p className="font-medium">{formatMoney(status?.advance_received || 0, cur)}</p></div>
        <div><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-medium">{formatMoney(status?.advance_outstanding || 0, cur)}</p></div>
        <div><p className="text-xs text-muted-foreground">Unapplied</p><p className="font-medium">{formatMoney(status?.advance_unapplied || 0, cur)}</p></div>
      </div>
      {receipts.length > 0 && (
        <Table>
          <TableHeader><TableRow><TableHead>Receipt</TableHead><TableHead>Date</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Applied</TableHead></TableRow></TableHeader>
          <TableBody>
            {receipts.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.receipt_no}</TableCell>
                <TableCell>{r.receipt_date}</TableCell>
                <TableCell>{r.bank_reference || "—"}</TableCell>
                <TableCell className="text-right">{formatMoney(r.total_amount, r.currency)}</TableCell>
                <TableCell className="text-right">{formatMoney(r.allocated_amount || 0, r.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log advance receipt — {status?.so_id}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Currency</Label><Input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1"><Label>Amount</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-1"><Label>Reference</Label><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Bank ref / UTR" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Customer page: advance position across that customer's SOs. */
export const SOAdvanceSummary = ({ customerId }: { customerId: string }) => {
  const [rows, setRows] = useState<AdvanceStatus[]>([]);
  useEffect(() => {
    supabase.from("so_advance_status").select("*").eq("customer_id", customerId)
      .or("advance_due.gt.0,advance_received.gt.0")
      .then(({ data, error }) => {
        if (error) toast.error("Could not load advances: " + error.message);
        setRows((data as any) || []);
      });
  }, [customerId]);
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Advances</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>SO</TableHead><TableHead className="text-right">Due</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead className="text-right">Unapplied</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.sales_order_id}>
                <TableCell className="font-medium">{r.so_id}</TableCell>
                <TableCell className="text-right">{formatMoney(r.advance_due, r.currency)}</TableCell>
                <TableCell className="text-right">{formatMoney(r.advance_received, r.currency)}</TableCell>
                <TableCell className="text-right">{formatMoney(r.advance_outstanding, r.currency)}</TableCell>
                <TableCell className="text-right">{formatMoney(r.advance_unapplied, r.currency)}</TableCell>
                <TableCell><ChaseAdvanceBadge status={r} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
