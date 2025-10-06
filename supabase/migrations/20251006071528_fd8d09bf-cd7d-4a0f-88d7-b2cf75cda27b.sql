-- Rename cycle_time_hours to cycle_time_seconds in sales_orders
ALTER TABLE public.sales_orders 
RENAME COLUMN cycle_time_hours TO cycle_time_seconds;

-- Rename cycle_time_hours to cycle_time_seconds in item_master
ALTER TABLE public.item_master 
RENAME COLUMN cycle_time_hours TO cycle_time_seconds;

-- Update the trigger function to use cycle_time_seconds
CREATE OR REPLACE FUNCTION update_item_master_from_sales_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert item data
  INSERT INTO public.item_master (
    item_code, 
    alloy, 
    material_size_mm, 
    gross_weight_grams, 
    net_weight_grams, 
    cycle_time_seconds,
    last_used
  ) VALUES (
    (NEW.items->0->>'item_code'),
    (NEW.items->0->>'alloy'),
    NEW.material_rod_forging_size_mm,
    NEW.gross_weight_per_pc_grams,
    NEW.net_weight_per_pc_grams,
    NEW.cycle_time_seconds,
    now()
  )
  ON CONFLICT (item_code) 
  DO UPDATE SET
    alloy = EXCLUDED.alloy,
    material_size_mm = EXCLUDED.material_size_mm,
    gross_weight_grams = EXCLUDED.gross_weight_grams,
    net_weight_grams = EXCLUDED.net_weight_grams,
    cycle_time_seconds = EXCLUDED.cycle_time_seconds,
    last_used = now(),
    updated_at = now();
  
  -- Update or insert customer data
  INSERT INTO public.customer_master (
    customer_name,
    party_code,
    last_used
  ) VALUES (
    NEW.customer,
    NEW.party_code,
    now()
  )
  ON CONFLICT (customer_name)
  DO UPDATE SET
    party_code = COALESCE(EXCLUDED.party_code, customer_master.party_code),
    last_used = now(),
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;