-- Add advance_payment_received column to sales_orders table
ALTER TABLE sales_orders 
ADD COLUMN IF NOT EXISTS advance_payment_received BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN sales_orders.advance_payment_received IS 'Indicates whether advance payment has been received from customer';