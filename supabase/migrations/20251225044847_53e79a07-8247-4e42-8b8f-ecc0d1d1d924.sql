-- Update the check constraint to include 'waived' as a valid final_qc_result value
ALTER TABLE public.work_orders DROP CONSTRAINT IF EXISTS work_orders_final_qc_result_check;

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_final_qc_result_check 
CHECK (final_qc_result = ANY (ARRAY['passed'::text, 'blocked'::text, 'pending'::text, 'waived'::text, 'failed'::text]));