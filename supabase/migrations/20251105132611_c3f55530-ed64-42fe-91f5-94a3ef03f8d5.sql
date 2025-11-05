-- Drop existing tables if they exist
DROP TABLE IF EXISTS public.wo_external_receipts CASCADE;
DROP TABLE IF EXISTS public.wo_external_moves CASCADE;
DROP TABLE IF EXISTS public.external_partners CASCADE;

-- Create external_partners table
CREATE TABLE public.external_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  process_type TEXT,
  default_lead_time_days INTEGER DEFAULT 7,
  is_active BOOLEAN DEFAULT true,
  address TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create wo_external_moves table
CREATE TABLE public.wo_external_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  process TEXT,
  partner_id UUID REFERENCES external_partners(id),
  qty_sent INTEGER NOT NULL,
  qty_returned INTEGER DEFAULT 0,
  status TEXT DEFAULT 'sent',
  dispatch_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expected_return_date TIMESTAMP WITH TIME ZONE,
  returned_date TIMESTAMP WITH TIME ZONE,
  challan_no TEXT,
  remarks TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create wo_external_receipts table (for tracking returns)
CREATE TABLE public.wo_external_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  move_id UUID REFERENCES wo_external_moves(id) ON DELETE CASCADE,
  received_qty INTEGER NOT NULL,
  received_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  received_by UUID REFERENCES profiles(id),
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.external_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_external_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wo_external_receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for external_partners
CREATE POLICY "Allow all read external_partners" 
  ON public.external_partners 
  FOR SELECT 
  USING (true);

CREATE POLICY "Allow insert external_partners" 
  ON public.external_partners 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow update external_partners" 
  ON public.external_partners 
  FOR UPDATE 
  USING (true);

-- RLS Policies for wo_external_moves
CREATE POLICY "Allow all read wo_external_moves" 
  ON public.wo_external_moves 
  FOR SELECT 
  USING (true);

CREATE POLICY "Allow insert wo_external_moves" 
  ON public.wo_external_moves 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow update wo_external_moves" 
  ON public.wo_external_moves 
  FOR UPDATE 
  USING (true);

-- RLS Policies for wo_external_receipts
CREATE POLICY "Allow all read wo_external_receipts" 
  ON public.wo_external_receipts 
  FOR SELECT 
  USING (true);

CREATE POLICY "Allow insert wo_external_receipts" 
  ON public.wo_external_receipts 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Allow update wo_external_receipts" 
  ON public.wo_external_receipts 
  FOR UPDATE 
  USING (true);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_wo_external_moves_updated_at
  BEFORE UPDATE ON public.wo_external_moves
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wo_external_moves_updated_at();