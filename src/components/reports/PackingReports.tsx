import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from "recharts";
import { format, subDays } from "date-fns";

const PackingReports = () => {
  const { toast } = useToast();
  const [packingTrend, setPackingTrend] = useState<any[]>([]);
  const [onTimeShipments, setOnTimeShipments] = useState<any>({ onTime: 0, total: 0 });
  const [exportReadiness, setExportReadiness] = useState<any>({ ready: 0, total: 0 });
  const [lanePerformance, setLanePerformance] = useState<any[]>([]);

  useEffect(() => {
    loadPackingTrend();
    loadOnTimeShipments();
    loadExportReadiness();
    loadLanePerformance();
  }, []);

  const loadPackingTrend = async () => {
    try {
      const { data: cartons } = await supabase
        .from("cartons")
        .select("built_at");

      const { data: pallets } = await supabase
        .from("pallets")
        .select("built_at");

      // Group by day for last 30 days
      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = subDays(new Date(), 29 - i);
        return {
          date: format(date, "MM/dd"),
          cartons: 0,
          pallets: 0,
        };
      });

      cartons?.forEach(c => {
        const dayIdx = last30Days.findIndex(d => format(new Date(c.built_at), "MM/dd") === d.date);
        if (dayIdx >= 0) last30Days[dayIdx].cartons += 1;
      });

      pallets?.forEach(p => {
        const dayIdx = last30Days.findIndex(d => format(new Date(p.built_at), "MM/dd") === d.date);
        if (dayIdx >= 0) last30Days[dayIdx].pallets += 1;
      });

      setPackingTrend(last30Days);
    } catch (error: any) {
      toast({ title: "Error loading packing trend", description: error.message, variant: "destructive" });
    }
  };

  const loadOnTimeShipments = async () => {
    try {
      const { data: shipments } = await supabase
        .from("shipments")
        .select(`
          ship_date,
          shipment_pallets(
            pallet:pallets(
              pallet_cartons(
                carton:cartons(
                  work_order:work_orders(due_date)
                )
              )
            )
          )
        `);

      let onTime = 0;
      let total = 0;

      shipments?.forEach(ship => {
        const shipDate = new Date(ship.ship_date);
        ship.shipment_pallets?.forEach((sp: any) => {
          sp.pallet?.pallet_cartons?.forEach((pc: any) => {
            const dueDate = pc.carton?.work_order?.due_date;
            if (dueDate) {
              total += 1;
              if (shipDate <= new Date(dueDate)) onTime += 1;
            }
          });
        });
      });

      setOnTimeShipments({ onTime, total });
    } catch (error: any) {
      toast({ title: "Error loading on-time shipments", description: error.message, variant: "destructive" });
    }
  };

  const loadExportReadiness = async () => {
    try {
      const { data: shipments } = await supabase
        .from("shipments")
        .select("*");

      const total = shipments?.length || 0;
      const ready = shipments?.filter(s => s.coo_file && s.packing_list_file && s.invoice_file).length || 0;

      setExportReadiness({ ready, total });
    } catch (error: any) {
      toast({ title: "Error loading export readiness", description: error.message, variant: "destructive" });
    }
  };

  const loadLanePerformance = async () => {
    try {
      const { data: costs } = await supabase
        .from("logistics_costs")
        .select(`
          lane,
          cost_amount,
          cost_per_kg,
          shipment:shipments(ship_date)
        `);

      const lanes = costs?.reduce((acc: any, cost) => {
        if (!acc[cost.lane]) {
          acc[cost.lane] = {
            lane: cost.lane,
            avgCostPerKg: 0,
            totalCost: 0,
            count: 0,
          };
        }
        acc[cost.lane].totalCost += Number(cost.cost_amount || 0);
        acc[cost.lane].avgCostPerKg += Number(cost.cost_per_kg || 0);
        acc[cost.lane].count += 1;
        return acc;
      }, {});

      const laneData = Object.values(lanes || {}).map((lane: any) => ({
        lane: lane.lane,
        avgCostPerKg: Number((lane.avgCostPerKg / lane.count).toFixed(2)),
        totalCost: Number(lane.totalCost.toFixed(2)),
      }));

      setLanePerformance(laneData);
    } catch (error: any) {
      toast({ title: "Error loading lane performance", description: error.message, variant: "destructive" });
    }
  };

  const onTimePct = onTimeShipments.total > 0
    ? ((onTimeShipments.onTime / onTimeShipments.total) * 100).toFixed(2)
    : 0;

  const exportReadyPct = exportReadiness.total > 0
    ? ((exportReadiness.ready / exportReadiness.total) * 100).toFixed(2)
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Packing & Dispatch Analytics</CardTitle>
          <CardDescription>Cartons/pallets built, on-time shipments, export readiness, and lane performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">On-Time Shipments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{onTimePct}%</div>
                <p className="text-xs text-muted-foreground">{onTimeShipments.onTime} / {onTimeShipments.total} on time</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Export Readiness</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{exportReadyPct}%</div>
                <p className="text-xs text-muted-foreground">{exportReadiness.ready} / {exportReadiness.total} complete docs</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Cartons & Pallets Built (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={packingTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="cartons" stroke="hsl(var(--chart-1))" />
                <Line type="monotone" dataKey="pallets" stroke="hsl(var(--chart-2))" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lane Performance</CardTitle>
            <CardDescription>Average cost per kg by lane</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={lanePerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="lane" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgCostPerKg" fill="hsl(var(--chart-3))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PackingReports;
