-- Fix the update_invoice_from_allocation function to properly cast to invoice_status enum
CREATE OR REPLACE FUNCTION public.update_invoice_from_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_allocated NUMERIC;
  v_invoice_total NUMERIC;
BEGIN
  -- Get total allocations for the invoice
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_allocated 
  FROM public.receipt_allocations 
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Get invoice total
  SELECT total_amount INTO v_invoice_total 
  FROM public.invoices 
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Update invoice paid_amount and balance with proper enum casting
  UPDATE public.invoices
  SET 
    paid_amount = v_total_allocated,
    balance_amount = total_amount - v_total_allocated,
    status = CASE 
      WHEN v_total_allocated = 0 THEN 'issued'::invoice_status
      WHEN v_total_allocated < v_invoice_total THEN 'part_paid'::invoice_status
      ELSE 'paid'::invoice_status
    END,
    updated_at = now()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;