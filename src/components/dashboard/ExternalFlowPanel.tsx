import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, formatWeight, formatDisplayValue, isEmpty } from "@/lib/displayUtils";

interface ProcessData {
  pcs: number;
  kg: number;
  activeMoves: number;
  overdue: number;
}

interface PartnerRisk {
  id: string;
  name: string;
  process: string;
  totalPcs: number;
  totalMoves: number;
  overdueMoves: number;
  avgDaysOverdue: number;
}

interface ExternalFlowPanelProps {
  data: Record<string, ProcessData>;
  onProcessClick: (process: string) => void;
}

const PROCESS_CONFIG = [
  { key: 'job_work', label: 'Job Work', icon: Factory, color: 'blue' },
  { key: 'plating', label: 'Plating', icon: Sparkles, color: 'purple' },
  { key: 'buffing', label: 'Buffing', icon: Wind, color: 'cyan' },
  { key: 'blasting', label: 'Blasting', icon: Hammer, color: 'orange' },
  { key: 'forging_ext', label: 'Forging', icon: Flame, color: 'red' }
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

const getProcessColors = (color: string, isSelected: boolean, hasOverdue: boolean) => {
  const colorMap: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500', text: 'text-blue-600', activeBg: 'bg-blue-500/20' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500', text: 'text-purple-600', activeBg: 'bg-purple-500/20' },
    cyan: { bg: 'bg-cyan-500/10', border: 'border-cyan-500', text: 'text-cyan-600', activeBg: 'bg-cyan-500/20' },
    orange: { bg: 'bg-orange-500/10', border: 'border-orange-500', text: 'text-orange-600', activeBg: 'bg-orange-500/20' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500', text: 'text-red-600', activeBg: 'bg-red-500/20' }
  };
  return colorMap[color] || colorMap.blue;
};

export const ExternalFlowPanel = ({ data, onProcessClick }: ExternalFlowPanelProps) => {
  const navigate = useNavigate();
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [partnerRisks, setPartnerRisks] = useState<PartnerRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [worstProcess, setWorstProcess] = useState<string | null>(null);
  const [worstPartner, setWorstPartner] = useState<PartnerRisk | null>(null);

  // Fetch partner-level risk data
  useEffect(() => {
    const fetchPartnerRisks = async () => {
      setLoading(true);
      
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch all external moves with partner info
      const { data: moves } = await supabase
        .from('wo_external_moves')
        .select(`
          id,
          partner_id,
          process,
          quantity_sent,
          quantity_returned,
          expected_return_date,
          status,
          external_partners!wo_external_moves_partner_id_fkey (
            id,
            name
          )
        `)
        .eq('status', 'sent');

      if (!moves) {
        setLoading(false);
        return;
      }

      // Aggregate by partner
      const partnerMap = new Map<string, PartnerRisk>();
      
      moves.forEach(move => {
        const partner = move.external_partners;
        if (!partner) return;
        
        const partnerId = partner.id;
        const existing = partnerMap.get(partnerId) || {
          id: partnerId,
          name: partner.name,
          process: move.process || 'unknown',
          totalPcs: 0,
          totalMoves: 0,
          overdueMoves: 0,
          avgDaysOverdue: 0
        };
        
        const pendingQty = (move.quantity_sent || 0) - (move.quantity_returned || 0);
        const isOverdue = move.expected_return_date && move.expected_return_date < today;
        const daysOverdue = isOverdue 
          ? Math.floor((new Date(today).getTime() - new Date(move.expected_return_date!).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        
        existing.totalPcs += pendingQty;
        existing.totalMoves += 1;
        if (isOverdue) {
          existing.overdueMoves += 1;
          existing.avgDaysOverdue = (existing.avgDaysOverdue * (existing.overdueMoves - 1) + daysOverdue) / existing.overdueMoves;
        }
        
        partnerMap.set(partnerId, existing);
      });

      const risks = Array.from(partnerMap.values())
        .sort((a, b) => (b.avgDaysOverdue * b.overdueMoves) - (a.avgDaysOverdue * a.overdueMoves));
      
      setPartnerRisks(risks);
      
      // Find worst partner
      if (risks.length > 0 && risks[0].overdueMoves > 0) {
        setWorstPartner(risks[0]);
      }
      
      setLoading(false);
    };

    fetchPartnerRisks();
  }, [data]);

  // Calculate totals and find worst process with null-safety
  const safeData = data ?? {};
  const totalActive = Object.values(safeData).reduce((sum, p) => sum + (p?.activeMoves ?? 0), 0);
  const totalOverdue = Object.values(safeData).reduce((sum, p) => sum + (p?.overdue ?? 0), 0);
  const totalPcs = Object.values(safeData).reduce((sum, p) => sum + (p?.pcs ?? 0), 0);
  const maxOverdue = Math.max(...Object.values(safeData).map(p => p?.overdue ?? 0), 0);

  // Find worst process
  useEffect(() => {
    let worstKey: string | null = null;
    let worstScore = 0;
    
    Object.entries(safeData).forEach(([key, processData]) => {
      const overdue = processData?.overdue ?? 0;
      const pcs = processData?.pcs ?? 0;
      const score = overdue * 10 + pcs;
      if (score > worstScore && overdue > 0) {
        worstScore = score;
        worstKey = key;
      }
    });
    
    setWorstProcess(worstKey);
  }, [safeData]);

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
    ? partnerRisks.filter(p => p.process.toLowerCase().includes(selectedProcess.replace('_ext', '').replace('_', ' ')))
    : partnerRisks;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary strip with alerts */}
        <div className="flex items-center justify-between px-2 flex-wrap gap-2">
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="text-muted-foreground">
              Active: <span className="font-semibold text-foreground">{formatCount(totalActive)}</span> moves
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

        {/* Worst alerts banner */}
        {(worstProcess || worstPartner) && (
          <div className="flex flex-wrap gap-2 px-2">
            {worstProcess && data[worstProcess]?.overdue > 0 && (
              <Badge 
                variant="outline" 
                className="border-destructive text-destructive cursor-pointer hover:bg-destructive/10"
                onClick={() => handleProcessClick(worstProcess)}
              >
                <AlertTriangle className="h-3 w-3 mr-1" />
                Worst Process: {PROCESS_CONFIG.find(p => p.key === worstProcess)?.label} ({data[worstProcess].overdue} overdue)
              </Badge>
            )}
            {worstPartner && worstPartner.overdueMoves > 0 && (
              <Badge 
                variant="outline" 
                className="border-amber-500 text-amber-600 cursor-pointer hover:bg-amber-500/10"
                onClick={() => navigate(`/partners?partner=${worstPartner.id}`)}
              >
                <Building2 className="h-3 w-3 mr-1" />
                Risk Partner: {worstPartner.name} ({Math.round(worstPartner.avgDaysOverdue)}d avg overdue)
              </Badge>
            )}
          </div>
        )}

        {/* Process Heatmap Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {PROCESS_CONFIG.map(({ key, label, icon: Icon, color }) => {
            const processData = data[key] || { pcs: 0, kg: 0, activeMoves: 0, overdue: 0 };
            const hasActivity = processData.activeMoves > 0;
            const hasOverdue = processData.overdue > 0;
            const isSelected = selectedProcess === key;
            const isWorst = worstProcess === key;
            const colors = getProcessColors(color, isSelected, hasOverdue);
            const heatmapBg = getHeatmapIntensity(processData.overdue, maxOverdue);

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
                          <span className="text-sm font-medium">{label}</span>
                        </div>
                        {hasOverdue && (
                          <Badge 
                            variant="destructive" 
                            className={cn(
                              "h-5 text-[10px] px-1.5",
                              isWorst && "animate-pulse"
                            )}
                          >
                            {processData.overdue}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div>
                          <div className={cn(
                            "text-xl font-bold",
                            hasActivity ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {formatCount(processData.activeMoves)}
                          </div>
                          <p className="text-[10px] text-muted-foreground">moves</p>
                        </div>
                        <div>
                          <div className={cn(
                            "text-xl font-bold",
                            hasActivity ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {formatCount(processData.pcs)}
                          </div>
                          <p className="text-[10px] text-muted-foreground">pcs</p>
                        </div>
                      </div>

                      {!isEmpty(processData.kg) && (
                        <div className="mt-2 pt-2 border-t border-border/50 text-center">
                          <span className="text-xs text-muted-foreground">
                            {formatWeight(processData.kg)}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    <p className="font-semibold">{label}</p>
                    <p>{formatCount(processData.activeMoves)} active moves</p>
                    <p>{formatCount(processData.pcs)} pcs • {formatWeight(processData.kg)}</p>
                    {hasOverdue && <p className="text-destructive">{formatCount(processData.overdue)} overdue returns</p>}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Partner Risk List */}
        <Card>
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Partner Risk
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
                <div className="p-4 text-center text-sm text-muted-foreground">No pending external moves</div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredPartners.slice(0, 10).map((partner, index) => {
                    const isHighRisk = partner.overdueMoves > 0 && partner.avgDaysOverdue > 3;
                    const isMediumRisk = partner.overdueMoves > 0;
                    const isWorstPartnerItem = worstPartner?.id === partner.id;
                    
                    return (
                      <div
                        key={partner.id}
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
                                {partner.name}
                              </p>
                              <p className="text-[10px] text-muted-foreground capitalize">
                                {partner.process}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 text-right">
                            {partner.overdueMoves > 0 && (
                              <div className="flex flex-col items-end">
                                <Badge 
                                  variant="destructive" 
                                  className={cn(
                                    "text-[9px] px-1.5 py-0",
                                    isHighRisk && "animate-pulse"
                                  )}
                                >
                                  SLA Breach
                                </Badge>
                                <span className="text-[10px] text-destructive font-medium mt-0.5">
                                  Avg {Math.round(partner.avgDaysOverdue)}d Overdue
                                </span>
                              </div>
                            )}
                            <div>
                              <p className={cn(
                                "text-sm font-bold",
                                partner.overdueMoves > 0 ? "text-amber-600" : "text-foreground"
                              )}>
                                {formatCount(partner.totalPcs)}
                              </p>
                              <p className={cn(
                                "text-[10px]",
                                partner.overdueMoves > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"
                              )}>
                                {partner.overdueMoves > 0 ? "pcs at Risk" : "pcs pending"}
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
                              navigate(`/partners?partner=${partner.id}`);
                            }}
                          >
                            <Building2 className="h-3 w-3 mr-1" />
                            View Partner
                          </Button>
                          {partner.overdueMoves > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/logistics?filter=overdue&partner=${partner.id}`);
                              }}
                            >
                              <Clock className="h-3 w-3 mr-1" />
                              View Overdue Jobs
                            </Button>
                          )}
                          {isHighRisk && (
                            <Badge 
                              variant="outline" 
                              className="h-5 text-[9px] border-amber-500 text-amber-600 cursor-pointer hover:bg-amber-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Flag only - no logic change
                              }}
                            >
                              <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                              Hold New Moves
                            </Badge>
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
      </div>
    </TooltipProvider>
  );
};
