-- Create material receipt types enum
CREATE TYPE public.material_receipt_type AS ENUM (
  'supplier_to_factory',       -- Supplier → Factory (raw material)
  'partner_to_factory',        -- External Partner → Factory (returned from processing)
  'partner_to_partner',        -- External Partner → External Partner (forwarded)
  'partner_to_packing'         -- External Partner → Packing (direct to final stage)
);

-- Create unified material receipts ledger
CREATE TABLE public.material_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Receipt metadata
  receipt_no TEXT NOT NULL UNIQUE,
  receipt_type public.material_receipt_type NOT NULL,
  receipt_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Source reference (one of these will be set based on receipt type)
  source_supplier_id UUID REFERENCES public.suppliers(id),
  source_partner_id UUID REFERENCES public.external_partners(id),
  
  -- Destination reference (for partner_to_partner type)
  destination_partner_id UUID REFERENCES public.external_partners(id),
  
  -- Batch and work order reference
  batch_id UUID REFERENCES public.production_batches(id),
  work_order_id UUID REFERENCES public.work_orders(id),
  
  -- External movement reference (for closing movements)
  external_movement_id UUID REFERENCES public.external_movements(id),
  
  -- RPO reference (for supplier receipts)
  rpo_id UUID REFERENCES public.raw_purchase_orders(id),
  
  -- Quantity details
  quantity_received INTEGER NOT NULL,
  quantity_rejected INTEGER DEFAULT 0,
  quantity_ok INTEGER GENERATED ALWAYS AS (quantity_received - COALESCE(quantity_rejected, 0)) STORED,
  unit public.batch_unit NOT NULL DEFAULT 'pcs',
  
  -- Material details (for supplier receipts)
  heat_no TEXT,
  material_grade TEXT,
  
  -- Document references
  challan_no TEXT,
  dc_number TEXT,
  invoice_no TEXT,
  invoice_date DATE,
  transporter TEXT,
  lr_no TEXT,
  
  -- Process details (for partner receipts)
  process_type TEXT,
  
  -- QC details
  requires_qc BOOLEAN DEFAULT false,
  qc_status TEXT DEFAULT 'pending',
  qc_approved_by UUID,
  qc_approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit
  received_by UUID,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.material_receipts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view material receipts" 
ON public.material_receipts 
FOR SELECT 
USING (true);

CREATE POLICY "Authorized roles can manage material receipts" 
ON public.material_receipts 
FOR ALL 
USING (
  has_role(auth.uid(), 'production'::app_role) OR 
  has_role(auth.uid(), 'logistics'::app_role) OR 
  has_role(auth.uid(), 'stores'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Indexes for common queries
CREATE INDEX idx_material_receipts_type ON public.material_receipts(receipt_type);
CREATE INDEX idx_material_receipts_date ON public.material_receipts(receipt_date);
CREATE INDEX idx_material_receipts_batch ON public.material_receipts(batch_id);
CREATE INDEX idx_material_receipts_work_order ON public.material_receipts(work_order_id);
CREATE INDEX idx_material_receipts_movement ON public.material_receipts(external_movement_id);
CREATE INDEX idx_material_receipts_source_partner ON public.material_receipts(source_partner_id);
CREATE INDEX idx_material_receipts_source_supplier ON public.material_receipts(source_supplier_id);

-- Trigger function to update batch location on receipt
CREATE OR REPLACE FUNCTION public.update_batch_location_on_receipt()
RETURNS TRIGGER AS $$
BEGIN
  -- Update production batch based on receipt type
  IF NEW.batch_id IS NOT NULL THEN
    CASE NEW.receipt_type
      WHEN 'supplier_to_factory' THEN
        -- Raw material received at factory
        UPDATE public.production_batches
        SET 
          current_location_type = 'factory',
          current_location_ref = NULL,
          current_process = 'goods_in'
        WHERE id = NEW.batch_id;
        
      WHEN 'partner_to_factory' THEN
        -- Material returned from external partner
        UPDATE public.production_batches
        SET 
          current_location_type = 'factory',
          current_location_ref = NULL,
          current_process = CASE 
            WHEN NEW.requires_qc THEN 'post_external_qc'
            ELSE 'production'
          END,
          external_returned_at = NEW.receipt_date
        WHERE id = NEW.batch_id;
        
      WHEN 'partner_to_partner' THEN
        -- Forwarded to another partner
        UPDATE public.production_batches
        SET 
          current_location_type = 'external_partner',
          current_location_ref = NEW.destination_partner_id,
          current_process = NEW.process_type
        WHERE id = NEW.batch_id;
        
      WHEN 'partner_to_packing' THEN
        -- Direct to packing
        UPDATE public.production_batches
        SET 
          current_location_type = 'factory',
          current_location_ref = NULL,
          current_process = 'packing',
          external_returned_at = NEW.receipt_date
        WHERE id = NEW.batch_id;
    END CASE;
  END IF;
  
  -- Update external movement if referenced
  IF NEW.external_movement_id IS NOT NULL THEN
    UPDATE public.external_movements
    SET 
      quantity_returned = COALESCE(quantity_returned, 0) + NEW.quantity_received,
      quantity_rejected = COALESCE(quantity_rejected, 0) + COALESCE(NEW.quantity_rejected, 0),
      actual_return_date = CASE 
        WHEN (COALESCE(quantity_returned, 0) + NEW.quantity_received) >= quantity_sent 
        THEN NEW.receipt_date 
        ELSE actual_return_date 
      END,
      status = CASE 
        WHEN NEW.receipt_type = 'partner_to_partner' THEN 'forwarded'
        WHEN (COALESCE(quantity_returned, 0) + NEW.quantity_received) >= quantity_sent THEN 'returned'
        ELSE 'partially_returned'
      END,
      forwarded_to_movement_id = CASE 
        WHEN NEW.receipt_type = 'partner_to_partner' THEN NEW.id 
        ELSE forwarded_to_movement_id 
      END,
      updated_at = now()
    WHERE id = NEW.external_movement_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger
CREATE TRIGGER trg_update_batch_on_receipt
AFTER INSERT ON public.material_receipts
FOR EACH ROW
EXECUTE FUNCTION public.update_batch_location_on_receipt();

-- Trigger for updated_at
CREATE TRIGGER update_material_receipts_updated_at
BEFORE UPDATE ON public.material_receipts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate receipt number
CREATE OR REPLACE FUNCTION public.generate_receipt_number(receipt_type public.material_receipt_type)
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  seq_num INTEGER;
  result TEXT;
BEGIN
  -- Determine prefix based on type
  CASE receipt_type
    WHEN 'supplier_to_factory' THEN prefix := 'GRN';
    WHEN 'partner_to_factory' THEN prefix := 'RET';
    WHEN 'partner_to_partner' THEN prefix := 'FWD';
    WHEN 'partner_to_packing' THEN prefix := 'RTP';
    ELSE prefix := 'REC';
  END CASE;
  
  -- Get next sequence number for today
  SELECT COALESCE(MAX(
    CAST(NULLIF(SUBSTRING(receipt_no FROM LENGTH(prefix) + 9), '') AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM public.material_receipts
  WHERE receipt_no LIKE prefix || to_char(CURRENT_DATE, 'YYYYMMDD') || '%';
  
  -- Generate receipt number
  result := prefix || to_char(CURRENT_DATE, 'YYYYMMDD') || LPAD(seq_num::TEXT, 4, '0');
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create view for receipt ledger with source/destination names
CREATE OR REPLACE VIEW public.material_receipts_ledger AS
SELECT 
  mr.*,
  s.name AS source_supplier_name,
  sp.name AS source_partner_name,
  dp.name AS destination_partner_name,
  pb.batch_number,
  wo.display_id AS work_order_display_id,
  wo.item_code,
  wo.customer
FROM public.material_receipts mr
LEFT JOIN public.suppliers s ON mr.source_supplier_id = s.id
LEFT JOIN public.external_partners sp ON mr.source_partner_id = sp.id
LEFT JOIN public.external_partners dp ON mr.destination_partner_id = dp.id
LEFT JOIN public.production_batches pb ON mr.batch_id = pb.id
LEFT JOIN public.work_orders wo ON mr.work_order_id = wo.id
ORDER BY mr.receipt_date DESC;