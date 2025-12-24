-- Create trigger function to notify production when material is received
CREATE OR REPLACE FUNCTION public.notify_production_on_material_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_ids UUID[];
BEGIN
  -- Only trigger on new material lots received (INSERT)
  IF TG_OP = 'INSERT' THEN
    -- Get all users with 'production' role
    SELECT ARRAY_AGG(user_id) INTO v_user_ids
    FROM public.user_roles
    WHERE role = 'production';
    
    -- Send notification to each production user
    IF v_user_ids IS NOT NULL AND array_length(v_user_ids, 1) > 0 THEN
      PERFORM public.notify_users(
        v_user_ids,
        'material_received',
        'Raw Material Received',
        'New material received: ' || NEW.lot_id || ' - ' || COALESCE(NEW.alloy, 'Unknown') || ' (' || COALESCE(NEW.gross_weight::text, '0') || ' kg). Ready for QC inspection.',
        'material_lot',
        NEW.id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on material_lots table
DROP TRIGGER IF EXISTS notify_production_on_material_receipt_trigger ON public.material_lots;
CREATE TRIGGER notify_production_on_material_receipt_trigger
  AFTER INSERT ON public.material_lots
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_production_on_material_receipt();