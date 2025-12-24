import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, parseISO, subDays, format } from "date-fns";

export interface ExternalMovement {
  id: string;
  batch_id: string;
  work_order_id: string;
  process_type: string;
  partner_id: string | null;
  quantity_sent: number;
  quantity_returned: number | null;
  quantity_rejected: number | null;
  sent_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: string | null;
  challan_no: string | null;
}

export interface MaterialReceipt {
  id: string;
  receipt_no: string;
  receipt_type: string;
  receipt_date: string;
  source_partner_id: string | null;
  destination_partner_id: string | null;
  external_movement_id: string | null;
  quantity_received: number;
  quantity_rejected: number | null;
  quantity_ok: number | null;
  process_type: string | null;
}

export interface Partner {
  id: string;
  name: string;
  process_type: string | null;
  is_active: boolean | null;
}

export interface PartnerMetrics {
  partner_id: string;
  partner_name: string;
  process_type: string | null;
  total_movements: number;
  completed_movements: number;
  pending_movements: number;
  overdue_movements: number;
  total_qty_sent: number;
  total_qty_returned: number;
  total_qty_rejected: number;
  qty_pending: number;
  turnaround_days_avg: number;
  turnaround_days_min: number;
  turnaround_days_max: number;
  on_time_count: number;
  late_count: number;
  on_time_percentage: number;
  loss_percentage: number; // Only for closed movements
}

export interface ProcessMetrics {
  process: string;
  process_label: string;
  total_movements: number;
  completed_movements: number;
  avg_turnaround_days: number;
  on_time_percentage: number;
  loss_percentage: number;
}

export interface SummaryMetrics {
  total_movements: number;
  completed_movements: number;
  pending_movements: number;
  overdue_movements: number;
  avg_turnaround_days: number;
  on_time_percentage: number;
  total_qty_sent: number;
  total_qty_returned: number;
  total_qty_rejected: number;
  loss_percentage: number;
}

export const PROCESS_LABELS: Record<string, string> = {
  job_work: 'Job Work',
  plating: 'Plating',
  buffing: 'Buffing',
  blasting: 'Blasting',
  forging_ext: 'Forging',
  heat_treatment: 'Heat Treatment',
  grinding: 'Grinding',
  anodizing: 'Anodizing',
  painting: 'Painting',
  passivation: 'Passivation',
};

export type DateRange = '30' | '90' | '180' | '365';

export function useExternalAnalytics(dateRange: DateRange = '90') {
  const [movements, setMovements] = useState<ExternalMovement[]>([]);
  const [receipts, setReceipts] = useState<MaterialReceipt[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const days = parseInt(dateRange);
      const cutoffDate = format(subDays(new Date(), days), "yyyy-MM-dd");

      const [movementsRes, receiptsRes, partnersRes] = await Promise.all([
        supabase
          .from("external_movements")
          .select("*")
          .gte("sent_date", cutoffDate)
          .order("sent_date", { ascending: false }),
        supabase
          .from("material_receipts")
          .select("*")
          .in("receipt_type", ["partner_to_factory", "partner_to_partner", "partner_to_packing"])
          .gte("receipt_date", cutoffDate),
        supabase
          .from("external_partners")
          .select("id, name, process_type, is_active")
      ]);

      if (movementsRes.error) throw movementsRes.error;
      if (receiptsRes.error) throw receiptsRes.error;

      setMovements(movementsRes.data || []);
      setReceipts(receiptsRes.data || []);
      setPartners(partnersRes.data || []);
    } catch (err: any) {
      console.error("Error loading external analytics:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("external-analytics")
      .on("postgres_changes", { event: "*", schema: "public", table: "external_movements" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_receipts" }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Partner lookup map
  const partnerMap = useMemo(() => {
    const map: Record<string, Partner> = {};
    partners.forEach(p => { map[p.id] = p; });
    return map;
  }, [partners]);

  // Calculate partner metrics
  const partnerMetrics = useMemo((): PartnerMetrics[] => {
    const today = new Date();
    const metricsMap: Record<string, PartnerMetrics> = {};
    const turnaroundsByPartner: Record<string, number[]> = {};

    // Initialize metrics for known partners
    partners.forEach(p => {
      metricsMap[p.id] = {
        partner_id: p.id,
        partner_name: p.name,
        process_type: p.process_type,
        total_movements: 0,
        completed_movements: 0,
        pending_movements: 0,
        overdue_movements: 0,
        total_qty_sent: 0,
        total_qty_returned: 0,
        total_qty_rejected: 0,
        qty_pending: 0,
        turnaround_days_avg: 0,
        turnaround_days_min: 999,
        turnaround_days_max: 0,
        on_time_count: 0,
        late_count: 0,
        on_time_percentage: 0,
        loss_percentage: 0,
      };
      turnaroundsByPartner[p.id] = [];
    });

    movements.forEach(mov => {
      const partnerId = mov.partner_id;
      if (!partnerId || !metricsMap[partnerId]) return;

      const metrics = metricsMap[partnerId];
      metrics.total_movements++;
      metrics.total_qty_sent += mov.quantity_sent || 0;

      const qtySent = mov.quantity_sent || 0;
      const qtyReturned = mov.quantity_returned || 0;
      const qtyRejected = mov.quantity_rejected || 0;
      const isCompleted = mov.status === 'received' || mov.status === 'completed' || mov.actual_return_date;
      
      const sentDate = mov.sent_date ? parseISO(mov.sent_date) : null;
      const expectedDate = mov.expected_return_date ? parseISO(mov.expected_return_date) : null;
      const returnedDate = mov.actual_return_date ? parseISO(mov.actual_return_date) : null;

      if (isCompleted && returnedDate) {
        metrics.completed_movements++;
        metrics.total_qty_returned += qtyReturned;
        metrics.total_qty_rejected += qtyRejected;

        // Turnaround = received_date - sent_date
        if (sentDate) {
          const turnaround = differenceInDays(returnedDate, sentDate);
          turnaroundsByPartner[partnerId].push(turnaround);
          if (turnaround < metrics.turnaround_days_min) metrics.turnaround_days_min = turnaround;
          if (turnaround > metrics.turnaround_days_max) metrics.turnaround_days_max = turnaround;
        }

        // On-time = received_date <= expected_date
        if (expectedDate) {
          if (returnedDate <= expectedDate) {
            metrics.on_time_count++;
          } else {
            metrics.late_count++;
          }
        }
      } else {
        // Pending
        metrics.pending_movements++;
        metrics.qty_pending += qtySent - qtyReturned;

        // Overdue = not returned and past expected date
        if (expectedDate && today > expectedDate) {
          metrics.overdue_movements++;
        }
      }
    });

    // Finalize metrics
    Object.values(metricsMap).forEach(metrics => {
      const partnerId = metrics.partner_id;
      const turnarounds = turnaroundsByPartner[partnerId] || [];

      // Average turnaround
      if (turnarounds.length > 0) {
        metrics.turnaround_days_avg = Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length);
      }
      if (metrics.turnaround_days_min === 999) metrics.turnaround_days_min = 0;

      // On-time percentage
      const totalWithExpected = metrics.on_time_count + metrics.late_count;
      if (totalWithExpected > 0) {
        metrics.on_time_percentage = Math.round((metrics.on_time_count / totalWithExpected) * 100);
      }

      // Loss percentage - ONLY for completed movements (not pending)
      // Loss = (sent - returned - rejected) for completed records
      if (metrics.completed_movements > 0 && metrics.total_qty_returned > 0) {
        const completedSent = metrics.total_qty_sent - metrics.qty_pending; // Amount that was for completed movements
        const actualLoss = completedSent - metrics.total_qty_returned - metrics.total_qty_rejected;
        if (completedSent > 0 && actualLoss > 0) {
          metrics.loss_percentage = Math.round((actualLoss / completedSent) * 100 * 100) / 100;
        }
      }
    });

    return Object.values(metricsMap)
      .filter(m => m.total_movements > 0)
      .sort((a, b) => b.total_movements - a.total_movements);
  }, [movements, partners]);

  // Calculate process metrics
  const processMetrics = useMemo((): ProcessMetrics[] => {
    const today = new Date();
    const processMap: Record<string, ExternalMovement[]> = {};

    movements.forEach(mov => {
      const process = mov.process_type || 'unknown';
      if (!processMap[process]) processMap[process] = [];
      processMap[process].push(mov);
    });

    return Object.entries(processMap).map(([process, movs]) => {
      const completed = movs.filter(m => m.status === 'received' || m.status === 'completed' || m.actual_return_date);
      
      const turnarounds = completed
        .filter(m => m.sent_date && m.actual_return_date)
        .map(m => differenceInDays(parseISO(m.actual_return_date!), parseISO(m.sent_date)));

      const avgTurnaround = turnarounds.length > 0
        ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
        : 0;

      const onTimeCount = completed.filter(m => {
        if (!m.expected_return_date || !m.actual_return_date) return false;
        return parseISO(m.actual_return_date) <= parseISO(m.expected_return_date);
      }).length;

      const totalSent = movs.reduce((sum, m) => sum + (m.quantity_sent || 0), 0);
      const totalReturned = completed.reduce((sum, m) => sum + (m.quantity_returned || 0), 0);
      const totalRejected = completed.reduce((sum, m) => sum + (m.quantity_rejected || 0), 0);
      const lossPercent = totalSent > 0 && completed.length > 0
        ? Math.max(0, ((totalSent - totalReturned - totalRejected) / totalSent) * 100)
        : 0;

      return {
        process,
        process_label: PROCESS_LABELS[process] || process,
        total_movements: movs.length,
        completed_movements: completed.length,
        avg_turnaround_days: Math.round(avgTurnaround * 10) / 10,
        on_time_percentage: completed.length > 0 ? Math.round((onTimeCount / completed.length) * 100) : 0,
        loss_percentage: Math.round(lossPercent * 10) / 10,
      };
    }).sort((a, b) => b.total_movements - a.total_movements);
  }, [movements]);

  // Summary metrics
  const summary = useMemo((): SummaryMetrics => {
    const today = new Date();
    const completed = movements.filter(m => m.status === 'received' || m.status === 'completed' || m.actual_return_date);
    const pending = movements.filter(m => !m.actual_return_date && m.status !== 'received' && m.status !== 'completed');
    const overdue = pending.filter(m => m.expected_return_date && parseISO(m.expected_return_date) < today);

    const turnarounds = completed
      .filter(m => m.sent_date && m.actual_return_date)
      .map(m => differenceInDays(parseISO(m.actual_return_date!), parseISO(m.sent_date)));

    const avgTurnaround = turnarounds.length > 0
      ? turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length
      : 0;

    const onTimeJobs = completed.filter(m => {
      if (!m.expected_return_date || !m.actual_return_date) return false;
      return parseISO(m.actual_return_date) <= parseISO(m.expected_return_date);
    });

    const totalSent = movements.reduce((sum, m) => sum + (m.quantity_sent || 0), 0);
    const totalReturned = completed.reduce((sum, m) => sum + (m.quantity_returned || 0), 0);
    const totalRejected = completed.reduce((sum, m) => sum + (m.quantity_rejected || 0), 0);
    
    // Loss only for closed movements
    const lossPercent = completed.length > 0 && totalReturned > 0
      ? Math.max(0, ((totalSent - totalReturned - totalRejected - pending.reduce((s, m) => s + (m.quantity_sent || 0), 0)) / (totalSent - pending.reduce((s, m) => s + (m.quantity_sent || 0), 0))) * 100)
      : 0;

    return {
      total_movements: movements.length,
      completed_movements: completed.length,
      pending_movements: pending.length,
      overdue_movements: overdue.length,
      avg_turnaround_days: Math.round(avgTurnaround * 10) / 10,
      on_time_percentage: completed.length > 0 ? Math.round((onTimeJobs.length / completed.length) * 100) : 0,
      total_qty_sent: totalSent,
      total_qty_returned: totalReturned,
      total_qty_rejected: totalRejected,
      loss_percentage: Math.round(lossPercent * 10) / 10,
    };
  }, [movements]);

  return {
    movements,
    receipts,
    partners,
    partnerMap,
    partnerMetrics,
    processMetrics,
    summary,
    loading,
    error,
    refresh: loadData,
  };
}
