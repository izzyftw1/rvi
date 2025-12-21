-- Create operation_routes table for soft routing
CREATE TABLE public.operation_routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  work_order_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL,
  operation_type public.operation_type NOT NULL,
  process_name TEXT,
  is_external BOOLEAN NOT NULL DEFAULT false,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(work_order_id, sequence_number)
);

-- Enable RLS
ALTER TABLE public.operation_routes ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view operation routes"
ON public.operation_routes
FOR SELECT
USING (true);

CREATE POLICY "Admin and production can manage operation routes"
ON public.operation_routes
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'production'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'production'::app_role));

-- Add index for faster lookups
CREATE INDEX idx_operation_routes_wo_id ON public.operation_routes(work_order_id);
CREATE INDEX idx_operation_routes_sequence ON public.operation_routes(work_order_id, sequence_number);

-- Add out_of_sequence flag to execution_records
ALTER TABLE public.execution_records 
ADD COLUMN out_of_sequence BOOLEAN DEFAULT false,
ADD COLUMN route_step_id UUID REFERENCES public.operation_routes(id);