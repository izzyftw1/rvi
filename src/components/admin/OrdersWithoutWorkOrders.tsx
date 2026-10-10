import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface MissingLine { id: string; soNumber: string; lineNumber: number; itemCode: string }

export function OrdersWithoutWorkOrders() {
  const [lines, setLines] = useState<MissingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    setFailure(null);
    try {
      const { data: orders, error: orderError } = await supabase.from("sales_orders").select("id, so_id").eq("status", "approved").eq("is_archived", false);
      if (orderError) throw orderError;
      if (!orders?.length) { setLines([]); return; }
      const { data: orderLines, error: lineError } = await supabase.from("sales_order_line_items").select("id, sales_order_id, line_number, item_code, work_order_id").eq("status", "approved").in("sales_order_id", orders.map(order => order.id));
      if (lineError) throw lineError;
      const { data: wos, error: woError } = await supabase.from("work_orders").select("id, sales_order_line_id").in("so_id", orders.map(order => order.id));
      if (woError) throw woError;
      const ids = new Set(wos?.map(wo => wo.id));
      const lineIds = new Set(wos?.map(wo => wo.sales_order_line_id));
      setLines((orderLines || []).filter(line => !ids.has(line.work_order_id || "") && !lineIds.has(line.id)).map(line => ({
        id: line.id, soNumber: orders.find(order => order.id === line.sales_order_id)?.so_id || "", lineNumber: line.line_number, itemCode: line.item_code,
      })));
    } catch (error) {
      const message = error instanceof Error ? error.message : (error as { message?: string }).message || String(error);
      setFailure(message);
      toast({ variant: "destructive", description: message });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const recover = async () => {
    setRecovering(true);
    try {
      const { data, error } = await supabase.rpc("recover_missing_work_orders", { p_line_ids: lines.map(line => line.id) });
      if (error) throw error;
      const result = data as { wo_numbers: string[] };
      toast({ description: result.wo_numbers.length ? `Created: ${result.wo_numbers.join(", ")}` : "No missing work orders remain" });
      await load();
    } catch (error) {
      toast({ variant: "destructive", description: (error as { message?: string }).message || String(error) });
    } finally { setRecovering(false); }
  };

  return <Card>
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <CardTitle>Orders without work orders</CardTitle>
      <Button onClick={recover} disabled={loading || recovering || !!failure || lines.length === 0}>{recovering ? "Creating…" : "Create missing WOs"}</Button>
    </CardHeader>
    <CardContent>
      {failure ? <p className="text-destructive">{failure}</p> : loading ? <p className="text-muted-foreground">Loading…</p> : lines.length ? <ul className="divide-y divide-border">{lines.map(line => <li key={line.id} className="py-2 text-sm">{line.soNumber} · Line {line.lineNumber} · {line.itemCode}</li>)}</ul> : <p className="text-sm text-muted-foreground">No missing work orders</p>}
    </CardContent>
  </Card>;
}