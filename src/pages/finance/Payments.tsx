
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Payments() {
  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Payment Receipts</CardTitle>
            <Button disabled>
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Migration Required</AlertTitle>
              <AlertDescription>
                The payments table is pending database migration approval. Once approved, you'll be able to:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Record payments (date, amount, method, reference)</li>
                  <li>Auto-update invoice status (draft → issued → part_paid → paid)</li>
                  <li>Support multi-payment allocation across invoices</li>
                  <li>Track payment methods (cash, check, wire, etc.)</li>
                  <li>Link payment receipts to invoices</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="mt-6">
              <h3 className="font-semibold mb-2">Planned Features:</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✓ Payment recording with date, amount, method</li>
                <li>✓ Auto invoice status update</li>
                <li>✓ Multi-payment allocation</li>
                <li>✓ Payment method tracking</li>
                <li>✓ Receipt generation</li>
                <li>✓ Payment reconciliation</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
