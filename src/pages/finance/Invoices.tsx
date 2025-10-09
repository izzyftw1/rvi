import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function Invoices() {
  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Invoices" subtitle="Manage customer invoices" />
      
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Invoices</CardTitle>
            <Button disabled>
              <Plus className="h-4 w-4 mr-2" />
              Create Invoice
            </Button>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Migration Required</AlertTitle>
              <AlertDescription>
                The invoices table is pending database migration approval. Once approved, you'll be able to:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Create invoices from approved Sales Orders</li>
                  <li>Support partial invoicing (select subset of SO lines/qty)</li>
                  <li>Auto-calculate GST (domestic only), subtotal, total</li>
                  <li>Set due_date = invoice_date + payment_terms_days</li>
                  <li>Generate PDF with company letterhead</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="mt-6">
              <h3 className="font-semibold mb-2">Planned Features:</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>✓ Invoice creation from SO with line selection</li>
                <li>✓ Partial invoicing support</li>
                <li>✓ Auto GST calculation (domestic)</li>
                <li>✓ Payment terms & due date calculation</li>
                <li>✓ PDF generation & storage</li>
                <li>✓ Status tracking (draft → issued → part_paid → paid)</li>
                <li>✓ Multi-currency support</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
