/**
 * ExternalFlowPanel - External Processing Status
 * Clean grid with no text truncation. Batch-based SSOT.
 */
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles, Wind, Hammer, Flame, Factory, AlertTriangle,
  ExternalLink, X, Clock, TrendingUp, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/displayUtils";
import { useBatchBasedWIP } from "@/hooks/useBatchBasedWIP";

interface ProcessData { pcs: number; kg: number; activeMoves: number; overdue: number; }
interface ExternalFlowPanelProps {
  data?: Record<string, ProcessData>;
  onProcessClick: (process: string) => void;
}

const PROCESS_CONFIG = [
  { key: 'Forging', label: 'Forging', icon: Flame, color: 'text-red-600', bg: 'bg-red-500/10' },
  { key: 'Job Work', label: 'Job Work', icon: Factory, color: 'text-blue-600', bg: 'bg-blue-500/10' },
  { key: 'Plating', label: 'Plating', icon: Sparkles, color: 'text-purple-600', bg: 'bg-purple-500/10' },
  { key: 'Buffing', label: 'Buffing', icon: Wind, color: 'text-cyan-600', bg: 'bg-cyan-500/10' },
  { key: 'Blasting', label: 'Blasting', icon: Hammer, color: 'text-orange-600', bg: 'bg-orange-500/10' },
  { key: 'Heat Treatment', label: 'Heat Treat', icon: Flame, color: 'text-amber-600', bg: 'bg-amber-500/10' }
];

export const ExternalFlowPanel = ({ onProcessClick }: ExternalFlowPanelProps) => {
  const navigate = useNavigate();
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const { externalProcesses, partnerMetrics, loading } = useBatchBasedWIP();

  const totalActive = externalProcesses.reduce((sum, p) => sum + p.batchCount, 0);
  const totalOverdue = externalProcesses.reduce((sum, p) => sum + p.overdueCount, 0);
  const totalPcs = externalProcesses.reduce((sum, p) => sum + p.totalQuantity, 0);

  const worstProcess = externalProcesses.reduce((worst, p) =>
    (p.overdueCount > (worst?.overdueCount || 0)) ? p : worst, null as typeof externalProcesses[0] | null);
  const worstPartner = partnerMetrics.find(p => p.overdueCount > 0);

  const getProcessData = (key: string) => {
    return externalProcesses.find(p =>
      p.processType.toLowerCase() === key.toLowerCase() ||
      p.processType.toLowerCase().includes(key.toLowerCase().replace('_', ' '))
    ) || { processType: key, batchCount: 0, totalQuantity: 0, overdueCount: 0, avgWaitHours: 0, partnerBreakdown: [] };
  };

  const handleClick = (key: string) => {
    setSelectedProcess(selectedProcess === key ? null : key);
    onProcessClick(key);
  };

  const filteredPartners = selectedProcess
    ? partnerMetrics.filter(p => p.processType.toLowerCase().includes(selectedProcess.toLowerCase()))
    : partnerMetrics;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-muted-foreground">
            Active: <span className="font-semibold text-foreground">{formatCount(totalActive)}</span> batches
          </span>
          <span className="text-muted-foreground">
            WIP: <span className="font-semibold text-foreground">{formatCount(totalPcs)}</span> pcs
          </span>
          {totalOverdue > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {formatCount(totalOverdue)} Overdue
            </Badge>
          )}
        </div>
        {selectedProcess && (
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setSelectedProcess(null)}>
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Alert badges */}
      {(worstProcess?.overdueCount ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {worstProcess && (
            <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px] cursor-pointer hover:bg-destructive/5"
              onClick={() => handleClick(worstProcess.processType)}>
              <AlertTriangle className="h-2.5 w-2.5 mr-1" />
              Worst Process: {worstProcess.processType} ({worstProcess.overdueCount} overdue)
            </Badge>
          )}
          {worstPartner && worstPartner.overdueCount > 0 && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 text-[10px] cursor-pointer hover:bg-amber-500/5"
              onClick={() => navigate(`/partners?partner=${worstPartner.partnerId}`)}>
              <Building2 className="h-2.5 w-2.5 mr-1" />
              Risk Partner: {worstPartner.partnerName} ({Math.round(worstPartner.avgWaitHours / 24)}d avg)
            </Badge>
          )}
        </div>
      )}

      {/* Process cards - 3 cols to prevent truncation */}
      <div className="grid grid-cols-3 gap-2">
        {PROCESS_CONFIG.map(({ key, label, icon: Icon, color, bg }) => {
          const d = getProcessData(key);
          const hasWork = d.batchCount > 0;
          const isSelected = selectedProcess === key;

          return (
            <button
              key={key}
              onClick={() => handleClick(key)}
              className={cn(
                "rounded-lg p-3 text-left transition-all border",
                isSelected ? "border-primary ring-1 ring-primary/20" : "border-transparent",
                hasWork ? bg : "bg-muted/20 opacity-40",
                hasWork && "hover:shadow-sm hover:-translate-y-0.5"
              )}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className={cn("h-3.5 w-3.5", color)} />
                <span className="text-xs font-medium truncate">{label}</span>
                {d.overdueCount > 0 && (
                  <Badge variant="destructive" className="h-4 text-[9px] px-1 ml-auto">{d.overdueCount}</Badge>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className={cn("text-lg font-bold", hasWork ? "text-foreground" : "text-muted-foreground")}>
                  {formatCount(d.batchCount)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatCount(d.totalQuantity)} pcs
                </span>
              </div>
              {hasWork && d.avgWaitHours > 0 && (
                <div className={cn(
                  "text-[10px] mt-1 flex items-center gap-0.5",
                  d.avgWaitHours > 48 ? "text-destructive" : "text-muted-foreground"
                )}>
                  <Clock className="h-2.5 w-2.5" />
                  {Math.round(d.avgWaitHours)}h avg
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Partner risk */}
      {filteredPartners.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="h-3 w-3" /> Partner Risk
            </span>
            <span>{filteredPartners.length} partners</span>
          </div>
          <ScrollArea className="max-h-[150px]">
            <div className="space-y-1">
              {filteredPartners.slice(0, 5).map((partner, i) => (
                <div key={partner.partnerId}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                  onClick={() => navigate(`/partners?partner=${partner.partnerId}`)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold",
                      partner.overdueCount > 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
                    )}>{i + 1}</div>
                    <div>
                      <p className="text-xs font-medium">{partner.partnerName}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{partner.processType}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    {partner.overdueCount > 0 && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                        {partner.overdueCount} Late
                      </Badge>
                    )}
                    <div>
                      <p className="text-xs font-bold">{formatCount(partner.totalQuantity)}</p>
                      <p className="text-[10px] text-muted-foreground">pcs</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};
