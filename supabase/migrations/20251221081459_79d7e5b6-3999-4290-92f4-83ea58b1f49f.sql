-- Create measurement instruments table (without generated columns for status)
CREATE TABLE public.measurement_instruments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instrument_name TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  serial_number TEXT NOT NULL UNIQUE,
  location TEXT,
  calibration_interval_days INTEGER NOT NULL DEFAULT 365,
  last_calibration_date DATE NOT NULL,
  next_calibration_due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'VALID',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create function to calculate calibration fields
CREATE OR REPLACE FUNCTION public.calculate_calibration_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate next calibration due date
  NEW.next_calibration_due_date := NEW.last_calibration_date + (NEW.calibration_interval_days || ' days')::INTERVAL;
  
  -- Calculate status based on due date
  IF NEW.next_calibration_due_date < CURRENT_DATE THEN
    NEW.status := 'OVERDUE';
  ELSE
    NEW.status := 'VALID';
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for insert/update
CREATE TRIGGER calculate_calibration_on_change
BEFORE INSERT OR UPDATE ON public.measurement_instruments
FOR EACH ROW
EXECUTE FUNCTION public.calculate_calibration_fields();

-- Add instrument reference to QC records
ALTER TABLE public.qc_records 
ADD COLUMN instrument_id UUID REFERENCES public.measurement_instruments(id);

-- Add instrument reference to hourly QC checks
ALTER TABLE public.hourly_qc_checks
ADD COLUMN instrument_id UUID REFERENCES public.measurement_instruments(id);

-- Add instrument reference to qc_measurements
ALTER TABLE public.qc_measurements
ADD COLUMN instrument_id UUID REFERENCES public.measurement_instruments(id);

-- Enable RLS
ALTER TABLE public.measurement_instruments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Everyone can view instruments"
ON public.measurement_instruments
FOR SELECT
USING (true);

CREATE POLICY "Quality and admin can manage instruments"
ON public.measurement_instruments
FOR ALL
USING (has_role(auth.uid(), 'quality'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_instruments_status ON public.measurement_instruments(status);
CREATE INDEX idx_instruments_due_date ON public.measurement_instruments(next_calibration_due_date);
CREATE INDEX idx_qc_records_instrument ON public.qc_records(instrument_id);
CREATE INDEX idx_hourly_qc_instrument ON public.hourly_qc_checks(instrument_id);