import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Package, Truck, MapPin, FileText, Home, Calendar, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/ui/empty-state";
import { subDays } from "date-fns";

interface Shipment {
  id: string;
  ship_id: string;
  customer: string | null;
  status: string | null;
  transporter_name: string | null;
  lr_no: string | null;
  ship_date: string | null;
  shipped_at: string | null;
  delivered_date: string | null;
  boxes: number | null;
  gross_weight_kg: number | null;
  net_weight_kg: number | null;
  ship_to_address: any;
  wo_id: string | null;
  work_order?: {
    wo_number: string;
  } | null;
}

export default function Logistics() {
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [stats, setStats] = useState({
    active: 0,
    inTransit: 0,
    deliveredThisMonth: 0,
    pendingDocs: 0
  });

  useEffect(() => {
    loadShipments();
  }, []);

  const loadShipments = async () => {
    setLoading(true);
    try {
      // Load shipments with work order info
      const { data, error } = await supabase
        .from('shipments')
        .select(`
          *,
          work_order:wo_id(wo_number)
        `)
        .order('ship_date', { ascending: false })
        .limit(50);

      if (error) throw error;

      setShipments(data || []);

      // Calculate stats
      const thirtyDaysAgo = subDays(new Date(), 30);
      const active = (data || []).filter(s => s.status !== 'delivered' && s.status !== 'cancelled').length;
      const inTransit = (data || []).filter(s => s.status === 'in_transit').length;
      const deliveredThisMonth = (data || []).filter(s => 
        s.status === 'delivered' && 
        s.delivered_date && 
        new Date(s.delivered_date) >= thirtyDaysAgo
      ).length;
      const pendingDocs = (data || []).filter(s => {
        const docs = s.documents as Record<string, any> | null;
        return !docs?.invoice_uploaded || !docs?.packing_list_uploaded;
      }).length;

      setStats({ active, inTransit, deliveredThisMonth, pendingDocs });
    } catch (error) {
      console.error('Error loading shipments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    const variants: Record<string, { variant: any; label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      picked: { variant: "outline", label: "Picked" },
      in_transit: { variant: "default", label: "In Transit" },
      delivered: { variant: "default", label: "Delivered" },
      exception: { variant: "destructive", label: "Exception" },
      cancelled: { variant: "destructive", label: "Cancelled" }
    };

    const config = variants[status || 'pending'] || { variant: "secondary", label: status || 'Unknown' };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDestination = (shipment: Shipment) => {
    if (shipment.ship_to_address) {
      const addr = shipment.ship_to_address;
      return [addr.city, addr.state, addr.country].filter(Boolean).join(', ') || 'N/A';
    }
    return 'N/A';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">
                    <Home className="h-4 w-4" />
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Logistics</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Button variant="outline" size="sm" onClick={loadShipments} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Shipments</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active}</div>
              <p className="text-xs text-muted-foreground">Not yet delivered</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Transit</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inTransit}</div>
              <p className="text-xs text-muted-foreground">Currently shipping</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered (30d)</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.deliveredThisMonth}</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Docs</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingDocs}</div>
              <p className="text-xs text-muted-foreground">Missing documents</p>
            </CardContent>
          </Card>
        </div>

        {/* Shipment Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Shipments</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : shipments.length === 0 ? (
            <Card>
              <CardContent className="py-0">
                <EmptyState
                  icon="partners"
                  title="No Shipments"
                  description="Shipments are created when work orders are dispatched to customers. Complete a work order through packing and dispatch to create a shipment."
                  hint="Navigate to Dispatch to ship completed work orders."
                  action={{
                    label: "Go to Dispatch",
                    onClick: () => window.location.href = "/dispatch",
                    variant: "outline",
                  }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {shipments.map((shipment) => (
                <Card key={shipment.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{shipment.ship_id}</CardTitle>
                      {getStatusBadge(shipment.status)}
                    </div>
                    <CardDescription>
                      {shipment.work_order?.wo_number 
                        ? `Work Order: ${shipment.work_order.wo_number}` 
                        : shipment.customer || 'No customer'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {shipment.transporter_name && (
                      <div className="flex items-center gap-2 text-sm">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        <span>{shipment.transporter_name}</span>
                      </div>
                    )}
                    {shipment.lr_no && (
                      <div className="flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span>LR: {shipment.lr_no}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{getDestination(shipment)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {shipment.shipped_at || shipment.ship_date
                          ? `Shipped: ${new Date(shipment.shipped_at || shipment.ship_date!).toLocaleDateString()}`
                          : 'Not shipped yet'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
                      <span>{shipment.boxes || 0} boxes</span>
                      <span>•</span>
                      <span>{shipment.gross_weight_kg?.toFixed(1) || 0} kg</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
