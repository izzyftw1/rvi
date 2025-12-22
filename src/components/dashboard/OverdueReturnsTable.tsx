import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  AlertTriangle, 
  Clock, 
  ExternalLink,
  Phone,
  Calendar,
  Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays, parseISO } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface OverdueReturn {
  id: string;
  workOrderId: string;
  workOrderDisplay: string;
  process: string;
  partnerName: string;
  partnerId: string;
  sentDate: string;
  expectedReturn: string;
  pcsPending: number;
  daysOverdue: number;
}

interface OverdueReturnsTableProps {
  selectedProcess?: string | null;
}

export const OverdueReturnsTable = ({ selectedProcess }: OverdueReturnsTableProps) => {
  const navigate = useNavigate();
  const [overdueReturns, setOverdueReturns] = useState<OverdueReturn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverdueReturns = async () => {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      // Fetch overdue external moves
      const { data: moves, error } = await supabase
        .from('wo_external_moves')
        .select(`
          id,
          work_order_id,
          process,
          quantity_sent,
          quantity_returned,
          dispatch_date,
          expected_return_date,
          partner_id,
          work_orders!wo_external_moves_work_order_id_fkey (
            id,
            display_id,
            item_code
          ),
          external_partners!wo_external_moves_partner_id_fkey (
            id,
            name
          )
        `)
        .eq('status', 'sent')
        .lt('expected_return_date', today)
        .order('expected_return_date', { ascending: true });

      if (error) {
        console.error('Error fetching overdue returns:', error);
        setLoading(false);
        return;
      }

      const overdueList: OverdueReturn[] = (moves || []).map(move => {
        const pendingQty = (move.quantity_sent || 0) - (move.quantity_returned || 0);
        const expectedDate = move.expected_return_date ? parseISO(move.expected_return_date) : new Date();
        const daysOverdue = differenceInDays(new Date(), expectedDate);

        return {
          id: move.id,
          workOrderId: move.work_order_id,
          workOrderDisplay: move.work_orders?.display_id || move.work_orders?.item_code || 'N/A',
          process: move.process || 'Unknown',
          partnerName: move.external_partners?.name || 'Unknown Partner',
          partnerId: move.partner_id || '',
          sentDate: move.dispatch_date || '',
          expectedReturn: move.expected_return_date || '',
          pcsPending: pendingQty,
          daysOverdue: daysOverdue
        };
      }).filter(item => item.pcsPending > 0);

      setOverdueReturns(overdueList);
      setLoading(false);
    };

    fetchOverdueReturns();

    // Set up realtime subscription
    const channel = supabase
      .channel('overdue-returns-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, () => {
        fetchOverdueReturns();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter by selected process if provided
  const filteredReturns = selectedProcess
    ? overdueReturns.filter(r => 
        r.process.toLowerCase().includes(selectedProcess.replace('_ext', '').replace('_', ' ').toLowerCase()) ||
        r.process.toLowerCase().replace(' ', '_').includes(selectedProcess.toLowerCase())
      )
    : overdueReturns;

  const getSeverityColor = (daysOverdue: number): string => {
    if (daysOverdue > 7) return 'text-destructive';
    if (daysOverdue > 3) return 'text-amber-600';
    return 'text-amber-500';
  };

  const getSeverityBadge = (daysOverdue: number) => {
    if (daysOverdue > 7) return <Badge variant="destructive">Critical</Badge>;
    if (daysOverdue > 3) return <Badge className="bg-amber-500 hover:bg-amber-600">Warning</Badge>;
    return <Badge variant="outline" className="border-amber-500 text-amber-600">Overdue</Badge>;
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Overdue Returns
              {filteredReturns.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {filteredReturns.length}
                </Badge>
              )}
              {selectedProcess && (
                <Badge variant="secondary" className="text-xs capitalize">
                  {selectedProcess.replace('_ext', '').replace('_', ' ')}
                </Badge>
              )}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => navigate('/partners?filter=overdue')}
            >
              View All <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Clock className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground/50" />
              Loading overdue returns...
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm text-muted-foreground">No overdue returns</p>
              <p className="text-xs text-muted-foreground/70">All external jobs are on track</p>
            </div>
          ) : (
            <ScrollArea className="h-[280px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="text-xs w-[120px]">Work Order</TableHead>
                    <TableHead className="text-xs w-[90px]">Process</TableHead>
                    <TableHead className="text-xs">Partner</TableHead>
                    <TableHead className="text-xs w-[85px]">Sent</TableHead>
                    <TableHead className="text-xs w-[85px]">Expected</TableHead>
                    <TableHead className="text-xs text-right w-[70px]">Pcs</TableHead>
                    <TableHead className="text-xs text-right w-[90px]">Overdue</TableHead>
                    <TableHead className="text-xs w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReturns.map((item, index) => (
                    <TableRow 
                      key={item.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                        index === 0 && item.daysOverdue > 7 && "bg-destructive/5"
                      )}
                      onClick={() => navigate(`/work-orders/${item.workOrderId}`)}
                    >
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-medium text-sm truncate block max-w-[110px]">
                              {item.workOrderDisplay}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{item.workOrderDisplay}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {item.process}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span 
                              className="text-sm truncate block max-w-[120px] hover:text-primary hover:underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/partners?partner=${item.partnerId}`);
                              }}
                            >
                              {item.partnerName}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{item.partnerName}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {item.sentDate ? format(parseISO(item.sentDate), 'dd MMM') : '-'}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-muted-foreground">
                        {item.expectedReturn ? format(parseISO(item.expectedReturn), 'dd MMM') : '-'}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <span className="font-semibold text-sm">
                          {item.pcsPending.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Clock className={cn("h-3 w-3", getSeverityColor(item.daysOverdue))} />
                          <span className={cn("font-bold text-sm", getSeverityColor(item.daysOverdue))}>
                            {item.daysOverdue}d
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/partners?partner=${item.partnerId}&action=followup`);
                              }}
                            >
                              <Phone className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Follow up</TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
};
