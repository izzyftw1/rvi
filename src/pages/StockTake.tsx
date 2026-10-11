import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function StockTake() {
  const [takes, setTakes] = useState<any[]>([]);
  const [current, setCurrent] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadTakes = useCallback(async () => {
    const { data, error } = await supabase.from("stock_takes").select("*").order("created_at", { ascending: false }).limit(24);
    if (error) return toast.error(error.message);
    setTakes(data || []);
    setCurrent((c: any) => (c ? data?.find(t => t.id === c.id) : data?.find(t => t.status === "counting")) || null);
  }, []);

  const loadLines = useCallback(async (id: string) => {
    const { data, error } = await supabase.from("stock_take_lines")
      .select("*, material_lots(lot_id, heat_no, alloy, material_size_mm)").eq("stock_take_id", id);
    if (error) return toast.error(error.message);
    setLines((data || []).sort((a: any, b: any) => (a.material_lots?.lot_id || "").localeCompare(b.material_lots?.lot_id || "")));
  }, []);

  useEffect(() => { loadTakes(); }, [loadTakes]);
  useEffect(() => { if (current) loadLines(current.id); else setLines([]); }, [current, loadLines]);

  const start = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("start_stock_take", { p_notes: null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Stock take started — system kg frozen");
    setCurrent({ id: data, status: "counting" });
    loadTakes();
  };

  const setPhysical = async (line: any, value: string) => {
    const v = value === "" ? null : Number(value);
    const { error } = await supabase.from("stock_take_lines").update({ physical_kg: v }).eq("id", line.id);
    if (error) return toast.error(error.message);
    setLines(ls => ls.map(l => l.id === line.id ? { ...l, physical_kg: v, variance_kg: v == null ? null : v - Number(l.system_kg) } : l));
  };

  const approve = async () => {
    if (!current) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("approve_stock_take", { p_stock_take_id: current.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Approved — ${data} adjustment(s) written`);
    loadTakes(); loadLines(current.id);
  };

  const counting = current?.status === "counting";
  const totalVar = lines.reduce((s, l) => s + Number(l.variance_kg || 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Raw Material Stock Take</h1>
        <Button onClick={start} disabled={busy || takes.some(t => t.status === "counting")}>Start count</Button>
      </div>

      {takes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {takes.map(t => (
            <Button key={t.id} size="sm" variant={current?.id === t.id ? "default" : "outline"} onClick={() => setCurrent(t)}>
              {t.take_date} {t.status === "counting" ? "(counting)" : ""}
            </Button>
          ))}
        </div>
      )}

      {current && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              Count {current.take_date || ""} <Badge variant={counting ? "secondary" : "default"}>{current.status}</Badge>
            </CardTitle>
            <div className="flex items-center gap-4">
              <span className="text-sm">Net variance: <b>{totalVar.toFixed(2)} kg</b></span>
              {counting && <Button onClick={approve} disabled={busy}>Approve & adjust</Button>}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Lot</TableHead><TableHead>Heat</TableHead><TableHead>Material</TableHead><TableHead className="text-right">System kg</TableHead><TableHead className="text-right w-40">Physical kg</TableHead><TableHead className="text-right">Variance</TableHead></TableRow></TableHeader>
              <TableBody>
                {lines.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No lots with stock</TableCell></TableRow>}
                {lines.map(l => {
                  const v = l.variance_kg == null ? null : Number(l.variance_kg);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs">{l.material_lots?.lot_id}</TableCell>
                      <TableCell>{l.material_lots?.heat_no || "—"}</TableCell>
                      <TableCell>{l.material_lots?.alloy} {l.material_lots?.material_size_mm}</TableCell>
                      <TableCell className="text-right">{Number(l.system_kg).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {counting ? (
                          <Input type="number" min={0} className="text-right" defaultValue={l.physical_kg ?? ""} onBlur={e => setPhysical(l, e.target.value)} />
                        ) : (l.physical_kg ?? "—")}
                      </TableCell>
                      <TableCell className={`text-right ${v ? (v < 0 ? "text-destructive" : "text-primary") : ""}`}>{v == null ? "—" : v.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
