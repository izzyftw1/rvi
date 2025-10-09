import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface QCGateControlsProps {
  woId: string;
  qcMaterialPassed: boolean;
  qcFirstPiecePassed: boolean;
  onUpdate: () => void;
}

export function QCGateControls({ woId, qcMaterialPassed, qcFirstPiecePassed, onUpdate }: QCGateControlsProps) {
  const [loading, setLoading] = useState(false);

  const handleQCUpdate = async (gate: 'material' | 'first_piece', passed: boolean) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const updateData: any = {};
      
      if (gate === 'material') {
        updateData.qc_material_passed = passed;
        updateData.qc_material_approved_by = user?.id;
        updateData.qc_material_approved_at = new Date().toISOString();
      } else {
        updateData.qc_first_piece_passed = passed;
        updateData.qc_first_piece_approved_by = user?.id;
        updateData.qc_first_piece_approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('work_orders')
        .update(updateData)
        .eq('id', woId);

      if (error) throw error;

      toast.success(`${gate === 'material' ? 'Material' : 'First Piece'} QC marked as ${passed ? 'Passed' : 'Failed'}`);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update QC status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>QC Gate Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Material QC */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <p className="font-medium">Material QC</p>
            <Badge variant={qcMaterialPassed ? "default" : "secondary"}>
              {qcMaterialPassed ? "✅ Passed" : "🔴 Pending"}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={qcMaterialPassed ? "outline" : "default"}
              onClick={() => handleQCUpdate('material', true)}
              disabled={loading || qcMaterialPassed}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Pass
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleQCUpdate('material', false)}
              disabled={loading || !qcMaterialPassed}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Fail
            </Button>
          </div>
        </div>

        {/* First Piece QC */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <p className="font-medium">First Piece QC</p>
            <Badge variant={qcFirstPiecePassed ? "default" : "secondary"}>
              {qcFirstPiecePassed ? "✅ Passed" : "🔴 Pending"}
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={qcFirstPiecePassed ? "outline" : "default"}
              onClick={() => handleQCUpdate('first_piece', true)}
              disabled={loading || qcFirstPiecePassed || !qcMaterialPassed}
              title={!qcMaterialPassed ? "Material QC must pass first" : ""}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Pass
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleQCUpdate('first_piece', false)}
              disabled={loading || !qcFirstPiecePassed}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Fail
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
