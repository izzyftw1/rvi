import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, ArrowRight, AlertTriangle } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import type { FinishedGoodsItem } from "@/hooks/useLogisticsData";

interface FinishedGoodsVisibilityProps {
  items: FinishedGoodsItem[];
}

export const FinishedGoodsVisibility = memo(({ items }: FinishedGoodsVisibilityProps) => {
  const navigate = useNavigate();

  const summary = useMemo(() => {
    const totalQty = items.reduce((sum, i) => sum + i.quantity_available, 0);
    const reservedQty = items.reduce((sum, i) => sum + i.quantity_reserved, 0);
    const totalValue = items.reduce((sum, i) => sum + (i.quantity_available * (i.unit_cost || 0)), 0);
    
    const today = new Date();
    const ageingItems = items.filter(i => differenceInDays(today, new Date(i.created_at)) > 90);
    const ageingValue = ageingItems.reduce((sum, i) => sum + (i.quantity_available * (i.unit_cost || 0)), 0);

    return { totalQty, reservedQty, totalValue, ageingValue, ageingCount: ageingItems.length };
  }, [items]);

  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
    return `₹${value.toLocaleString()}`;
  };

  const getAgeBadge = (createdAt: string) => {
    const days = differenceInDays(new Date(), new Date(createdAt));
    if (days <= 30) return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 text-xs">{days}d</Badge>;
    if (days <= 90) return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 text-xs">{days}d</Badge>;
    if (days <= 180) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 text-xs">{days}d</Badge>;
    return <Badge variant="destructive" className="text-xs">{days}d</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="h-4 w-4" />
            Finished Goods Visibility
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
            <p className="text-xs text-muted-foreground">Unpacked Stock</p>
            <p className="text-lg font-bold">{summary.totalQty.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Reserved</p>
            <p className="text-lg font-bold text-amber-600">{summary.reservedQty.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Total Value</p>
            <p className="text-lg font-bold">{formatCurrency(summary.totalValue)}</p>
          </div>
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-red-500" />
              Value at Risk (&gt;90d)
            </p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(summary.ageingValue)}</p>
          </div>
        </div>

        {/* Items Table */}
        <ScrollArea className="h-[200px]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead>Item Code</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-center">Age</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    No finished goods in inventory
                  </TableCell>
                </TableRow>
              ) : (
                items.slice(0, 20).map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-xs font-medium">
                      {item.item_code}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-sm">
                      {item.customer_name || <span className="text-muted-foreground">Unallocated</span>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {item.quantity_available.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-amber-600">
                      {item.quantity_reserved > 0 ? item.quantity_reserved.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {getAgeBadge(item.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => navigate("/packing")}
                      >
                        Pack
                      </Button>
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
