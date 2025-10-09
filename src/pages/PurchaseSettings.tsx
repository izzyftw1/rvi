import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

interface PurchaseSettings {
  id: string;
  rate_variance_tolerance_percent: number;
  require_reason_on_override: boolean;
}

export default function PurchaseSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PurchaseSettings | null>(null);
  const [tolerance, setTolerance] = useState("5.0");
  const [requireReason, setRequireReason] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("purchase_settings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        setSettings(data);
        setTolerance(data.rate_variance_tolerance_percent.toString());
        setRequireReason(data.require_reason_on_override);
      }
    } catch (error: any) {
      console.error("Error loading settings:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const toleranceValue = parseFloat(tolerance);
      if (isNaN(toleranceValue) || toleranceValue < 0 || toleranceValue > 100) {
        toast({ variant: "destructive", description: "Tolerance must be between 0 and 100" });
        return;
      }

      if (settings) {
        // Update existing
        const { error } = await supabase
          .from("purchase_settings")
          .update({
            rate_variance_tolerance_percent: toleranceValue,
            require_reason_on_override: requireReason,
            updated_by: user.id
          })
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("purchase_settings")
          .insert({
            rate_variance_tolerance_percent: toleranceValue,
            require_reason_on_override: requireReason,
            updated_by: user.id
          });

        if (error) throw error;
      }

      toast({ title: "Success", description: "Settings saved successfully" });
      loadSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Purchase Settings" subtitle="Configure procurement parameters" />
      
      <div className="p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Rate Variance Controls</CardTitle>
            <CardDescription>
              Set tolerance levels for purchase order rate variances and override requirements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <p className="text-center text-muted-foreground">Loading settings...</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="tolerance">
                    Default Rate Variance Tolerance (%)
                  </Label>
                  <Input
                    id="tolerance"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={tolerance}
                    onChange={(e) => setTolerance(e.target.value)}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    When the invoice rate differs from the PO rate by more than this percentage,
                    a warning will be shown and notifications will be sent.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="require-reason">Require Reason on Override</Label>
                    <p className="text-xs text-muted-foreground">
                      When enabled, users must provide a reason when the variance exceeds tolerance
                    </p>
                  </div>
                  <Switch
                    id="require-reason"
                    checked={requireReason}
                    onCheckedChange={setRequireReason}
                  />
                </div>

                <div className="pt-4">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
