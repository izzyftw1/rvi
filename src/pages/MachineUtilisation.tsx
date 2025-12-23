/**
 * Machine Utilisation Review Page
 * 
 * READ-ONLY metrics derived from the shared useProductionLogMetrics hook.
 * Allows supervisors to review and document reasons for low utilisation.
 * 
 * FORMULAS (from shared hook):
 * - Expected Runtime = Shift End - Shift Start (or default 690 min)
 * - Actual Runtime = from production logs
 * - Utilisation % = (Actual Runtime ÷ Expected Runtime) × 100
 */

import { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon, Settings, AlertTriangle, CheckCircle2, Clock, Percent, Activity, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProductionLogMetrics } from "@/hooks/useProductionLogMetrics";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface MachineReview {
  id: string;
  reason: string | null;
  action_taken: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface MachineUtilisationData {
  machineId: string;
  machineName: string;
  expectedRuntime: number;
  actualRuntime: number;
  utilisationPct: number;
  review?: MachineReview;
  needsReview: boolean;
}

// Default shift duration in minutes (11.5 hours = 690 minutes)
const DEFAULT_SHIFT_MINUTES = 690;

// Helper to format minutes as hours:minutes
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

export default function MachineUtilisation() {
  const { toast } = useToast();
  const [reviewDate, setReviewDate] = useState<Date>(subDays(new Date(), 1));
  const [threshold, setThreshold] = useState<number>(80);
  const [showSettings, setShowSettings] = useState(false);
  const [reviews, setReviews] = useState<Record<string, MachineReview>>({});
  const [submitting, setSubmitting] = useState(false);

  // Review dialog state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<MachineUtilisationData | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewAction, setReviewAction] = useState("");

  // Single source of truth: useProductionLogMetrics
  const { metrics, loading } = useProductionLogMetrics({
    startDate: format(reviewDate, "yyyy-MM-dd"),
    endDate: format(reviewDate, "yyyy-MM-dd"),
    period: "custom",
  });

  // Convert shared metrics to utilisation view format
  const utilisationData = useMemo<MachineUtilisationData[]>(() => {
    if (!metrics) return [];
    
    return metrics.machineMetrics.map((m) => {
      const review = reviews[m.machineId];
      const needsReview = m.utilizationPercent < threshold && !review?.reason;

      return {
        machineId: m.machineId,
        machineName: m.machineName,
        expectedRuntime: m.expectedRuntime,
        actualRuntime: m.totalRuntime,
        utilisationPct: m.utilizationPercent,
        review,
        needsReview,
      };
    }).sort((a, b) => a.utilisationPct - b.utilisationPct); // Sort by lowest utilisation first
  }, [metrics, reviews, threshold]);

  // Summary statistics
  const summary = useMemo(() => {
    const total = utilisationData.length;
    const belowThreshold = utilisationData.filter((d) => d.utilisationPct < threshold).length;
    const needingReview = utilisationData.filter((d) => d.needsReview).length;
    const avgUtilisation = total > 0
      ? Math.round(utilisationData.reduce((sum, d) => sum + d.utilisationPct, 0) / total)
      : 0;
    return { total, belowThreshold, needingReview, avgUtilisation };
  }, [utilisationData, threshold]);

  // Load reviews for the selected date
  useEffect(() => {
    loadReviews();
  }, [reviewDate]);

  const loadReviews = async () => {
    try {
      const dateStr = format(reviewDate, "yyyy-MM-dd");
      const { data: reviewsData } = await supabase
        .from("machine_utilisation_reviews")
        .select("id, machine_id, reason, action_taken, reviewed_by, reviewed_at")
        .eq("review_date", dateStr);

      const reviewsMap: Record<string, MachineReview> = {};
      (reviewsData || []).forEach((r: any) => {
        reviewsMap[r.machine_id] = {
          id: r.id,
          reason: r.reason,
          action_taken: r.action_taken,
          reviewed_by: r.reviewed_by,
          reviewed_at: r.reviewed_at,
        };
      });
      setReviews(reviewsMap);
    } catch (error: any) {
      console.error("Error loading reviews:", error);
    }
  };

  const openReviewDialog = (data: MachineUtilisationData) => {
    setSelectedMachine(data);
    setReviewReason(data.review?.reason || "");
    setReviewAction(data.review?.action_taken || "");
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!selectedMachine) return;

    if (!reviewReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for low utilisation",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const dateStr = format(reviewDate, "yyyy-MM-dd");

      const reviewData = {
        machine_id: selectedMachine.machineId,
        review_date: dateStr,
        expected_runtime_minutes: selectedMachine.expectedRuntime,
        actual_runtime_minutes: selectedMachine.actualRuntime,
        utilisation_percentage: selectedMachine.utilisationPct,
        reason: reviewReason.trim(),
        action_taken: reviewAction.trim() || null,
        reviewed_by: userData.user?.id,
        reviewed_at: new Date().toISOString(),
      };

      if (selectedMachine.review?.id) {
        const { error } = await supabase
          .from("machine_utilisation_reviews")
          .update(reviewData)
          .eq("id", selectedMachine.review.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("machine_utilisation_reviews")
          .insert(reviewData);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Utilisation review saved",
      });

      setReviewDialogOpen(false);
      loadReviews();
    } catch (error: any) {
      console.error("Error saving review:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save review",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getUtilisationColor = (pct: number) => {
    if (pct >= 90) return "text-green-600 dark:text-green-400";
    if (pct >= threshold) return "text-blue-600 dark:text-blue-400";
    if (pct >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Machine Utilisation Review"
        description="Review daily machine utilisation and document reasons for low performance"
      />

      {/* Read-only notice */}
      <div className="bg-muted/50 border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>All metrics derived from Production Log entries via shared calculation engine. Reviews can be added but metrics cannot be overridden.</span>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Date Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !reviewDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reviewDate ? format(reviewDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={reviewDate}
                    onSelect={(date) => date && setReviewDate(date)}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Threshold Display */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Threshold:</span>
                <Badge variant="secondary" className="font-mono">
                  {threshold}%
                </Badge>
              </div>
            </div>

            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Utilisation</p>
                <p className={cn("text-2xl font-bold", getUtilisationColor(summary.avgUtilisation))}>
                  {summary.avgUtilisation}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Total Machines</p>
                <p className="text-2xl font-bold">{summary.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm text-muted-foreground">Below Threshold</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {summary.belowThreshold}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">Needs Review</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {summary.needingReview}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formula explanation */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-3">
          <p className="text-xs font-mono text-muted-foreground">
            <span className="font-semibold text-foreground">Utilisation %</span> = (Actual Runtime ÷ Expected Runtime) × 100 | 
            <span className="font-semibold text-foreground ml-2">Expected</span> = Gross Shift Time (from logs or default {formatMinutes(DEFAULT_SHIFT_MINUTES)})
          </p>
        </CardContent>
      </Card>

      {/* Utilisation Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Machine Utilisation for {format(reviewDate, "PPP")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : utilisationData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No machine data for this date.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Machine</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="w-[200px]">Utilisation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {utilisationData.map((data) => (
                    <TableRow key={data.machineId} className={data.needsReview ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <TableCell>
                        <span className="font-mono text-sm font-medium">
                          {data.machineName}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMinutes(data.expectedRuntime)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMinutes(data.actualRuntime)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className={cn("font-bold", getUtilisationColor(data.utilisationPct))}>
                              {data.utilisationPct}%
                            </span>
                          </div>
                          <Progress 
                            value={Math.min(data.utilisationPct, 100)} 
                            className="h-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        {data.utilisationPct >= threshold ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            OK
                          </Badge>
                        ) : data.review?.reason ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            Reviewed
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            Needs Review
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {data.review?.reason || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={data.needsReview ? "default" : "ghost"}
                          onClick={() => openReviewDialog(data)}
                        >
                          {data.review?.reason ? "Edit" : "Review"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Review Utilisation - {selectedMachine?.machineName}
            </DialogTitle>
          </DialogHeader>
          
          {selectedMachine && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 text-center p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Expected</p>
                  <p className="font-mono font-medium">{formatMinutes(selectedMachine.expectedRuntime)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Actual</p>
                  <p className="font-mono font-medium">{formatMinutes(selectedMachine.actualRuntime)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Utilisation</p>
                  <p className={cn("font-bold", getUtilisationColor(selectedMachine.utilisationPct))}>
                    {selectedMachine.utilisationPct}%
                  </p>
                </div>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label htmlFor="reason">Reason for Low Utilisation *</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., No job scheduled, Tool change, Maintenance..."
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Action Taken */}
              <div className="space-y-2">
                <Label htmlFor="action">Action Taken (Optional)</Label>
                <Textarea
                  id="action"
                  placeholder="e.g., Rescheduled jobs, Requested maintenance..."
                  value={reviewAction}
                  onChange={(e) => setReviewAction(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitReview} disabled={submitting}>
              {submitting ? "Saving..." : "Save Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Utilisation Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <Label>Utilisation Threshold: {threshold}%</Label>
              <Slider
                value={[threshold]}
                onValueChange={(v) => setThreshold(v[0])}
                min={50}
                max={95}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Machines below this threshold will be flagged for review.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowSettings(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
