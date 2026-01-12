import { memo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Download, Search, ExternalLink, CheckCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { downloadCSV } from "@/lib/exportHelpers";
import type { DispatchRecord } from "@/hooks/useLogisticsData";

interface DispatchHistoryTableProps {
  dispatches: DispatchRecord[];
}

export const DispatchHistoryTable = memo(({ dispatches }: DispatchHistoryTableProps) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filteredDispatches = dispatches.filter(d => {
    const searchLower = search.toLowerCase();
    return (
      d.work_order?.display_id?.toLowerCase().includes(searchLower) ||
      d.work_order?.customer?.toLowerCase().includes(searchLower) ||
      d.work_order?.item_code?.toLowerCase().includes(searchLower) ||
      d.shipment?.ship_id?.toLowerCase().includes(searchLower)
    );
  });

  const handleExport = () => {
    const exportData = filteredDispatches.map(d => ({
      "Dispatch Date": format(new Date(d.dispatched_at), "yyyy-MM-dd HH:mm"),
      "Work Order": d.work_order?.display_id || "",
      "Customer": d.work_order?.customer || "",
      "Item Code": d.work_order?.item_code || "",
      "Quantity": d.quantity,
      "Shipment #": d.shipment?.ship_id || "—",
      "Status": d.shipment?.status || "standalone",
    }));
    downloadCSV(exportData, `dispatch-history-${format(new Date(), "yyyy-MM-dd")}`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Dispatch History (Audit-Ready)
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search dispatches..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[320px]">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[140px]">Date</TableHead>
                <TableHead>Work Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Shipment</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDispatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No dispatch records found
                  </TableCell>
                </TableRow>
              ) : (
                filteredDispatches.slice(0, 50).map((dispatch) => (
                  <TableRow key={dispatch.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-xs">
                      {format(new Date(dispatch.dispatched_at), "MMM dd, HH:mm")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {dispatch.work_order?.display_id || "—"}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {dispatch.work_order?.customer || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {dispatch.work_order?.item_code || "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {dispatch.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {dispatch.shipment?.ship_id || (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {dispatch.shipment?.status === "delivered" ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Delivered
                        </Badge>
                      ) : dispatch.shipment?.status === "in_transit" ? (
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          In Transit
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Dispatched</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => navigate(`/work-orders/${dispatch.wo_id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
        {filteredDispatches.length > 50 && (
          <div className="p-2 border-t text-center">
            <span className="text-xs text-muted-foreground">
              Showing 50 of {filteredDispatches.length} records
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

DispatchHistoryTable.displayName = "DispatchHistoryTable";
