import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ArrowUpRight, ArrowDownLeft, AlertCircle } from "lucide-react";

interface ExternalMovementsTabProps {
  workOrderId: string;
}

interface GoodsOutEntry {
  id: string;
  process: string;
  qty_out: number;
  challan_no: string;
  dispatch_date: string;
  partner_name: string;
}

interface GoodsInEntry {
  id: string;
  process: string;
  qty_in: number;
  grn_no: string | null;
  receipt_date: string;
  partner_name: string;
}

export const ExternalMovementsTab = ({ workOrderId }: ExternalMovementsTabProps) => {
  const [goodsOut, setGoodsOut] = useState<GoodsOutEntry[]>([]);
  const [goodsIn, setGoodsIn] = useState<GoodsInEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLedgers();

    const channel = supabase
      .channel('external_ledgers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goods_out_ledger', filter: `work_order_id=eq.${workOrderId}` }, loadLedgers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goods_in_ledger', filter: `work_order_id=eq.${workOrderId}` }, loadLedgers)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  const loadLedgers = async () => {
    try {
      setLoading(true);

      // Load goods out
      const { data: outData } = await supabase
        .from("goods_out_ledger" as any)
        .select(`
          id,
          process,
          qty_out,
          challan_no,
          dispatch_date,
          external_partners!inner(name)
        `)
        .eq("work_order_id", workOrderId)
        .order("dispatch_date", { ascending: false });

      // Load goods in
      const { data: inData } = await supabase
        .from("goods_in_ledger" as any)
        .select(`
          id,
          process,
          qty_in,
          grn_no,
          receipt_date,
          external_partners!inner(name)
        `)
        .eq("work_order_id", workOrderId)
        .order("receipt_date", { ascending: false });

      const mappedOut = (outData || []).map((item: any) => ({
        id: item.id,
        process: item.process,
        qty_out: item.qty_out,
        challan_no: item.challan_no,
        dispatch_date: item.dispatch_date,
        partner_name: item.external_partners?.name || 'Unknown',
      }));

      const mappedIn = (inData || []).map((item: any) => ({
        id: item.id,
        process: item.process,
        qty_in: item.qty_in,
        grn_no: item.grn_no,
        receipt_date: item.receipt_date,
        partner_name: item.external_partners?.name || 'Unknown',
      }));

      setGoodsOut(mappedOut);
      setGoodsIn(mappedIn);
    } catch (error) {
      console.error("Error loading ledgers:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading external movements...</div>;
  }

  const totalOut = goodsOut.reduce((sum, item) => sum + item.qty_out, 0);
  const totalIn = goodsIn.reduce((sum, item) => sum + item.qty_in, 0);
  const netOut = totalOut - totalIn;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Out</p>
                <p className="text-2xl font-bold">{totalOut}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total In</p>
                <p className="text-2xl font-bold">{totalIn}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm text-muted-foreground">Net External WIP</p>
                <p className="text-2xl font-bold">{netOut}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Goods Out Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Goods Out Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {goodsOut.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No outward movements</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Challan No</TableHead>
                  <TableHead>Process</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Qty Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goodsOut.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{format(new Date(item.dispatch_date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-mono text-sm">{item.challan_no}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {item.process.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.partner_name}</TableCell>
                    <TableCell className="text-right font-medium">{item.qty_out}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Goods In Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Goods In Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {goodsIn.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No inward receipts</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>GRN/Invoice</TableHead>
                  <TableHead>Process</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead className="text-right">Qty In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {goodsIn.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{format(new Date(item.receipt_date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-mono text-sm">{item.grn_no || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {item.process.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.partner_name}</TableCell>
                    <TableCell className="text-right font-medium">{item.qty_in}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
