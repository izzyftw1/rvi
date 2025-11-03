-- Create sales_bookings table to track approved SOs in finance before invoicing
CREATE TABLE IF NOT EXISTS public.sales_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  so_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  booking_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id UUID REFERENCES public.customer_master(id),
  po_number TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'invoiced', 'cancelled')),
  expected_delivery_date DATE,
  payment_terms_days INTEGER,
  incoterm TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view bookings"
  ON public.sales_bookings
  FOR SELECT
  USING (true);

CREATE POLICY "Sales and accounts can manage bookings"
  ON public.sales_bookings
  FOR ALL
  USING (has_role(auth.uid(), 'sales'::app_role) OR has_role(auth.uid(), 'accounts'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_sales_bookings_so_id ON public.sales_bookings(so_id);
CREATE INDEX idx_sales_bookings_customer_id ON public.sales_bookings(customer_id);
CREATE INDEX idx_sales_bookings_booking_date ON public.sales_bookings(booking_date);
CREATE INDEX idx_sales_bookings_status ON public.sales_bookings(status);

-- Trigger for updated_at
CREATE TRIGGER update_sales_bookings_updated_at
  BEFORE UPDATE ON public.sales_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create sales booking when SO is approved
CREATE OR REPLACE FUNCTION public.auto_create_sales_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create booking when SO is approved for the first time
  IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved') THEN
    INSERT INTO public.sales_bookings (
      so_id,
      booking_date,
      customer_id,
      po_number,
      currency,
      total_value,
      status,
      expected_delivery_date,
      payment_terms_days,
      incoterm
    ) VALUES (
      NEW.id,
      CURRENT_DATE,
      NEW.customer_id,
      NEW.po_number,
      COALESCE(NEW.currency, 'USD'),
      COALESCE(NEW.total_amount, 0),
      'booked',
      NEW.expected_delivery_date,
      NEW.payment_terms_days,
      NEW.incoterm
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for auto booking creation
DROP TRIGGER IF EXISTS trigger_auto_create_sales_booking ON public.sales_orders;
CREATE TRIGGER trigger_auto_create_sales_booking
  AFTER INSERT OR UPDATE ON public.sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_sales_booking();

-- Function to update booking status when invoice is created
CREATE OR REPLACE FUNCTION public.update_booking_on_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark booking as invoiced when invoice is created
  IF NEW.so_id IS NOT NULL THEN
    UPDATE public.sales_bookings
    SET status = 'invoiced',
        updated_at = now()
    WHERE so_id = NEW.so_id
      AND status = 'booked';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for booking status update
DROP TRIGGER IF EXISTS trigger_update_booking_on_invoice ON public.invoices;
CREATE TRIGGER trigger_update_booking_on_invoice
  AFTER INSERT ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_booking_on_invoice();