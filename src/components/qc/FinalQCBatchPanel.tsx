import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BatchRow {
  id: string;
  wo_id: string;
  batch_number: number;
  produced: number;
  approved: number;
  rejected: number;
  inspected: number;
  final_status: string;
  wo_number: string;
  item_code: string;
}

interface Props {
  /** When set, only this WO's batches are shown. Otherwise, all batches awaiting Final QC. */
  woId?: string;
}

export const FinalQCBatchPanel = ({ woId }: Props) => {
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<BatchRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from("production_batches")
      .select("id, wo_id, batch_number, produced_qty, production_complete_qty, qc_approved_qty, qc_rejected_qty, qc_final_status")
      .order("created_at", { ascending: false })
      .limit(woId ? 100 : 300);
    if (woId) q = q.eq("wo_id", woId);
    else q = q.gt("produced_qty", 0);
    const { data, error: bErr } = await q;
    if (bErr) { setError(bErr.message); setLoading(false); return; }

    const batchIds = (data || []).map(b => b.id);
    const woIds = [...new Set((data || []).map(b => b.wo_id))];
    const [insp, wos] = await Promise.all([
      batchIds.length
        ? supabase.from("final_qc_inspections").select("batch_id, accepted_qty, rejected_qty, result").in("batch_id", batchIds)
        : Promise.resolve({ data: [], error: null } as any),
      woIds.length
        ? supabase.from("work_orders_restricted").select("id, wo_number, item_code").in("id", woIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (insp.error || wos.error) setError((insp.error || wos.error).message);

    const inspected: Record<string, number> = {};
    (insp.data || []).forEach((i: any) => {
      if (i.result !== "hold") inspected[i.batch_id] = (inspected[i.batch_id] || 0) + i.accepted_qty + i.rejected_qty;
    });
    const woMap = new Map<string, any>((wos.data || []).map((w: any) => [w.id, w]));

    const mapped: BatchRow[] = (data || [])
      .filter(b => woMap.has(b.wo_id))
      .map(b => ({
        id: b.id,
        wo_id: b.wo_id,
        batch_number: b.batch_number,
        produced: Math.max(b.produced_qty || 0, b.production_complete_qty || 0),
        approved: b.qc_approved_qty || 0,
        rejected: b.qc_rejected_qty || 0,
        inspected: inspected[b.id] || 0,
        final_status: b.qc_final_status || "pending",
        wo_number: woMap.get(b.wo_id)?.wo_number || "",
        item_code: woMap.get(b.wo_id)?.item_code || "",
      }))
      .filter(r => woId || r.produced - r.inspected > 0);
    setRows(mapped);
    setLoading(false);
  }, [woId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4 text-primary" /> Final QC by production batch
        </CardTitle>
        <CardDescription>A Final QC pass makes the accepted quantity available for packing.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <Alert variant="destructive" className="mb-3"><AlertDescription>Could not load Final QC: {error}</AlertDescription></Alert>}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No batches awaiting Final QC.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {!woId && <TableHead>Work order</TableHead>}
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Produced</TableHead>
                <TableHead className="text-right">Inspected</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const remaining = r.produced - r.inspected;
                return (
                  <TableRow key={r.id}>
                    {!woId && (
                      <TableCell>
                        <Link to={`/work-orders/${r.wo_id}`} className="font-medium text-primary hover:underline">{r.wo_number}</Link>
                        <div className="text-xs text-muted-foreground">{r.item_code}</div>
                      </TableCell>
                    )}
                    <TableCell>#{r.batch_number}</TableCell>
                    <TableCell className="text-right">{r.produced.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.inspected.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.approved.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.rejected.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={r.final_status === "passed" ? "default" : r.final_status === "failed" ? "destructive" : "outline"}>
                        {r.final_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" disabled={remaining <= 0} onClick={() => setActive(r)}>
                        Final QC
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {active && (
        <FinalQCDialog batch={active} onClose={() => setActive(null)} onSaved={() => { setActive(null); load(); }} />
      )}
    </Card>
  );
};

const FinalQCDialog = ({ batch, onClose, onSaved }: { batch: BatchRow; onClose: () => void; onSaved: () => void }) => {
  const remaining = Math.max(0, batch.produced - batch.inspected);
  const [result, setResult] = useState<"pass" | "fail" | "hold">("pass");
  const [inspected, setInspected] = useState(String(remaining));
  const [accepted, setAccepted] = useState(String(remaining));
  const [rejected, setRejected] = useState("0");
  const [disposition, setDisposition] = useState<string>("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);

  const insp = parseInt(inspected) || 0;
  const acc = result === "hold" ? 0 : parseInt(accepted) || 0;
  const rej = result === "hold" ? 0 : parseInt(rejected) || 0;
  const sumOk = result === "hold" || acc + rej === insp;
  const needsDisposition = rej > 0 && !disposition;
  const valid = insp > 0 && (result === "hold" || insp <= remaining) && sumOk && !needsDisposition && !(result === "fail" && rej === 0);

  const submit = async () => {
    setSaving(true);
    const { data, error } = await supabase.rpc("record_final_qc", {
      p_batch_id: batch.id,
      p_result: result,
      p_inspected_qty: insp,
      p_accepted_qty: acc,
      p_rejected_qty: rej,
      p_disposition: rej > 0 ? disposition : null,
      p_remarks: remarks || null,
    } as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const ncr = (data as any)?.ncr_number;
    toast.success(`Final QC ${result.toUpperCase()} recorded for batch #${batch.batch_number}${acc ? ` — ${acc} pcs ready for packing` : ""}${ncr ? `. ${ncr} opened` : ""}`);
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Final QC — {batch.wo_number} batch #{batch.batch_number}</DialogTitle>
          <DialogDescription>{remaining.toLocaleString()} pcs produced and not yet inspected.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Result</Label>
            <Select value={result} onValueChange={(v) => setResult(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">Pass / partial accept</SelectItem>
                <SelectItem value="fail">Fail</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Inspected</Label><Input type="number" min={1} value={inspected} onChange={e => setInspected(e.target.value)} /></div>
            <div className="space-y-1"><Label>Accepted</Label><Input type="number" min={0} disabled={result === "hold"} value={result === "hold" ? "0" : accepted} onChange={e => setAccepted(e.target.value)} /></div>
            <div className="space-y-1"><Label>Rejected</Label><Input type="number" min={0} disabled={result === "hold"} value={result === "hold" ? "0" : rejected} onChange={e => setRejected(e.target.value)} /></div>
          </div>
          {!sumOk && <p className="text-xs text-destructive">Accepted + rejected must equal inspected.</p>}
          {result !== "hold" && insp > remaining && <p className="text-xs text-destructive">Only {remaining} pcs remain to inspect.</p>}
          {rej > 0 && (
            <div className="space-y-2">
              <Label>Disposition for rejects</Label>
              <Select value={disposition} onValueChange={setDisposition}>
                <SelectTrigger><SelectValue placeholder="Choose disposition" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rework">Rework</SelectItem>
                  <SelectItem value="scrap">Scrap</SelectItem>
                  <SelectItem value="ncr">Raise NCR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2"><Label>Remarks</Label><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || saving} variant={result === "fail" ? "destructive" : "default"}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record Final QC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
