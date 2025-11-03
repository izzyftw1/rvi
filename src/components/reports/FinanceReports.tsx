import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";

const FinanceReports = () => {
  const { toast } = useToast();
  const [materialSpend, setMaterialSpend] = useState<any[]>([]);
  const [supplierComparison, setSupplierComparison] = useState<any[]>([]);
  const [logisticsCosts, setLogisticsCosts] = useState<any[]>([]);
  const [customerProfitability, setCustomerProfitability] = useState<any[]>([]);

  useEffect(() => {
    loadMaterialSpend();
    loadSupplierComparison();
    loadLogisticsCosts();
    loadCustomerProfitability();
  }, []);

  const loadMaterialSpend = async () => {
    try {
      const { data, error } = await supabase
        .from("material_costs")
        .select("total_cost, lme_copper_price, created_at, currency")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      const spendData = data?.map(mc => ({
        date: new Date(mc.created_at).toLocaleDateString(),
        spend: Number(mc.total_cost),
        lme: Number(mc.lme_copper_price || 0),
      })).reverse();

      setMaterialSpend(spendData || []);
    } catch (error: any) {
      console.error("Material spend error:", error);
      toast({ title: "Error loading material spend", description: error.message, variant: "destructive" });
    }
  };

  const loadSupplierComparison = async () => {
    try {
      // Get material lots with their suppliers
      const { data: lots, error: lotsError } = await supabase
        .from("material_lots")
        .select("id, supplier");

      if (lotsError) throw lotsError;

      // Get material costs
      const { data: costs, error: costsError } = await supabase
        .from("material_costs")
        .select("lot_id, cost_per_kg");

      if (costsError) throw costsError;

      // Create lookup map
      const lotSupplierMap: any = {};
      lots?.forEach(lot => {
        lotSupplierMap[lot.id] = lot.supplier || "Unknown";
      });

      // Aggregate by supplier
      const suppliers = costs?.reduce((acc: any, mc) => {
        const supplier = lotSupplierMap[mc.lot_id] || "Unknown";
        if (!acc[supplier]) {
          acc[supplier] = { supplier, avgCostPerKg: 0, count: 0 };
        }
        acc[supplier].avgCostPerKg += Number(mc.cost_per_kg);
        acc[supplier].count += 1;
        return acc;
      }, {});

      const supplierData = Object.values(suppliers || {}).map((s: any) => ({
        supplier: s.supplier,
        avgCostPerKg: Number((s.avgCostPerKg / s.count).toFixed(2)),
      }));

      setSupplierComparison(supplierData);
    } catch (error: any) {
      console.error("Supplier comparison error:", error);
      toast({ title: "Error loading supplier comparison", description: error.message, variant: "destructive" });
    }
  };

  const loadLogisticsCosts = async () => {
    try {
      const { data, error } = await supabase
        .from("logistics_costs")
        .select("lane, mode, cost_amount, cost_per_kg");

      if (error) throw error;

      const lanes = data?.reduce((acc: any, lc) => {
        const key = `${lc.lane}-${lc.mode}`;
        if (!acc[key]) {
          acc[key] = {
            lane: lc.lane,
            mode: lc.mode,
            totalCost: 0,
            avgCostPerKg: 0,
            count: 0,
          };
        }
        acc[key].totalCost += Number(lc.cost_amount);
        acc[key].avgCostPerKg += Number(lc.cost_per_kg || 0);
        acc[key].count += 1;
        return acc;
      }, {});

      const laneData = Object.values(lanes || {}).map((l: any) => ({
        lane: `${l.lane} (${l.mode})`,
        avgCostPerKg: Number((l.avgCostPerKg / l.count).toFixed(2)),
        totalCost: Number(l.totalCost.toFixed(2)),
      }));

      setLogisticsCosts(laneData);
    } catch (error: any) {
      toast({ title: "Error loading logistics costs", description: error.message, variant: "destructive" });
    }
  };

  const loadCustomerProfitability = async () => {
    try {
      // Get work orders with customer info
      const { data: workOrders, error: woError } = await supabase
        .from("work_orders")
        .select("id, customer");

      if (woError) throw woError;

      // Get material issues
      const { data: materialIssues, error: miError } = await supabase
        .from("wo_material_issues")
        .select("wo_id, lot_id, quantity_kg");

      if (miError) throw miError;

      // Get material costs
      const { data: materialCosts, error: mcError } = await supabase
        .from("material_costs")
        .select("lot_id, cost_per_kg");

      if (mcError) throw mcError;

      // Get processing costs
      const { data: processingCosts, error: pcError } = await supabase
        .from("processing_costs")
        .select("wo_id, cost_amount");

      if (pcError) throw pcError;

      const customerData: any = {};

      // Build lookups
      const woCustomerMap: any = {};
      workOrders?.forEach(wo => {
        woCustomerMap[wo.id] = wo.customer || "Unknown";
      });

      const costLookup: any = {};
      materialCosts?.forEach(mc => {
        costLookup[mc.lot_id] = mc.cost_per_kg;
      });

      // Aggregate material costs by customer
      materialIssues?.forEach((mi: any) => {
        const customer = woCustomerMap[mi.wo_id] || "Unknown";
        if (!customerData[customer]) {
          customerData[customer] = {
            customer,
            materialCost: 0,
            processingCost: 0,
          };
        }
        const costPerKg = Number(costLookup[mi.lot_id] || 0);
        customerData[customer].materialCost += Number(mi.quantity_kg || 0) * costPerKg;
      });

      // Aggregate processing costs by customer
      processingCosts?.forEach((pc: any) => {
        const customer = woCustomerMap[pc.wo_id] || "Unknown";
        if (!customerData[customer]) {
          customerData[customer] = {
            customer,
            materialCost: 0,
            processingCost: 0,
          };
        }
        customerData[customer].processingCost += Number(pc.cost_amount);
      });

      setCustomerProfitability(Object.values(customerData));
    } catch (error: any) {
      console.error("Customer profitability error:", error);
      toast({ title: "Error loading customer profitability", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Finance & Cost Analytics</CardTitle>
          <CardDescription>Material spend, supplier comparison, logistics, and customer profitability</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Material Spend vs LME Copper</CardTitle>
            <CardDescription>Recent trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={materialSpend.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="spend" stroke="hsl(var(--chart-1))" />
                <Line type="monotone" dataKey="lme" stroke="hsl(var(--chart-2))" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supplier Price Comparison</CardTitle>
            <CardDescription>Average cost per kg by supplier</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={supplierComparison}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="supplier" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgCostPerKg" fill="hsl(var(--chart-3))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Logistics Cost by Lane & Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={logisticsCosts}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="lane" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avgCostPerKg" fill="hsl(var(--chart-4))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer Profitability</CardTitle>
            <CardDescription>Material + processing costs by customer</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={customerProfitability}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="customer" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="materialCost" stackId="a" fill="hsl(var(--chart-1))" />
                <Bar dataKey="processingCost" stackId="a" fill="hsl(var(--chart-2))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FinanceReports;
