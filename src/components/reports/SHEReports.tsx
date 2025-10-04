import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const SHEReports = () => {
  const { toast } = useToast();
  const [incidentData, setIncidentData] = useState<any[]>([]);
  const [capaData, setCapaData] = useState<any>({ total: 0, overdue: 0, closed: 0 });
  const [trainingData, setTrainingData] = useState<any[]>([]);
  const [ppeData, setPpeData] = useState<any[]>([]);
  const [environmentalData, setEnvironmentalData] = useState<any[]>([]);

  useEffect(() => {
    loadIncidentData();
    loadCapaData();
    loadTrainingData();
    loadPPEData();
    loadEnvironmentalData();
  }, []);

  const loadIncidentData = async () => {
    try {
      const { data, error } = await supabase
        .from("she_incidents")
        .select("severity, lost_time_hours");

      if (error) throw error;

      const grouped = data?.reduce((acc: any, inc) => {
        if (!acc[inc.severity]) {
          acc[inc.severity] = { severity: inc.severity, count: 0, lostTime: 0 };
        }
        acc[inc.severity].count += 1;
        acc[inc.severity].lostTime += Number(inc.lost_time_hours || 0);
        return acc;
      }, {});

      setIncidentData(Object.values(grouped || {}));
    } catch (error: any) {
      toast({ title: "Error loading incident data", description: error.message, variant: "destructive" });
    }
  };

  const loadCapaData = async () => {
    try {
      const { data, error } = await supabase
        .from("capa")
        .select("status");

      if (error) throw error;

      const total = data?.length || 0;
      const overdue = data?.filter(c => c.status === "overdue").length || 0;
      const closed = data?.filter(c => c.status === "closed").length || 0;

      setCapaData({ total, overdue, closed });
    } catch (error: any) {
      toast({ title: "Error loading CAPA data", description: error.message, variant: "destructive" });
    }
  };

  const loadTrainingData = async () => {
    try {
      const { data, error } = await supabase
        .from("training_records")
        .select(`
          training_type,
          status,
          user:profiles!training_records_user_id_fkey(full_name)
        `);

      if (error) throw error;

      const grouped = data?.reduce((acc: any, tr) => {
        if (!acc[tr.training_type]) {
          acc[tr.training_type] = { type: tr.training_type, valid: 0, expired: 0 };
        }
        if (tr.status === "valid") acc[tr.training_type].valid += 1;
        if (tr.status === "expired") acc[tr.training_type].expired += 1;
        return acc;
      }, {});

      setTrainingData(Object.values(grouped || {}));
    } catch (error: any) {
      toast({ title: "Error loading training data", description: error.message, variant: "destructive" });
    }
  };

  const loadPPEData = async () => {
    try {
      const { data, error } = await supabase
        .from("ppe_inventory")
        .select("category, status, expiry_date");

      if (error) throw error;

      const statusData = data?.reduce((acc: any, ppe) => {
        if (!acc[ppe.status]) {
          acc[ppe.status] = { status: ppe.status, count: 0 };
        }
        acc[ppe.status].count += 1;
        return acc;
      }, {});

      setPpeData(Object.values(statusData || {}));
    } catch (error: any) {
      toast({ title: "Error loading PPE data", description: error.message, variant: "destructive" });
    }
  };

  const loadEnvironmentalData = async () => {
    try {
      const { data, error } = await supabase
        .from("environmental_metrics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(30);

      if (error) throw error;

      const metrics = data?.map(m => ({
        date: new Date(m.metric_date).toLocaleDateString(),
        energy: Number(m.energy_kwh || 0),
        water: Number(m.water_liters || 0) / 1000, // Convert to cubic meters
        waste: Number(m.waste_kg || 0),
        recycled: Number(m.recycled_waste_kg || 0),
        recyclingPct: m.waste_kg ? ((Number(m.recycled_waste_kg || 0) / Number(m.waste_kg)) * 100).toFixed(1) : 0,
      })).reverse();

      setEnvironmentalData(metrics || []);
    } catch (error: any) {
      toast({ title: "Error loading environmental data", description: error.message, variant: "destructive" });
    }
  };

  const capaClosureRate = capaData.total > 0
    ? ((capaData.closed / capaData.total) * 100).toFixed(2)
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>SHE Analytics</CardTitle>
          <CardDescription>Safety, Health, and Environment metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Total Incidents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{incidentData.reduce((sum, i) => sum + i.count, 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CAPA Closure Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{capaClosureRate}%</div>
                <p className="text-xs text-muted-foreground">{capaData.closed} / {capaData.total} closed</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Overdue CAPAs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">{capaData.overdue}</div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Incident Frequency by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={incidentData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="severity" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="hsl(var(--destructive))" />
                <Bar dataKey="lostTime" fill="hsl(var(--chart-1))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Training Compliance Matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trainingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="valid" fill="hsl(var(--chart-2))" />
                <Bar dataKey="expired" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PPE Inventory Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={ppeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.status}: ${entry.count}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {ppeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Environmental KPIs (Last 30 Days)</CardTitle>
            <CardDescription>Energy, water, waste, and recycling</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={environmentalData.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="energy" stroke="hsl(var(--chart-1))" />
                <Line type="monotone" dataKey="waste" stroke="hsl(var(--chart-3))" />
                <Line type="monotone" dataKey="recycled" stroke="hsl(var(--chart-4))" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SHEReports;
