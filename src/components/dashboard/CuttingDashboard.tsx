import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Scissors, TrendingUp, Clock, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";

interface CuttingStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  totalQtyRequired: number;
  totalQtyCut: number;
}

export function CuttingDashboard() {
  const [stats, setStats] = useState<CuttingStats>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    totalQtyRequired: 0,
    totalQtyCut: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();

    const channel = supabase
      .channel('cutting-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cutting_records' }, () => {
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
        .from('cutting_records')
        .select('*');

      if (error) throw error;

      const stats: CuttingStats = {
        total: data?.length || 0,
        pending: data?.filter(r => r.status === 'pending').length || 0,
        inProgress: data?.filter(r => r.status === 'in_progress').length || 0,
        completed: data?.filter(r => r.status === 'completed').length || 0,
        totalQtyRequired: data?.reduce((sum, r) => sum + Number(r.qty_required || 0), 0) || 0,
        totalQtyCut: data?.reduce((sum, r) => sum + Number(r.qty_cut || 0), 0) || 0,
      };

      setStats(stats);
    } catch (error) {
      console.error("Error loading cutting stats:", error);
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
    ? (stats.totalQtyCut / stats.totalQtyRequired) * 100
    : 0;

  return (
    <Link to="/work-orders?stage=cutting_queue">
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Scissors className="w-4 h-4" />
            Cutting Queue
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
                <span>{stats.totalQtyCut.toFixed(2)} kg cut</span>
                <span>{stats.totalQtyRequired.toFixed(2)} kg required</span>
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
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
