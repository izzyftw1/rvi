-- Create comprehensive WO actions log table
CREATE TABLE IF NOT EXISTS public.wo_actions_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  department TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id),
  action_details JSONB NOT NULL DEFAULT '{}',
  entity_reference UUID,
  reference_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.wo_actions_log ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view WO actions log"
  ON public.wo_actions_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert WO actions log"
  ON public.wo_actions_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_wo_actions_log_wo_id ON public.wo_actions_log(wo_id);
CREATE INDEX IF NOT EXISTS idx_wo_actions_log_created_at ON public.wo_actions_log(created_at);
CREATE INDEX IF NOT EXISTS idx_wo_actions_log_department ON public.wo_actions_log(department);

-- Function to log material issue
CREATE OR REPLACE FUNCTION public.log_material_issue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wo_actions_log (
    wo_id,
    action_type,
    department,
    performed_by,
    action_details,
    entity_reference,
    reference_type
  )
  SELECT
    NEW.wo_id,
    'material_issued',
    'Goods In',
    NEW.issued_by,
    jsonb_build_object(
      'lot_id', ml.lot_id,
      'heat_no', ml.heat_no,
      'alloy', ml.alloy,
      'quantity_kg', NEW.quantity_kg,
      'quantity_pcs', NEW.quantity_pcs,
      'uom', NEW.uom
    ),
    NEW.id,
    'material_issue'
  FROM material_lots ml
  WHERE ml.id = NEW.lot_id;
  
  RETURN NEW;
END;
$$;

-- Function to log QC records
CREATE OR REPLACE FUNCTION public.log_qc_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wo_actions_log (
    wo_id,
    action_type,
    department,
    performed_by,
    action_details,
    entity_reference,
    reference_type
  )
  VALUES (
    NEW.wo_id,
    CASE 
      WHEN NEW.qc_type = 'incoming' THEN 'qc_incoming'
      WHEN NEW.qc_type = 'in_process' THEN 'qc_in_process'
      WHEN NEW.qc_type = 'final' THEN 'qc_final'
      ELSE 'qc_other'
    END,
    'Quality',
    NEW.approved_by,
    jsonb_build_object(
      'qc_id', NEW.qc_id,
      'qc_type', NEW.qc_type,
      'result', NEW.result,
      'measurements', NEW.measurements,
      'remarks', NEW.remarks
    ),
    NEW.id,
    'qc_record'
  );
  
  RETURN NEW;
END;
$$;

-- Function to log hourly QC checks
CREATE OR REPLACE FUNCTION public.log_hourly_qc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wo_actions_log (
    wo_id,
    action_type,
    department,
    performed_by,
    action_details,
    entity_reference,
    reference_type
  )
  SELECT
    NEW.wo_id,
    'hourly_qc_check',
    'Production',
    NEW.operator_id,
    jsonb_build_object(
      'machine_id', m.machine_id,
      'machine_name', m.name,
      'operation', NEW.operation,
      'status', NEW.status,
      'dimensions', NEW.dimensions,
      'visual_status', NEW.visual_status,
      'thread_status', NEW.thread_status,
      'plating_status', NEW.plating_status,
      'remarks', NEW.remarks
    ),
    NEW.id,
    'hourly_qc'
  FROM machines m
  WHERE m.id = NEW.machine_id;
  
  RETURN NEW;
END;
$$;

-- Function to log carton building
CREATE OR REPLACE FUNCTION public.log_carton_build()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wo_actions_log (
    wo_id,
    action_type,
    department,
    performed_by,
    action_details,
    entity_reference,
    reference_type
  )
  VALUES (
    NEW.wo_id,
    'carton_built',
    'Packing',
    NEW.built_by,
    jsonb_build_object(
      'carton_id', NEW.carton_id,
      'quantity', NEW.quantity,
      'gross_weight', NEW.gross_weight,
      'net_weight', NEW.net_weight,
      'heat_nos', NEW.heat_nos
    ),
    NEW.id,
    'carton'
  );
  
  RETURN NEW;
END;
$$;

-- Function to log design file uploads
CREATE OR REPLACE FUNCTION public.log_design_upload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wo_actions_log (
    wo_id,
    action_type,
    department,
    performed_by,
    action_details,
    entity_reference,
    reference_type
  )
  VALUES (
    NEW.wo_id,
    'design_uploaded',
    'Design',
    NEW.uploaded_by,
    jsonb_build_object(
      'file_name', NEW.file_name,
      'file_type', NEW.file_type,
      'version', NEW.version,
      'change_notes', NEW.change_notes
    ),
    NEW.id,
    'design_file'
  );
  
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER trigger_log_material_issue
  AFTER INSERT ON public.wo_material_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.log_material_issue();

CREATE TRIGGER trigger_log_qc_record
  AFTER INSERT ON public.qc_records
  FOR EACH ROW
  EXECUTE FUNCTION public.log_qc_record();

CREATE TRIGGER trigger_log_hourly_qc
  AFTER INSERT ON public.hourly_qc_checks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_hourly_qc();

CREATE TRIGGER trigger_log_carton_build
  AFTER INSERT ON public.cartons
  FOR EACH ROW
  EXECUTE FUNCTION public.log_carton_build();

CREATE TRIGGER trigger_log_design_upload
  AFTER INSERT ON public.design_files
  FOR EACH ROW
  EXECUTE FUNCTION public.log_design_upload();