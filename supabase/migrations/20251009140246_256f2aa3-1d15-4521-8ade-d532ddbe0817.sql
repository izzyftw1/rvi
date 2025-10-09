-- Ensure UUID columns for customer/item linkage and fix SO/WO sync functions
BEGIN;

-- 1) Add UUID linkage columns if missing
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.customer_master(id);

ALTER TABLE public.sales_order_line_items
  ADD COLUMN IF NOT EXISTS item_id uuid NULL REFERENCES public.item_master(id);

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS customer_id uuid NULL REFERENCES public.customer_master(id);

-- 2) Update legacy auto WO generation from sales_orders JSON (ensure correct so_id/text mapping + customer_id)
CREATE OR REPLACE FUNCTION public.auto_generate_work_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  item_record jsonb;
  new_display_id text;
  item_counter integer := 1;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'approved') OR 
     (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved') THEN

    FOR item_record IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
      new_display_id := 'ISO-' || NEW.po_number || '-' || NEW.so_id || '-' || LPAD(item_counter::text, 3, '0');
      
      INSERT INTO public.work_orders (
        wo_id,
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
        new_display_id,
        NEW.customer,
        NEW.customer_id,
        NEW.po_number,
        COALESCE(item_record->>'item_code', 'N/A'),
        COALESCE(item_record->>'revision', '0'),
        COALESCE((item_record->>'quantity')::integer, 0),
        COALESCE((item_record->>'due_date')::date, CURRENT_DATE + interval '30 days'),
        COALESCE((item_record->>'priority')::integer, 3),
        NEW.so_id,          -- text copy of SO display id
        NEW.id,             -- UUID FK to sales_orders.id
        'pending',
        'goods_in',
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
            'alloy', COALESCE(item_record->>'alloy', NULL),
            'material_size_mm', COALESCE(item_record->>'material_size_mm', NEW.material_rod_forging_size_mm)
          )
        )
      );
      
      item_counter := item_counter + 1;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 3) Update line-item-based WO generation to carry UUID/text correctly + customer_id
CREATE OR REPLACE FUNCTION public.auto_generate_work_order_from_line_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_wo_id text;
  new_wo_uuid uuid;
  so_record record;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status != 'approved' AND NEW.status = 'approved' AND NEW.work_order_id IS NULL) THEN
    SELECT * INTO so_record FROM sales_orders WHERE id = NEW.sales_order_id;
    new_wo_id := 'SO-' || so_record.po_number || '-' || LPAD(NEW.line_number::text, 3, '0');

    INSERT INTO work_orders (
      wo_id,
      display_id,
      customer,
      customer_id,
      customer_po,
      item_code,
      quantity,
      due_date,
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
      new_wo_id,
      so_record.customer,
      so_record.customer_id,
      so_record.po_number,
      NEW.item_code,
      NEW.quantity,
      NEW.due_date,
      so_record.so_id,
      NEW.sales_order_id,
      'pending',
      'goods_in',
      NEW.gross_weight_per_pc_grams,
      NEW.net_weight_per_pc_grams,
      NEW.material_size_mm,
      NEW.cycle_time_seconds,
      jsonb_build_object(
        'currency', so_record.currency,
        'payment_terms_days', so_record.payment_terms_days,
        'incoterm', so_record.incoterm,
        'so_total', so_record.total_amount,
        'line_item', jsonb_build_object(
          'item_code', NEW.item_code,
          'quantity', NEW.quantity,
          'price_per_pc', NULL,
          'line_amount', NULL,
          'due_date', NEW.due_date,
          'drawing_number', NULL,
          'alloy', NEW.alloy,
          'material_size_mm', NEW.material_size_mm
        )
      )
    ) RETURNING id INTO new_wo_uuid;

    UPDATE sales_order_line_items
    SET work_order_id = new_wo_uuid
    WHERE id = NEW.id;

    RAISE NOTICE 'Generated Work Order % for line item % of SO %', new_wo_id, NEW.line_number, so_record.so_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 4) Fix functions that referenced text field instead of UUID link
CREATE OR REPLACE FUNCTION public.sync_so_to_wo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  wo_record record;
  can_update boolean;
BEGIN
  IF NEW.status = 'approved' AND (OLD.items != NEW.items) THEN
    FOR wo_record IN 
      SELECT * FROM public.work_orders 
      WHERE so_id = NEW.id
    LOOP
      can_update := wo_record.current_stage IN ('planning', 'material_prep');
      IF can_update THEN
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

CREATE OR REPLACE FUNCTION public.cancel_wos_on_so_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE public.work_orders
    SET status = 'cancelled'
    WHERE so_id = NEW.id
      AND status NOT IN ('completed', 'cancelled');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_wo_status_to_so()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  all_wos_complete boolean;
BEGIN
  IF NEW.status = 'completed' AND NEW.so_id IS NOT NULL THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM public.work_orders
      WHERE so_id = NEW.so_id
        AND status != 'completed'
    ) INTO all_wos_complete;

    IF all_wos_complete THEN
      UPDATE public.sales_orders
      SET status = 'fulfilled'
      WHERE id = NEW.so_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;