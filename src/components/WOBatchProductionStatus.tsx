import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Layers, CheckCircle2, Clock, Package, ArrowRight } from "lucide-react";
import { BatchProductionCompleteControl } from "./BatchProductionCompleteControl";

interface Batch {
  id: string;
  batch_number: number;
  wo_id: string;
  produced_qty: number;
  batch_quantity: number;
  qc_approved_qty: number;
  qc_rejected_qty: number;
  dispatched_qty: number;
  production_complete: boolean;
  production_complete_qty: number | null;
  production_completed_at: string | null;
  production_completed_by: string | null;
  production_complete_reason: string | null;
  qc_final_status: string;
  batch_status: string;
  stage_type: string;
}

interface WOBatchProductionStatusProps {
  woId: string;
  orderedQty: number;
  onUpdate?: () => void;
}

export function WOBatchProductionStatus({ woId, orderedQty, onUpdate }: WOBatchProductionStatusProps) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});

  useEffect(() => {
    loadBatches();
    
    // Real-time subscription
    const channel = supabase
      .channel(`wo-batches-${woId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'production_batches',
        filter: `wo_id=eq.${woId}`
      }, () => {
        loadBatches();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId]);

  const loadBatches = async () => {
    const { data, error } = await supabase
      .from("production_batches")
      .select(`
        id,
        batch_number,
        wo_id,
        produced_qty,
        batch_quantity,
        qc_approved_qty,
        qc_rejected_qty,
        dispatched_qty,
        production_complete,
        production_complete_qty,
        production_completed_at,
        production_completed_by,
        production_complete_reason,
        qc_final_status,
        batch_status,
        stage_type
      `)
      .eq("wo_id", woId)
      .order("batch_number", { ascending: true });

    if (error) {
      console.error("Error loading batches:", error);
      setLoading(false);
      return;
    }

    setBatches(data || []);
    setLoading(false);

    // Load approver names
    const approverIds = (data || [])
      .map(b => b.production_completed_by)
      .filter(Boolean);
    
    if (approverIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", approverIds);
      
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach(p => {
        if (p.id && p.full_name) nameMap[p.id] = p.full_name;
      });
      setApproverNames(nameMap);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-12 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (batches.length === 0) {
    return null;
  }

  const completeBatches = batches.filter(b => b.production_complete);
  const inProgressBatches = batches.filter(b => !b.production_complete);
  const totalProduced = batches.reduce((sum, b) => sum + (b.produced_qty || 0), 0);
  const totalCompleteQty = completeBatches.reduce((sum, b) => sum + (b.production_complete_qty || b.produced_qty || 0), 0);
  const totalQCApproved = batches.reduce((sum, b) => sum + (b.qc_approved_qty || 0), 0);
  const allComplete = batches.length > 0 && completeBatches.length === batches.length;

  const getStageLabel = (batch: Batch) => {
    if (batch.dispatched_qty > 0) return { label: "Dispatched", color: "bg-blue-500/10 text-blue-600" };
    if (batch.qc_final_status === "passed") return { label: "QC Passed", color: "bg-emerald-500/10 text-emerald-600" };
    if (batch.qc_final_status === "pending" && batch.production_complete) return { label: "Awaiting QC", color: "bg-amber-500/10 text-amber-600" };
    if (batch.production_complete) return { label: "Complete", color: "bg-emerald-500/10 text-emerald-600" };
    return { label: "In Production", color: "bg-blue-500/10 text-blue-600" };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Production Batches</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {allComplete ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                All Complete
              </Badge>
            ) : (
              <Badge variant="outline">
                {completeBatches.length} / {batches.length} complete
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          {totalProduced.toLocaleString()} produced • {totalCompleteQty.toLocaleString()} complete • {totalQCApproved.toLocaleString()} QC approved
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Production Progress</span>
            <span>{Math.round((totalCompleteQty / orderedQty) * 100)}% of ordered qty complete</span>
          </div>
          <Progress value={(totalCompleteQty / orderedQty) * 100} className="h-2" />
        </div>

        {/* Batch list */}
        <div className="space-y-2 mt-4">
          {batches.map(batch => (
            <div key={batch.id} className="relative">
              <BatchProductionCompleteControl
                batch={batch}
                completedByName={batch.production_completed_by ? approverNames[batch.production_completed_by] : undefined}
                onUpdate={() => {
                  loadBatches();
                  onUpdate?.();
                }}
              />
              
              {/* Flow indicator for complete batches */}
              {batch.production_complete && (
                <div className="flex items-center gap-1.5 mt-1.5 ml-11 text-xs text-muted-foreground">
                  <ArrowRight className="h-3 w-3" />
                  <Badge variant="outline" className={`text-xs ${getStageLabel(batch).color}`}>
                    {getStageLabel(batch).label}
                  </Badge>
                  {batch.qc_approved_qty > 0 && (
                    <span className="text-muted-foreground">
                      → {batch.qc_approved_qty.toLocaleString()} pcs ready for packing
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Summary footer */}
        {batches.length > 1 && (
          <div className="pt-3 mt-3 border-t border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Work Order Summary</span>
              <div className="flex items-center gap-4">
                <span>
                  <span className="font-medium">{inProgressBatches.length}</span>
                  <span className="text-muted-foreground"> in progress</span>
                </span>
                <span>
                  <span className="font-medium">{completeBatches.length}</span>
                  <span className="text-muted-foreground"> complete</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
