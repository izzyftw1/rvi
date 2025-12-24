import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sparkles, 
  Wind, 
  Hammer, 
  Flame, 
  Factory,
  AlertTriangle,
  ExternalLink,
  X,
  Clock,
  TrendingUp,
  Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, isEmpty } from "@/lib/displayUtils";
import { useBatchBasedWIP } from "@/hooks/useBatchBasedWIP";

/**
 * ExternalFlowPanel - External Processing Status
 * 
 * SINGLE SOURCE OF TRUTH: All external quantities derived from production_batches
 * where stage_type='external'.
 * 
 * Do NOT use wo_external_moves for WIP counts.
 * production_batches.external_partner_id links to partner.
 */

interface ProcessData {
  pcs: number;
  kg: number;
  activeMoves: number;
  overdue: number;
}

interface ExternalFlowPanelProps {
  data?: Record<string, ProcessData>; // Legacy prop - ignored
  onProcessClick: (process: string) => void;
}

const PROCESS_CONFIG = [
  { key: 'Forging', label: 'Forging', icon: Flame, color: 'red' },
  { key: 'Job Work', label: 'Job Work', icon: Factory, color: 'blue' },
  { key: 'Plating', label: 'Plating', icon: Sparkles, color: 'purple' },
  { key: 'Buffing', label: 'Buffing', icon: Wind, color: 'cyan' },
  { key: 'Blasting', label: 'Blasting', icon: Hammer, color: 'orange' },
  { key: 'Heat Treatment', label: 'Heat Treatment', icon: Flame, color: 'amber' }
];

// Heatmap intensity based on overdue count
const getHeatmapIntensity = (overdue: number, maxOverdue: number): string => {
  if (overdue === 0) return 'bg-muted/30';
  const ratio = overdue / Math.max(maxOverdue, 1);
  if (ratio > 0.7) return 'bg-destructive/80';
  if (ratio > 0.4) return 'bg-destructive/50';
  if (ratio > 0.2) return 'bg-amber-500/50';
  return 'bg-amber-500/30';
};

const getProcessColors = (color: string) => {
  const colorMap: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500', text: 'text-blue-600', activeBg: 'bg-blue-500/20' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500', text: 'text-purple-600', activeBg: 'bg-purple-500/20' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500', text: 'text-cyan-600', activeBg: 'bg-cyan-500/20' },
    orange: { bg: 'bg-orange-500/10', border: 'border-orange-500', text: 'text-orange-600', activeBg: 'bg-orange-500/20' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500', text: 'text-red-600', activeBg: 'bg-red-500/20' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500', text: 'text-amber-600', activeBg: 'bg-amber-500/20' }
  };
  return colorMap[color] || colorMap.blue;
};

export const ExternalFlowPanel = ({ data: _legacyData, onProcessClick }: ExternalFlowPanelProps) => {
  const navigate = useNavigate();
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  
  // Use batch-based WIP - single source of truth
  const { externalProcesses, partnerMetrics, loading } = useBatchBasedWIP();
  
  // Find worst process and partner based on batch data
  const worstProcess = externalProcesses.reduce((worst, p) => 
    (p.overdueCount > (worst?.overdueCount || 0)) ? p : worst, null as typeof externalProcesses[0] | null);
  const worstPartner = partnerMetrics.find(p => p.overdueCount > 0);

  // Calculate totals from batch data
  const totalActive = externalProcesses.reduce((sum, p) => sum + p.batchCount, 0);
  const totalOverdue = externalProcesses.reduce((sum, p) => sum + p.overdueCount, 0);
  const totalPcs = externalProcesses.reduce((sum, p) => sum + p.totalQuantity, 0);
  const maxOverdue = Math.max(...externalProcesses.map(p => p.overdueCount), 0);

  const handleProcessClick = (key: string) => {
    if (selectedProcess === key) {
      setSelectedProcess(null);
    } else {
      setSelectedProcess(key);
    }
    onProcessClick(key);
  };

  // Filter partners by selected process
  const filteredPartners = selectedProcess 
    ? partnerMetrics.filter(p => p.processType.toLowerCase().includes(selectedProcess.toLowerCase()))
    : partnerMetrics;

  // Get process data from batch-based metrics
  const getProcessData = (key: string) => {
    const process = externalProcesses.find(p => 
      p.processType.toLowerCase() === key.toLowerCase() ||
      p.processType.toLowerCase().includes(key.toLowerCase().replace('_', ' '))
    );
    return process || { processType: key, batchCount: 0, totalQuantity: 0, overdueCount: 0, avgWaitHours: 0, partnerBreakdown: [] };
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary strip with alerts - derived from batch data */}
        <div className="flex items-center justify-between px-2 flex-wrap gap-2">
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-muted-foreground">
              Active: <span className="font-semibold text-foreground">{formatCount(totalActive)}</span> batches
            </span>
            <span className="text-muted-foreground">
              WIP: <span className="font-semibold text-foreground">{formatCount(totalPcs)}</span> pcs
            </span>
            {!isEmpty(totalOverdue) && (
              <Badge variant="destructive" className="gap-1 animate-pulse">
                <AlertTriangle className="h-3 w-3" />
                {formatCount(totalOverdue)} Overdue
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {selectedProcess && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => setSelectedProcess(null)}
              >
                <X className="h-3 w-3" />
                Clear Filter
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => navigate('/partners')}
            >
              View All <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Worst alerts banner - derived from batch data */}
        {(worstProcess || worstPartner) && (
          <div className="flex flex-wrap gap-2 px-2">
            {worstProcess && worstProcess.overdueCount > 0 && (
              <Badge 
                variant="outline" 
                className="border-destructive text-destructive cursor-pointer hover:bg-destructive/10"
                onClick={() => handleProcessClick(worstProcess.processType)}
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Worst Process: {worstProcess.processType} ({worstProcess.overdueCount} overdue)
              </Badge>
            )}
            {worstPartner && worstPartner.overdueCount > 0 && (
              <Badge 
                variant="outline" 
                className="border-amber-500 text-amber-600 cursor-pointer hover:bg-amber-500/10"
                onClick={() => navigate(`/partners?partner=${worstPartner.partnerId}`)}
              >
                <Building2 className="h-3 w-3 mr-1" />
                Risk Partner: {worstPartner.partnerName} ({Math.round(worstPartner.avgWaitHours / 24)}d avg wait)
              </Badge>
            )}
          </div>
        )}

        {/* Process Heatmap Grid - derived from batch data */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {PROCESS_CONFIG.map(({ key, label, icon: Icon, color }) => {
            const processData = getProcessData(key);
            const hasActivity = processData.batchCount > 0;
            const hasOverdue = processData.overdueCount > 0;
            const isSelected = selectedProcess === key;
            const isWorst = worstProcess?.processType === key;
            const colors = getProcessColors(color);
            const heatmapBg = getHeatmapIntensity(processData.overdueCount, maxOverdue);

            return (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <Card
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 border-2 relative overflow-hidden",
                      isSelected ? colors.border : "border-transparent",
                      isWorst && hasOverdue && "ring-2 ring-destructive ring-offset-2 ring-offset-background",
                      !hasActivity && "opacity-40"
                    )}
                    onClick={() => handleProcessClick(key)}
                  >
                    {/* Heatmap background overlay */}
                    <div className={cn(
                      "absolute inset-0 transition-colors",
                      hasOverdue ? heatmapBg : (hasActivity ? colors.bg : 'bg-muted/10')
                    )} />
                    
                    <CardContent className="p-4 relative">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1.5 rounded", colors.activeBg)}>
                            <Icon className={cn("h-4 w-4", colors.text)} />
                          </div>
                          <span className="text-xs font-medium">{label}</span>
                        </div>
                        {hasOverdue && (
                          <Badge 
                            variant="destructive" 
                            className={cn(
                              "h-5 text-[10px] px-1.5",
                              isWorst && "animate-pulse"
                            )}
                          >
                            {processData.overdueCount}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div>
                          <div className={cn(
                            "text-xl font-bold",
                            hasActivity ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {formatCount(processData.batchCount)}
                          </div>
                          <p className="text-[10px] text-muted-foreground">batches</p>
                        </div>
                        <div>
                          <div className={cn(
                            "text-xl font-bold",
                            hasActivity ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {formatCount(processData.totalQuantity)}
                          </div>
                          <p className="text-[10px] text-muted-foreground">pcs</p>
                        </div>
                      </div>

                      {hasActivity && processData.avgWaitHours > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50 text-center">
                          <span className={cn(
                            "text-xs",
                            processData.avgWaitHours > 48 ? "text-destructive" :
                            processData.avgWaitHours > 24 ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            <Clock className="h-3 w-3 inline mr-1" />
                            {Math.round(processData.avgWaitHours)}h avg
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">{label}</p>
                    <p>{formatCount(processData.batchCount)} active batches</p>
                    <p>{formatCount(processData.totalQuantity)} pcs</p>
                    {processData.avgWaitHours > 0 && <p>Avg wait: {Math.round(processData.avgWaitHours)}h</p>}
                    {hasOverdue && <p className="text-destructive">{formatCount(processData.overdueCount)} overdue</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Partner Risk List - derived from batch data */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Partner Risk (Batch-Based)
                {selectedProcess && (
                  <Badge variant="secondary" className="text-xs">
                    {PROCESS_CONFIG.find(p => p.key === selectedProcess)?.label}
                  </Badge>
                )}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {filteredPartners.length} partners
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[180px]">
              {loading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
              ) : filteredPartners.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No batches at external partners</div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredPartners.slice(0, 10).map((partner, index) => {
                    const avgDaysWait = partner.avgWaitHours / 24;
                    const isHighRisk = partner.overdueCount > 0 && avgDaysWait > 3;
                    const isMediumRisk = partner.overdueCount > 0;
                    const isWorstPartnerItem = worstPartner?.partnerId === partner.partnerId;
                    
                    return (
                      <div
                        key={partner.partnerId}
                        className={cn(
                          "px-4 py-3 transition-colors",
                          isWorstPartnerItem && "bg-destructive/5"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                              isHighRisk ? "bg-destructive text-destructive-foreground" :
                              isMediumRisk ? "bg-amber-500 text-white" :
                              "bg-muted text-muted-foreground"
                            )}>
                              {index + 1}
                            </div>
                            <div>
                              <p className={cn(
                                "text-sm font-medium",
                                isWorstPartnerItem && "text-destructive"
                              )}>
                                {partner.partnerName}
                              </p>
                              <p className="text-[10px] text-muted-foreground capitalize">
                                {partner.processType}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 text-right">
                            {partner.overdueCount > 0 && (
                              <div className="flex flex-col items-end">
                                <Badge 
                                  variant="destructive" 
                                  className={cn(
                                    "text-[9px] px-1.5 py-0",
                                    isHighRisk && "animate-pulse"
                                  )}
                                >
                                  {partner.overdueCount} Overdue
                                </Badge>
                                <span className="text-[10px] text-destructive font-medium mt-0.5">
                                  Avg {Math.round(avgDaysWait)}d Wait
                                </span>
                              </div>
                            )}
                            <div>
                              <p className={cn(
                                "text-sm font-bold",
                                partner.overdueCount > 0 ? "text-amber-600" : "text-foreground"
                              )}>
                                {formatCount(partner.totalQuantity)}
                              </p>
                              <p className={cn(
                                "text-[10px]",
                                partner.overdueCount > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"
                              )}>
                                {partner.overdueCount > 0 ? "pcs at Risk" : "pcs pending"}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Partner CTAs */}
                        <div className="flex items-center gap-2 pl-9">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/partners?partner=${partner.partnerId}`);
                            }}
                          >
                            <Building2 className="h-3 w-3 mr-1" />
                            View Partner
                          </Button>
                          {partner.overdueCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/logistics?filter=overdue&partner=${partner.partnerId}`);
                              }}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              View Overdue
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
        
        {/* Source indicator */}
        <p className="text-[10px] text-muted-foreground italic text-right">
          All values derived from production_batches (batch-level source of truth)
        </p>
      </div>
    </TooltipProvider>
  );
};
