import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Activity, ArrowRight, Users } from "lucide-react";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const ProductionReports = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [wipData, setWipData] = useState<any[]>([]);
  const [cycleTimeData, setCycleTimeData] = useState<any[]>([]);
  const [bottleneckData, setBottleneckData] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    loadDepartments();
    loadWIPData();
    loadCycleTimeData();
    loadBottleneckData();
  }, [selectedDept]);

  const loadDepartments = async () => {
    const { data } = await supabase.from("departments").select("*");
    if (data) setDepartments(data);
  };

  const loadWIPData = async () => {
    try {
      let query = supabase
        .from("routing_steps")
        .select(`
          id,
          status,
          department:departments(name),
          work_order:work_orders(quantity)
        `)
        .in("status", ["in_progress", "pending"]);

      const { data, error } = await query;
      if (error) throw error;

      // Group by department
      const grouped = data?.reduce((acc: any, step: any) => {
        const deptName = step.department?.name || "Unknown";
        if (!acc[deptName]) {
          acc[deptName] = { department: deptName, jobs: 0, pcs: 0 };
        }
        acc[deptName].jobs += 1;
        acc[deptName].pcs += step.work_order?.quantity || 0;
        return acc;
      }, {});

      setWipData(Object.values(grouped || {}));
    } catch (error: any) {
      toast({ title: "Error loading WIP data", description: error.message, variant: "destructive" });
    }
  };

  const loadCycleTimeData = async () => {
    try {
      const { data, error } = await supabase
        .from("routing_steps")
        .select(`
          name,
          planned_start,
          planned_end,
          actual_start,
          actual_end,
          status
        `)
        .not("actual_end", "is", null);

      if (error) throw error;

      const cycleData = data?.map((step) => {
        const plannedCycle = step.planned_end && step.planned_start
          ? (new Date(step.planned_end).getTime() - new Date(step.planned_start).getTime()) / (1000 * 60 * 60)
          : 0;
        const actualCycle = step.actual_end && step.actual_start
          ? (new Date(step.actual_end).getTime() - new Date(step.actual_start).getTime()) / (1000 * 60 * 60)
          : 0;
        return {
          step: step.name,
          planned: plannedCycle,
          actual: actualCycle,
        };
      });

      setCycleTimeData(cycleData || []);
    } catch (error: any) {
      toast({ title: "Error loading cycle time data", description: error.message, variant: "destructive" });
    }
  };

  const loadBottleneckData = async () => {
    try {
      const { data, error } = await supabase
        .from("routing_steps")
        .select(`
          name,
          planned_end,
          actual_end
        `)
        .not("actual_end", "is", null);

      if (error) throw error;

      // Calculate average delay per step name
      const delays = data?.reduce((acc: any, step) => {
        if (!step.planned_end || !step.actual_end) return acc;
        const delay = (new Date(step.actual_end).getTime() - new Date(step.planned_end).getTime()) / (1000 * 60 * 60);
        if (!acc[step.name]) {
          acc[step.name] = { step: step.name, totalDelay: 0, count: 0 };
        }
        acc[step.name].totalDelay += delay;
        acc[step.name].count += 1;
        return acc;
      }, {});

      const bottlenecks = Object.values(delays || {}).map((item: any) => ({
        step: item.step,
        avgDelay: item.totalDelay / item.count,
      })).sort((a: any, b: any) => b.avgDelay - a.avgDelay).slice(0, 5);

      setBottleneckData(bottlenecks);
    } catch (error: any) {
      toast({ title: "Error loading bottleneck data", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Production & Efficiency Analytics</CardTitle>
              <CardDescription>WIP, cycle times, bottlenecks, and productivity metrics</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate('/reports/machine-runtime')} variant="outline" className="gap-2">
                <Activity className="h-4 w-4" />
                Machine Runtime
              </Button>
              <Button onClick={() => navigate('/reports/worker-efficiency')} variant="outline" className="gap-2">
                <Users className="h-4 w-4" />
                Worker Efficiency
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Filter by Department</Label>
              <Select value={selectedDept} onValueChange={setSelectedDept}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>WIP by Department</CardTitle>
            <CardDescription>Work in progress - jobs and pieces</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={wipData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="jobs" fill="hsl(var(--chart-1))" />
                <Bar dataKey="pcs" fill="hsl(var(--chart-2))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cycle Time: Planned vs Actual</CardTitle>
            <CardDescription>Hours per routing step</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cycleTimeData.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="planned" fill="hsl(var(--chart-3))" />
                <Bar dataKey="actual" fill="hsl(var(--chart-4))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Bottlenecks</CardTitle>
            <CardDescription>Steps with highest average delay (hours)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bottleneckData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="step" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="avgDelay" fill="hsl(var(--chart-5))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProductionReports;
