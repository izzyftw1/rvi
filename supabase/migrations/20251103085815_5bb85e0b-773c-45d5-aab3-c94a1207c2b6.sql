-- Fix COALESCE type mismatch in auto_create_qc_incoming function
CREATE OR REPLACE FUNCTION public.auto_create_qc_incoming()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_qc_id text;
  qc_count integer;
BEGIN
  -- Only create QC record for new Work Orders
  IF TG_OP = 'INSERT' THEN
    -- Generate QC-IN ID
    SELECT COUNT(*) INTO qc_count FROM qc_records WHERE qc_type = 'first_piece';
    new_qc_id := 'QC-IN-' || LPAD((qc_count + 1)::text, 6, '0');
    
    -- Insert QC record linked to this Work Order
    INSERT INTO public.qc_records (
      qc_id,
      wo_id,
      qc_type,
      result,
      approved_by,
      measurements,
      remarks
    ) VALUES (
      new_qc_id,
      NEW.id,
      'first_piece',
      'pending',
      NULL,
      jsonb_build_object(
        'material_size_mm', NEW.material_size_mm,
        'item_code', NEW.item_code,
        'customer', NEW.customer
      ),
      'Auto-generated QC-In record for Work Order ' || COALESCE(NEW.display_id, NEW.wo_id::text)
    );
    
    RAISE NOTICE 'Created QC-In record % for WO %', new_qc_id, NEW.display_id;
  END IF;
  
  RETURN NEW;
END;
$function$;