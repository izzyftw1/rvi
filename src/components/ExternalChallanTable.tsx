import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, AlertTriangle, Clock, CheckCircle2, PackageX } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/displayUtils";
import { differenceInDays, parseISO, format } from "date-fns";

interface ExternalMove {
  id: string;
  challan_no: string;
  process: string;
  partner_id: string | null;
  quantity_sent: number;
  quantity_returned: number;
  dispatch_date: string;
  expected_return_date: string | null;
  returned_date: string | null;
  status: string;
  remarks: string | null;
}

interface Partner {
  id: string;
  name: string;
}

interface ExternalChallanTableProps {
  workOrderId: string;
  externalMoves?: any[];
}

type ChallanStatus = 'sent' | 'partial' | 'completed' | 'overdue';

const STATUS_CONFIG: Record<ChallanStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  sent: { label: 'Sent', variant: 'secondary', icon: Truck },
  partial: { label: 'Partial', variant: 'outline', icon: Clock },
  completed: { label: 'Completed', variant: 'default', icon: CheckCircle2 },
  overdue: { label: 'Overdue', variant: 'destructive', icon: AlertTriangle },
};

export function ExternalChallanTable({ workOrderId, externalMoves: propMoves }: ExternalChallanTableProps) {
  const [moves, setMoves] = useState<ExternalMove[]>([]);
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [workOrderId]);

  const loadData = async () => {
    try {
      // Load external moves
      const { data: movesData } = await supabase
        .from("wo_external_moves")
        .select("*")
        .eq("work_order_id", workOrderId)
        .order("dispatch_date", { ascending: false });

      const mappedMoves: ExternalMove[] = (movesData || []).map((m: any) => ({
        id: m.id,
        challan_no: m.challan_no || `CH-${m.id.slice(0, 6).toUpperCase()}`,
        process: m.process || 'Unknown',
        partner_id: m.partner_id,
        quantity_sent: m.quantity_sent || m.qty_sent || 0,
        quantity_returned: m.quantity_returned || m.qty_returned || 0,
        dispatch_date: m.dispatch_date,
        expected_return_date: m.expected_return_date,
        returned_date: m.returned_date,
        status: m.status || 'sent',
        remarks: m.remarks,
      }));

      setMoves(mappedMoves);

      // Load partner names
      const partnerIds = [...new Set(mappedMoves.map(m => m.partner_id).filter(Boolean))] as string[];
      if (partnerIds.length > 0) {
        const { data: partnersData } = await supabase
          .from("external_partners")
          .select("id, name")
          .in("id", partnerIds);

        const partnersMap: Record<string, string> = {};
        (partnersData || []).forEach((p: Partner) => {
          partnersMap[p.id] = p.name;
        });
        setPartners(partnersMap);
      }
    } catch (error) {
      console.error("Error loading external moves:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateOverdueDays = (expectedDate: string | null, returnedDate: string | null): number | null => {
    if (!expectedDate) return null;
    
    const expected = parseISO(expectedDate);
    const compareDate = returnedDate ? parseISO(returnedDate) : new Date();
    const diff = differenceInDays(compareDate, expected);
    
    return diff > 0 ? diff : null;
  };

  const getEffectiveStatus = (move: ExternalMove): ChallanStatus => {
    const balance = move.quantity_sent - move.quantity_returned;
    const overdueDays = calculateOverdueDays(move.expected_return_date, move.returned_date);
    
    if (balance === 0) return 'completed';
    if (overdueDays && overdueDays > 0 && !move.returned_date) return 'overdue';
    if (move.quantity_returned > 0 && balance > 0) return 'partial';
    return 'sent';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading external processing data...
        </CardContent>
      </Card>
    );
  }

  if (moves.length === 0) {
    return null; // Don't show section if no external moves
  }

  // Calculate summary stats
  const totalSent = moves.reduce((sum, m) => sum + m.quantity_sent, 0);
  const totalReturned = moves.reduce((sum, m) => sum + m.quantity_returned, 0);
  const totalPending = totalSent - totalReturned;
  const overdueCount = moves.filter(m => getEffectiveStatus(m) === 'overdue').length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">External Processing</CardTitle>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="font-bold">{formatCount(totalSent, true)}</span>
              <span className="text-muted-foreground ml-1">sent</span>
            </div>
            <div>
              <span className="font-bold">{formatCount(totalReturned, true)}</span>
              <span className="text-muted-foreground ml-1">returned</span>
            </div>
            {totalPending > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-500/50">
                {totalPending} pending
              </Badge>
            )}
            {overdueCount > 0 && (
              <Badge variant="destructive">
                {overdueCount} overdue
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
                <TableHead className="w-[120px]">Challan No.</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right w-[80px]">Sent</TableHead>
                <TableHead className="text-right w-[80px]">Received</TableHead>
                <TableHead className="text-right w-[80px]">Pending</TableHead>
                <TableHead className="w-[100px]">Sent Date</TableHead>
                <TableHead className="w-[100px]">Expected</TableHead>
                <TableHead className="text-right w-[80px]">Overdue</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moves.map((move) => {
                const balance = move.quantity_sent - move.quantity_returned;
                const overdueDays = calculateOverdueDays(move.expected_return_date, move.returned_date);
                const effectiveStatus = getEffectiveStatus(move);
                const statusConfig = STATUS_CONFIG[effectiveStatus];
                const StatusIcon = statusConfig.icon;

                return (
                  <TableRow key={move.id} className={cn(
                    effectiveStatus === 'overdue' && "bg-destructive/5"
                  )}>
                    <TableCell className="font-mono text-sm font-medium">
                      {move.challan_no}
                    </TableCell>
                    <TableCell>
                      <span className="capitalize">{move.process}</span>
                    </TableCell>
                    <TableCell>
                      {move.partner_id ? partners[move.partner_id] || '—' : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCount(move.quantity_sent, true)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCount(move.quantity_returned, true)}
                    </TableCell>
                    <TableCell className="text-right">
                      {balance > 0 ? (
                        <span className="font-medium text-amber-600 dark:text-amber-400">
                          {balance}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {move.dispatch_date ? format(parseISO(move.dispatch_date), 'dd MMM yy') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {move.expected_return_date ? format(parseISO(move.expected_return_date), 'dd MMM yy') : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {overdueDays && overdueDays > 0 && !move.returned_date ? (
                        <span className="font-bold text-destructive flex items-center justify-end gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {overdueDays}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
