/**
 * Hook for managing Item Cost Breakups with revision control
 * Handles all cost calculations using formulas - no manual computed values
 */
import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CostBreakupInputs {
  // Physical parameters
  grossWeightPerPiece: number;
  netWeightPerPiece: number;
  
  // Raw Material Costing
  scrapRecoveryPercent: number;
  scrapRatePerKg: number;
  rodSectionRatePerKg: number;
  
  // Manufacturing / Conversion
  cncCycleTimeSeconds: number;
  machineRatePerHour: number;
  
  // Quality Impact
  rejectionAllowancePercent: number;
  
  // Logistics & Packing
  packingChargePerPiece: number;
  freightChargePerPiece: number;
  
  // Commercial
  sellingPricePerPiece: number;
  
  // Profile
  costProfile: 'domestic' | 'export';
}

export interface ComputedCosts {
  grossRmCostPerPiece: number;
  scrapRealisableValue: number;
  netRmCostPerPiece: number;
  machiningCostPerPiece: number;
  rejectionCostPerPiece: number;
  totalCostPerPiece: number;
  costPerKg: number;
  grossProfitPercent: number;
  pricePerPiece: number;
}

export interface CostRevision {
  id: string;
  revisionNumber: number;
  effectiveDate: string;
  createdAt: string;
  createdBy: string | null;
  changeReason: string | null;
  inputs: CostBreakupInputs;
  computed: ComputedCosts;
}

export interface ItemCostBreakup {
  id: string;
  itemId: string;
  inputs: CostBreakupInputs;
  currentRevisionNumber: number;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_INPUTS: CostBreakupInputs = {
  grossWeightPerPiece: 0,
  netWeightPerPiece: 0,
  scrapRecoveryPercent: 0,
  scrapRatePerKg: 0,
  rodSectionRatePerKg: 0,
  cncCycleTimeSeconds: 0,
  machineRatePerHour: 0,
  rejectionAllowancePercent: 0,
  packingChargePerPiece: 0,
  freightChargePerPiece: 0,
  sellingPricePerPiece: 0,
  costProfile: 'domestic',
};

/**
 * Compute all derived costs from inputs
 */
export function computeCosts(inputs: CostBreakupInputs): ComputedCosts {
  const {
    grossWeightPerPiece,
    netWeightPerPiece,
    scrapRecoveryPercent,
    scrapRatePerKg,
    rodSectionRatePerKg,
    cncCycleTimeSeconds,
    machineRatePerHour,
    rejectionAllowancePercent,
    packingChargePerPiece,
    freightChargePerPiece,
    sellingPricePerPiece,
    costProfile,
  } = inputs;

  // Convert grams to kg for calculations
  const grossWeightKg = grossWeightPerPiece / 1000;
  const netWeightKg = netWeightPerPiece / 1000;
  const scrapWeightKg = grossWeightKg - netWeightKg;

  // Raw Material Costing
  const grossRmCostPerPiece = grossWeightKg * rodSectionRatePerKg;
  const scrapRealisableValue = scrapWeightKg * (scrapRecoveryPercent / 100) * scrapRatePerKg;
  const netRmCostPerPiece = grossRmCostPerPiece - scrapRealisableValue;

  // Manufacturing / Conversion Cost
  // Machine rate is per hour, cycle time is in seconds
  const machiningCostPerPiece = (cncCycleTimeSeconds / 3600) * machineRatePerHour;

  // Quality Impact - rejection cost as percentage of manufacturing cost
  const subtotalBeforeRejection = netRmCostPerPiece + machiningCostPerPiece + packingChargePerPiece;
  const rejectionCostPerPiece = subtotalBeforeRejection * (rejectionAllowancePercent / 100);

  // Logistics - freight only for export
  const effectiveFreight = costProfile === 'export' ? freightChargePerPiece : 0;

  // Total Cost
  const totalCostPerPiece = 
    netRmCostPerPiece + 
    machiningCostPerPiece + 
    rejectionCostPerPiece + 
    packingChargePerPiece + 
    effectiveFreight;

  // Cost per kg (based on net weight)
  const costPerKg = netWeightKg > 0 ? totalCostPerPiece / netWeightKg : 0;

  // Gross Profit
  const pricePerPiece = sellingPricePerPiece;
  const grossProfitPercent = pricePerPiece > 0 
    ? ((pricePerPiece - totalCostPerPiece) / pricePerPiece) * 100 
    : 0;

  return {
    grossRmCostPerPiece: round4(grossRmCostPerPiece),
    scrapRealisableValue: round4(scrapRealisableValue),
    netRmCostPerPiece: round4(netRmCostPerPiece),
    machiningCostPerPiece: round4(machiningCostPerPiece),
    rejectionCostPerPiece: round4(rejectionCostPerPiece),
    totalCostPerPiece: round4(totalCostPerPiece),
    costPerKg: round4(costPerKg),
    grossProfitPercent: round2(grossProfitPercent),
    pricePerPiece: round4(pricePerPiece),
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function useItemCostBreakup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [breakup, setBreakup] = useState<ItemCostBreakup | null>(null);
  const [revisions, setRevisions] = useState<CostRevision[]>([]);
  const [inputs, setInputs] = useState<CostBreakupInputs>(DEFAULT_INPUTS);

  const computed = useMemo(() => computeCosts(inputs), [inputs]);

  const loadBreakup = useCallback(async (itemId: string, profile: 'domestic' | 'export') => {
    setLoading(true);
    try {
      // Load existing breakup
      const { data: breakupData, error: breakupError } = await supabase
        .from('item_cost_breakups')
        .select('*')
        .eq('item_id', itemId)
        .eq('cost_profile', profile)
        .maybeSingle();

      if (breakupError) throw breakupError;

      if (breakupData) {
        const loadedInputs: CostBreakupInputs = {
          grossWeightPerPiece: Number(breakupData.gross_weight_per_piece) || 0,
          netWeightPerPiece: Number(breakupData.net_weight_per_piece) || 0,
          scrapRecoveryPercent: Number(breakupData.scrap_recovery_percent) || 0,
          scrapRatePerKg: Number(breakupData.scrap_rate_per_kg) || 0,
          rodSectionRatePerKg: Number(breakupData.rod_section_rate_per_kg) || 0,
          cncCycleTimeSeconds: Number(breakupData.cnc_cycle_time_seconds) || 0,
          machineRatePerHour: Number(breakupData.machine_rate_per_hour) || 0,
          rejectionAllowancePercent: Number(breakupData.rejection_allowance_percent) || 0,
          packingChargePerPiece: Number(breakupData.packing_charge_per_piece) || 0,
          freightChargePerPiece: Number(breakupData.freight_charge_per_piece) || 0,
          sellingPricePerPiece: Number(breakupData.selling_price_per_piece) || 0,
          costProfile: breakupData.cost_profile as 'domestic' | 'export',
        };

        setInputs(loadedInputs);
        setBreakup({
          id: breakupData.id,
          itemId: breakupData.item_id,
          inputs: loadedInputs,
          currentRevisionNumber: breakupData.current_revision_number,
          createdAt: breakupData.created_at,
          updatedAt: breakupData.updated_at,
        });

        // Load revisions
        await loadRevisions(breakupData.id);
      } else {
        // No existing breakup - try to populate from item_master defaults
        const { data: itemData } = await supabase
          .from('item_master')
          .select('estimated_gross_weight_g, estimated_net_weight_g, gross_weight_grams, net_weight_grams, estimated_cycle_time_s, cycle_time_seconds')
          .eq('id', itemId)
          .single();

        const defaultInputs: CostBreakupInputs = {
          ...DEFAULT_INPUTS,
          costProfile: profile,
          grossWeightPerPiece: itemData?.estimated_gross_weight_g || itemData?.gross_weight_grams || 0,
          netWeightPerPiece: itemData?.estimated_net_weight_g || itemData?.net_weight_grams || 0,
          cncCycleTimeSeconds: itemData?.estimated_cycle_time_s || itemData?.cycle_time_seconds || 0,
        };

        setInputs(defaultInputs);
        setBreakup(null);
        setRevisions([]);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', description: `Error loading cost breakup: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadRevisions = useCallback(async (breakupId: string) => {
    const { data, error } = await supabase
      .from('item_cost_revisions')
      .select('*')
      .eq('cost_breakup_id', breakupId)
      .order('revision_number', { ascending: false });

    if (error) {
      console.error('Error loading revisions:', error);
      return;
    }

    const mapped: CostRevision[] = (data || []).map(r => ({
      id: r.id,
      revisionNumber: r.revision_number,
      effectiveDate: r.effective_date,
      createdAt: r.created_at,
      createdBy: r.created_by,
      changeReason: r.change_reason,
      inputs: {
        grossWeightPerPiece: Number(r.gross_weight_per_piece) || 0,
        netWeightPerPiece: Number(r.net_weight_per_piece) || 0,
        scrapRecoveryPercent: Number(r.scrap_recovery_percent) || 0,
        scrapRatePerKg: Number(r.scrap_rate_per_kg) || 0,
        rodSectionRatePerKg: Number(r.rod_section_rate_per_kg) || 0,
        cncCycleTimeSeconds: Number(r.cnc_cycle_time_seconds) || 0,
        machineRatePerHour: Number(r.machine_rate_per_hour) || 0,
        rejectionAllowancePercent: Number(r.rejection_allowance_percent) || 0,
        packingChargePerPiece: Number(r.packing_charge_per_piece) || 0,
        freightChargePerPiece: Number(r.freight_charge_per_piece) || 0,
        sellingPricePerPiece: Number(r.selling_price_per_piece) || 0,
        costProfile: r.cost_profile as 'domestic' | 'export',
      },
      computed: {
        grossRmCostPerPiece: Number(r.gross_rm_cost_per_piece) || 0,
        scrapRealisableValue: Number(r.scrap_realisable_value) || 0,
        netRmCostPerPiece: Number(r.net_rm_cost_per_piece) || 0,
        machiningCostPerPiece: Number(r.machining_cost_per_piece) || 0,
        rejectionCostPerPiece: Number(r.rejection_cost_per_piece) || 0,
        totalCostPerPiece: Number(r.total_cost_per_piece) || 0,
        costPerKg: Number(r.cost_per_kg) || 0,
        grossProfitPercent: Number(r.gross_profit_percent) || 0,
        pricePerPiece: Number(r.selling_price_per_piece) || 0,
      },
    }));

    setRevisions(mapped);
  }, []);

  const saveBreakup = useCallback(async (
    itemId: string,
    changeReason?: string,
    effectiveDate?: string
  ) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const computedValues = computeCosts(inputs);

      const breakupData = {
        item_id: itemId,
        gross_weight_per_piece: inputs.grossWeightPerPiece,
        net_weight_per_piece: inputs.netWeightPerPiece,
        scrap_recovery_percent: inputs.scrapRecoveryPercent,
        scrap_rate_per_kg: inputs.scrapRatePerKg,
        rod_section_rate_per_kg: inputs.rodSectionRatePerKg,
        cnc_cycle_time_seconds: inputs.cncCycleTimeSeconds,
        machine_rate_per_hour: inputs.machineRatePerHour,
        rejection_allowance_percent: inputs.rejectionAllowancePercent,
        packing_charge_per_piece: inputs.packingChargePerPiece,
        freight_charge_per_piece: inputs.freightChargePerPiece,
        selling_price_per_piece: inputs.sellingPricePerPiece,
        cost_profile: inputs.costProfile,
        updated_at: new Date().toISOString(),
      };

      let breakupId: string;
      let newRevisionNumber: number;

      if (breakup) {
        // Update existing
        newRevisionNumber = breakup.currentRevisionNumber + 1;
        
        const { error: updateError } = await supabase
          .from('item_cost_breakups')
          .update({
            ...breakupData,
            current_revision_number: newRevisionNumber,
          })
          .eq('id', breakup.id);

        if (updateError) throw updateError;
        breakupId = breakup.id;
      } else {
        // Create new
        newRevisionNumber = 1;
        
        const { data: newBreakup, error: insertError } = await supabase
          .from('item_cost_breakups')
          .insert({
            ...breakupData,
            current_revision_number: 1,
            created_by: user?.id,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        breakupId = newBreakup.id;
      }

      // Create immutable revision record
      const { error: revisionError } = await supabase
        .from('item_cost_revisions')
        .insert({
          cost_breakup_id: breakupId,
          revision_number: newRevisionNumber,
          effective_date: effectiveDate || new Date().toISOString().split('T')[0],
          created_by: user?.id,
          change_reason: changeReason || null,
          gross_weight_per_piece: inputs.grossWeightPerPiece,
          net_weight_per_piece: inputs.netWeightPerPiece,
          scrap_recovery_percent: inputs.scrapRecoveryPercent,
          scrap_rate_per_kg: inputs.scrapRatePerKg,
          rod_section_rate_per_kg: inputs.rodSectionRatePerKg,
          cnc_cycle_time_seconds: inputs.cncCycleTimeSeconds,
          machine_rate_per_hour: inputs.machineRatePerHour,
          rejection_allowance_percent: inputs.rejectionAllowancePercent,
          packing_charge_per_piece: inputs.packingChargePerPiece,
          freight_charge_per_piece: inputs.freightChargePerPiece,
          selling_price_per_piece: inputs.sellingPricePerPiece,
          cost_profile: inputs.costProfile,
          gross_rm_cost_per_piece: computedValues.grossRmCostPerPiece,
          scrap_realisable_value: computedValues.scrapRealisableValue,
          net_rm_cost_per_piece: computedValues.netRmCostPerPiece,
          machining_cost_per_piece: computedValues.machiningCostPerPiece,
          rejection_cost_per_piece: computedValues.rejectionCostPerPiece,
          total_cost_per_piece: computedValues.totalCostPerPiece,
          cost_per_kg: computedValues.costPerKg,
          gross_profit_percent: computedValues.grossProfitPercent,
        });

      if (revisionError) throw revisionError;

      toast({ description: `Cost breakup saved as revision ${newRevisionNumber}` });
      
      // Reload to sync state
      await loadBreakup(itemId, inputs.costProfile);
    } catch (err: any) {
      toast({ variant: 'destructive', description: `Error saving: ${err.message}` });
    } finally {
      setSaving(false);
    }
  }, [breakup, inputs, toast, loadBreakup]);

  const updateInput = useCallback(<K extends keyof CostBreakupInputs>(
    key: K,
    value: CostBreakupInputs[K]
  ) => {
    setInputs(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetInputs = useCallback(() => {
    setInputs(DEFAULT_INPUTS);
    setBreakup(null);
    setRevisions([]);
  }, []);

  return {
    loading,
    saving,
    breakup,
    inputs,
    computed,
    revisions,
    loadBreakup,
    saveBreakup,
    updateInput,
    resetInputs,
    setInputs,
  };
}
