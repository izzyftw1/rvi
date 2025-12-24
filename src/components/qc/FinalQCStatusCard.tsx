import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QCGateStatusBadge } from "@/components/QCGateStatusBadge";
import { 
  Shield, 
  Lock, 
  ExternalLink, 
  FileText, 
  Download, 
  AlertTriangle,
  CheckCircle2,
  Clock
} from "lucide-react";
import { format } from "date-fns";

interface FinalQCStatusCardProps {
  woId: string;
  woNumber: string;
  customer: string;
  itemCode: string;
  status: string;
  qualityReleased: boolean;
  qualityReleasedAt?: string | null;
  qualityReleasedByName?: string;
  remarks?: string | null;
  onNavigateToInspect?: () => void;
}

interface ReportData {
  id: string;
  file_url: string;
  version_number: number;
  generated_at: string;
  generated_by_name?: string;
}

export const FinalQCStatusCard = ({
  woId,
  woNumber,
  customer,
  itemCode,
  status,
  qualityReleased,
  qualityReleasedAt,
  qualityReleasedByName,
  remarks,
}: FinalQCStatusCardProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [latestReport, setLatestReport] = useState<ReportData | null>(null);
  const [hourlyQCCount, setHourlyQCCount] = useState(0);
  const [productionSummary, setProductionSummary] = useState<{
    totalOK: number;
    totalRejected: number;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, [woId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load latest report
      const { data: reportData } = await supabase
        .from('qc_final_reports')
        .select(`
          id,
          file_url,
          version_number,
          generated_at,
          generated_by
        `)
        .eq('work_order_id', woId)
        .order('version_number', { ascending: false })
        .limit(1)
        .single();

      if (reportData) {
        let generatedByName = undefined;
        if (reportData.generated_by) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', reportData.generated_by)
            .single();
          generatedByName = profile?.full_name;
        }
        setLatestReport({
          ...reportData,
          generated_by_name: generatedByName
        });
      }

      // Load hourly QC count
      const { count: qcCount } = await supabase
        .from('hourly_qc_checks')
        .select('*', { count: 'exact', head: true })
        .eq('wo_id', woId);

      setHourlyQCCount(qcCount || 0);

      // Load production summary
      const { data: prodLogs } = await supabase
        .from('daily_production_logs')
        .select('ok_quantity, total_rejection_quantity')
        .eq('wo_id', woId);

      if (prodLogs && prodLogs.length > 0) {
        const totalOK = prodLogs.reduce((sum, log) => sum + (log.ok_quantity || 0), 0);
        const totalRejected = prodLogs.reduce((sum, log) => sum + (log.total_rejection_quantity || 0), 0);
        setProductionSummary({ totalOK, totalRejected });
      }

    } catch (error) {
      console.error('Error loading Final QC data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    if (qualityReleased) {
      return <Lock className="h-5 w-5 text-green-600" />;
    }
    if (status === 'failed' || status === 'blocked') {
      return <AlertTriangle className="h-5 w-5 text-destructive" />;
    }
    if (status === 'passed' || status === 'waived') {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    }
    return <Clock className="h-5 w-5 text-muted-foreground" />;
  };

  const getStatusLabel = () => {
    if (qualityReleased) return 'Quality Released';
    if (status === 'failed' || status === 'blocked') return 'Blocked';
    if (status === 'passed') return 'Passed';
    if (status === 'waived') return 'Waived';
    return 'Pending Inspection';
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={qualityReleased ? 'border-green-500/50 bg-green-50/30 dark:bg-green-900/10' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${qualityReleased ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
              <Shield className="h-5 w-5" style={{ color: 'hsl(142 70% 45%)' }} />
            </div>
            <div>
              <CardTitle className="text-base">Final Dispatch QC</CardTitle>
              <CardDescription>Final inspection before packing and dispatch</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge 
              variant={qualityReleased ? 'default' : 'outline'}
              className={qualityReleased ? 'bg-green-600' : ''}
            >
              {getStatusLabel()}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">
              {productionSummary?.totalOK.toLocaleString() || 0}
            </div>
            <div className="text-xs text-muted-foreground">OK Quantity</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-destructive">
              {productionSummary?.totalRejected.toLocaleString() || 0}
            </div>
            <div className="text-xs text-muted-foreground">Rejected</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {hourlyQCCount}
            </div>
            <div className="text-xs text-muted-foreground">Hourly Checks</div>
          </div>
        </div>

        {/* Release Details */}
        {qualityReleased && qualityReleasedAt && (
          <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg space-y-1 text-sm border border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 text-green-800 dark:text-green-300 font-medium">
              <Lock className="h-4 w-4" />
              Quality Released
            </div>
            <div className="flex justify-between text-green-700 dark:text-green-400">
              <span>Released At:</span>
              <span>{format(new Date(qualityReleasedAt), 'PPp')}</span>
            </div>
            {qualityReleasedByName && (
              <div className="flex justify-between text-green-700 dark:text-green-400">
                <span>Released By:</span>
                <span>{qualityReleasedByName}</span>
              </div>
            )}
          </div>
        )}

        {/* Remarks */}
        {remarks && (
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <span className="text-muted-foreground">Remarks: </span>
            <span>{remarks}</span>
          </div>
        )}

        {/* Latest Report */}
        {latestReport && (
          <div className="p-3 border rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Final QC Report</span>
                <Badge variant="secondary" className="text-xs">v{latestReport.version_number}</Badge>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(latestReport.file_url, '_blank')}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Generated {format(new Date(latestReport.generated_at), 'PPp')}
              {latestReport.generated_by_name && ` by ${latestReport.generated_by_name}`}
            </div>
          </div>
        )}

        {/* Action Button - Navigate to Final QC Page */}
        <div className="pt-2 border-t">
          <Button
            variant={qualityReleased ? "outline" : "default"}
            className="w-full"
            onClick={() => navigate(`/final-qc/${woId}`)}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            {qualityReleased ? 'View Full Inspection Details' : 'Go to Final QC Inspection'}
          </Button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {qualityReleased 
              ? 'Final QC inspection completed. View details or regenerate report.'
              : 'Perform final inspection in Quality > Final QC'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
