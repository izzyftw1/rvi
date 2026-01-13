-- Create item_cost_breakups table to store active cost configuration per item
CREATE TABLE public.item_cost_breakups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.item_master(id) ON DELETE CASCADE,
  
  -- Physical parameters (stored once, reused across revisions)
  gross_weight_per_piece NUMERIC(12,4) NOT NULL DEFAULT 0,
  net_weight_per_piece NUMERIC(12,4) NOT NULL DEFAULT 0,
  
  -- Raw Material Costing inputs
  scrap_recovery_percent NUMERIC(7,2) NOT NULL DEFAULT 0,
  scrap_rate_per_kg NUMERIC(12,4) NOT NULL DEFAULT 0,
  rod_section_rate_per_kg NUMERIC(12,4) NOT NULL DEFAULT 0,
  
  -- Manufacturing / Conversion Cost inputs
  cnc_cycle_time_seconds NUMERIC(10,2) NOT NULL DEFAULT 0,
  machine_rate_per_hour NUMERIC(12,4) NOT NULL DEFAULT 0,
  
  -- Quality Impact
  rejection_allowance_percent NUMERIC(7,2) NOT NULL DEFAULT 0,
  
  -- Logistics & Packing
  packing_charge_per_piece NUMERIC(12,4) NOT NULL DEFAULT 0,
  freight_charge_per_piece NUMERIC(12,4) NOT NULL DEFAULT 0,
  
  -- Commercial
  selling_price_per_piece NUMERIC(14,4) NOT NULL DEFAULT 0,
  
  -- Cost profile: 'domestic' or 'export'
  cost_profile TEXT NOT NULL DEFAULT 'domestic' CHECK (cost_profile IN ('domestic', 'export')),
  
  -- Active revision tracking
  current_revision_number INTEGER NOT NULL DEFAULT 1,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  
  -- Each item can have one domestic and one export profile
  UNIQUE (item_id, cost_profile)
);

-- Create item_cost_revisions table to store immutable revision history
CREATE TABLE public.item_cost_revisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cost_breakup_id UUID NOT NULL REFERENCES public.item_cost_breakups(id) ON DELETE CASCADE,
  
  -- Revision metadata
  revision_number INTEGER NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  change_reason TEXT,
  
  -- Snapshot of all inputs at this revision
  gross_weight_per_piece NUMERIC(12,4) NOT NULL,
  net_weight_per_piece NUMERIC(12,4) NOT NULL,
  scrap_recovery_percent NUMERIC(7,2) NOT NULL,
  scrap_rate_per_kg NUMERIC(12,4) NOT NULL,
  rod_section_rate_per_kg NUMERIC(12,4) NOT NULL,
  cnc_cycle_time_seconds NUMERIC(10,2) NOT NULL,
  machine_rate_per_hour NUMERIC(12,4) NOT NULL,
  rejection_allowance_percent NUMERIC(7,2) NOT NULL,
  packing_charge_per_piece NUMERIC(12,4) NOT NULL,
  freight_charge_per_piece NUMERIC(12,4) NOT NULL,
  selling_price_per_piece NUMERIC(14,4) NOT NULL,
  cost_profile TEXT NOT NULL,
  
  -- Computed values snapshot (for historical reporting)
  gross_rm_cost_per_piece NUMERIC(14,4),
  scrap_realisable_value NUMERIC(14,4),
  net_rm_cost_per_piece NUMERIC(14,4),
  machining_cost_per_piece NUMERIC(14,4),
  rejection_cost_per_piece NUMERIC(14,4),
  total_cost_per_piece NUMERIC(14,4),
  cost_per_kg NUMERIC(14,4),
  gross_profit_percent NUMERIC(7,2),
  
  -- Unique revision per breakup
  UNIQUE (cost_breakup_id, revision_number)
);

-- Enable RLS
ALTER TABLE public.item_cost_breakups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_cost_revisions ENABLE ROW LEVEL SECURITY;

-- RLS policies for item_cost_breakups
CREATE POLICY "Anyone can view item cost breakups"
  ON public.item_cost_breakups
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert item cost breakups"
  ON public.item_cost_breakups
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update item cost breakups"
  ON public.item_cost_breakups
  FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete item cost breakups"
  ON public.item_cost_breakups
  FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- RLS policies for item_cost_revisions (read-only for audit trail)
CREATE POLICY "Anyone can view item cost revisions"
  ON public.item_cost_revisions
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert item cost revisions"
  ON public.item_cost_revisions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- No update/delete on revisions - they are immutable

-- Create index for performance
CREATE INDEX idx_item_cost_breakups_item_id ON public.item_cost_breakups(item_id);
CREATE INDEX idx_item_cost_revisions_breakup_id ON public.item_cost_revisions(cost_breakup_id);
CREATE INDEX idx_item_cost_revisions_created_at ON public.item_cost_revisions(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_item_cost_breakups_updated_at
  BEFORE UPDATE ON public.item_cost_breakups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();