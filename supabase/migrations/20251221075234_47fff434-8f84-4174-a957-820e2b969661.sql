-- Create operation_type enum
CREATE TYPE public.operation_type AS ENUM ('RAW_MATERIAL', 'CNC', 'QC', 'EXTERNAL_PROCESS', 'PACKING', 'DISPATCH');

-- Create direction enum
CREATE TYPE public.execution_direction AS ENUM ('IN', 'OUT', 'COMPLETE');

-- Create execution_records table
CREATE TABLE public.execution_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  operation_type public.operation_type NOT NULL,
  process_name TEXT,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  direction public.execution_direction NOT NULL,
  related_partner_id UUID REFERENCES public.external_partners(id),
  related_challan_id UUID REFERENCES public.wo_external_moves(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.execution_records ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view execution records"
ON public.execution_records
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can create execution records"
ON public.execution_records
FOR INSERT
WITH CHECK (true);

-- Add index for faster lookups
CREATE INDEX idx_execution_records_wo_id ON public.execution_records(work_order_id);
CREATE INDEX idx_execution_records_operation ON public.execution_records(operation_type);
CREATE INDEX idx_execution_records_created_at ON public.execution_records(created_at DESC);