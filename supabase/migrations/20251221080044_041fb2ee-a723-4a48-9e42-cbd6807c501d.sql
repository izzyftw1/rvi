
-- Create NCR type enum
CREATE TYPE public.ncr_type AS ENUM ('INTERNAL', 'CUSTOMER', 'SUPPLIER');

-- Create NCR disposition enum
CREATE TYPE public.ncr_disposition AS ENUM ('REWORK', 'SCRAP', 'USE_AS_IS', 'RETURN_TO_SUPPLIER');

-- Create NCR status enum
CREATE TYPE public.ncr_status AS ENUM ('OPEN', 'ACTION_IN_PROGRESS', 'EFFECTIVENESS_PENDING', 'CLOSED');

-- Create NCR table
CREATE TABLE public.ncrs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ncr_number TEXT NOT NULL UNIQUE,
  ncr_type public.ncr_type NOT NULL,
  source_reference TEXT,
  work_order_id UUID REFERENCES public.work_orders(id),
  qc_record_id UUID REFERENCES public.qc_records(id),
  operation_type public.operation_type,
  quantity_affected NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  issue_description TEXT NOT NULL,
  disposition public.ncr_disposition,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  responsible_person UUID REFERENCES auth.users(id),
  due_date DATE,
  status public.ncr_status NOT NULL DEFAULT 'OPEN',
  effectiveness_check TEXT,
  effectiveness_verified BOOLEAN DEFAULT FALSE,
  closed_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ncrs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Everyone can view NCRs"
ON public.ncrs FOR SELECT
USING (true);

CREATE POLICY "Quality and admin can manage NCRs"
ON public.ncrs FOR ALL
USING (has_role(auth.uid(), 'quality'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'production'::app_role));

-- Create indexes
CREATE INDEX idx_ncrs_work_order ON public.ncrs(work_order_id);
CREATE INDEX idx_ncrs_qc_record ON public.ncrs(qc_record_id);
CREATE INDEX idx_ncrs_status ON public.ncrs(status);
CREATE INDEX idx_ncrs_type ON public.ncrs(ncr_type);

-- Create trigger for updated_at
CREATE TRIGGER update_ncrs_updated_at
  BEFORE UPDATE ON public.ncrs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to generate NCR number
CREATE OR REPLACE FUNCTION public.generate_ncr_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  year_suffix TEXT;
BEGIN
  year_suffix := TO_CHAR(CURRENT_DATE, 'YY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(ncr_number FROM 'NCR-(\d+)-') AS INTEGER)), 0) + 1
  INTO next_number
  FROM ncrs
  WHERE ncr_number LIKE 'NCR-%-' || year_suffix;
  
  RETURN 'NCR-' || LPAD(next_number::TEXT, 5, '0') || '-' || year_suffix;
END;
$$;
