-- Add new workflow stages to wo_stage enum
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'production_planning';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'proforma_sent';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'raw_material_check';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'raw_material_order';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'raw_material_inwards';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'raw_material_qc';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'cutting';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'forging';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'cnc_production';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'first_piece_qc';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'mass_production';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'buffing';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'plating';
ALTER TYPE wo_stage ADD VALUE IF NOT EXISTS 'blasting';

-- Update work_orders table to add work order number and cycle time tracking
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS wo_number TEXT;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS production_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS production_end TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS actual_cycle_time_hours NUMERIC GENERATED ALWAYS AS (
  CASE 
    WHEN production_start IS NOT NULL AND production_end IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (production_end - production_start)) / 3600.0
    ELSE NULL
  END
) STORED;

-- Create index for wo_number search
CREATE INDEX IF NOT EXISTS idx_work_orders_wo_number ON public.work_orders(wo_number);

-- Update auto_generate_work_orders function to set initial stage and generate proper WO number
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  item_record jsonb;
  new_wo_number text;
  item_counter integer := 1;
  so_short_code text;
  year_month text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN

    -- Generate SO short code and year-month
    so_short_code := SUBSTRING(NEW.po_number, 1, 4);
    year_month := TO_CHAR(CURRENT_DATE, 'YYMM');

    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      -- Generate WO number: {SO#}-{ItemCode}-{YYMM}-{WO#}
      new_wo_number := so_short_code || '-' || 
                       COALESCE(item_record->>'item_code', 'ITEM') || '-' || 
                       year_month || '-' || 
                       LPAD(item_counter::text, 2, '0');
      
      INSERT INTO public.work_orders (
        wo_id,
        wo_number,
        display_id,
        customer,
        customer_id,
        customer_po,
        item_code,
        revision,
        quantity,
        due_date,
        priority,
        sales_order,
        so_id,
        status,
        current_stage,
        gross_weight_per_pc,
        net_weight_per_pc,
        material_size_mm,
        cycle_time_seconds,
        financial_snapshot
      ) VALUES (
        gen_random_uuid(),
        new_wo_number,
        new_wo_number,
        NEW.customer,
        NEW.customer_id,
        NEW.po_number,
        COALESCE(item_record->>'item_code', 'N/A'),
        COALESCE(item_record->>'revision', '0'),
        COALESCE((item_record->>'quantity')::integer, 0),
        COALESCE((item_record->>'due_date')::date, CURRENT_DATE + interval '30 days'),
        COALESCE((item_record->>'priority')::integer, 3),
        NEW.so_id,
        NEW.id,
        'pending',
        'production_planning',  -- Start at production planning instead of goods_in
        COALESCE((item_record->>'gross_weight_per_pc_grams')::numeric, NEW.gross_weight_per_pc_grams),
        COALESCE((item_record->>'net_weight_per_pc_grams')::numeric, NEW.net_weight_per_pc_grams),
        COALESCE(item_record->>'material_size_mm', NEW.material_rod_forging_size_mm),
        COALESCE((item_record->>'cycle_time_seconds')::numeric, NEW.cycle_time_seconds),
        jsonb_build_object(
          'currency', NEW.currency,
          'payment_terms_days', NEW.payment_terms_days,
          'incoterm', NEW.incoterm,
          'so_total', COALESCE(NEW.total_amount, 0),
          'line_item', jsonb_build_object(
            'item_code', COALESCE(item_record->>'item_code', 'N/A'),
            'quantity', COALESCE((item_record->>'quantity')::integer, 0),
            'price_per_pc', COALESCE((item_record->>'price_per_pc')::numeric, 0),
            'line_amount', COALESCE((item_record->>'line_amount')::numeric, 0),
            'due_date', COALESCE(item_record->>'due_date', ''),
            'drawing_number', COALESCE(item_record->>'drawing_number', ''),
            'alloy', item_record->>'alloy',
            'material_size_mm', COALESCE(item_record->>'material_size_mm', NEW.material_rod_forging_size_mm)
          )
        )
      );
      
      item_counter := item_counter + 1;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Enhanced log_wo_stage_change to track user and module
CREATE OR REPLACE FUNCTION public.log_wo_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Only log if stage actually changed
  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    INSERT INTO wo_stage_history (wo_id, from_stage, to_stage, changed_by, is_override)
    VALUES (
      NEW.id,
      OLD.current_stage,
      NEW.current_stage,
      auth.uid(),
      true  -- Mark as override if manual change
    );
    
    -- Also log to actions log for comprehensive tracking
    INSERT INTO wo_actions_log (
      wo_id,
      action_type,
      department,
      performed_by,
      action_details
    )
    VALUES (
      NEW.id,
      'stage_change',
      'System',
      auth.uid(),
      jsonb_build_object(
        'from_stage', OLD.current_stage,
        'to_stage', NEW.current_stage,
        'timestamp', now()
      )
    );
  END IF;
  
  RETURN NEW;
END;
$function$;