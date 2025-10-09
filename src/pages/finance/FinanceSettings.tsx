import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function FinanceSettings() {
  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Finance Settings" subtitle="Tax profiles, numbering, and currencies" />
      
      <div className="p-6 space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Migration Required</AlertTitle>
          <AlertDescription>
            Finance settings will be functional after database migration approval.
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="tax" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tax">Tax Profiles</TabsTrigger>
            <TabsTrigger value="numbering">Numbering</TabsTrigger>
            <TabsTrigger value="currency">Currencies</TabsTrigger>
            <TabsTrigger value="terms">Payment Terms</TabsTrigger>
          </TabsList>

          <TabsContent value="tax">
            <Card>
              <CardHeader>
                <CardTitle>Tax Profiles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>GST Rate (Domestic)</Label>
                  <Input type="number" placeholder="18" disabled />
                </div>
                <div className="space-y-2">
                  <Label>IGST Rate (Interstate)</Label>
                  <Input type="number" placeholder="18" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Export Tax Rate</Label>
                  <Input type="number" placeholder="0" disabled />
                </div>
                <Button disabled>Save Tax Settings</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="numbering">
            <Card>
              <CardHeader>
                <CardTitle>Invoice Numbering</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Prefix</Label>
                  <Input placeholder="INV-" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Next Number</Label>
                  <Input type="number" placeholder="1" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Input placeholder="INV-YYYY-NNNN" disabled />
                </div>
                <Button disabled>Save Numbering</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="currency">
            <Card>
              <CardHeader>
                <CardTitle>Currency Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Base Currency</Label>
                  <Input value="INR" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Supported Currencies</Label>
                  <div className="flex gap-2">
                    <Input value="INR, USD, EUR, GBP" disabled />
                  </div>
                </div>
                <Button disabled>Save Currencies</Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="terms">
            <Card>
              <CardHeader>
                <CardTitle>Default Payment Terms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Default Days</Label>
                  <Input type="number" placeholder="30" disabled />
                </div>
                <div className="space-y-2">
                  <Label>Terms Text</Label>
                  <Input placeholder="Net 30 days" disabled />
                </div>
                <Button disabled>Save Terms</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
