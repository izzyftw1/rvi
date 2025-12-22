import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertCircle, FlaskConical, Target } from "lucide-react";
import { format } from "date-fns";
import { ProductionContextDisplay } from "@/components/qc/ProductionContextDisplay";

interface QCRecord {
  id: string;
  qc_id: string;
  qc_type: string;
  result: string;
  qc_date_time?: string;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  measurements?: any;
  remarks?: string;
}

interface EnhancedQCRecordsProps {
  qcRecords: QCRecord[];
  workOrder: any;
}

export function EnhancedQCRecords({ qcRecords, workOrder }: EnhancedQCRecordsProps) {
  const getQCIcon = (result: string) => {
    switch (result?.toLowerCase()) {
      case 'pass':
      case 'passed':
        return <CheckCircle2 className="h-6 w-6 text-green-500" />;
      case 'fail':
      case 'failed':
        return <XCircle className="h-6 w-6 text-red-500" />;
      case 'pending':
        return <AlertCircle className="h-6 w-6 text-yellow-500" />;
      default:
        return <FlaskConical className="h-6 w-6 text-muted-foreground" />;
    }
  };

  const getResultBadge = (result: string) => {
    switch (result?.toLowerCase()) {
      case 'pass':
      case 'passed':
        return <Badge className="bg-green-500">PASS ✓</Badge>;
      case 'fail':
      case 'failed':
        return <Badge variant="destructive">FAIL ✗</Badge>;
      case 'pending':
        return <Badge variant="secondary">PENDING</Badge>;
      default:
        return <Badge variant="outline">{result}</Badge>;
    }
  };

  const getQCTypeLabel = (type: string) => {
    const labels: Record<string, { name: string; icon: any }> = {
      'incoming': { name: 'Raw Material QC', icon: FlaskConical },
      'first_piece': { name: 'First Piece QC', icon: Target },
      'in_process': { name: 'In-Process QC', icon: CheckCircle2 },
      'final': { name: 'Final QC', icon: CheckCircle2 },
    };
    return labels[type] || { name: type, icon: FlaskConical };
  };

  const groupedQC = {
    incoming: qcRecords.filter(q => q.qc_type === 'incoming'),
    first_piece: qcRecords.filter(q => q.qc_type === 'first_piece'),
    in_process: qcRecords.filter(q => q.qc_type === 'in_process'),
    final: qcRecords.filter(q => q.qc_type === 'final'),
  };

  return (
    <div className="space-y-4">
      {/* Production Context from Daily Production Log - Read Only */}
      <ProductionContextDisplay
        workOrderId={workOrder.id}
        title="Production Context (from Daily Log)"
        showRejectionDetails={true}
      />

      {/* QC Gates Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={workOrder.qc_material_passed ? 'border-green-500' : 'border-red-500'}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Raw Material</p>
                {getResultBadge(workOrder.qc_material_status || 'pending')}
              </div>
              {getQCIcon(workOrder.qc_material_status || 'pending')}
            </div>
          </CardContent>
        </Card>
        
        <Card className={workOrder.qc_first_piece_passed ? 'border-green-500' : 'border-red-500'}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">First Piece</p>
                {getResultBadge(workOrder.qc_first_piece_status || 'pending')}
              </div>
              {getQCIcon(workOrder.qc_first_piece_status || 'pending')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">In-Process</p>
                <Badge variant="secondary">{groupedQC.in_process.length} checks</Badge>
              </div>
              <FlaskConical className="h-6 w-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Final QC</p>
                <Badge variant="secondary">{groupedQC.final.length} checks</Badge>
              </div>
              <CheckCircle2 className="h-6 w-6 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* QC Records by Type */}
      {Object.entries(groupedQC).map(([type, records]) => {
        if (records.length === 0) return null;
        const typeInfo = getQCTypeLabel(type);
        const Icon = typeInfo.icon;

        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {typeInfo.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {records.map((qc) => (
                  <div
                    key={qc.id}
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          {getQCIcon(qc.result)}
                          <span className="font-medium">{qc.qc_id}</span>
                          {getResultBadge(qc.result)}
                        </div>

                        <div className="text-sm text-muted-foreground">
                          <p>
                            Tested: {format(
                              new Date(qc.qc_date_time || qc.created_at), 
                              'dd MMM yyyy, hh:mm a'
                            )}
                          </p>
                          {qc.approved_at && (
                            <p>
                              Approved: {format(new Date(qc.approved_at), 'dd MMM yyyy, hh:mm a')}
                            </p>
                          )}
                        </div>

                        {qc.measurements && Object.keys(qc.measurements).length > 0 && (
                          <div className="mt-2 p-2 bg-secondary rounded text-sm">
                            <p className="font-medium mb-1">Measurements:</p>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(qc.measurements).map(([key, value]) => (
                                <div key={key}>
                                  <span className="text-muted-foreground">{key}:</span>{' '}
                                  <span className="font-medium">{JSON.stringify(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {qc.remarks && (
                          <p className="text-sm italic text-muted-foreground">
                            💬 {qc.remarks}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {qcRecords.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              No QC records found for this work order
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
