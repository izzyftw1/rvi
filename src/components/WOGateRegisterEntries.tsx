import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Inbox, Send, Package, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";

interface GateEntry {
  id: string;
  gate_entry_no: string;
  direction: 'in' | 'out';
  material_type: string;
  entry_date: string;
  entry_time: string;
  item_name: string | null;
  process_type: string | null;
  gross_weight_kg: number;
  net_weight_kg: number | null;
  estimated_pcs: number | null;
  challan_no: string | null;
  dc_number: string | null;
  partner_name: string | null;
  qc_required: boolean;
  qc_status: string | null;
  status: string | null;
  remarks: string | null;
}

interface WOGateRegisterEntriesProps {
  workOrderId: string;
}

export function WOGateRegisterEntries({ workOrderId }: WOGateRegisterEntriesProps) {
  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntries();

    // Set up real-time subscription
    const channel = supabase
      .channel(`wo_gate_register_${workOrderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gate_register',
          filter: `work_order_id=eq.${workOrderId}`,
        },
        () => loadEntries()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId]);

  const loadEntries = async () => {
    try {
      setLoading(true);
      
      // Fetch gate register entries with partner name
      const { data, error } = await supabase
        .from("gate_register")
        .select(`
          id,
          gate_entry_no,
          direction,
          material_type,
          entry_date,
          entry_time,
          item_name,
          process_type,
          gross_weight_kg,
          net_weight_kg,
          estimated_pcs,
          challan_no,
          dc_number,
          qc_required,
          qc_status,
          status,
          remarks,
          partner_id
        `)
        .eq("work_order_id", workOrderId)
        .order("entry_time", { ascending: false });

      if (error) throw error;

      // Fetch partner names
      const partnerIds = [...new Set((data || []).map((e: any) => e.partner_id).filter(Boolean))];
      let partnersMap: Record<string, string> = {};
      
      if (partnerIds.length > 0) {
        const { data: partnersData } = await supabase
          .from("external_partners")
          .select("id, name")
          .in("id", partnerIds);
        
        (partnersData || []).forEach((p: any) => {
          partnersMap[p.id] = p.name;
        });
      }

      const mappedEntries: GateEntry[] = (data || []).map((e: any) => ({
        id: e.id,
        gate_entry_no: e.gate_entry_no,
        direction: e.direction,
        material_type: e.material_type,
        entry_date: e.entry_date,
        entry_time: e.entry_time,
        item_name: e.item_name,
        process_type: e.process_type,
        gross_weight_kg: e.gross_weight_kg,
        net_weight_kg: e.net_weight_kg,
        estimated_pcs: e.estimated_pcs,
        challan_no: e.challan_no,
        dc_number: e.dc_number,
        partner_name: e.partner_id ? partnersMap[e.partner_id] || null : null,
        qc_required: e.qc_required || false,
        qc_status: e.qc_status,
        status: e.status,
        remarks: e.remarks,
      }));

      setEntries(mappedEntries);
    } catch (error) {
      console.error("Error loading gate register entries:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDirectionBadge = (direction: 'in' | 'out') => {
    if (direction === 'in') {
      return (
        <Badge variant="outline" className="gap-1 border-green-500 text-green-700 bg-green-50 dark:bg-green-950/30">
          <Inbox className="h-3 w-3" />
          IN
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/30">
        <Send className="h-3 w-3" />
        OUT
      </Badge>
    );
  };

  const getQCStatusBadge = (qcRequired: boolean, qcStatus: string | null) => {
    if (!qcRequired) return <span className="text-muted-foreground text-xs">N/A</span>;
    
    switch (qcStatus) {
      case 'passed':
        return <Badge className="gap-1 bg-green-600"><CheckCircle2 className="h-3 w-3" />Passed</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Failed</Badge>;
      case 'pending':
      default:
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading gate register entries...
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return null; // Don't show if no entries
  }

  // Summary stats
  const inCount = entries.filter(e => e.direction === 'in').length;
  const outCount = entries.filter(e => e.direction === 'out').length;
  const pendingQC = entries.filter(e => e.qc_required && e.qc_status !== 'passed').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Gate Register Entries</CardTitle>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Inbox className="h-4 w-4 text-green-600" />
              <span className="font-bold">{inCount}</span>
              <span className="text-muted-foreground">in</span>
            </div>
            <div className="flex items-center gap-1">
              <Send className="h-4 w-4 text-amber-600" />
              <span className="font-bold">{outCount}</span>
              <span className="text-muted-foreground">out</span>
            </div>
            {pendingQC > 0 && (
              <Badge variant="secondary">
                {pendingQC} pending QC
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[100px]">Entry No.</TableHead>
                <TableHead className="w-[80px]">Direction</TableHead>
                <TableHead>Type / Process</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Qty (pcs)</TableHead>
                <TableHead className="text-right">Weight (kg)</TableHead>
                <TableHead>Challan/DC</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>QC Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {entry.gate_entry_no}
                  </TableCell>
                  <TableCell>
                    {getDirectionBadge(entry.direction)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="capitalize">{entry.material_type?.replace(/_/g, ' ')}</span>
                      {entry.process_type && (
                        <p className="text-xs text-muted-foreground capitalize">
                          {entry.process_type.replace(/_/g, ' ')}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.partner_name || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {entry.estimated_pcs ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.net_weight_kg?.toFixed(2) || entry.gross_weight_kg?.toFixed(2) || '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.challan_no || entry.dc_number || '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {format(parseISO(entry.entry_time), 'dd MMM yy HH:mm')}
                  </TableCell>
                  <TableCell>
                    {getQCStatusBadge(entry.qc_required, entry.qc_status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
