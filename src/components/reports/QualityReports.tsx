import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const QualityReports = () => {
  const { toast } = useToast();
  const [fpyData, setFpyData] = useState<any>({ fpy: 0, total: 0, passed: 0 });
  const [rejectionData, setRejectionData] = useState<any[]>([]);
  const [defectData, setDefectData] = useState<any[]>([]);
  const [complianceData, setComplianceData] = useState<any[]>([]);
  const [oesData, setOesData] = useState<any[]>([]);

  useEffect(() => {
    loadFPYData();
    loadRejectionData();
    loadDefectData();
    loadComplianceData();
    loadOESData();
  }, []);

  const loadFPYData = async () => {
    try {
      const { data, error } = await supabase
        .from("qc_records")
        .select("result");

      if (error) throw error;

      const total = data?.length || 0;
      const passed = data?.filter(r => r.result === "pass").length || 0;
      const fpy = total > 0 ? ((passed / total) * 100).toFixed(2) : 0;

      setFpyData({ fpy, total, passed });
    } catch (error: any) {
      toast({ title: "Error loading FPY data", description: error.message, variant: "destructive" });
    }
  };

  const loadRejectionData = async () => {
    try {
      const { data, error } = await supabase
        .from("qc_records")
        .select(`
          result,
          qc_type,
          work_order:work_orders(customer)
        `);

      if (error) throw error;

      const rejections = data?.reduce((acc: any, rec) => {
        if (rec.result === "fail") {
          const customer = rec.work_order?.customer || "Unknown";
          if (!acc[customer]) {
            acc[customer] = { customer, rejections: 0 };
          }
          acc[customer].rejections += 1;
        }
        return acc;
      }, {});

      setRejectionData(Object.values(rejections || {}));
    } catch (error: any) {
      toast({ title: "Error loading rejection data", description: error.message, variant: "destructive" });
    }
  };

  const loadDefectData = async () => {
    try {
      const { data, error } = await supabase
        .from("qc_records")
        .select("remarks")
        .eq("result", "fail")
        .not("remarks", "is", null);

      if (error) throw error;

      // Simple defect categorization
      const defects = data?.reduce((acc: any, rec) => {
        const reason = rec.remarks || "Unspecified";
        if (!acc[reason]) {
          acc[reason] = { reason, count: 0 };
        }
        acc[reason].count += 1;
        return acc;
      }, {});

      const sorted = Object.values(defects || {})
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 5);

      setDefectData(sorted);
    } catch (error: any) {
      toast({ title: "Error loading defect data", description: error.message, variant: "destructive" });
    }
  };

  const loadComplianceData = async () => {
    try {
      const { data: allWO } = await supabase.from("work_orders").select("id");
      const { data: testedWO } = await supabase.from("qc_records").select("wo_id");

      const total = allWO?.length || 0;
      const tested = new Set(testedWO?.map(r => r.wo_id)).size;
      const compliancePct = total > 0 ? ((tested / total) * 100).toFixed(2) : 0;

      setComplianceData([
        { name: "Tested", value: tested },
        { name: "Not Tested", value: total - tested },
      ]);
    } catch (error: any) {
      toast({ title: "Error loading compliance data", description: error.message, variant: "destructive" });
    }
  };

  const loadOESData = async () => {
    try {
      const { data, error } = await supabase
        .from("material_lots")
        .select("qc_status");

      if (error) throw error;

      const grouped = data?.reduce((acc: any, lot) => {
        const status = lot.qc_status || "pending";
        if (!acc[status]) {
          acc[status] = { status, count: 0 };
        }
        acc[status].count += 1;
        return acc;
      }, {});

      setOesData(Object.values(grouped || {}));
    } catch (error: any) {
      toast({ title: "Error loading OES data", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Quality Analytics</CardTitle>
          <CardDescription>FPY, rejection rates, defect analysis, and compliance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">First Pass Yield</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{fpyData.fpy}%</div>
                <p className="text-xs text-muted-foreground">{fpyData.passed} / {fpyData.total} passed</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Rejection Rates by Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rejectionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="customer" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="rejections" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Defect Reasons (Pareto)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={defectData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="reason" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--chart-1))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QC Compliance</CardTitle>
            <CardDescription>% of batches tested</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={complianceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {complianceData.map((entry, index) => (
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
            <CardTitle>OES/XRF Compliance Trend</CardTitle>
            <CardDescription>Material lot QC status distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={oesData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.status}: ${entry.count}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {oesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QualityReports;
