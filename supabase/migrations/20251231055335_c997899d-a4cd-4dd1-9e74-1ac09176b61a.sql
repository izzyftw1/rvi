-- Fix the gate_register_to_inventory trigger to use valid qc_status values
CREATE OR REPLACE FUNCTION public.gate_register_to_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for completed raw material IN entries with heat number
  IF NEW.direction = 'IN' AND NEW.material_type = 'raw_material' 
     AND NEW.status = 'completed' AND NEW.heat_no IS NOT NULL THEN
    
    -- Create material_lots entry with valid qc_status
    INSERT INTO public.material_lots (
      lot_id,
      heat_no,
      alloy,
      material_size_mm,
      gross_weight,
      net_weight,
      supplier,
      status,
      qc_status,
      received_by
    ) VALUES (
      'LOT-' || NEW.gate_entry_no,
      NEW.heat_no,
      COALESCE(NEW.alloy, 'Unknown'),
      NEW.rod_section_size,
      NEW.gross_weight_kg,
      COALESCE(NEW.net_weight_kg, NEW.gross_weight_kg),
      COALESCE(NEW.supplier_name, 'Unknown'),
      'received',
      'pending', -- Always use 'pending' as it's a valid qc_status value
      NEW.created_by
    ) ON CONFLICT (lot_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Change default status to 'pending' so entries don't immediately trigger inventory creation
-- This allows the gate user to complete the entry after verification
ALTER TABLE public.gate_register ALTER COLUMN status SET DEFAULT 'pending';