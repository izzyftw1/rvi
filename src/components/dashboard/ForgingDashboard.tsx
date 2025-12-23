import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Hammer, TrendingUp, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

interface ForgingStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  qcPending: number;
  qcApproved: number;
  totalQtyRequired: number;
  totalQtyForged: number;
}

export function ForgingDashboard() {
  const [stats, setStats] = useState<ForgingStats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    qcPending: 0,
    qcApproved: 0,
    totalQtyRequired: 0,
    totalQtyForged: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();

    const channel = supabase
      .channel('forging-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forging_records' }, () => {
        loadStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadStats = async () => {
    try {
      const { data, error } = await supabase
        .from('forging_records')
        .select('*');

      if (error) throw error;

      const stats: ForgingStats = {
        total: data?.length || 0,
        pending: data?.filter(r => r.status === 'pending').length || 0,
        inProgress: data?.filter(r => r.status === 'in_progress').length || 0,
        completed: data?.filter(r => r.status === 'completed').length || 0,
        qcPending: data?.filter(r => r.sample_sent && !r.qc_approved).length || 0,
        qcApproved: data?.filter(r => r.qc_approved).length || 0,
        totalQtyRequired: data?.reduce((sum, r) => sum + Number(r.qty_required || 0), 0) || 0,
        totalQtyForged: data?.reduce((sum, r) => sum + Number(r.qty_forged || 0), 0) || 0,
      };

      setStats(stats);
    } catch (error) {
      console.error("Error loading forging stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const completionPercentage = stats.totalQtyRequired > 0
    ? (stats.totalQtyForged / stats.totalQtyRequired) * 100
    : 0;

  return (
    <Link to="/work-orders?type=external&stage=forging">
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Hammer className="w-4 h-4" />
            Forging Queue
          </CardTitle>
          <Badge variant="secondary">{stats.total} Jobs</Badge>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-semibold">{completionPercentage.toFixed(1)}%</span>
              </div>
              <Progress value={completionPercentage} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                <span>{stats.totalQtyForged.toFixed(2)} forged</span>
                <span>{stats.totalQtyRequired.toFixed(2)} required</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-1 text-orange-600">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs font-medium">Pending</span>
                </div>
                <div className="text-xl font-bold">{stats.pending}</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-1 text-blue-600">
                  <TrendingUp className="w-3 h-3" />
                  <span className="text-xs font-medium">Active</span>
                </div>
                <div className="text-xl font-bold">{stats.inProgress}</div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-center gap-1 text-green-600">
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="text-xs font-medium">Done</span>
                </div>
                <div className="text-xl font-bold">{stats.completed}</div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">QC Status</span>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {stats.qcPending} Pending
                  </Badge>
                  <Badge variant="default" className="text-xs">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {stats.qcApproved} Approved
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
