-- Function to auto-generate Work Orders from Sales Order
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  item_record jsonb;
  wo_counter integer := 0;
  new_wo_id text;
BEGIN
  -- Only generate WOs when status changes to 'approved'
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN
    
    -- Loop through each item in the sales order
    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      wo_counter := wo_counter + 1;
      
      -- Generate WO ID: SO_ID-WO-001, SO_ID-WO-002, etc.
      new_wo_id := NEW.so_id || '-WO-' || LPAD(wo_counter::text, 3, '0');
      
      -- Insert new work order
      INSERT INTO public.work_orders (
        wo_id,
        customer,
        item_code,
        revision,
        quantity,
        due_date,
        priority,
        sales_order,
        status,
        current_stage,
        gross_weight_per_pc,
        net_weight_per_pc,
        material_size_mm
      ) VALUES (
        new_wo_id,
        NEW.customer,
        item_record->>'item_code',
        item_record->>'revision',
        (item_record->>'quantity')::integer,
        (NEW.po_date + interval '30 days')::date, -- Default due date 30 days from PO
        COALESCE((item_record->>'priority')::integer, 3), -- Default priority 3
        NEW.id, -- Link to sales order UUID
        'created',
        'planning', -- Initial stage
        NEW.gross_weight_per_pc_grams,
        NEW.net_weight_per_pc_grams,
        NEW.material_rod_forging_size_mm
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to sync Sales Order updates to Work Orders
CREATE OR REPLACE FUNCTION public.sync_so_to_wo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  wo_record record;
  can_update boolean;
BEGIN
  -- Only sync if approved and items/quantities changed
  IF NEW.status = 'approved' AND (OLD.items != NEW.items) THEN
    
    -- Check all linked work orders
    FOR wo_record IN 
      SELECT * FROM public.work_orders 
      WHERE sales_order = NEW.id
    LOOP
      -- Check if WO is in production or beyond
      can_update := wo_record.current_stage IN ('planning', 'material_prep');
      
      IF can_update THEN
        -- Auto-update WO from SO items
        UPDATE public.work_orders
        SET 
          quantity = (SELECT (value->>'quantity')::integer 
                      FROM jsonb_array_elements(NEW.items) 
                      WHERE value->>'item_code' = wo_record.item_code 
                      LIMIT 1),
          gross_weight_per_pc = NEW.gross_weight_per_pc_grams,
          net_weight_per_pc = NEW.net_weight_per_pc_grams,
          material_size_mm = NEW.material_rod_forging_size_mm,
          updated_at = now()
        WHERE id = wo_record.id;
      ELSE
        -- Create notification for manager approval
        INSERT INTO public.notifications (
          user_id,
          type,
          title,
          message,
          entity_type,
          entity_id
        )
        SELECT 
          ur.user_id,
          'approval_required',
          'Sales Order Update Requires Approval',
          'Sales Order ' || NEW.so_id || ' has been updated but linked Work Order ' || wo_record.wo_id || ' is already in production. Manager approval required to sync changes.',
          'work_order',
          wo_record.id
        FROM public.user_roles ur
        WHERE ur.role IN ('admin', 'production');
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_auto_generate_work_orders ON public.sales_orders;
CREATE TRIGGER trigger_auto_generate_work_orders
  AFTER INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_work_orders();

DROP TRIGGER IF EXISTS trigger_sync_so_to_wo ON public.sales_orders;
CREATE TRIGGER trigger_sync_so_to_wo
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_so_to_wo();

-- Add index for better performance on sales_order lookups
CREATE INDEX IF NOT EXISTS idx_work_orders_sales_order ON public.work_orders(sales_order);

-- Add missing columns to work_orders if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'work_orders' AND column_name = 'gross_weight_per_pc') THEN
    ALTER TABLE public.work_orders ADD COLUMN gross_weight_per_pc numeric;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'work_orders' AND column_name = 'net_weight_per_pc') THEN
    ALTER TABLE public.work_orders ADD COLUMN net_weight_per_pc numeric;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'work_orders' AND column_name = 'material_size_mm') THEN
    ALTER TABLE public.work_orders ADD COLUMN material_size_mm numeric;
  END IF;
END $$;