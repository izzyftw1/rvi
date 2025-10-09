import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Package, Truck, MapPin, FileText } from "lucide-react";

export default function Logistics() {
  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Logistics" subtitle="Shipment tracking and delivery management" />
      
      <div className="p-6 space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Migration Required</AlertTitle>
          <AlertDescription>
            The shipments table enhancements are pending database migration approval. Once approved, you'll be able to:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Capture transporter, LR No, ship date, boxes/cartons, weights, ship-to address</li>
              <li>Track shipment events (picked, in transit, delivered, exceptions)</li>
              <li>Attach delivery documents (CI, Packing List, COO, MTC, POD)</li>
              <li>Link shipments to invoices</li>
              <li>View shipment timelines on Work Orders and Sales Orders</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Shipments</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">Pending migration</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Transit</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">Pending migration</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered (30d)</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">Pending migration</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Docs</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">—</div>
              <p className="text-xs text-muted-foreground">Pending migration</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Planned Features</CardTitle>
            <CardDescription>
              Comprehensive shipment and delivery tracking capabilities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Shipment Creation</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>✓ Create shipments from Dispatch page or Sales Orders</li>
                  <li>✓ Capture transporter name, LR number, ship date</li>
                  <li>✓ Record boxes/cartons, gross/net weights</li>
                  <li>✓ Ship-to address with full details</li>
                  <li>✓ Attach documents (CI, Packing List, COO, MTC)</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Shipment Timeline</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>✓ Event tracking: picked, in transit, out for delivery, delivered</li>
                  <li>✓ Exception tracking with notes</li>
                  <li>✓ Timeline widget on Work Orders and Sales Orders</li>
                  <li>✓ Manual event entry for now</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Delivery Confirmation</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>✓ Delivered date capture</li>
                  <li>✓ Proof of Delivery (POD) attachment (photo/PDF)</li>
                  <li>✓ Status tracking and notifications</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Integration</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>✓ Link shipments to invoices (bi-directional)</li>
                  <li>✓ Document generation from Dispatch (if QC approved)</li>
                  <li>✓ Document storage in shipments.documents (JSONB)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
