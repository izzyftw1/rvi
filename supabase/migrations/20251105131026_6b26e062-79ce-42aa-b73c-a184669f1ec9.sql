-- Update external_partners table to ensure correct schema
ALTER TABLE public.external_partners 
  ADD COLUMN IF NOT EXISTS default_lead_time_days INTEGER DEFAULT 7;

-- Rename active to is_active if needed
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'external_partners' AND column_name = 'active'
  ) THEN
    ALTER TABLE public.external_partners RENAME COLUMN active TO is_active;
  END IF;
END $$;

-- Enable RLS on external_partners
ALTER TABLE public.external_partners ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Select active partners" ON public.external_partners;
DROP POLICY IF EXISTS "Authenticated users can insert partners" ON public.external_partners;
DROP POLICY IF EXISTS "Authenticated users can update partners" ON public.external_partners;

-- RLS Policies for external_partners
CREATE POLICY "Select active partners" ON public.external_partners
  FOR SELECT USING (is_active = true);

CREATE POLICY "Authenticated users can insert partners" ON public.external_partners
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update partners" ON public.external_partners
  FOR UPDATE USING (true);

-- Ensure wo_external_moves table exists with correct schema
CREATE TABLE IF NOT EXISTS public.wo_external_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES public.work_orders(id) ON DELETE CASCADE,
  process TEXT NOT NULL,
  partner_id UUID REFERENCES public.external_partners(id),
  quantity_sent INTEGER NOT NULL,
  qty_returned INTEGER DEFAULT 0,
  status TEXT DEFAULT 'sent',
  dispatch_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expected_return_date TIMESTAMP WITH TIME ZONE,
  returned_date TIMESTAMP WITH TIME ZONE,
  challan_no TEXT UNIQUE,
  remarks TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on wo_external_moves
ALTER TABLE public.wo_external_moves ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view external moves" ON public.wo_external_moves;
DROP POLICY IF EXISTS "Authenticated users can create external moves" ON public.wo_external_moves;
DROP POLICY IF EXISTS "Authenticated users can update external moves" ON public.wo_external_moves;

-- RLS Policies for wo_external_moves
CREATE POLICY "Authenticated users can view external moves" ON public.wo_external_moves
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create external moves" ON public.wo_external_moves
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update external moves" ON public.wo_external_moves
  FOR UPDATE USING (true);

-- Create wo_external_receipts table
CREATE TABLE IF NOT EXISTS public.wo_external_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  move_id UUID REFERENCES public.wo_external_moves(id) ON DELETE CASCADE,
  received_qty INTEGER NOT NULL,
  received_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  received_by UUID REFERENCES auth.users(id),
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on wo_external_receipts
ALTER TABLE public.wo_external_receipts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON public.wo_external_receipts;
DROP POLICY IF EXISTS "Authenticated users can create receipts" ON public.wo_external_receipts;

-- RLS Policies for wo_external_receipts
CREATE POLICY "Authenticated users can view receipts" ON public.wo_external_receipts
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create receipts" ON public.wo_external_receipts
  FOR INSERT WITH CHECK (true);

-- Trigger for updated_at on wo_external_moves
CREATE OR REPLACE FUNCTION update_wo_external_moves_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_wo_external_moves_updated_at ON public.wo_external_moves;
CREATE TRIGGER update_wo_external_moves_updated_at
  BEFORE UPDATE ON public.wo_external_moves
  FOR EACH ROW
  EXECUTE FUNCTION update_wo_external_moves_updated_at();