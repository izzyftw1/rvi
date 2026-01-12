import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, ArrowRight, AlertTriangle } from "lucide-react";
import { differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { FinishedGoodsItem } from "@/hooks/useLogisticsData";

interface FinishedGoodsVisibilityProps {
  items: FinishedGoodsItem[];
}

export const FinishedGoodsVisibility = memo(({ items }: FinishedGoodsVisibilityProps) => {
  const navigate = useNavigate();

  const summary = useMemo(() => {
    const totalQty = items.reduce((sum, i) => sum + (i.quantity - i.dispatched_qty), 0);
    const totalWeight = items.reduce((sum, i) => sum + i.net_weight, 0);
    
    const today = new Date();
    const ageingItems = items.filter(i => differenceInDays(today, new Date(i.built_at)) > 30);
    const ageingQty = ageingItems.reduce((sum, i) => sum + (i.quantity - i.dispatched_qty), 0);

    return { totalQty, totalWeight, ageingQty, ageingCount: ageingItems.length, totalCartons: items.length };
  }, [items]);

  const getAgeBadge = (builtAt: string) => {
    const days = differenceInDays(new Date(), new Date(builtAt));
    if (days <= 7) return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 text-xs">{days}d</Badge>;
    if (days <= 15) return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 text-xs">{days}d</Badge>;
    if (days <= 30) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 text-xs">{days}d</Badge>;
    return <Badge variant="destructive" className="text-xs">{days}d</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" />
            Packed Stock Overview
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => navigate("/finished-goods")}
          >
            View All
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Available Qty</p>
            <p className="text-lg font-bold">{summary.totalQty.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Cartons</p>
            <p className="text-lg font-bold">{summary.totalCartons.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Total Weight</p>
            <p className="text-lg font-bold">{(summary.totalWeight / 1000).toFixed(1)} T</p>
          </div>
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              Ageing (&gt;30d)
            </p>
            <p className="text-lg font-bold text-red-600">{summary.ageingQty.toLocaleString()}</p>
          </div>
        </div>

        {/* Items Table */}
        <ScrollArea className="h-[200px]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Carton ID</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-center">Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No packed stock in inventory
                  </TableCell>
                </TableRow>
              ) : (
                items.slice(0, 20).map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-xs font-medium">
                      {item.carton_id}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.item_code}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-sm">
                      {item.customer || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {(item.quantity - item.dispatched_qty).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">
                      {getAgeBadge(item.built_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
});

FinishedGoodsVisibility.displayName = "FinishedGoodsVisibility";
