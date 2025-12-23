import { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon, Settings, AlertTriangle, CheckCircle2, Clock, Percent, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface Machine {
  id: string;
  name: string;
  machine_id: string;
}

interface ProductionLogSummary {
  machine_id: string;
  total_shift_minutes: number;
  total_runtime_minutes: number;
}

interface MachineUtilisationData {
  machine: Machine;
  expectedRuntime: number;
  actualRuntime: number;
  utilisationPct: number;
  review?: {
    id: string;
    reason: string | null;
    action_taken: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
  };
  needsReview: boolean;
}

// Default shift duration in minutes (11.5 hours = 690 minutes)
const DEFAULT_SHIFT_MINUTES = 690;

// Helper to format minutes as hours:minutes
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function MachineUtilisation() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewDate, setReviewDate] = useState<Date>(subDays(new Date(), 1)); // Yesterday
  const [machines, setMachines] = useState<Machine[]>([]);
  const [logSummaries, setLogSummaries] = useState<ProductionLogSummary[]>([]);
  const [reviews, setReviews] = useState<Record<string, MachineUtilisationData["review"]>>({});
  const [threshold, setThreshold] = useState<number>(80);
  const [showSettings, setShowSettings] = useState(false);

  // Review dialog state
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<MachineUtilisationData | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewAction, setReviewAction] = useState("");

  // Calculate utilisation data for each machine
  const utilisationData = useMemo<MachineUtilisationData[]>(() => {
    return machines.map((machine) => {
      // Find production logs for this machine
      const logSummary = logSummaries.find((s) => s.machine_id === machine.id);
      
      // Expected runtime from shift duration (if logs exist, use their shift times, otherwise default)
      const expectedRuntime = logSummary?.total_shift_minutes || DEFAULT_SHIFT_MINUTES;
      const actualRuntime = logSummary?.total_runtime_minutes || 0;
      
      // Calculate utilisation percentage
      const utilisationPct = expectedRuntime > 0 
        ? Math.round((actualRuntime / expectedRuntime) * 100 * 100) / 100
        : 0;

      const review = reviews[machine.id];
      const needsReview = utilisationPct < threshold && !review?.reason;

      return {
        machine,
        expectedRuntime,
        actualRuntime,
        utilisationPct,
        review,
        needsReview,
      };
    });
  }, [machines, logSummaries, reviews, threshold]);

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

  useEffect(() => {
    loadData();
  }, [reviewDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const dateStr = format(reviewDate, "yyyy-MM-dd");

      // Load all machines
      const { data: machinesData } = await supabase
        .from("machines")
        .select("id, name, machine_id")
        .order("machine_id");
      setMachines(machinesData || []);

      // Load production logs for the review date and aggregate by machine
      const { data: logsData } = await supabase
        .from("daily_production_logs")
        .select("machine_id, shift_start_time, shift_end_time, actual_runtime_minutes")
        .eq("log_date", dateStr);

      // Aggregate logs by machine
      const summaryMap: Record<string, ProductionLogSummary> = {};
      (logsData || []).forEach((log: any) => {
        if (!summaryMap[log.machine_id]) {
          summaryMap[log.machine_id] = {
            machine_id: log.machine_id,
            total_shift_minutes: 0,
            total_runtime_minutes: 0,
          };
        }
        
        // Calculate shift duration from times if available
        if (log.shift_start_time && log.shift_end_time) {
          const [startH, startM] = log.shift_start_time.split(":").map(Number);
          const [endH, endM] = log.shift_end_time.split(":").map(Number);
          let shiftMinutes = (endH * 60 + endM) - (startH * 60 + startM);
          if (shiftMinutes < 0) shiftMinutes += 24 * 60; // Handle overnight
          summaryMap[log.machine_id].total_shift_minutes += shiftMinutes;
        } else {
          summaryMap[log.machine_id].total_shift_minutes += DEFAULT_SHIFT_MINUTES;
        }
        
        summaryMap[log.machine_id].total_runtime_minutes += log.actual_runtime_minutes || 0;
      });
      setLogSummaries(Object.values(summaryMap));

      // Load existing reviews for the date
      const { data: reviewsData } = await supabase
        .from("machine_utilisation_reviews")
        .select("id, machine_id, reason, action_taken, reviewed_by, reviewed_at")
        .eq("review_date", dateStr);

      const reviewsMap: Record<string, MachineUtilisationData["review"]> = {};
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
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load utilisation data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
        machine_id: selectedMachine.machine.id,
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
        // Update existing
        const { error } = await supabase
          .from("machine_utilisation_reviews")
          .update(reviewData)
          .eq("id", selectedMachine.review.id);
        if (error) throw error;
      } else {
        // Insert new
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
      loadData();
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

  const getProgressColor = (pct: number) => {
    if (pct >= 90) return "bg-green-500";
    if (pct >= threshold) return "bg-blue-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Machine Utilisation Review"
        description="Review daily machine utilisation and document reasons for low performance"
      />

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
              <p>No machines found.</p>
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
                    <TableRow key={data.machine.id} className={data.needsReview ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <TableCell>
                        <div>
                          <span className="font-mono text-sm font-medium">
                            {data.machine.machine_id}
                          </span>
                          <br />
                          <span className="text-muted-foreground text-xs">
                            {data.machine.name}
                          </span>
                        </div>
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
                          <p className="text-[9px] font-mono text-muted-foreground">
                            = ({data.actualRuntime} ÷ {data.expectedRuntime}) × 100
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {data.utilisationPct >= threshold ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            OK
                          </Badge>
                        ) : data.review?.reason ? (
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Reviewed
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Needs Review
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {data.review?.reason ? (
                          <span className="text-sm text-muted-foreground truncate block">
                            {data.review.reason}
                          </span>
                        ) : data.utilisationPct < threshold ? (
                          <span className="text-sm text-red-500 italic">Required</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {data.utilisationPct < threshold && (
                          <Button
                            size="sm"
                            variant={data.review?.reason ? "outline" : "default"}
                            onClick={() => openReviewDialog(data)}
                          >
                            {data.review?.reason ? "Edit" : "Review"}
                          </Button>
                        )}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Review Low Utilisation - {selectedMachine?.machine.machine_id}
            </DialogTitle>
          </DialogHeader>
          
          {selectedMachine && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Expected</p>
                  <p className="font-mono font-medium">{formatMinutes(selectedMachine.expectedRuntime)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Actual</p>
                  <p className="font-mono font-medium">{formatMinutes(selectedMachine.actualRuntime)}</p>
                </div>
                <div className="text-center">
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
                  placeholder="Explain why utilisation was below threshold..."
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Action Taken */}
              <div className="space-y-2">
                <Label htmlFor="action">Action Taken</Label>
                <Textarea
                  id="action"
                  placeholder="What actions were taken or planned..."
                  value={reviewAction}
                  onChange={(e) => setReviewAction(e.target.value)}
                  rows={3}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Utilisation Settings</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <Label>Utilisation Threshold: {threshold}%</Label>
              <Slider
                value={[threshold]}
                onValueChange={([val]) => setThreshold(val)}
                min={50}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Machines with utilisation below this threshold will require a review with reason and action.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setShowSettings(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
