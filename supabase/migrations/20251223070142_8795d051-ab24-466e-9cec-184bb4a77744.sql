-- Create operator_production_ledger table
-- This is the single source of truth for operator metrics derived from production logs
CREATE TABLE public.operator_production_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_log_id UUID NOT NULL REFERENCES public.daily_production_logs(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  machine_id UUID REFERENCES public.machines(id) ON DELETE SET NULL,
  log_date DATE NOT NULL,
  runtime_minutes INTEGER NOT NULL DEFAULT 0,
  target_qty INTEGER NOT NULL DEFAULT 0,
  actual_qty INTEGER NOT NULL DEFAULT 0,
  ok_qty INTEGER NOT NULL DEFAULT 0,
  rejection_qty INTEGER NOT NULL DEFAULT 0,
  efficiency_pct NUMERIC(5,2),
  minutes_share NUMERIC(5,2) NOT NULL DEFAULT 100.00, -- % share of runtime for this operator
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(production_log_id, operator_id)
);

-- Enable RLS
ALTER TABLE public.operator_production_ledger ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Everyone can view operator ledger" 
ON public.operator_production_ledger 
FOR SELECT 
USING (true);

CREATE POLICY "System can insert operator ledger" 
ON public.operator_production_ledger 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can manage operator ledger" 
ON public.operator_production_ledger 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for common queries
CREATE INDEX idx_operator_ledger_operator_date ON public.operator_production_ledger(operator_id, log_date);
CREATE INDEX idx_operator_ledger_log_date ON public.operator_production_ledger(log_date);
CREATE INDEX idx_operator_ledger_machine ON public.operator_production_ledger(machine_id, log_date);

-- Add operators JSONB column to daily_production_logs for storing multiple operators
ALTER TABLE public.daily_production_logs 
ADD COLUMN IF NOT EXISTS operators JSONB DEFAULT '[]'::jsonb;

-- Comment for documentation
COMMENT ON TABLE public.operator_production_ledger IS 'Single source of truth for operator metrics, derived from daily_production_logs. Each entry represents one operator contribution to a production log.';
COMMENT ON COLUMN public.operator_production_ledger.minutes_share IS 'Percentage share of the total runtime for this operator (defaults to equal split among all operators)';