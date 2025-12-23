/**
 * NCRBlockerAlert - Surfaces open NCRs as blockers
 * 
 * Used in:
 * - Floor Dashboard
 * - CNC Dashboard
 * - Work Order Details
 * 
 * Displays open NCRs that affect production efficiency.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  Factory,
  Package,
  User,
  FileWarning
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface NCRBlockerAlertProps {
  workOrderId?: string;
  machineId?: string;
  compact?: boolean;
  className?: string;
}

interface OpenNCR {
  id: string;
  ncr_number: string;
  ncr_type: string;
  status: string;
  quantity_affected: number;
  unit: string;
  issue_description: string;
  rejection_type: string | null;
  created_at: string;
  work_order_id: string | null;
  machine_id: string | null;
  work_orders?: { display_id: string; item_code: string } | null;
  machines?: { machine_id: string; name: string } | null;
}

export function NCRBlockerAlert({ 
  workOrderId, 
  machineId, 
  compact = false,
  className 
}: NCRBlockerAlertProps) {
  const navigate = useNavigate();
  const [ncrs, setNcrs] = useState<OpenNCR[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOpenNCRs();

    // Set up realtime subscription
    const channel = supabase
      .channel('ncr-blockers')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ncrs' }, loadOpenNCRs)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workOrderId, machineId]);

  const loadOpenNCRs = async () => {
    try {
      let query = supabase
        .from('ncrs')
        .select(`
          id,
          ncr_number,
          ncr_type,
          status,
          quantity_affected,
          unit,
          issue_description,
          rejection_type,
          created_at,
          work_order_id,
          machine_id,
          work_orders (display_id, item_code),
          machines (machine_id, name)
        `)
        .neq('status', 'CLOSED')
        .order('created_at', { ascending: false });

      // Apply filters if provided
      if (workOrderId) {
        query = query.eq('work_order_id', workOrderId);
      }
      if (machineId) {
        query = query.eq('machine_id', machineId);
      }

      const { data, error } = await query.limit(10);

      if (error) throw error;
      setNcrs(data || []);
    } catch (error) {
      console.error('Error loading open NCRs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || ncrs.length === 0) {
    return null;
  }

  const totalAffected = ncrs.reduce((sum, n) => sum + n.quantity_affected, 0);

  if (compact) {
    return (
      <div 
        className={cn(
          "flex items-center gap-2 p-2 bg-destructive/10 border border-destructive/30 rounded-md cursor-pointer hover:bg-destructive/20",
          className
        )}
        onClick={() => navigate('/ncr')}
      >
        <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
        <span className="text-sm font-medium text-destructive">
          {ncrs.length} Open NCR{ncrs.length > 1 ? 's' : ''} ({totalAffected} pcs affected)
        </span>
        <ArrowRight className="h-3 w-3 text-destructive ml-auto" />
      </div>
    );
  }

  return (
    <Card className={cn("border-destructive/50", className)}>
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-destructive">
            <FileWarning className="h-4 w-4" />
            Open NCRs Affecting Production
            <Badge variant="destructive" className="text-xs">
              {ncrs.length}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs"
            onClick={() => navigate('/ncr')}
          >
            View All
            <ArrowRight className="h-3 w-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2">
        {ncrs.slice(0, 5).map((ncr) => (
          <div
            key={ncr.id}
            className="flex items-center justify-between p-2 bg-muted/50 rounded-lg hover:bg-muted cursor-pointer"
            onClick={() => navigate(`/ncr/${ncr.id}`)}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{ncr.ncr_number}</span>
                  <Badge variant="outline" className="text-[9px]">
                    {ncr.ncr_type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {ncr.work_orders && (
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {ncr.work_orders.display_id}
                    </span>
                  )}
                  {ncr.machines && (
                    <span className="flex items-center gap-1">
                      <Factory className="h-3 w-3" />
                      {ncr.machines.machine_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-destructive font-medium text-sm">
                -{ncr.quantity_affected} {ncr.unit}
              </span>
              {ncr.rejection_type && (
                <span className="text-[9px] text-muted-foreground">
                  {ncr.rejection_type.replace('rejection_', '').replace('_', ' ')}
                </span>
              )}
            </div>
          </div>
        ))}
        
        <div className="pt-2 border-t text-xs text-muted-foreground flex justify-between">
          <span>Total qty affected:</span>
          <span className="font-medium text-destructive">{totalAffected} pcs</span>
        </div>
      </CardContent>
    </Card>
  );
}
