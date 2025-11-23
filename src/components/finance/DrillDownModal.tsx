import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { downloadExcel, downloadPDF } from "@/lib/exportHelpers";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

interface DrillDownModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  type: 'revenue' | 'customer' | 'item' | 'scrap' | 'region' | 'profitability';
  data: any[];
  metadata?: any;
}

export function DrillDownModal({ open, onClose, title, type, data, metadata }: DrillDownModalProps) {
  const handleExportExcel = () => {
    const exportData = formatDataForExport(data, type);
    downloadExcel(exportData, `${title.replace(/\s+/g, '_')}_DrillDown.xlsx`, 'Details');
  };

  const handleExportPDF = () => {
    const columns = getColumnsForType(type);
    const exportData = formatDataForExport(data, type);
    downloadPDF(exportData, `${title.replace(/\s+/g, '_')}_DrillDown.pdf`, title, columns);
  };

  const formatDataForExport = (data: any[], type: string) => {
    switch (type) {
      case 'customer':
        return data.map(d => ({
          'Month': d.month,
          'Item Code': d.item_code,
          'Quantity': d.quantity,
          'Revenue': d.revenue,
          'Avg Price': d.avg_price
        }));
      case 'item':
        return data.map(d => ({
          'Month': d.month,
          'Customer': d.customer,
          'Quantity Sold': d.quantity,
          'Revenue': d.revenue,
          'Avg Price': d.avg_price
        }));
      case 'revenue':
        return data.map(d => ({
          'Date': d.date,
          'Customer': d.customer,
          'Invoice No': d.invoice_no,
          'Amount': d.amount,
          'Status': d.status
        }));
      case 'scrap':
        return data.map(d => ({
          'Date': d.date,
          'WO ID': d.wo_id,
          'Item': d.item_code,
          'Scrap Qty': d.scrap_qty,
          'Total Qty': d.total_qty,
          'Scrap %': d.scrap_percent
        }));
      case 'region':
        return data.map(d => ({
          'Customer': d.customer,
          'City': d.city,
          'State': d.state,
          'Total Orders': d.order_count,
          'Revenue': d.revenue
        }));
      case 'profitability':
        return data.map(d => ({
          'Month': d.month,
          'Revenue': d.revenue,
          'Material Cost': d.material_cost,
          'Labour Cost': d.labour_cost,
          'Scrap Cost': d.scrap_cost,
          'Net Profit': d.net_profit,
          'Profit %': d.profit_percent
        }));
      default:
        return data;
    }
  };

  const getColumnsForType = (type: string) => {
    const columnMap: Record<string, any[]> = {
      customer: [
        { header: 'Month', dataKey: 'month' },
        { header: 'Item Code', dataKey: 'item_code' },
        { header: 'Quantity', dataKey: 'quantity' },
        { header: 'Revenue', dataKey: 'revenue' }
      ],
      item: [
        { header: 'Month', dataKey: 'month' },
        { header: 'Customer', dataKey: 'customer' },
        { header: 'Quantity', dataKey: 'quantity' },
        { header: 'Revenue', dataKey: 'revenue' }
      ],
      revenue: [
        { header: 'Date', dataKey: 'date' },
        { header: 'Customer', dataKey: 'customer' },
        { header: 'Invoice No', dataKey: 'invoice_no' },
        { header: 'Amount', dataKey: 'amount' }
      ],
      scrap: [
        { header: 'Date', dataKey: 'date' },
        { header: 'WO ID', dataKey: 'wo_id' },
        { header: 'Item', dataKey: 'item_code' },
        { header: 'Scrap %', dataKey: 'scrap_percent' }
      ],
      region: [
        { header: 'Customer', dataKey: 'customer' },
        { header: 'City', dataKey: 'city' },
        { header: 'Revenue', dataKey: 'revenue' }
      ],
      profitability: [
        { header: 'Month', dataKey: 'month' },
        { header: 'Revenue', dataKey: 'revenue' },
        { header: 'Net Profit', dataKey: 'net_profit' },
        { header: 'Profit %', dataKey: 'profit_percent' }
      ]
    };
    return columnMap[type] || [];
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{title}</DialogTitle>
          <DialogDescription>
            Detailed breakdown and analysis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Buttons */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>

          {/* Chart Visualization */}
          {renderChart(type, data)}

          {/* Summary Cards */}
          {metadata && renderSummaryCards(type, metadata)}

          {/* Detailed Table */}
          {renderTable(type, data)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function renderChart(type: string, data: any[]) {
  if (data.length === 0) return null;

  switch (type) {
    case 'customer':
    case 'item':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Trend Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" name="Revenue" />
                <Line yAxisId="right" type="monotone" dataKey="quantity" stroke="hsl(var(--chart-2))" name="Quantity" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      );
    
    case 'profitability':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Profitability Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="profit_percent" stroke="hsl(var(--chart-1))" name="Profit %" />
                <Line type="monotone" dataKey="scrap_percent" stroke="hsl(var(--destructive))" name="Scrap %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      );

    case 'region':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Regional Revenue Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="city" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      );

    default:
      return null;
  }
}

function renderSummaryCards(type: string, metadata: any) {
  const cards: { label: string; value: string }[] = [];

  switch (type) {
    case 'customer':
      cards.push(
        { label: 'Total Orders', value: metadata.total_orders?.toString() || '0' },
        { label: 'Total Revenue', value: `$${metadata.total_revenue?.toLocaleString() || '0'}` },
        { label: 'Avg Order Value', value: `$${metadata.avg_order_value?.toLocaleString() || '0'}` }
      );
      break;
    case 'item':
      cards.push(
        { label: 'Total Sold', value: metadata.total_quantity?.toLocaleString() || '0' },
        { label: 'Total Revenue', value: `$${metadata.total_revenue?.toLocaleString() || '0'}` },
        { label: 'Avg Price', value: `$${metadata.avg_price?.toFixed(2) || '0'}` }
      );
      break;
    case 'scrap':
      cards.push(
        { label: 'Total Scrap Qty', value: metadata.total_scrap?.toLocaleString() || '0' },
        { label: 'Avg Scrap %', value: `${metadata.avg_scrap_percent?.toFixed(2) || '0'}%` },
        { label: 'Scrap Cost', value: `$${metadata.scrap_cost?.toLocaleString() || '0'}` }
      );
      break;
  }

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-4">
      {cards.map((card, idx) => (
        <Card key={idx}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{card.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function renderTable(type: string, data: any[]) {
  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  switch (type) {
    case 'customer':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Sales History by Item & Month</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Avg Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell className="font-medium">{row.item_code}</TableCell>
                    <TableCell className="text-right">{row.quantity?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.revenue?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.avg_price?.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );

    case 'item':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Sales History by Customer & Month</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Avg Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell className="font-medium">{row.customer}</TableCell>
                    <TableCell className="text-right">{row.quantity?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.revenue?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.avg_price?.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );

    case 'revenue':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium">{row.invoice_no}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell className="text-right">${row.amount?.toLocaleString()}</TableCell>
                    <TableCell>{row.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );

    case 'scrap':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Scrap Records</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>WO ID</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead className="text-right">Scrap Qty</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Scrap %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="font-medium">{row.wo_id}</TableCell>
                    <TableCell>{row.item_code}</TableCell>
                    <TableCell className="text-right">{row.scrap_qty?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.total_qty?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.scrap_percent?.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );

    case 'region':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Regional Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{row.customer}</TableCell>
                    <TableCell>{row.city}</TableCell>
                    <TableCell>{row.state}</TableCell>
                    <TableCell className="text-right">{row.order_count?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.revenue?.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );

    case 'profitability':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Profitability Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Material Cost</TableHead>
                  <TableHead className="text-right">Labour Cost</TableHead>
                  <TableHead className="text-right">Scrap Cost</TableHead>
                  <TableHead className="text-right">Net Profit</TableHead>
                  <TableHead className="text-right">Profit %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{row.month}</TableCell>
                    <TableCell className="text-right">${row.revenue?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.material_cost?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.labour_cost?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${row.scrap_cost?.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">${row.net_profit?.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{row.profit_percent?.toFixed(2)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );

    default:
      return null;
  }
}
