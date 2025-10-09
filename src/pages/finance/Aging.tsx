import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Aging() {
  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="AR Aging Report" subtitle="Accounts receivable aging analysis" />
      
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Aging Buckets</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Migration Required</AlertTitle>
              <AlertDescription>
                AR Aging reports are pending database migration approval. Once approved, you'll see:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Aging buckets: Current, 1–15, 16–30, 31–45, 46–60, {">"}60 days</li>
                  <li>Totals by bucket and by customer</li>
                  <li>Click-through to invoice list for each bucket</li>
                  <li>Overdue tags with days late</li>
                  <li>Customer-wise breakdowns</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="mt-6">
              <h3 className="font-semibold mb-2">Planned Aging Buckets:</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Current</div>
                  <div className="text-2xl font-bold mt-1">₹0</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">1-15 days</div>
                  <div className="text-2xl font-bold mt-1">₹0</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">16-30 days</div>
                  <div className="text-2xl font-bold mt-1">₹0</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">31-45 days</div>
                  <div className="text-2xl font-bold mt-1">₹0</div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">46-60 days</div>
                  <div className="text-2xl font-bold mt-1">₹0</div>
                </div>
                <div className="p-4 border rounded-lg bg-destructive/10">
                  <div className="text-sm text-muted-foreground">{">"}60 days</div>
                  <div className="text-2xl font-bold mt-1 text-destructive">₹0</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
