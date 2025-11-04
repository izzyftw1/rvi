-- Add new fields to customer_master table
ALTER TABLE public.customer_master
ADD COLUMN IF NOT EXISTS account_owner uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS address_line_1 text,
ADD COLUMN IF NOT EXISTS pincode text;

-- Create index for account_owner for faster lookups
CREATE INDEX IF NOT EXISTS idx_customer_master_account_owner ON public.customer_master(account_owner);

-- Create a view to get last order date for each customer
CREATE OR REPLACE VIEW public.customer_last_order AS
SELECT 
  cm.id as customer_id,
  MAX(so.po_date) as last_order_date
FROM public.customer_master cm
LEFT JOIN public.sales_orders so ON so.customer_id = cm.id
GROUP BY cm.id;

-- Grant access to the view
GRANT SELECT ON public.customer_last_order TO authenticated;