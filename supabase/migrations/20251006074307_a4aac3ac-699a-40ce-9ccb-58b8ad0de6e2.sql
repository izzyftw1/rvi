-- Enable realtime for work_orders
ALTER TABLE public.work_orders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.work_orders;