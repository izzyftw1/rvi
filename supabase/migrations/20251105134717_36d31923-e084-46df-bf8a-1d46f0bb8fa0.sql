-- A) NORMALIZE DATA SOURCE: Use external_partners as single source of truth

-- Drop the compatibility view if it exists
DROP VIEW IF EXISTS public.wo_external_partners CASCADE;

-- Create or replace external_partners table
CREATE TABLE IF NOT EXISTS public.external_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  process_type text NOT NULL CHECK (process_type IN ('Plating', 'Job Work', 'Buffing', 'Blasting', 'Forging', 'Heat Treatment')),
  default_lead_time_days integer DEFAULT 7,
  is_active boolean DEFAULT true,
  contact_name text,
  contact_phone text,
  contact_email text,
  address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add updated_at trigger for external_partners
CREATE OR REPLACE FUNCTION update_external_partners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_external_partners_updated_at ON public.external_partners;
CREATE TRIGGER update_external_partners_updated_at
  BEFORE UPDATE ON public.external_partners
  FOR EACH ROW
  EXECUTE FUNCTION update_external_partners_updated_at();

-- Create compatibility view for legacy code
CREATE OR REPLACE VIEW public.wo_external_partners AS 
SELECT * FROM public.external_partners;

-- Enable RLS on external_partners
ALTER TABLE public.external_partners ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow all read external_partners" ON public.external_partners;
DROP POLICY IF EXISTS "Allow insert external_partners" ON public.external_partners;
DROP POLICY IF EXISTS "Allow update external_partners" ON public.external_partners;
DROP POLICY IF EXISTS "Allow delete external_partners" ON public.external_partners;

-- RLS Policies for external_partners
CREATE POLICY "Allow all read external_partners"
  ON public.external_partners FOR SELECT
  USING (true);

CREATE POLICY "Allow insert external_partners"
  ON public.external_partners FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'production'::app_role) OR
    has_role(auth.uid(), 'logistics'::app_role)
  );

CREATE POLICY "Allow update external_partners"
  ON public.external_partners FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'production'::app_role) OR
    has_role(auth.uid(), 'logistics'::app_role)
  );

CREATE POLICY "Allow delete external_partners"
  ON public.external_partners FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- B) GUARANTEE EXTERNAL MOVES/RECEIPTS TABLES EXIST

-- Drop and recreate wo_external_moves with proper schema
DROP TABLE IF EXISTS public.wo_external_moves CASCADE;
CREATE TABLE public.wo_external_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  process text NOT NULL CHECK (process IN ('Plating', 'Job Work', 'Buffing', 'Blasting', 'Forging', 'Heat Treatment')),
  partner_id uuid REFERENCES public.external_partners(id),
  quantity_sent numeric NOT NULL,
  quantity_returned numeric DEFAULT 0,
  dispatch_date date DEFAULT CURRENT_DATE,
  expected_return_date date,
  returned_date date,
  challan_no text,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'partial', 'returned', 'overdue')),
  remarks text,
  operation_tag text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add updated_at trigger for wo_external_moves
DROP TRIGGER IF EXISTS update_wo_external_moves_updated_at ON public.wo_external_moves;
CREATE TRIGGER update_wo_external_moves_updated_at
  BEFORE UPDATE ON public.wo_external_moves
  FOR EACH ROW
  EXECUTE FUNCTION update_wo_external_moves_updated_at();

-- Enable RLS on wo_external_moves
ALTER TABLE public.wo_external_moves ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all read wo_external_moves" ON public.wo_external_moves;
DROP POLICY IF EXISTS "Allow insert wo_external_moves" ON public.wo_external_moves;
DROP POLICY IF EXISTS "Allow update wo_external_moves" ON public.wo_external_moves;

-- RLS Policies for wo_external_moves
CREATE POLICY "Allow all read wo_external_moves"
  ON public.wo_external_moves FOR SELECT
  USING (true);

CREATE POLICY "Allow insert wo_external_moves"
  ON public.wo_external_moves FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update wo_external_moves"
  ON public.wo_external_moves FOR UPDATE
  USING (true);

-- Create wo_external_receipts table
DROP TABLE IF EXISTS public.wo_external_receipts CASCADE;
CREATE TABLE public.wo_external_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  move_id uuid NOT NULL REFERENCES public.wo_external_moves(id) ON DELETE CASCADE,
  quantity_received numeric NOT NULL,
  grn_no text,
  received_at timestamptz DEFAULT now(),
  received_by uuid REFERENCES auth.users(id),
  remarks text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on wo_external_receipts
ALTER TABLE public.wo_external_receipts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all read wo_external_receipts" ON public.wo_external_receipts;
DROP POLICY IF EXISTS "Allow insert wo_external_receipts" ON public.wo_external_receipts;
DROP POLICY IF EXISTS "Allow update wo_external_receipts" ON public.wo_external_receipts;

-- RLS Policies for wo_external_receipts
CREATE POLICY "Allow all read wo_external_receipts"
  ON public.wo_external_receipts FOR SELECT
  USING (true);

CREATE POLICY "Allow insert wo_external_receipts"
  ON public.wo_external_receipts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update wo_external_receipts"
  ON public.wo_external_receipts FOR UPDATE
  USING (true);

-- Enable realtime for external processing tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.external_partners;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wo_external_moves;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wo_external_receipts;