import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const InventoryReports = () => {
  const { toast } = useToast();
  const [materialStock, setMaterialStock] = useState<any[]>([]);
  const [consumptionData, setConsumptionData] = useState<any[]>([]);
  const [stockAlerts, setStockAlerts] = useState<any[]>([]);
  const [nonConsumables, setNonConsumables] = useState<any[]>([]);

  useEffect(() => {
    loadMaterialStock();
    loadConsumptionData();
    loadStockAlerts();
    loadNonConsumables();
  }, []);

  const loadMaterialStock = async () => {
    try {
      const { data, error } = await supabase
        .from("material_lots")
        .select("*")
        .in("status", ["received", "issued"])
        .order("alloy");

      if (error) throw error;

      // Group by alloy
      const grouped = data?.reduce((acc: any, lot) => {
        const key = `${lot.alloy}-${lot.supplier}`;
        if (!acc[key]) {
          acc[key] = {
            alloy: lot.alloy,
            supplier: lot.supplier,
            totalWeight: 0,
            heatNos: [],
            age: 0,
          };
        }
        acc[key].totalWeight += Number(lot.net_weight);
        acc[key].heatNos.push(lot.heat_no);
        const age = Math.floor((Date.now() - new Date(lot.received_date_time).getTime()) / (1000 * 60 * 60 * 24));
        acc[key].age = Math.max(acc[key].age, age);
        return acc;
      }, {});

      setMaterialStock(Object.values(grouped || {}));
    } catch (error: any) {
      toast({ title: "Error loading material stock", description: error.message, variant: "destructive" });
    }
  };

  const loadConsumptionData = async () => {
    try {
      const { data, error } = await supabase
        .from("material_issues")
        .select(`
          quantity_kg,
          wo:work_orders(customer)
        `);

      if (error) throw error;

      const consumption = data?.reduce((acc: any, issue) => {
        const customer = issue.wo?.customer || "Unknown";
        if (!acc[customer]) {
          acc[customer] = { customer, totalKg: 0 };
        }
        acc[customer].totalKg += Number(issue.quantity_kg || 0);
        return acc;
      }, {});

      setConsumptionData(Object.values(consumption || {}));
    } catch (error: any) {
      toast({ title: "Error loading consumption data", description: error.message, variant: "destructive" });
    }
  };

  const loadStockAlerts = async () => {
    try {
      const { data, error } = await supabase
        .from("non_consumables")
        .select("*");

      if (error) throw error;

      const alerts = data?.filter(item => {
        return item.reorder_level && item.quantity <= item.reorder_level;
      }).map(item => ({
        ...item,
        alertType: item.quantity <= (item.reorder_level || 0) ? "Below Min" : "OK",
      }));

      setStockAlerts(alerts || []);
    } catch (error: any) {
      toast({ title: "Error loading stock alerts", description: error.message, variant: "destructive" });
    }
  };

  const loadNonConsumables = async () => {
    try {
      const { data, error } = await supabase
        .from("non_consumable_usage")
        .select(`
          quantity_used,
          item:non_consumables(item_name, category),
          department:departments(name)
        `);

      if (error) throw error;

      const usage = data?.reduce((acc: any, u) => {
        const dept = u.department?.name || "Unknown";
        if (!acc[dept]) {
          acc[dept] = { department: dept, totalUsage: 0 };
        }
        acc[dept].totalUsage += Number(u.quantity_used || 0);
        return acc;
      }, {});

      setNonConsumables(Object.values(usage || {}));
    } catch (error: any) {
      toast({ title: "Error loading non-consumables", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Inventory & Material Analytics</CardTitle>
          <CardDescription>Stock levels, consumption, alerts, and non-consumables</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Raw Material Stock by Alloy & Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alloy</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Weight (kg)</TableHead>
                  <TableHead>Age (days)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialStock.slice(0, 10).map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{item.alloy}</TableCell>
                    <TableCell>{item.supplier}</TableCell>
                    <TableCell>{item.totalWeight.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant={item.age > 90 ? "destructive" : "secondary"}>
                        {item.age}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Material Consumption by Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={consumptionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="customer" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="totalKg" fill="hsl(var(--chart-2))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock Alerts</CardTitle>
            <CardDescription>Items below reorder level</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Alert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockAlerts.slice(0, 10).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.item_name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{item.alertType}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Non-Consumables Usage by Department</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={nonConsumables}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="totalUsage" fill="hsl(var(--chart-3))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default InventoryReports;
