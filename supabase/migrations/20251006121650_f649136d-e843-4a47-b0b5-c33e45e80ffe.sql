-- Create database function to calculate end time with exceptions
CREATE OR REPLACE FUNCTION public.calculate_end_time(
  _start_time TIMESTAMPTZ,
  _hours_needed NUMERIC
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  work_time TIMESTAMPTZ := _start_time;
  hours_left NUMERIC := _hours_needed;
  day_name_str TEXT;
  day_config RECORD;
  exception_config RECORD;
  shift_start TIME;
  shift_end TIME;
  brk1_start TIME;
  brk1_end TIME;
  brk2_start TIME;
  brk2_end TIME;
  day_hours NUMERIC;
  the_date DATE;
BEGIN
  WHILE hours_left > 0 LOOP
    the_date := work_time::DATE;
    day_name_str := LOWER(TO_CHAR(work_time, 'Day'));
    day_name_str := TRIM(day_name_str);
    
    -- Check for exception first
    SELECT * INTO exception_config
    FROM public.factory_calendar_exceptions
    WHERE exception_date = the_date;
    
    IF FOUND THEN
      -- Use exception settings
      IF NOT exception_config.is_working THEN
        -- Skip this day (holiday)
        work_time := (the_date + INTERVAL '1 day')::TIMESTAMPTZ;
        CONTINUE;
      ELSE
        -- Use override times
        shift_start := exception_config.override_shift_start;
        shift_end := exception_config.override_shift_end;
        brk1_start := NULL;
        brk1_end := NULL;
        brk2_start := NULL;
        brk2_end := NULL;
      END IF;
    ELSE
      -- Use weekly template
      SELECT * INTO day_config
      FROM public.factory_calendar_settings
      WHERE day_name = day_name_str;
      
      IF NOT FOUND OR NOT day_config.working THEN
        -- Skip non-working day
        work_time := (the_date + INTERVAL '1 day')::TIMESTAMPTZ;
        CONTINUE;
      END IF;
      
      shift_start := day_config.day_shift_start;
      shift_end := day_config.day_shift_end;
      brk1_start := day_config.break_1_start;
      brk1_end := day_config.break_1_end;
      brk2_start := day_config.break_2_start;
      brk2_end := day_config.break_2_end;
    END IF;
    
    -- Calculate available hours for this day
    day_hours := EXTRACT(EPOCH FROM (shift_end - shift_start)) / 3600.0;
    
    -- Subtract break times
    IF brk1_start IS NOT NULL AND brk1_end IS NOT NULL THEN
      day_hours := day_hours - (EXTRACT(EPOCH FROM (brk1_end - brk1_start)) / 3600.0);
    END IF;
    
    IF brk2_start IS NOT NULL AND brk2_end IS NOT NULL THEN
      day_hours := day_hours - (EXTRACT(EPOCH FROM (brk2_end - brk2_start)) / 3600.0);
    END IF;
    
    -- Deduct hours from this day
    IF hours_left <= day_hours THEN
      -- Finish on this day
      work_time := the_date::TIMESTAMPTZ + shift_start::INTERVAL + (hours_left || ' hours')::INTERVAL;
      hours_left := 0;
    ELSE
      -- Move to next day
      hours_left := hours_left - day_hours;
      work_time := (the_date + INTERVAL '1 day')::TIMESTAMPTZ;
    END IF;
  END LOOP;
  
  RETURN work_time;
END;
$$;