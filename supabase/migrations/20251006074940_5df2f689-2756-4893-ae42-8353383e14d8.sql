-- Add material_issues table if not exists for tracking material issued to work orders
CREATE TABLE IF NOT EXISTS public.material_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.material_lots(id) ON DELETE RESTRICT,
  quantity_kg numeric NOT NULL,
  quantity_pcs integer,
  uom text NOT NULL DEFAULT 'kg',
  issued_by uuid REFERENCES auth.users(id),
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.material_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view material issues" ON public.material_issues
  FOR SELECT USING (true);

CREATE POLICY "Stores and production can create material issues" ON public.material_issues
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'stores'::app_role) OR 
    has_role(auth.uid(), 'production'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Create trigger for logging material issues if not exists
DROP TRIGGER IF EXISTS log_material_issue_trigger ON public.material_issues;
CREATE TRIGGER log_material_issue_trigger
  AFTER INSERT ON public.material_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.log_material_issue();

-- Add wo_stage_history table if not exists
CREATE TABLE IF NOT EXISTS public.wo_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  from_stage wo_stage,
  to_stage wo_stage NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  is_override boolean DEFAULT false,
  remarks text
);

ALTER TABLE public.wo_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view WO stage history" ON public.wo_stage_history
  FOR SELECT USING (true);

CREATE POLICY "System can insert WO stage history" ON public.wo_stage_history
  FOR INSERT WITH CHECK (true);

-- Create trigger for logging WO stage changes if not exists
DROP TRIGGER IF EXISTS log_wo_stage_change_trigger ON public.work_orders;
CREATE TRIGGER log_wo_stage_change_trigger
  AFTER UPDATE OF current_stage ON public.work_orders
  FOR EACH ROW
  WHEN (OLD.current_stage IS DISTINCT FROM NEW.current_stage)
  EXECUTE FUNCTION public.log_wo_stage_change();

-- Add trigger for auto-generating work orders from sales orders
DROP TRIGGER IF EXISTS auto_generate_work_orders_trigger ON public.sales_orders;
CREATE TRIGGER auto_generate_work_orders_trigger
  AFTER INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_work_orders();

-- Add trigger for syncing SO to WO
DROP TRIGGER IF EXISTS sync_so_to_wo_trigger ON public.sales_orders;
CREATE TRIGGER sync_so_to_wo_trigger
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_so_to_wo();

-- Add triggers for status sync
DROP TRIGGER IF EXISTS sync_wo_completion_to_so ON public.work_orders;
CREATE TRIGGER sync_wo_completion_to_so
  AFTER UPDATE OF status ON public.work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_wo_status_to_so();

DROP TRIGGER IF EXISTS cancel_wos_on_so_cancel_trigger ON public.sales_orders;
CREATE TRIGGER cancel_wos_on_so_cancel_trigger
  AFTER UPDATE OF status ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.cancel_wos_on_so_cancel();

-- Add triggers for QC logging
DROP TRIGGER IF EXISTS log_qc_record_trigger ON public.qc_records;
CREATE TRIGGER log_qc_record_trigger
  AFTER INSERT ON public.qc_records
  FOR EACH ROW
  EXECUTE FUNCTION public.log_qc_record();

DROP TRIGGER IF EXISTS log_hourly_qc_trigger ON public.hourly_qc_checks;
CREATE TRIGGER log_hourly_qc_trigger
  AFTER INSERT ON public.hourly_qc_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_hourly_qc();

-- Add trigger for carton building
DROP TRIGGER IF EXISTS log_carton_build_trigger ON public.cartons;
CREATE TRIGGER log_carton_build_trigger
  AFTER INSERT ON public.cartons
  FOR EACH ROW
  EXECUTE FUNCTION public.log_carton_build();

-- Add trigger for design uploads
DROP TRIGGER IF EXISTS log_design_upload_trigger ON public.design_files;
CREATE TRIGGER log_design_upload_trigger
  AFTER INSERT ON public.design_files
  FOR EACH ROW
  EXECUTE FUNCTION public.log_design_upload();

-- Enable realtime for key tables (skip if already added)
ALTER TABLE public.material_lots REPLICA IDENTITY FULL;
ALTER TABLE public.qc_records REPLICA IDENTITY FULL;
ALTER TABLE public.hourly_qc_checks REPLICA IDENTITY FULL;
ALTER TABLE public.cartons REPLICA IDENTITY FULL;
ALTER TABLE public.wo_actions_log REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.material_lots;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.qc_records;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hourly_qc_checks;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cartons;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wo_actions_log;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;