/**
 * ExternalDashboard - Batch-Based External Processes View
 * 
 * Shows batches at external processing, not work orders.
 * Each row represents a batch with:
 * - Work Order ID
 * - External Process Type (forging, plating, etc)
 * - Batch quantity sent
 * - Date sent
 * - Date returned (if completed)
 * - Remaining quantity still internal
 * 
 * Does NOT change Work Order stage when sending partial quantities externally.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useThrottledRealtime } from "@/hooks/useThrottledRealtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Sparkles, 
  Wind, 
  Hammer, 
  Flame, 
  Factory,
  AlertTriangle,
  Calendar,
  Package,
  Search,
  ArrowUpDown,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ExternalBatch {
  id: string;
  wo_id: string;
  wo_display_id: string;
  item_code: string;
  customer: string;
  batch_number: number;
  batch_quantity: number;
  external_process_type: string;
  partner_name: string;
  stage_entered_at: string;
  returned_at: string | null;
  batch_status: string;
  wo_total_quantity: number;
  remaining_internal: number;
  days_external: number;
}

interface ProcessSummary {
  process: string;
  totalQuantity: number;
  batchCount: number;
  inProgress: number;
}

const PROCESS_CONFIG = [
  { key: 'forging', label: 'Forging', icon: Flame, color: 'text-red-600', bgColor: 'bg-red-500/10' },
  { key: 'plating', label: 'Plating', icon: Sparkles, color: 'text-purple-600', bgColor: 'bg-purple-500/10' },
  { key: 'blasting', label: 'Blasting', icon: Hammer, color: 'text-orange-600', bgColor: 'bg-orange-500/10' },
  { key: 'buffing', label: 'Buffing', icon: Wind, color: 'text-cyan-600', bgColor: 'bg-cyan-500/10' },
  { key: 'job_work', label: 'Job Work', icon: Factory, color: 'text-blue-600', bgColor: 'bg-blue-500/10' },
];

export const ExternalDashboard = () => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<ExternalBatch[]>([]);
  const [filteredBatches, setFilteredBatches] = useState<ExternalBatch[]>([]);
  const [processSummary, setProcessSummary] = useState<ProcessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"stage_entered_at" | "batch_quantity">("stage_entered_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const loadExternalBatches = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch batches with stage_type = 'external' - SOURCE OF TRUTH
      const { data: batchData, error: batchError } = await supabase
        .from('production_batches')
        .select(`
          id,
          wo_id,
          batch_number,
          batch_quantity,
          stage_type,
          external_process_type,
          external_partner_id,
          batch_status,
          stage_entered_at,
          ended_at,
          work_orders!wo_id(
            id,
            display_id,
            wo_number,
            item_code,
            customer,
            quantity
          ),
          external_partners!external_partner_id(name)
        `)
        .eq('stage_type', 'external')
        .order('stage_entered_at', { ascending: false });

      if (batchError) throw batchError;

      // Calculate remaining internal quantity per work order
      const woIds = [...new Set((batchData || []).map((b: any) => b.wo_id))];
      
      // Get all batches for these work orders to calculate remaining internal
      const { data: allWOBatches } = await supabase
        .from('production_batches')
        .select('wo_id, batch_quantity, stage_type')
        .in('wo_id', woIds)
        .is('ended_at', null);

      const internalByWO = new Map<string, number>();
      (allWOBatches || []).forEach((b: any) => {
        if (b.stage_type !== 'external' && b.stage_type !== 'dispatched') {
          const current = internalByWO.get(b.wo_id) || 0;
          internalByWO.set(b.wo_id, current + (b.batch_quantity || 0));
        }
      });

      const externalBatches: ExternalBatch[] = (batchData || []).map((batch: any) => {
        const daysExternal = batch.stage_entered_at 
          ? Math.floor((new Date().getTime() - new Date(batch.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          id: batch.id,
          wo_id: batch.wo_id,
          wo_display_id: batch.work_orders?.display_id || batch.work_orders?.wo_number || 'N/A',
          item_code: batch.work_orders?.item_code || 'N/A',
          customer: batch.work_orders?.customer || 'N/A',
          batch_number: batch.batch_number,
          batch_quantity: batch.batch_quantity || 0,
          external_process_type: batch.external_process_type || 'unknown',
          partner_name: batch.external_partners?.name || 'Unknown',
          stage_entered_at: batch.stage_entered_at || '',
          returned_at: batch.ended_at,
          batch_status: batch.batch_status || 'in_progress',
          wo_total_quantity: batch.work_orders?.quantity || 0,
          remaining_internal: internalByWO.get(batch.wo_id) || 0,
          days_external: daysExternal
        };
      });

      setBatches(externalBatches);

      // Build process summary
      const summaryMap = new Map<string, ProcessSummary>();
      externalBatches.forEach(batch => {
        const process = batch.external_process_type.toLowerCase();
        const existing = summaryMap.get(process) || {
          process,
          totalQuantity: 0,
          batchCount: 0,
          inProgress: 0
        };
        existing.totalQuantity += batch.batch_quantity;
        existing.batchCount += 1;
        if (batch.batch_status === 'in_progress') {
          existing.inProgress += 1;
        }
        summaryMap.set(process, existing);
      });

      setProcessSummary(Array.from(summaryMap.values()));
      setLoading(false);
    } catch (error) {
      console.error('Error loading external batches:', error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExternalBatches();
  }, [loadExternalBatches]);

  // Throttled realtime for batch updates
  useThrottledRealtime({
    channelName: 'external-dashboard-batches',
    tables: ['production_batches'],
    onUpdate: loadExternalBatches,
    throttleMs: 3000,
    cacheMs: 15000,
  });

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...batches];

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(batch =>
        batch.wo_display_id.toLowerCase().includes(term) ||
        batch.item_code.toLowerCase().includes(term) ||
        batch.customer.toLowerCase().includes(term) ||
        batch.partner_name.toLowerCase().includes(term) ||
        batch.external_process_type.toLowerCase().includes(term)
      );
    }

    // Filter by selected process
    if (selectedProcess) {
      filtered = filtered.filter(batch =>
        batch.external_process_type.toLowerCase() === selectedProcess.toLowerCase()
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'stage_entered_at') {
        return direction * (new Date(a.stage_entered_at).getTime() - new Date(b.stage_entered_at).getTime());
      }
      return direction * (a.batch_quantity - b.batch_quantity);
    });

    setFilteredBatches(filtered);
  }, [batches, searchTerm, selectedProcess, sortField, sortDirection]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getProcessIcon = (processType: string) => {
    const config = PROCESS_CONFIG.find(p => p.key === processType.toLowerCase());
    if (!config) return Factory;
    return config.icon;
  };

  const getProcessColor = (processType: string) => {
    const config = PROCESS_CONFIG.find(p => p.key === processType.toLowerCase());
    return config?.color || 'text-muted-foreground';
  };

  const totalQuantity = batches.reduce((sum, b) => sum + b.batch_quantity, 0);
  const totalBatches = batches.length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>External Processing - Batch View</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            External Processing - Batch View
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Each row represents a batch, not a work order. Same WO may have multiple batches at different external processes.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{totalBatches}</span>
              <span className="text-muted-foreground">batches</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{totalQuantity.toLocaleString()}</span>
              <span className="text-muted-foreground">pcs external</span>
            </div>
          </div>

          {/* Process Type Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {PROCESS_CONFIG.map(({ key, label, icon: Icon, color, bgColor }) => {
              const summary = processSummary.find(p => p.process === key);
              const isSelected = selectedProcess === key;
              const hasData = summary && summary.batchCount > 0;

              return (
                <Card
                  key={key}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    isSelected && "ring-2 ring-primary",
                    !hasData && "opacity-50"
                  )}
                  onClick={() => setSelectedProcess(isSelected ? null : key)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("p-1.5 rounded", bgColor)}>
                        <Icon className={cn("h-4 w-4", color)} />
                      </div>
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div>
                        <div className="text-lg font-bold">{summary?.batchCount || 0}</div>
                        <p className="text-[10px] text-muted-foreground">batches</p>
                      </div>
                      <div>
                        <div className="text-lg font-bold">{(summary?.totalQuantity || 0).toLocaleString()}</div>
                        <p className="text-[10px] text-muted-foreground">pcs</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Batch List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              External Batches
              {selectedProcess && (
                <Badge variant="secondary" className="capitalize">
                  {selectedProcess}
                </Badge>
              )}
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              {filteredBatches.length} batches
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by WO ID, Item, Customer, Partner..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {filteredBatches.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-lg">No batches at external processing</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work Order</TableHead>
                  <TableHead>Process Type</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => toggleSort('batch_quantity')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Batch Qty Sent
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleSort('stage_entered_at')}
                  >
                    <div className="flex items-center gap-1">
                      Date Sent
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead>Date Returned</TableHead>
                  <TableHead className="text-right">Remaining Internal</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBatches.map((batch) => {
                  const ProcessIcon = getProcessIcon(batch.external_process_type);
                  const processColor = getProcessColor(batch.external_process_type);

                  return (
                    <TableRow key={batch.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <div className="font-medium">{batch.wo_display_id}</div>
                          <div className="text-xs text-muted-foreground">{batch.item_code}</div>
                          <div className="text-xs text-muted-foreground">{batch.customer}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ProcessIcon className={cn("h-4 w-4", processColor)} />
                          <span className="capitalize">{batch.external_process_type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {batch.batch_quantity.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {batch.stage_entered_at ? new Date(batch.stage_entered_at).toLocaleDateString() : 'N/A'}
                        </div>
                        {batch.days_external > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {batch.days_external}d ago
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {batch.returned_at ? (
                          <div className="flex items-center gap-1 text-xs text-green-600">
                            <Calendar className="h-3 w-3" />
                            {new Date(batch.returned_at).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground">
                          {batch.remaining_internal.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>{batch.partner_name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={batch.batch_status === 'completed' ? 'default' : 'secondary'}
                          className={cn(
                            batch.batch_status === 'completed' && 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
                            batch.batch_status === 'in_progress' && 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          )}
                        >
                          {batch.batch_status === 'in_queue' ? 'Queued' : 
                           batch.batch_status === 'in_progress' ? 'In Progress' : 
                           batch.batch_status === 'completed' ? 'Returned' : batch.batch_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/work-orders/${batch.wo_id}`)}
                        >
                          View WO
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Source indicator */}
      <p className="text-[10px] text-muted-foreground italic text-right">
        All data derived from production_batches where stage_type = 'external'
      </p>
    </div>
  );
};
