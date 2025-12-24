import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Package, TrendingUp, AlertTriangle, Clock, CheckCircle2, Loader2, 
  Truck, ClipboardCheck, Layers, BoxIcon, Building2, Factory 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

interface WOProgressCardProps {
  woId: string;
  orderedQuantity: number;
}

interface ExternalBreakdown {
  process: string;
  quantity: number;
}

interface BatchData {
  id: string;
  batch_number: number;
  produced_qty: number;
  qc_approved_qty: number;
  qc_rejected_qty: number;
  packed_qty: number;
  dispatched_qty: number;
  qc_final_status: string;
  stage_type?: string;
  external_process_type?: string;
}

interface ProgressData {
  totalProduced: number;
  inProduction: number;
  atExternal: number;
  externalBreakdown: ExternalBreakdown[];
  totalQCApproved: number;
  totalQCRejected: number;
  totalPacked: number;
  totalDispatched: number;
  remaining: number;
  progressPercent: number;
  completedToday: number;
  scrapToday: number;
  avgRatePerHour: number;
  lastUpdated: string | null;
  batches: BatchData[];
}

export function WOProgressCard({ woId, orderedQuantity }: WOProgressCardProps) {
  const [progress, setProgress] = useState<ProgressData>({
    totalProduced: 0,
    inProduction: 0,
    atExternal: 0,
    externalBreakdown: [],
    totalQCApproved: 0,
    totalQCRejected: 0,
    totalPacked: 0,
    totalDispatched: 0,
    remaining: orderedQuantity,
    progressPercent: 0,
    completedToday: 0,
    scrapToday: 0,
    avgRatePerHour: 0,
    lastUpdated: null,
    batches: []
  });
  const [loading, setLoading] = useState(true);
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [showBatches, setShowBatches] = useState(false);

  const loadProgress = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get cached progress from work_orders
      const { data: wo, error: woError } = await supabase
        .from('work_orders')
        .select('qty_completed, qty_rejected, qty_remaining, completion_pct, updated_at')
        .eq('id', woId)
        .single();

      if (woError) throw woError;

      // Get batch-level data with stage info for external breakdown
      const { data: batchData } = await supabase
        .from('production_batches')
        .select('id, batch_number, produced_qty, qc_approved_qty, qc_rejected_qty, dispatched_qty, qc_final_status, stage_type, batch_status, external_process_type, batch_quantity')
        .eq('wo_id', woId)
        .order('batch_number', { ascending: true });

      // Get packed quantity per batch from cartons
      const { data: cartonData } = await supabase
        .from('cartons')
        .select('batch_id, production_batch_id, quantity')
        .eq('wo_id', woId);

      // Create a map of batch_id -> packed_qty
      const packedByBatch: Record<string, number> = {};
      (cartonData || []).forEach(c => {
        const batchId = c.production_batch_id || c.batch_id || '';
        packedByBatch[batchId] = (packedByBatch[batchId] || 0) + (c.quantity || 0);
      });

      // Calculate in-production and external quantities
      let inProduction = 0;
      let atExternal = 0;
      const externalMap: Record<string, number> = {};

      const batches: BatchData[] = (batchData || []).map(b => {
        const batchQty = b.batch_quantity || b.produced_qty || 0;
        
        if (b.stage_type === 'external') {
          atExternal += batchQty;
          const processType = b.external_process_type || 'Other';
          externalMap[processType] = (externalMap[processType] || 0) + batchQty;
        } else if (b.stage_type === 'production' && b.batch_status !== 'completed') {
          inProduction += batchQty;
        }

        return {
          id: b.id,
          batch_number: b.batch_number,
          produced_qty: b.produced_qty || 0,
          qc_approved_qty: b.qc_approved_qty || 0,
          qc_rejected_qty: b.qc_rejected_qty || 0,
          packed_qty: packedByBatch[b.id] || 0,
          dispatched_qty: b.dispatched_qty || 0,
          qc_final_status: b.qc_final_status || 'pending',
          stage_type: b.stage_type,
          external_process_type: b.external_process_type,
        };
      });

      const externalBreakdown: ExternalBreakdown[] = Object.entries(externalMap)
        .map(([process, quantity]) => ({ process, quantity }))
        .sort((a, b) => b.quantity - a.quantity);

      // Calculate totals from batches
      const totalProduced = batches.reduce((sum, b) => sum + b.produced_qty, 0);
      const totalQCApproved = batches.reduce((sum, b) => sum + b.qc_approved_qty, 0);
      const totalQCRejected = batches.reduce((sum, b) => sum + b.qc_rejected_qty, 0);
      const totalPacked = batches.reduce((sum, b) => sum + b.packed_qty, 0);
      const totalDispatched = batches.reduce((sum, b) => sum + b.dispatched_qty, 0);

      // Get today's stats
      const { data: todayLogs } = await supabase
        .from('daily_production_logs')
        .select('ok_quantity, total_rejection_quantity')
        .eq('wo_id', woId)
        .eq('log_date', today);

      const completedToday = todayLogs?.reduce((sum, log) => sum + (log.ok_quantity || 0), 0) || 0;
      const scrapToday = todayLogs?.reduce((sum, log) => sum + (log.total_rejection_quantity || 0), 0) || 0;

      // Calculate avg rate
      const { data: runtimeData } = await supabase
        .from('daily_production_logs')
        .select('actual_runtime_minutes, created_at')
        .eq('wo_id', woId)
        .order('created_at', { ascending: false })
        .limit(1);

      const { data: allRuntimeData } = await supabase
        .from('daily_production_logs')
        .select('actual_runtime_minutes')
        .eq('wo_id', woId);

      const totalRuntimeMinutes = allRuntimeData?.reduce((sum, log) => sum + (log.actual_runtime_minutes || 0), 0) || 0;
      const totalRuntimeHours = totalRuntimeMinutes / 60;
      const avgRatePerHour = totalRuntimeHours > 0 ? totalProduced / totalRuntimeHours : 0;

      // Remaining = ordered - dispatched
      const remaining = Math.max(0, orderedQuantity - totalDispatched);
      const progressPercent = orderedQuantity > 0 ? Math.min(100, (totalDispatched / orderedQuantity) * 100) : 0;

      setProgress({
        totalProduced,
        inProduction,
        atExternal,
        externalBreakdown,
        totalQCApproved,
        totalQCRejected,
        totalPacked,
        totalDispatched,
        remaining,
        progressPercent,
        completedToday,
        scrapToday,
        avgRatePerHour,
        lastUpdated: runtimeData?.[0]?.created_at || wo?.updated_at || null,
        batches
      });
    } catch (error) {
      console.error('Error loading production progress:', error);
    } finally {
      setLoading(false);
    }
  }, [woId, orderedQuantity]);

  useEffect(() => {
    loadProgress();

    const channel = supabase
      .channel(`wo_progress_realtime_${woId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_batches', filter: `wo_id=eq.${woId}` },
        () => loadProgress()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cartons', filter: `wo_id=eq.${woId}` },
        () => loadProgress()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatches', filter: `wo_id=eq.${woId}` },
        () => loadProgress()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'work_orders', filter: `id=eq.${woId}` },
        () => loadProgress()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId, loadProgress]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progress.progressPercent);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress.progressPercent]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const getBatchStatusBadge = (status: string) => {
    switch (status) {
      case 'passed':
        return <Badge variant="default" className="bg-green-600">Passed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'waived':
        return <Badge variant="secondary">Waived</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Work Order Progress
          </span>
          {progress.lastUpdated && (
            <span className="text-xs font-normal text-muted-foreground">
              Updated {new Date(progress.lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar - based on dispatched qty */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Dispatch Progress</span>
            <span className="font-semibold">{progress.progressPercent.toFixed(1)}%</span>
          </div>
          <Progress 
            value={animatedProgress} 
            className="h-3 transition-all duration-1000 ease-out" 
          />
        </div>

        {/* Main Stats Grid - 6 columns */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <TooltipProvider>
            {/* Ordered Qty */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Package className="h-4 w-4" />
                    Ordered
                  </div>
                  <div className="text-2xl font-bold">{orderedQuantity.toLocaleString()}</div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total ordered quantity</p>
              </TooltipContent>
            </Tooltip>

            {/* In Production */}
            {progress.inProduction > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Factory className="h-4 w-4" />
                      In Production
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                      {progress.inProduction.toLocaleString()}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Quantity currently in production stage</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* At External */}
            {progress.atExternal > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Building2 className="h-4 w-4" />
                      At External
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                      {progress.atExternal.toLocaleString()}
                    </div>
                    {progress.externalBreakdown.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {progress.externalBreakdown[0].process}
                        {progress.externalBreakdown.length > 1 && ` +${progress.externalBreakdown.length - 1}`}
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">At External Partners</p>
                  {progress.externalBreakdown.map(e => (
                    <p key={e.process} className="text-xs">{e.process}: {e.quantity.toLocaleString()}</p>
                  ))}
                </TooltipContent>
              </Tooltip>
            )}

            {/* Produced */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Layers className="h-4 w-4" />
                    Produced
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {progress.totalProduced.toLocaleString()}
                  </div>
                  {progress.completedToday > 0 && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      +{progress.completedToday} today
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total produced across all batches</p>
                <p className="text-xs">Avg rate: {progress.avgRatePerHour.toFixed(1)} pcs/hr</p>
              </TooltipContent>
            </Tooltip>

            {/* QC Approved */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <ClipboardCheck className="h-4 w-4" />
                    QC Approved
                  </div>
                  <div className="text-2xl font-bold text-green-600">
                    {progress.totalQCApproved.toLocaleString()}
                  </div>
                  {progress.totalQCRejected > 0 && (
                    <div className="text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {progress.totalQCRejected} rejected
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>QC approved: {progress.totalQCApproved.toLocaleString()}</p>
                <p>QC rejected: {progress.totalQCRejected.toLocaleString()}</p>
              </TooltipContent>
            </Tooltip>

            {/* Packed (Released) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <BoxIcon className="h-4 w-4" />
                    Packed
                  </div>
                  <div className="text-2xl font-bold text-amber-600">
                    {progress.totalPacked.toLocaleString()}
                  </div>
                  {progress.totalQCApproved > progress.totalPacked && (
                    <div className="text-xs text-muted-foreground">
                      {(progress.totalQCApproved - progress.totalPacked).toLocaleString()} pending
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Quantity packed in cartons</p>
                <p className="text-xs">Ready for dispatch</p>
              </TooltipContent>
            </Tooltip>

            {/* Dispatched */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Truck className="h-4 w-4" />
                    Dispatched
                  </div>
                  <div className="text-2xl font-bold text-purple-600">
                    {progress.totalDispatched.toLocaleString()}
                  </div>
                  {progress.totalPacked > progress.totalDispatched && (
                    <div className="text-xs text-muted-foreground">
                      {(progress.totalPacked - progress.totalDispatched).toLocaleString()} ready
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total dispatched to customer</p>
              </TooltipContent>
            </Tooltip>

            {/* Remaining */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="space-y-1">
                  <div className="text-muted-foreground text-sm">Remaining</div>
                  <div className={`text-2xl font-bold ${progress.remaining === 0 ? 'text-green-600' : 'text-orange-600'}`}>
                    {progress.remaining.toLocaleString()}
                  </div>
                  {progress.remaining === 0 && (
                    <div className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Complete
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ordered - Dispatched = Remaining</p>
                {progress.remaining === 0 && <p className="text-xs text-green-500">Work Order Complete</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Batch Breakdown */}
        {progress.batches.length > 0 && (
          <Collapsible open={showBatches} onOpenChange={setShowBatches}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between border-t pt-3 mt-2">
                <span className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Batch Breakdown ({progress.batches.length} batch{progress.batches.length > 1 ? 'es' : ''})
                </span>
                {showBatches ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead className="text-right">Produced</TableHead>
                    <TableHead className="text-right">QC Approved</TableHead>
                    <TableHead className="text-right">Packed</TableHead>
                    <TableHead className="text-right">Dispatched</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progress.batches.map(batch => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">#{batch.batch_number}</TableCell>
                      <TableCell className="text-right">{batch.produced_qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-green-600">{batch.qc_approved_qty.toLocaleString()}</span>
                        {batch.qc_rejected_qty > 0 && (
                          <span className="text-red-500 text-xs ml-1">
                            (-{batch.qc_rejected_qty})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-amber-600">{batch.packed_qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{batch.dispatched_qty.toLocaleString()}</TableCell>
                      <TableCell>{getBatchStatusBadge(batch.qc_final_status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Summary Footer */}
        <div className="pt-2 border-t flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {progress.totalDispatched.toLocaleString()} dispatched of {orderedQuantity.toLocaleString()} ordered
          </span>
          {progress.batches.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {progress.batches.length} batch{progress.batches.length > 1 ? 'es' : ''}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
