import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const PASSED = ["pass", "passed", "approved", "waived"];
const normAlloy = (s?: string | null) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normSize = (s?: string | null) => { const m = String(s || "").match(/[\d.]+/); return m ? Number(m[0]) : null; };

type Mode = "issue" | "return" | "scrap" | null;

export const WOMaterialPanel = ({ woId, alloy, sizeMm }: { woId: string; alloy?: string | null; sizeMm?: string | null }) => {
  const [lots, setLots] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [moves, setMoves] = useState<any[]>([]);
  const [mode, setMode] = useState<Mode>(null);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ lot: "", batch: "", kg: "", pcs: "", scrapType: "chips", location: "", notes: "" });

  const load = useCallback(async () => {
    const [l, b, m] = await Promise.all([
      supabase.from("material_lots").select("id, lot_id, heat_no, alloy, material_size_mm, qc_status, available_kg").order("created_at"),
      supabase.from("production_batches").select("id, batch_number").eq("wo_id", woId).order("batch_number"),
      supabase.from("inventory_movements").select("id, movement_type, quantity_kg, quantity, heat_no, scrap_type, location, notes, created_at, material_lot_id, batch_id")
        .eq("work_order_id", woId).not("material_lot_id", "is", null).order("created_at", { ascending: false }),
    ]);
    if (l.error || b.error || m.error) toast.error("Could not load material data: " + (l.error || b.error || m.error)!.message);
    setLots(l.data || []); setBatches(b.data || []); setMoves(m.data || []);
  }, [woId]);
  useEffect(() => { load(); }, [load]);

  const lotById = useMemo(() => Object.fromEntries(lots.map(l => [l.id, l])), [lots]);
  const batchById = useMemo(() => Object.fromEntries(batches.map(b => [b.id, b])), [batches]);

  const matchingLots = useMemo(() => lots.filter(l => {
    if (alloy && normAlloy(l.alloy) !== normAlloy(alloy)) return false;
    const ws = normSize(sizeMm), ls = normSize(l.material_size_mm);
    if (ws != null && ls != null && ws !== ls) return false;
    return true;
  }), [lots, alloy, sizeMm]);

  // net kg of each lot still with this WO (issue - return - scrap)
  const withWO = useMemo(() => {
    const m: Record<string, number> = {};
    moves.forEach(mv => {
      const k = mv.material_lot_id; const q = Number(mv.quantity_kg || 0);
      m[k] = (m[k] || 0) + (mv.movement_type === "issue" ? q : ["return", "scrap"].includes(mv.movement_type) ? -q : 0);
    });
    return m;
  }, [moves]);
  const issuedLotIds = Object.keys(withWO);

  const open = (m: Mode) => { setF({ lot: "", batch: batches.length === 1 ? batches[0].id : "", kg: "", pcs: "", scrapType: "chips", location: "", notes: "" }); setMode(m); };

  const submit = async () => {
    const kg = Number(f.kg);
    if (!f.lot && mode !== "scrap") return toast.error("Pick a lot");
    if (!f.batch && mode === "issue") return toast.error("Pick a production batch");
    if (!kg || kg <= 0) return toast.error("Enter kg");
    setSaving(true);
    const args: any = { p_wo_id: woId, p_lot_id: f.lot || null, p_batch_id: f.batch || null, p_kg: kg };
    const res = mode === "issue"
      ? await supabase.rpc("issue_material_to_wo", { ...args, p_pcs: f.pcs ? Number(f.pcs) : null })
      : mode === "return"
        ? await supabase.rpc("return_material_to_lot", { ...args, p_notes: f.notes || null })
        : await supabase.rpc("record_material_scrap", { ...args, p_scrap_type: f.scrapType, p_location: f.location || null, p_notes: f.notes || null });
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(mode === "issue" ? "Material issued" : mode === "return" ? "Returned to stock" : "Scrap recorded");
    setMode(null); load();
  };

  const lotOptions = mode === "issue" ? matchingLots : lots.filter(l => issuedLotIds.includes(l.id));
  const typeLabel: Record<string, string> = { issue: "Issue", return: "Return", scrap: "Scrap", adjustment: "Adjustment" };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Material Issues</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => open("issue")}>Issue material</Button>
          <Button size="sm" variant="outline" disabled={issuedLotIds.length === 0} onClick={() => open("return")}>Return to stock</Button>
          <Button size="sm" variant="outline" onClick={() => open("scrap")}>Record scrap</Button>
        </div>
      </CardHeader>
      <CardContent>
        {moves.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No material issued yet.</p>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Lot</TableHead><TableHead>Heat</TableHead><TableHead>Batch</TableHead><TableHead className="text-right">kg</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {moves.map(mv => (
                <TableRow key={mv.id}>
                  <TableCell>{new Date(mv.created_at).toLocaleDateString()}</TableCell>
                  <TableCell><Badge variant={mv.movement_type === "scrap" ? "destructive" : mv.movement_type === "issue" ? "default" : "secondary"}>{typeLabel[mv.movement_type] || mv.movement_type}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{lotById[mv.material_lot_id]?.lot_id || "—"}</TableCell>
                  <TableCell>{mv.heat_no || "—"}</TableCell>
                  <TableCell>{mv.batch_id ? `#${batchById[mv.batch_id]?.batch_number ?? "?"}` : "—"}</TableCell>
                  <TableCell className="text-right">{Number(mv.quantity_kg).toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {[mv.scrap_type?.replace("_", " "), mv.location, mv.movement_type === "issue" && mv.quantity ? `${mv.quantity} pcs` : null, mv.notes].filter(Boolean).join(" • ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={mode !== null} onOpenChange={o => !o && setMode(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{mode === "issue" ? "Issue material" : mode === "return" ? "Return to stock" : "Record scrap"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Lot{mode === "scrap" ? " (optional)" : ""}</Label>
              <Select value={f.lot} onValueChange={v => setF({ ...f, lot: v })}>
                <SelectTrigger><SelectValue placeholder="Select lot" /></SelectTrigger>
                <SelectContent>
                  {lotOptions.length === 0 && <div className="p-2 text-sm text-muted-foreground">No matching lots{alloy ? ` for ${alloy}` : ""}{sizeMm ? ` ${sizeMm}` : ""}</div>}
                  {lotOptions.map(l => {
                    const ok = PASSED.includes((l.qc_status || "pending").toLowerCase());
                    const blocked = mode === "issue" && (!ok || Number(l.available_kg || 0) <= 0);
                    return (
                      <SelectItem key={l.id} value={l.id} disabled={blocked}>
                        {l.lot_id} • Heat {l.heat_no || "?"} • {l.alloy} {l.material_size_mm} •{" "}
                        {mode === "issue" ? `${Number(l.available_kg || 0).toFixed(1)} kg free${!ok ? ` • QC ${l.qc_status || "pending"}` : ""}` : `${(withWO[l.id] || 0).toFixed(1)} kg with WO`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Production batch{mode === "issue" ? "" : " (optional)"}</Label>
              <Select value={f.batch} onValueChange={v => setF({ ...f, batch: v })}>
                <SelectTrigger><SelectValue placeholder={batches.length ? "Select batch" : "No batches yet"} /></SelectTrigger>
                <SelectContent>{batches.map(b => <SelectItem key={b.id} value={b.id}>Batch #{b.batch_number}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>kg</Label><Input type="number" min={0} value={f.kg} onChange={e => setF({ ...f, kg: e.target.value })} /></div>
              {mode === "issue" && <div className="space-y-1"><Label>pcs (optional)</Label><Input type="number" min={0} value={f.pcs} onChange={e => setF({ ...f, pcs: e.target.value })} /></div>}
              {mode === "scrap" && (
                <div className="space-y-1"><Label>Scrap type</Label>
                  <Select value={f.scrapType} onValueChange={v => setF({ ...f, scrapType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="chips">Chips</SelectItem><SelectItem value="bar_end">Bar end</SelectItem><SelectItem value="rejected_parts">Rejected parts</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {mode === "scrap" && <div className="space-y-1"><Label>Bag / location</Label><Input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></div>}
            {mode !== "issue" && <div className="space-y-1"><Label>Notes</Label><Input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMode(null)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
