import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  Package,
  Factory,
  CheckCircle2,
  Box,
  Truck
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface WorkOrder {
  id: string;
  wo_id: string;
  item_code: string;
  customer: string;
  quantity: number;
  status: string;
  due_date: string;
  current_step?: string;
  wait_time_hours?: number;
}

export default function DepartmentDetail() {
  const navigate = useNavigate();
  const { departmentName } = useParams<{ departmentName: string }>();
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [stats, setStats] = useState({
    totalPcs: 0,
    totalKg: 0,
    avgWaitTime: 0,
    alerts: 0,
    completedToday: 0,
    inProgress: 0
  });

  useEffect(() => {
    loadDepartmentData();
    
    // Set up real-time subscription
    const channel = supabase
      .channel(`${departmentName}-changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_orders'
        },
        () => loadDepartmentData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [departmentName]);

  const loadDepartmentData = async () => {
    setLoading(true);
    
    // Get department ID
    const { data: dept } = await supabase
      .from('departments')
      .select('id, type')
      .ilike('name', `%${departmentName}%`)
      .single();

    if (!dept) {
      setLoading(false);
      return;
    }

    // Get work orders with routing steps for this department
    const { data: woData } = await supabase
      .from('routing_steps')
      .select(`
        wo_id,
        status,
        actual_start,
        work_orders (
          id,
          wo_id,
          item_code,
          customer,
          quantity,
          status,
          due_date
        )
      `)
      .eq('department_id', dept.id)
      .in('status', ['in_progress', 'pending', 'waiting'])
      .order('actual_start', { ascending: false });

    if (woData) {
      const wos = woData
        .filter(item => item.work_orders)
        .map(item => {
          const wo = item.work_orders as any;
          const waitTimeHours = item.actual_start 
            ? Math.round((Date.now() - new Date(item.actual_start).getTime()) / (1000 * 60 * 60))
            : 0;
          
          return {
            id: wo.id,
            wo_id: wo.wo_id,
            item_code: wo.item_code,
            customer: wo.customer,
            quantity: wo.quantity,
            status: item.status,
            due_date: wo.due_date,
            current_step: item.status,
            wait_time_hours: waitTimeHours
          };
        });

      setWorkOrders(wos);

      // Calculate stats
      const totalPcs = wos.reduce((sum, wo) => sum + wo.quantity, 0);
      const avgWait = wos.length > 0 
        ? wos.reduce((sum, wo) => sum + (wo.wait_time_hours || 0), 0) / wos.length 
        : 0;
      const alerts = wos.filter(wo => 
        wo.wait_time_hours && wo.wait_time_hours > 24
      ).length;

      setStats({
        totalPcs,
        totalKg: totalPcs * 0.5, // Approximate weight
        avgWaitTime: avgWait,
        alerts,
        completedToday: 0,
        inProgress: wos.filter(wo => wo.status === 'in_progress').length
      });
    }

    setLoading(false);
  };

  const getDepartmentIcon = () => {
    const name = departmentName?.toLowerCase() || '';
    if (name.includes('store')) return Package;
    if (name.includes('production')) return Factory;
    if (name.includes('quality')) return CheckCircle2;
    if (name.includes('packing')) return Box;
    if (name.includes('dispatch') || name.includes('job')) return Truck;
    return Factory;
  };

  const Icon = getDepartmentIcon();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return 'bg-blue-500';
      case 'waiting': return 'bg-yellow-500';
      case 'pending': return 'bg-gray-500';
      case 'completed': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[50vh]">
          <Factory className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <Icon className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold capitalize">{departmentName}</h1>
              <p className="text-sm text-muted-foreground">Live Department Status</p>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{stats.totalPcs}</p>
                <p className="text-sm text-muted-foreground">WIP Pieces</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-primary">{stats.totalKg.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">WIP kg</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-warning">{stats.avgWaitTime.toFixed(1)}h</p>
                <p className="text-sm text-muted-foreground">Avg Wait</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-500">{stats.inProgress}</p>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-destructive">{stats.alerts}</p>
                <p className="text-sm text-muted-foreground">Alerts</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-3xl font-bold text-success">{stats.completedToday}</p>
                <p className="text-sm text-muted-foreground">Done Today</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Work Orders Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Active Work Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {workOrders.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No active work orders in this department</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>WO #</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Wait Time</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.map((wo) => (
                      <TableRow key={wo.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell className="font-medium">{wo.wo_id}</TableCell>
                        <TableCell>{wo.item_code}</TableCell>
                        <TableCell>{wo.customer}</TableCell>
                        <TableCell>{wo.quantity}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(wo.status)}>
                            {wo.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {wo.wait_time_hours}h
                            {wo.wait_time_hours && wo.wait_time_hours > 24 && (
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(wo.due_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => navigate(`/work-orders/${wo.id}`)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
