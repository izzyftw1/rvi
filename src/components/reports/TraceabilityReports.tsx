import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Download } from "lucide-react";

const TraceabilityReports = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [traceData, setTraceData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleGenealogyTrace = async () => {
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    try {
      // Search shipment
      const { data: shipment, error: shipError } = await supabase
        .from("shipments")
        .select(`
          *,
          shipment_pallets(
            pallet:pallets(
              *,
              pallet_cartons(
                carton:cartons(
                  *,
                  wo:work_orders(*),
                  material_issues(
                    lot:material_lots(*)
                  )
                )
              )
            )
          ),
          logistics_costs(*)
        `)
        .eq("ship_id", searchTerm)
        .maybeSingle();

      if (shipError) throw shipError;

      if (shipment) {
        setTraceData({ type: "shipment", data: shipment });
        toast({ title: "Genealogy trace complete", description: "Traced from shipment to all heat numbers" });
      } else {
        toast({ title: "Not found", description: "No shipment found with that ID", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReverseTrace = async () => {
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    try {
      // Find all lots with this heat number
      const { data: lots, error: lotError } = await supabase
        .from("material_lots")
        .select(`
          *,
          material_issues(
            wo:work_orders(
              *,
              cartons(*),
              qc_records(*)
            )
          ),
          material_costs(*)
        `)
        .eq("heat_no", searchTerm);

      if (lotError) throw lotError;

      if (lots && lots.length > 0) {
        setTraceData({ type: "reverse", data: lots });
        toast({ title: "Reverse trace complete", description: `Found ${lots.length} lot(s) with heat number ${searchTerm}` });
      } else {
        toast({ title: "Not found", description: "No lots found with that heat number", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRecallReport = async () => {
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    try {
      // Find lot and all affected shipments
      const { data: lot, error: lotError } = await supabase
        .from("material_lots")
        .select(`
          *,
          material_issues(
            wo:work_orders(
              *,
              cartons(
                pallet_cartons(
                  pallet:pallets(
                    shipment_pallets(
                      shipment:shipments(*)
                    )
                  )
                )
              )
            )
          )
        `)
        .eq("lot_id", searchTerm)
        .maybeSingle();

      if (lotError) throw lotError;

      if (lot) {
        setTraceData({ type: "recall", data: lot });
        toast({ title: "Recall report generated", description: "All affected shipments identified" });
      } else {
        toast({ title: "Not found", description: "No lot found with that ID", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = () => {
    toast({ title: "Export", description: "PDF export feature coming soon" });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Traceability Reports</CardTitle>
          <CardDescription>
            Genealogy, reverse trace, and recall reports for complete material traceability
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Search by Shipment ID / Heat No / Lot ID</Label>
              <Input
                placeholder="Enter ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenealogyTrace} disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              Forward Genealogy
            </Button>
            <Button onClick={handleReverseTrace} variant="outline" disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              Reverse Trace
            </Button>
            <Button onClick={handleRecallReport} variant="outline" disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              Recall Report
            </Button>
            {traceData && (
              <Button onClick={exportToPDF} variant="secondary">
                <Download className="mr-2 h-4 w-4" />
                Export PDF
              </Button>
            )}
          </div>

          {traceData && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Trace Results</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs overflow-auto max-h-96 bg-muted p-4 rounded">
                  {JSON.stringify(traceData, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TraceabilityReports;
