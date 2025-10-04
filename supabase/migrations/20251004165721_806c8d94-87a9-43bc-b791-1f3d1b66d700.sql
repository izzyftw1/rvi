-- Create the audit logging function
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
END;
$$;

-- Add item_code to hourly_qc_checks for easier querying and reporting
ALTER TABLE public.hourly_qc_checks
ADD COLUMN IF NOT EXISTS item_code text;

-- Update existing records to populate item_code from work_orders
UPDATE public.hourly_qc_checks hqc
SET item_code = wo.item_code
FROM public.work_orders wo
WHERE hqc.wo_id = wo.id
AND hqc.item_code IS NULL;

-- Create audit trigger for hourly_qc_checks
DROP TRIGGER IF EXISTS audit_hourly_qc_checks ON public.hourly_qc_checks;
CREATE TRIGGER audit_hourly_qc_checks
  AFTER INSERT OR UPDATE OR DELETE ON public.hourly_qc_checks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- Update RLS policy to allow quality supervisors to view all QC records
DROP POLICY IF EXISTS "Quality supervisors can view all hourly QC checks" ON public.hourly_qc_checks;
CREATE POLICY "Quality supervisors can view all hourly QC checks"
ON public.hourly_qc_checks
FOR SELECT
USING (has_role(auth.uid(), 'quality'::app_role));