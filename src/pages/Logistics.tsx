import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Package, Truck, MapPin, FileText, Home, Calendar } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/ui/empty-state";

export default function Logistics() {
  // Mock shipment data
  const shipments = [
    {
      id: "SHP-001",
      wo: "ISO-72823-001",
      status: "in_transit",
      transporter: "XYZ Logistics",
      lr_no: "LR-2024-001",
      ship_date: "2024-01-15",
      destination: "Mumbai, India",
      cartons: 12,
      weight: 250
    },
    {
      id: "SHP-002",
      wo: "ISO-72823-002",
      status: "delivered",
      transporter: "ABC Transport",
      lr_no: "LR-2024-002",
      ship_date: "2024-01-10",
      destination: "Delhi, India",
      cartons: 8,
      weight: 180
    }
  ];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      pending: { variant: "secondary", label: "Pending" },
      picked: { variant: "outline", label: "Picked" },
      in_transit: { variant: "default", label: "In Transit" },
      delivered: { variant: "default", label: "Delivered" },
      exception: { variant: "destructive", label: "Exception" }
    };

    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Logistics" subtitle="Shipment tracking and delivery management" />
      
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
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Shipments</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">2</div>
              <p className="text-xs text-muted-foreground">Demo data</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Transit</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1</div>
              <p className="text-xs text-muted-foreground">Currently shipping</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered (30d)</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1</div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Docs</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">All up to date</p>
            </CardContent>
          </Card>
        </div>

        {/* Shipment Cards */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Active Shipments</h2>
          </div>

          {shipments.length === 0 ? (
            <Card>
              <CardContent className="py-0">
                <EmptyState
                  icon="partners"
                  title="No Active Shipments"
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
                <Card key={shipment.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{shipment.id}</CardTitle>
                      {getStatusBadge(shipment.status)}
                    </div>
                    <CardDescription>Work Order: {shipment.wo}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <span>{shipment.transporter}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>LR: {shipment.lr_no}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{shipment.destination}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Shipped: {new Date(shipment.ship_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2 border-t">
                      <span>{shipment.cartons} cartons</span>
                      <span>•</span>
                      <span>{shipment.weight} kg</span>
                    </div>
                    <Button variant="outline" size="sm" className="w-full mt-2" disabled>
                      View Timeline & Docs
                    </Button>
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
